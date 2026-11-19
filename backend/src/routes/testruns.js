const router = require('express').Router();
const db = require('../config/db');
const { runs: schemas } = require('../validators/schemas');
const { validate } = require('../middleware/validate');
const { authorize, CAN_EXECUTE } = require('../middleware/auth');
const { assertProjectAccess, loadWithAccess } = require('../middleware/projectAccess');
const { asyncHandler, HttpError } = require('../middleware/errors');
const { logAudit } = require('../services/audit');
const cache = require('../services/cache');

const PROGRESS = `cardinality(r.case_ids) AS total,
  (SELECT COUNT(DISTINCT e.test_case_id)::int FROM test_executions e WHERE e.run_id = r.id) AS executed`;

// Runs with execution progress (executed vs total).
router.get(
  '/',
  validate(schemas.list, 'query'),
  asyncHandler(async (req, res) => {
    const q = req.valid.query;
    const projectId = await assertProjectAccess(req.user, q.projectId);
    const params = [projectId];
    let filter = '';
    if (q.suiteId) {
      params.push(q.suiteId);
      filter = 'AND r.suite_id = $2';
    }
    const total = (await db.query(`SELECT COUNT(*)::int AS n FROM test_runs r WHERE r.project_id = $1 ${filter}`, params)).rows[0].n;
    params.push(q.pageSize, (q.page - 1) * q.pageSize);
    const { rows } = await db.query(
      `SELECT r.id, r.name, r.status, r.suite_id, s.name AS suite_name, r.started_at, r.completed_at,
              u.name AS started_by_name, ${PROGRESS}
         FROM test_runs r
         LEFT JOIN test_suites s ON s.id = r.suite_id
         LEFT JOIN users u ON u.id = r.started_by
        WHERE r.project_id = $1 ${filter}
        ORDER BY r.started_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    res.json({ data: rows, total, page: q.page, pageSize: q.pageSize });
  })
);

// Run detail: every case in the run with its steps and its result in this run, plus per-tester progress.
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const run = await loadWithAccess(req.user, 'SELECT * FROM test_runs WHERE id = $1', req.params.id, 'Test run');
    const [meta, cases, byTester] = await Promise.all([
      db.query(
        `SELECT r.*, s.name AS suite_name, u.name AS started_by_name, ${PROGRESS}
           FROM test_runs r LEFT JOIN test_suites s ON s.id = r.suite_id LEFT JOIN users u ON u.id = r.started_by
          WHERE r.id = $1`,
        [run.id]
      ),
      db.query(
        `SELECT tc.id, tc.title, tc.description, tc.priority, tc.type, tc.preconditions, tc.postconditions,
                COALESCE((SELECT json_agg(json_build_object('step_number', s.step_number, 'action', s.action,
                                  'expected_result', s.expected_result) ORDER BY s.step_number)
                            FROM test_steps s WHERE s.test_case_id = tc.id), '[]') AS steps,
                x.id AS execution_id, x.status AS result, x.comments AS result_comments, x.executed_at, xu.name AS executed_by_name
           FROM unnest($2::int[]) WITH ORDINALITY AS c(id, ord)
           JOIN test_cases tc ON tc.id = c.id
           LEFT JOIN LATERAL (SELECT e.* FROM test_executions e WHERE e.run_id = $1 AND e.test_case_id = tc.id
                               ORDER BY e.executed_at DESC, e.id DESC LIMIT 1) x ON TRUE
           LEFT JOIN users xu ON xu.id = x.executed_by
          ORDER BY c.ord`,
        [run.id, run.case_ids]
      ),
      db.query(
        `SELECT u.id, u.name, COUNT(DISTINCT e.test_case_id)::int AS executed,
                COUNT(*) FILTER (WHERE e.status = 'Pass')::int AS passed,
                COUNT(*) FILTER (WHERE e.status = 'Fail')::int AS failed
           FROM test_executions e JOIN users u ON u.id = e.executed_by
          WHERE e.run_id = $1 GROUP BY u.id ORDER BY u.name`,
        [run.id]
      ),
    ]);
    res.json({ ...meta.rows[0], cases: cases.rows, byTester: byTester.rows });
  })
);

router.patch(
  '/:id',
  authorize(...CAN_EXECUTE),
  validate(schemas.update),
  asyncHandler(async (req, res) => {
    const run = await loadWithAccess(req.user, 'SELECT * FROM test_runs WHERE id = $1', req.params.id, 'Test run');
    if (run.status !== 'in-progress') throw new HttpError(409, `Run is already ${run.status}`);
    const {
      rows: [updated],
    } = await db.query('UPDATE test_runs SET status = $2, completed_at = NOW() WHERE id = $1 RETURNING *', [run.id, req.valid.body.status]);
    await logAudit({ userId: req.user.id, projectId: run.project_id, action: req.valid.body.status === 'completed' ? 'complete_run' : 'abort_run', entityType: 'test_run', entityId: run.id });
    await cache.invalidate(cache.keys.suites(run.project_id), cache.keys.analyticsAll(run.project_id));
    res.json(updated);
  })
);

module.exports = router;
