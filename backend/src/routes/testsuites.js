const router = require('express').Router();
const db = require('../config/db');
const env = require('../config/env');
const { suites: schemas } = require('../validators/schemas');
const { validate } = require('../middleware/validate');
const { authorize, CAN_MANAGE, CAN_EXECUTE } = require('../middleware/auth');
const { assertProjectAccess, loadWithAccess } = require('../middleware/projectAccess');
const { executionLimiter } = require('../middleware/rateLimiters');
const { asyncHandler, HttpError } = require('../middleware/errors');
const { logAudit, diff } = require('../services/audit');
const cache = require('../services/cache');

const loadSuite = (user, id) => loadWithAccess(user, 'SELECT * FROM test_suites WHERE id = $1', id, 'Test suite');
const invalidateSuites = (projectId) => cache.invalidate(cache.keys.suites(projectId), cache.keys.analyticsAll(projectId));

// Suite list per project, cached for 30 minutes.
router.get(
  '/',
  validate(schemas.list, 'query'),
  asyncHandler(async (req, res) => {
    const projectId = await assertProjectAccess(req.user, req.valid.query.projectId);
    const data = await cache.getOrSet(
      cache.keys.suites(projectId),
      env.ttl.suites,
      async () => {
        const { rows } = await db.query(
          `SELECT s.id, s.project_id, s.name, s.description, s.created_at, s.updated_at, u.name AS created_by_name,
                  (SELECT COUNT(*)::int FROM test_suite_cases sc WHERE sc.suite_id = s.id) AS case_count,
                  lr.id AS last_run_id, lr.status AS last_run_status, lr.started_at AS last_run_at
             FROM test_suites s
             LEFT JOIN users u ON u.id = s.created_by
             LEFT JOIN LATERAL (SELECT r.id, r.status, r.started_at FROM test_runs r WHERE r.suite_id = s.id
                                 ORDER BY r.started_at DESC LIMIT 1) lr ON TRUE
            WHERE s.project_id = $1 ORDER BY s.name`,
          [projectId]
        );
        return rows;
      },
      res
    );
    res.json({ data });
  })
);

router.post(
  '/',
  authorize(...CAN_MANAGE),
  validate(schemas.create),
  asyncHandler(async (req, res) => {
    const { projectId: pid, name, description } = req.valid.body;
    const projectId = await assertProjectAccess(req.user, pid);
    const {
      rows: [suite],
    } = await db.query('INSERT INTO test_suites (project_id, name, description, created_by) VALUES ($1, $2, $3, $4) RETURNING *', [
      projectId,
      name,
      description,
      req.user.id,
    ]);
    await logAudit({ userId: req.user.id, projectId, action: 'create', entityType: 'test_suite', entityId: suite.id, details: { name } });
    await invalidateSuites(projectId);
    res.status(201).json(suite);
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const suite = await loadSuite(req.user, req.params.id);
    const { rows: cases } = await db.query(
      `SELECT tc.id, tc.title, tc.priority, tc.type, tc.assigned_to, u.name AS assignee_name, sc.position,
              le.status AS last_status, le.executed_at AS last_executed_at
         FROM test_suite_cases sc
         JOIN test_cases tc ON tc.id = sc.test_case_id
         LEFT JOIN users u ON u.id = tc.assigned_to
         LEFT JOIN LATERAL (SELECT e.status, e.executed_at FROM test_executions e WHERE e.test_case_id = tc.id
                             ORDER BY e.executed_at DESC, e.id DESC LIMIT 1) le ON TRUE
        WHERE sc.suite_id = $1 ORDER BY sc.position, tc.id`,
      [suite.id]
    );
    res.json({ ...suite, cases });
  })
);

router.put(
  '/:id',
  authorize(...CAN_MANAGE),
  validate(schemas.update),
  asyncHandler(async (req, res) => {
    const before = await loadSuite(req.user, req.params.id);
    const b = req.valid.body;
    const {
      rows: [suite],
    } = await db.query(
      `UPDATE test_suites SET name = COALESCE($2, name), description = COALESCE($3, description), updated_at = NOW()
        WHERE id = $1 RETURNING *`,
      [before.id, b.name ?? null, b.description ?? null]
    );
    await logAudit({
      userId: req.user.id,
      projectId: suite.project_id,
      action: 'update',
      entityType: 'test_suite',
      entityId: suite.id,
      details: diff(before, suite, ['name', 'description']),
    });
    await invalidateSuites(suite.project_id);
    res.json(suite);
  })
);

router.delete(
  '/:id',
  authorize(...CAN_MANAGE),
  asyncHandler(async (req, res) => {
    const suite = await loadSuite(req.user, req.params.id);
    await db.query('DELETE FROM test_suites WHERE id = $1', [suite.id]);
    await logAudit({ userId: req.user.id, projectId: suite.project_id, action: 'delete', entityType: 'test_suite', entityId: suite.id, details: { name: suite.name } });
    await invalidateSuites(suite.project_id);
    res.status(204).end();
  })
);

router.post(
  '/:id/cases',
  authorize(...CAN_MANAGE),
  validate(schemas.addCases),
  asyncHandler(async (req, res) => {
    const suite = await loadSuite(req.user, req.params.id);
    const ids = [...new Set(req.valid.body.testCaseIds)];
    const { rows } = await db.query('SELECT id FROM test_cases WHERE id = ANY($1::int[]) AND project_id = $2', [ids, suite.project_id]);
    if (rows.length !== ids.length) throw new HttpError(400, 'One or more test cases do not belong to this project');
    const { rowCount } = await db.query(
      `INSERT INTO test_suite_cases (suite_id, test_case_id, position)
       SELECT $1, x.id, COALESCE((SELECT MAX(position) FROM test_suite_cases WHERE suite_id = $1), 0) + x.ord
         FROM unnest($2::int[]) WITH ORDINALITY AS x(id, ord)
       ON CONFLICT DO NOTHING`,
      [suite.id, ids]
    );
    await logAudit({ userId: req.user.id, projectId: suite.project_id, action: 'add_cases', entityType: 'test_suite', entityId: suite.id, details: { ids } });
    await invalidateSuites(suite.project_id);
    res.status(201).json({ added: rowCount });
  })
);

router.delete(
  '/:id/cases/:caseId',
  authorize(...CAN_MANAGE),
  asyncHandler(async (req, res) => {
    const suite = await loadSuite(req.user, req.params.id);
    const { rowCount } = await db.query('DELETE FROM test_suite_cases WHERE suite_id = $1 AND test_case_id = $2', [
      suite.id,
      Number(req.params.caseId),
    ]);
    if (!rowCount) throw new HttpError(404, 'Test case is not in this suite');
    await logAudit({
      userId: req.user.id,
      projectId: suite.project_id,
      action: 'remove_case',
      entityType: 'test_suite',
      entityId: suite.id,
      details: { testCaseId: Number(req.params.caseId) },
    });
    await invalidateSuites(suite.project_id);
    res.status(204).end();
  })
);

// Start a test run that steps through every case currently in the suite.
router.post(
  '/:id/runs',
  executionLimiter,
  authorize(...CAN_EXECUTE),
  validate(schemas.run),
  asyncHandler(async (req, res) => {
    const suite = await loadSuite(req.user, req.params.id);
    const { rows } = await db.query('SELECT test_case_id FROM test_suite_cases WHERE suite_id = $1 ORDER BY position, test_case_id', [suite.id]);
    if (!rows.length) throw new HttpError(400, 'Suite has no test cases to run');
    const name = req.valid.body.name || `${suite.name} – ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`;
    const {
      rows: [run],
    } = await db.query(
      `INSERT INTO test_runs (project_id, suite_id, name, case_ids, started_by) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [suite.project_id, suite.id, name, rows.map((r) => r.test_case_id), req.user.id]
    );
    await logAudit({ userId: req.user.id, projectId: suite.project_id, action: 'start_run', entityType: 'test_run', entityId: run.id, details: { suite: suite.name, cases: rows.length } });
    await invalidateSuites(suite.project_id);
    res.status(201).json(run);
  })
);

// Suite-level report: latest result breakdown, pass rate, and run history.
router.get(
  '/:id/report',
  asyncHandler(async (req, res) => {
    const suite = await loadSuite(req.user, req.params.id);
    const [breakdown, runs] = await Promise.all([
      db.query(
        `SELECT COALESCE(le.status, 'Pending') AS status, COUNT(*)::int AS count
           FROM test_suite_cases sc
           LEFT JOIN LATERAL (SELECT e.status FROM test_executions e WHERE e.test_case_id = sc.test_case_id
                               ORDER BY e.executed_at DESC, e.id DESC LIMIT 1) le ON TRUE
          WHERE sc.suite_id = $1 GROUP BY 1`,
        [suite.id]
      ),
      db.query(
        `SELECT r.id, r.name, r.status, r.started_at, r.completed_at, u.name AS started_by_name,
                cardinality(r.case_ids) AS total,
                COUNT(x.test_case_id)::int AS executed,
                COUNT(*) FILTER (WHERE x.status = 'Pass')::int AS passed,
                COUNT(*) FILTER (WHERE x.status = 'Fail')::int AS failed,
                COUNT(*) FILTER (WHERE x.status = 'Blocked')::int AS blocked,
                COUNT(*) FILTER (WHERE x.status = 'Skipped')::int AS skipped
           FROM test_runs r
           LEFT JOIN users u ON u.id = r.started_by
           LEFT JOIN LATERAL (SELECT DISTINCT ON (e.test_case_id) e.test_case_id, e.status FROM test_executions e
                               WHERE e.run_id = r.id ORDER BY e.test_case_id, e.executed_at DESC, e.id DESC) x ON TRUE
          WHERE r.suite_id = $1
          GROUP BY r.id, u.name ORDER BY r.started_at DESC LIMIT 20`,
        [suite.id]
      ),
    ]);
    const counts = { Pass: 0, Fail: 0, Blocked: 0, Skipped: 0, Pending: 0 };
    breakdown.rows.forEach((r) => (counts[r.status] = r.count));
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    const executed = total - counts.Pending;
    res.json({
      suite: { id: suite.id, name: suite.name },
      total,
      executed,
      breakdown: counts,
      passRate: executed ? counts.Pass / executed : 0,
      runs: runs.rows,
    });
  })
);

module.exports = router;
