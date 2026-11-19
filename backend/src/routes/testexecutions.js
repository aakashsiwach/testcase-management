const router = require('express').Router();
const db = require('../config/db');
const { executions: schemas } = require('../validators/schemas');
const { validate } = require('../middleware/validate');
const { authorize, CAN_EXECUTE } = require('../middleware/auth');
const { loadWithAccess } = require('../middleware/projectAccess');
const { upload, checkContent, safeFilename } = require('../middleware/upload');
const { asyncHandler, HttpError } = require('../middleware/errors');
const { logAudit, diff } = require('../services/audit');
const cache = require('../services/cache');

const loadExecution = (user, id) => loadWithAccess(user, 'SELECT * FROM test_executions WHERE id = $1', id, 'Execution');

// Testers may only change their own results; admins and leads may change any.
const assertCanModify = (user, execution) => {
  if (user.role === 'tester' && execution.executed_by !== user.id) {
    throw new HttpError(403, 'Testers can only modify their own executions');
  }
};

router.post(
  '/',
  authorize(...CAN_EXECUTE),
  validate(schemas.create),
  asyncHandler(async (req, res) => {
    const b = req.valid.body;
    const tc = await loadWithAccess(req.user, 'SELECT id, project_id, title FROM test_cases WHERE id = $1', b.testCaseId, 'Test case');
    if (b.runId) {
      const { rows } = await db.query('SELECT project_id, status, case_ids FROM test_runs WHERE id = $1', [b.runId]);
      const run = rows[0];
      if (!run || run.project_id !== tc.project_id) throw new HttpError(400, 'Run not found in this project');
      if (run.status !== 'in-progress') throw new HttpError(409, `Run is ${run.status}; start a new run to record results`);
      if (!run.case_ids.includes(tc.id)) throw new HttpError(400, 'Test case is not part of this run');
    }
    const execution = await db.withTransaction(async (c) => {
      const {
        rows: [row],
      } = await c.query(
        `INSERT INTO test_executions (test_case_id, project_id, run_id, executed_by, status, comments, duration_seconds)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [tc.id, tc.project_id, b.runId ?? null, req.user.id, b.status, b.comments, b.durationSeconds ?? null]
      );
      await logAudit(
        {
          userId: req.user.id,
          projectId: tc.project_id,
          action: 'execute',
          entityType: 'test_execution',
          entityId: row.id,
          details: { testCaseId: tc.id, title: tc.title, status: b.status, runId: b.runId ?? null },
        },
        c
      );
      return row;
    });
    await cache.invalidate(cache.keys.analyticsAll(tc.project_id));
    res.status(201).json(execution);
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const e = await loadExecution(req.user, req.params.id);
    const [detail, attachments] = await Promise.all([
      db.query(
        `SELECT e.*, u.name AS executed_by_name, tc.title AS test_case_title, r.name AS run_name
           FROM test_executions e
           JOIN test_cases tc ON tc.id = e.test_case_id
           LEFT JOIN users u ON u.id = e.executed_by
           LEFT JOIN test_runs r ON r.id = e.run_id
          WHERE e.id = $1`,
        [e.id]
      ),
      db.query(
        `SELECT a.id, a.filename, a.mime_type, a.size_bytes, a.created_at, u.name AS uploaded_by_name
           FROM execution_attachments a LEFT JOIN users u ON u.id = a.uploaded_by
          WHERE a.execution_id = $1 ORDER BY a.id`,
        [e.id]
      ),
    ]);
    res.json({ ...detail.rows[0], attachments: attachments.rows });
  })
);

router.put(
  '/:id',
  authorize(...CAN_EXECUTE),
  validate(schemas.update),
  asyncHandler(async (req, res) => {
    const before = await loadExecution(req.user, req.params.id);
    assertCanModify(req.user, before);
    const b = req.valid.body;
    const {
      rows: [row],
    } = await db.query(
      `UPDATE test_executions SET status = COALESCE($2, status), comments = COALESCE($3, comments), updated_at = NOW()
        WHERE id = $1 RETURNING *`,
      [before.id, b.status ?? null, b.comments ?? null]
    );
    await logAudit({
      userId: req.user.id,
      projectId: before.project_id,
      action: 'update',
      entityType: 'test_execution',
      entityId: before.id,
      details: { testCaseId: before.test_case_id, ...diff(before, row, ['status', 'comments']) },
    });
    await cache.invalidate(cache.keys.analyticsAll(before.project_id));
    res.json(row);
  })
);

// Attachments are stored in Postgres (bytea) because free-tier hosts have ephemeral disks.
router.post(
  '/:id/attachments',
  authorize(...CAN_EXECUTE),
  upload.array('files', 5),
  asyncHandler(async (req, res) => {
    const e = await loadExecution(req.user, req.params.id);
    assertCanModify(req.user, e);
    if (!req.files?.length) throw new HttpError(400, 'No files uploaded (use multipart field "files")');
    const prepared = req.files.map((f) => ({ name: safeFilename(f.originalname), mime: checkContent(f), file: f }));
    const saved = await db.withTransaction(async (c) => {
      const out = [];
      for (const p of prepared) {
        const {
          rows: [row],
        } = await c.query(
          `INSERT INTO execution_attachments (execution_id, filename, mime_type, size_bytes, data, uploaded_by)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, filename, mime_type, size_bytes, created_at`,
          [e.id, p.name, p.mime, p.file.size, p.file.buffer, req.user.id]
        );
        out.push(row);
      }
      await logAudit(
        {
          userId: req.user.id,
          projectId: e.project_id,
          action: 'attach',
          entityType: 'test_execution',
          entityId: e.id,
          details: { testCaseId: e.test_case_id, files: out.map((r) => r.filename) },
        },
        c
      );
      return out;
    });
    res.status(201).json({ data: saved });
  })
);

router.get(
  '/attachments/:attachmentId',
  asyncHandler(async (req, res) => {
    const a = await loadWithAccess(
      req.user,
      `SELECT a.*, e.project_id FROM execution_attachments a JOIN test_executions e ON e.id = a.execution_id WHERE a.id = $1`,
      req.params.attachmentId,
      'Attachment'
    );
    res.set({
      'Content-Type': a.mime_type,
      'Content-Length': a.size_bytes,
      'Content-Disposition': `attachment; filename="${a.filename.replace(/"/g, '')}"`,
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'",
      'Cache-Control': 'private, no-store',
    });
    res.send(a.data);
  })
);

module.exports = router;
