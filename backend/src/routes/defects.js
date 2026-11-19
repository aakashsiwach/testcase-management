const router = require('express').Router();
const db = require('../config/db');
const { defects: schemas } = require('../validators/schemas');
const { validate } = require('../middleware/validate');
const { authorize, CAN_EXECUTE } = require('../middleware/auth');
const { assertProjectAccess, loadWithAccess, isProjectMember } = require('../middleware/projectAccess');
const { executionLimiter } = require('../middleware/rateLimiters');
const { asyncHandler, HttpError } = require('../middleware/errors');
const { logAudit, diff } = require('../services/audit');
const cache = require('../services/cache');

const SELECT = `SELECT d.*, tc.title AS test_case_title, rb.name AS reported_by_name, a.name AS assignee_name
  FROM defects d
  LEFT JOIN test_cases tc ON tc.id = d.test_case_id
  LEFT JOIN users rb ON rb.id = d.reported_by
  LEFT JOIN users a ON a.id = d.assigned_to`;

async function assertAssignee(projectId, userId) {
  if (userId === null || userId === undefined) return;
  if (!(await isProjectMember(projectId, userId))) throw new HttpError(400, 'Assignee must be a member of the project');
}

router.get(
  '/',
  validate(schemas.list, 'query'),
  asyncHandler(async (req, res) => {
    const f = req.valid.query;
    const projectId = await assertProjectAccess(req.user, f.projectId);
    const params = [projectId];
    const where = ['d.project_id = $1'];
    const add = (v) => {
      params.push(v);
      return `$${params.length}`;
    };
    if (f.status?.length) where.push(`d.status = ANY(${add(f.status)}::varchar[])`);
    if (f.severity?.length) where.push(`d.severity = ANY(${add(f.severity)}::varchar[])`);
    if (f.testCaseId) where.push(`d.test_case_id = ${add(f.testCaseId)}`);
    if (f.q) where.push(`d.title ILIKE ${add(`%${f.q}%`)}`);
    const w = where.join(' AND ');
    const total = (await db.query(`SELECT COUNT(*)::int AS n FROM defects d WHERE ${w}`, params)).rows[0].n;
    const limit = add(f.pageSize);
    const offset = add((f.page - 1) * f.pageSize);
    const { rows } = await db.query(
      `${SELECT} WHERE ${w}
        ORDER BY array_position(ARRAY['Open','In Progress','Resolved','Closed']::varchar[], d.status),
                 array_position(ARRAY['Critical','High','Medium','Low']::varchar[], d.severity), d.id DESC
        LIMIT ${limit} OFFSET ${offset}`,
      params
    );
    res.json({ data: rows, total, page: f.page, pageSize: f.pageSize });
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const d = await loadWithAccess(req.user, 'SELECT id, project_id FROM defects WHERE id = $1', req.params.id, 'Defect');
    const { rows } = await db.query(`${SELECT} WHERE d.id = $1`, [d.id]);
    res.json(rows[0]);
  })
);

// Create a defect, optionally from a (failed) execution: test case is inferred from the execution.
router.post(
  '/',
  executionLimiter,
  authorize(...CAN_EXECUTE),
  validate(schemas.create),
  asyncHandler(async (req, res) => {
    const b = req.valid.body;
    const projectId = await assertProjectAccess(req.user, b.projectId);
    let testCaseId = b.testCaseId ?? null;
    if (b.executionId) {
      const { rows } = await db.query('SELECT test_case_id, project_id FROM test_executions WHERE id = $1', [b.executionId]);
      if (!rows[0] || rows[0].project_id !== projectId) throw new HttpError(400, 'Execution not found in this project');
      testCaseId = rows[0].test_case_id;
    } else if (testCaseId) {
      const { rows } = await db.query('SELECT project_id FROM test_cases WHERE id = $1', [testCaseId]);
      if (!rows[0] || rows[0].project_id !== projectId) throw new HttpError(400, 'Test case not found in this project');
    }
    await assertAssignee(projectId, b.assignedTo);
    const {
      rows: [defect],
    } = await db.query(
      `INSERT INTO defects (project_id, test_case_id, execution_id, title, description, severity, reported_by, assigned_to)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [projectId, testCaseId, b.executionId ?? null, b.title, b.description, b.severity, req.user.id, b.assignedTo ?? null]
    );
    await logAudit({
      userId: req.user.id,
      projectId,
      action: 'create',
      entityType: 'defect',
      entityId: defect.id,
      details: { title: defect.title, severity: defect.severity, testCaseId, executionId: b.executionId ?? null },
    });
    await cache.invalidate(cache.keys.analyticsAll(projectId));
    res.status(201).json(defect);
  })
);

router.put(
  '/:id',
  executionLimiter,
  authorize(...CAN_EXECUTE),
  validate(schemas.update),
  asyncHandler(async (req, res) => {
    const before = await loadWithAccess(req.user, 'SELECT * FROM defects WHERE id = $1', req.params.id, 'Defect');
    const b = req.valid.body;
    if (b.assignedTo !== undefined) await assertAssignee(before.project_id, b.assignedTo);
    const {
      rows: [row],
    } = await db.query(
      `UPDATE defects SET title = COALESCE($2, title), description = COALESCE($3, description),
              severity = COALESCE($4, severity), status = COALESCE($5, status),
              assigned_to = CASE WHEN $6::boolean THEN $7::int ELSE assigned_to END, updated_at = NOW()
        WHERE id = $1 RETURNING *`,
      [before.id, b.title ?? null, b.description ?? null, b.severity ?? null, b.status ?? null, b.assignedTo !== undefined, b.assignedTo ?? null]
    );
    await logAudit({
      userId: req.user.id,
      projectId: before.project_id,
      action: 'update',
      entityType: 'defect',
      entityId: before.id,
      details: diff(before, row, ['title', 'description', 'severity', 'status', 'assigned_to']),
    });
    await cache.invalidate(cache.keys.analyticsAll(before.project_id));
    res.json(row);
  })
);

module.exports = router;
