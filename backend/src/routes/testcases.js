const router = require('express').Router();
const db = require('../config/db');
const { testCases: schemas, PRIORITIES, TYPES } = require('../validators/schemas');
const { validate, sanitize } = require('../middleware/validate');
const { authorize, CAN_MANAGE, CAN_EXECUTE } = require('../middleware/auth');
const { assertProjectAccess, loadWithAccess } = require('../middleware/projectAccess');
const { asyncHandler, HttpError } = require('../middleware/errors');
const { logAudit, diff } = require('../services/audit');
const { notifyAssignment } = require('../services/notification');
const { parseCsv, toCsv } = require('../services/csv');
const cache = require('../services/cache');
const { testcaseLimiter, generalLimiter } = require('../middleware/rateLimiters');

// CRUD, bulk, import/export and assignment count against the 100/h test case limit;
// read-only sub-resources (history, versions, comments, audit, tags) use the general limiter.
const SUB_RESOURCE = /^\/(tags|\d+\/(executions|versions|comments|audit))\/?$/;
router.use((req, res, next) => (req.method === 'GET' && SUB_RESOURCE.test(req.path) ? generalLimiter : testcaseLimiter)(req, res, next));

const loadCase = (user, id) => loadWithAccess(user, 'SELECT * FROM test_cases WHERE id = $1', id, 'Test case');

const invalidateFor = (projectId, { suites = false } = {}) =>
  cache.invalidate(cache.keys.analyticsAll(projectId), ...(suites ? [cache.keys.suites(projectId)] : []));

// Stores a JSON snapshot of the current state of each test case as its current version.
const saveVersions = (conn, ids, userId) =>
  conn.query(
    `INSERT INTO test_case_versions (test_case_id, version, snapshot, changed_by)
     SELECT tc.id, tc.version, jsonb_build_object(
              'title', tc.title, 'description', tc.description, 'priority', tc.priority, 'type', tc.type,
              'preconditions', tc.preconditions, 'postconditions', tc.postconditions, 'tags', tc.tags,
              'assignedTo', tc.assigned_to,
              'steps', COALESCE((SELECT jsonb_agg(jsonb_build_object('action', s.action, 'expectedResult', s.expected_result)
                                   ORDER BY s.step_number) FROM test_steps s WHERE s.test_case_id = tc.id), '[]'::jsonb)),
            $2
       FROM test_cases tc WHERE tc.id = ANY($1::int[])
     ON CONFLICT (test_case_id, version) DO NOTHING`,
    [ids, userId]
  );

const insertSteps = async (conn, caseId, steps) => {
  for (let i = 0; i < steps.length; i++) {
    await conn.query(
      'INSERT INTO test_steps (test_case_id, step_number, action, expected_result) VALUES ($1, $2, $3, $4)',
      [caseId, i + 1, steps[i].action, steps[i].expectedResult]
    );
  }
};

// Assignees must be active project members who can execute tests.
async function assertAssignable(projectId, userId) {
  if (userId === null || userId === undefined) return;
  const { rows } = await db.query(
    `SELECT u.role FROM users u JOIN project_members m ON m.user_id = u.id AND m.project_id = $1
      WHERE u.id = $2 AND u.is_active`,
    [projectId, userId]
  );
  if (!rows[0]) throw new HttpError(400, 'Assignee must be an active member of the project');
  if (rows[0].role === 'read-only') throw new HttpError(400, 'Read-only users cannot be assigned test cases');
}

async function assertSuitesInProject(projectId, suiteIds) {
  if (!suiteIds || !suiteIds.length) return;
  const { rows } = await db.query('SELECT id FROM test_suites WHERE id = ANY($1::int[]) AND project_id = $2', [
    suiteIds,
    projectId,
  ]);
  if (rows.length !== new Set(suiteIds).size) throw new HttpError(400, 'One or more suites do not belong to this project');
}

const addToSuite = (conn, suiteId, caseIds) =>
  conn.query(
    `INSERT INTO test_suite_cases (suite_id, test_case_id, position)
     SELECT $1, x.id, COALESCE((SELECT MAX(position) FROM test_suite_cases WHERE suite_id = $1), 0) + x.ord
       FROM unnest($2::int[]) WITH ORDINALITY AS x(id, ord)
     ON CONFLICT DO NOTHING`,
    [suiteId, caseIds]
  );

// ---------- List with multi-criteria filters + server-side pagination ----------

const SORT_SQL = {
  id: 'tc.id',
  title: 'tc.title',
  priority: `array_position(ARRAY['Low','Medium','High','Critical']::varchar[], tc.priority)`,
  type: 'tc.type',
  updated_at: 'tc.updated_at',
  created_at: 'tc.created_at',
  last_executed_at: 'le.executed_at',
  last_status: 'le.status',
};

const LATEST_EXECUTION_JOIN = `LEFT JOIN LATERAL (
    SELECT e.status, e.executed_at FROM test_executions e
     WHERE e.test_case_id = tc.id ORDER BY e.executed_at DESC, e.id DESC LIMIT 1
  ) le ON TRUE`;

router.get(
  '/',
  validate(schemas.list, 'query'),
  asyncHandler(async (req, res) => {
    const f = req.valid.query;
    const projectId = await assertProjectAccess(req.user, f.projectId);
    const params = [projectId];
    const where = ['tc.project_id = $1'];
    const add = (value) => {
      params.push(value);
      return `$${params.length}`;
    };

    if (f.q) {
      const ftsParam = add(f.q);
      const likeParam = add(`%${f.q}%`);
      where.push(
        `(to_tsvector('english', tc.title || ' ' || tc.description) @@ plainto_tsquery('english', ${ftsParam})
          OR tc.title ILIKE ${likeParam} OR tc.id::text = ${ftsParam})`
      );
    }
    if (f.priority?.length) where.push(`tc.priority = ANY(${add(f.priority)}::varchar[])`);
    if (f.type?.length) where.push(`tc.type = ANY(${add(f.type)}::varchar[])`);
    if (f.tags?.length) where.push(`tc.tags && ${add(f.tags)}::text[]`);
    if (f.suiteId) {
      where.push(`EXISTS (SELECT 1 FROM test_suite_cases sc WHERE sc.test_case_id = tc.id AND sc.suite_id = ${add(f.suiteId)})`);
    }
    if (f.assignedTo === 'me') where.push(`tc.assigned_to = ${add(req.user.id)}`);
    else if (f.assignedTo === 'unassigned') where.push('tc.assigned_to IS NULL');
    else if (f.assignedTo) where.push(`tc.assigned_to = ${add(f.assignedTo)}`);
    if (f.lastResult?.length) {
      const results = f.lastResult.filter((r) => r !== 'Pending');
      const parts = [];
      if (results.length) parts.push(`le.status = ANY(${add(results)}::varchar[])`);
      if (f.lastResult.includes('Pending')) parts.push('le.status IS NULL');
      where.push(`(${parts.join(' OR ')})`);
    }

    const whereSql = `WHERE ${where.join(' AND ')}`;
    const total = (await db.query(`SELECT COUNT(*)::int AS n FROM test_cases tc ${LATEST_EXECUTION_JOIN} ${whereSql}`, params))
      .rows[0].n;
    const order = f.order === 'asc' ? 'ASC' : 'DESC';
    const limit = add(f.pageSize);
    const offset = add((f.page - 1) * f.pageSize);
    const { rows } = await db.query(
      `SELECT tc.id, tc.title, tc.priority, tc.type, tc.tags, tc.assigned_to, tc.version, tc.updated_at,
              u.name AS assignee_name, le.status AS last_status, le.executed_at AS last_executed_at,
              (SELECT COUNT(*)::int FROM test_steps s WHERE s.test_case_id = tc.id) AS step_count
         FROM test_cases tc ${LATEST_EXECUTION_JOIN}
         LEFT JOIN users u ON u.id = tc.assigned_to
         ${whereSql}
        ORDER BY ${SORT_SQL[f.sort]} ${order} NULLS LAST, tc.id ${order}
        LIMIT ${limit} OFFSET ${offset}`,
      params
    );
    res.json({ data: rows, total, page: f.page, pageSize: f.pageSize });
  })
);

// Distinct tags in a project (for the tag filter)
router.get(
  '/tags',
  validate(schemas.exportQuery, 'query'),
  asyncHandler(async (req, res) => {
    const projectId = await assertProjectAccess(req.user, req.valid.query.projectId);
    const { rows } = await db.query(
      'SELECT DISTINCT unnest(tags) AS tag FROM test_cases WHERE project_id = $1 ORDER BY 1',
      [projectId]
    );
    res.json({ data: rows.map((r) => r.tag) });
  })
);

// ---------- CSV export / import (bonus) ----------

router.get(
  '/export',
  validate(schemas.exportQuery, 'query'),
  asyncHandler(async (req, res) => {
    const projectId = await assertProjectAccess(req.user, req.valid.query.projectId);
    const { rows } = await db.query(
      `SELECT tc.id, tc.title, tc.description, tc.priority, tc.type, tc.preconditions, tc.postconditions,
              array_to_string(tc.tags, ';') AS tags, u.email AS assigned_to, le.status AS last_status,
              COALESCE((SELECT string_agg(s.step_number || '. ' || s.action || ' -> ' || s.expected_result, E'\n' ORDER BY s.step_number)
                          FROM test_steps s WHERE s.test_case_id = tc.id), '') AS steps
         FROM test_cases tc ${LATEST_EXECUTION_JOIN}
         LEFT JOIN users u ON u.id = tc.assigned_to
        WHERE tc.project_id = $1 ORDER BY tc.id`,
      [projectId]
    );
    const headers = ['id', 'title', 'description', 'priority', 'type', 'preconditions', 'postconditions', 'tags', 'steps', 'assigned_to', 'last_status'];
    res.set('Content-Type', 'text/csv; charset=utf-8');
    res.set('Content-Disposition', `attachment; filename="testcases-project-${projectId}.csv"`);
    res.send(toCsv(headers, rows));
  })
);

const parseSteps = (text) =>
  (text || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [action, ...rest] = l.replace(/^\d+[.)]\s*/, '').split(' -> ');
      return { action: action.trim(), expectedResult: rest.join(' -> ').trim() };
    });

router.post(
  '/import',
  authorize(...CAN_MANAGE),
  validate(schemas.import),
  asyncHandler(async (req, res) => {
    const projectId = await assertProjectAccess(req.user, req.valid.body.projectId);
    // Parse the raw CSV (validate() sanitized it already).
    const rows = parseCsv(req.valid.body.csv);
    if (rows.length < 2) throw new HttpError(400, 'CSV must have a header row and at least one data row');
    const header = rows[0].map((h) => h.trim().toLowerCase());
    if (!header.includes('title')) throw new HttpError(400, 'CSV header must include a "title" column');
    if (rows.length - 1 > 500) throw new HttpError(400, 'Import is limited to 500 rows');

    const errors = [];
    const valid = [];
    rows.slice(1).forEach((cells, i) => {
      const rec = Object.fromEntries(header.map((h, j) => [h, (cells[j] || '').trim()]));
      const candidate = {
        projectId,
        title: rec.title,
        description: rec.description || '',
        priority: PRIORITIES.find((p) => p.toLowerCase() === (rec.priority || 'medium').toLowerCase()) || rec.priority,
        type: TYPES.find((t) => t.toLowerCase() === (rec.type || 'functional').toLowerCase()) || rec.type,
        preconditions: rec.preconditions || '',
        postconditions: rec.postconditions || '',
        tags: (rec.tags || '').split(/[;|]/).map((t) => t.trim()).filter(Boolean),
        steps: parseSteps(rec.steps),
      };
      const result = schemas.create.safeParse(candidate);
      if (result.success) valid.push(sanitize(result.data));
      else errors.push({ row: i + 2, message: result.error.issues.map((x) => `${x.path.join('.')}: ${x.message}`).join('; ') });
    });
    if (errors.length) throw new HttpError(400, 'Import failed: fix the listed rows and try again', errors.slice(0, 50));

    const ids = await db.withTransaction(async (c) => {
      const created = [];
      for (const tc of valid) {
        const {
          rows: [row],
        } = await c.query(
          `INSERT INTO test_cases (project_id, title, description, priority, type, preconditions, postconditions, tags, created_by, updated_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9) RETURNING id`,
          [projectId, tc.title, tc.description, tc.priority, tc.type, tc.preconditions, tc.postconditions, tc.tags, req.user.id]
        );
        await insertSteps(c, row.id, tc.steps);
        created.push(row.id);
      }
      await saveVersions(c, created, req.user.id);
      await logAudit({ userId: req.user.id, projectId, action: 'import', entityType: 'test_case', details: { count: created.length } }, c);
      return created;
    });
    await invalidateFor(projectId);
    res.status(201).json({ imported: ids.length, ids });
  })
);

// ---------- Bulk operations ----------

router.post(
  '/bulk',
  authorize(...CAN_MANAGE),
  validate(schemas.bulk),
  asyncHandler(async (req, res) => {
    const b = req.valid.body;
    const projectId = await assertProjectAccess(req.user, b.projectId);
    const ids = [...new Set(b.ids)];
    const { rows: found } = await db.query('SELECT id, title FROM test_cases WHERE id = ANY($1::int[]) AND project_id = $2', [ids, projectId]);
    if (found.length !== ids.length) throw new HttpError(400, 'One or more test cases do not belong to this project');

    let affected = 0;
    await db.withTransaction(async (c) => {
      if (b.action === 'delete') {
        affected = (await c.query('DELETE FROM test_cases WHERE id = ANY($1::int[])', [ids])).rowCount;
      } else if (b.action === 'update-priority') {
        affected = (
          await c.query(
            `UPDATE test_cases SET priority = $2, version = version + 1, updated_by = $3, updated_at = NOW()
              WHERE id = ANY($1::int[]) AND priority <> $2`,
            [ids, b.priority, req.user.id]
          )
        ).rowCount;
        await saveVersions(c, ids, req.user.id);
      } else if (b.action === 'add-to-suite') {
        await assertSuitesInProject(projectId, [b.suiteId]);
        affected = (await addToSuite(c, b.suiteId, ids)).rowCount;
      } else if (b.action === 'assign') {
        await assertAssignable(projectId, b.assigneeId);
        affected = (
          await c.query('UPDATE test_cases SET assigned_to = $2, updated_by = $3, updated_at = NOW() WHERE id = ANY($1::int[])', [
            ids,
            b.assigneeId,
            req.user.id,
          ])
        ).rowCount;
      }
      await logAudit(
        {
          userId: req.user.id,
          projectId,
          action: `bulk_${b.action.replace(/-/g, '_')}`,
          entityType: 'test_case',
          details: { ids, priority: b.priority, suiteId: b.suiteId, assigneeId: b.assigneeId },
        },
        c
      );
    });
    await invalidateFor(projectId, { suites: b.action === 'delete' || b.action === 'add-to-suite' });
    if (b.action === 'assign' && b.assigneeId) notifyAssignment(b.assigneeId, found, req.user);
    res.json({ action: b.action, affected });
  })
);

// ---------- Single test case ----------

router.post(
  '/',
  authorize(...CAN_MANAGE),
  validate(schemas.create),
  asyncHandler(async (req, res) => {
    const b = req.valid.body;
    const projectId = await assertProjectAccess(req.user, b.projectId);
    await assertAssignable(projectId, b.assignedTo);
    await assertSuitesInProject(projectId, b.suiteIds);
    const tc = await db.withTransaction(async (c) => {
      const {
        rows: [row],
      } = await c.query(
        `INSERT INTO test_cases (project_id, title, description, priority, type, preconditions, postconditions, tags,
                                 assigned_to, created_by, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10) RETURNING *`,
        [projectId, b.title, b.description, b.priority, b.type, b.preconditions, b.postconditions, b.tags, b.assignedTo ?? null, req.user.id]
      );
      await insertSteps(c, row.id, b.steps);
      for (const suiteId of b.suiteIds || []) await addToSuite(c, suiteId, [row.id]);
      await saveVersions(c, [row.id], req.user.id);
      await logAudit({ userId: req.user.id, projectId, action: 'create', entityType: 'test_case', entityId: row.id, details: { title: row.title } }, c);
      return row;
    });
    await invalidateFor(projectId, { suites: Boolean(b.suiteIds?.length) });
    if (tc.assigned_to) notifyAssignment(tc.assigned_to, [tc], req.user);
    res.status(201).json(tc);
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const base = await loadCase(req.user, req.params.id);
    const [detail, steps, suites, defects] = await Promise.all([
      db.query(
        `SELECT tc.*, a.name AS assignee_name, cb.name AS created_by_name, ub.name AS updated_by_name,
                le.status AS last_status, le.executed_at AS last_executed_at
           FROM test_cases tc ${LATEST_EXECUTION_JOIN}
           LEFT JOIN users a ON a.id = tc.assigned_to
           LEFT JOIN users cb ON cb.id = tc.created_by
           LEFT JOIN users ub ON ub.id = tc.updated_by
          WHERE tc.id = $1`,
        [base.id]
      ),
      db.query('SELECT id, step_number, action, expected_result FROM test_steps WHERE test_case_id = $1 ORDER BY step_number', [base.id]),
      db.query(
        `SELECT s.id, s.name FROM test_suites s JOIN test_suite_cases sc ON sc.suite_id = s.id
          WHERE sc.test_case_id = $1 ORDER BY s.name`,
        [base.id]
      ),
      db.query(`SELECT COUNT(*) FILTER (WHERE status IN ('Open','In Progress'))::int AS open, COUNT(*)::int AS total
                  FROM defects WHERE test_case_id = $1`, [base.id]),
    ]);
    res.json({ ...detail.rows[0], steps: steps.rows, suites: suites.rows, defects: defects.rows[0] });
  })
);

const AUDITED_FIELDS = ['title', 'description', 'priority', 'type', 'preconditions', 'postconditions', 'tags', 'assigned_to'];

router.put(
  '/:id',
  authorize(...CAN_MANAGE),
  validate(schemas.update),
  asyncHandler(async (req, res) => {
    const before = await loadCase(req.user, req.params.id);
    const b = req.valid.body;
    if (b.assignedTo !== undefined) await assertAssignable(before.project_id, b.assignedTo);

    const next = {
      title: b.title ?? before.title,
      description: b.description ?? before.description,
      priority: b.priority ?? before.priority,
      type: b.type ?? before.type,
      preconditions: b.preconditions ?? before.preconditions,
      postconditions: b.postconditions ?? before.postconditions,
      tags: b.tags ?? before.tags,
      assigned_to: b.assignedTo === undefined ? before.assigned_to : b.assignedTo,
    };
    const changes = diff(before, next, AUDITED_FIELDS);

    let stepsChanged = false;
    if (b.steps) {
      const { rows: oldSteps } = await db.query(
        'SELECT action, expected_result AS "expectedResult" FROM test_steps WHERE test_case_id = $1 ORDER BY step_number',
        [before.id]
      );
      stepsChanged = JSON.stringify(oldSteps) !== JSON.stringify(b.steps);
      if (stepsChanged) changes.steps = { from: oldSteps.length, to: b.steps.length };
    }
    if (!Object.keys(changes).length) return res.json(before);

    const updated = await db.withTransaction(async (c) => {
      const {
        rows: [row],
      } = await c.query(
        `UPDATE test_cases SET title = $2, description = $3, priority = $4, type = $5, preconditions = $6,
                postconditions = $7, tags = $8, assigned_to = $9, version = version + 1, updated_by = $10, updated_at = NOW()
          WHERE id = $1 RETURNING *`,
        [before.id, next.title, next.description, next.priority, next.type, next.preconditions, next.postconditions, next.tags, next.assigned_to, req.user.id]
      );
      if (stepsChanged) {
        await c.query('DELETE FROM test_steps WHERE test_case_id = $1', [before.id]);
        await insertSteps(c, before.id, b.steps);
      }
      await saveVersions(c, [before.id], req.user.id);
      await logAudit({ userId: req.user.id, projectId: before.project_id, action: 'update', entityType: 'test_case', entityId: before.id, details: changes }, c);
      return row;
    });
    await invalidateFor(before.project_id);
    if (changes.assigned_to && updated.assigned_to) notifyAssignment(updated.assigned_to, [updated], req.user);
    res.json(updated);
  })
);

router.delete(
  '/:id',
  authorize(...CAN_MANAGE),
  asyncHandler(async (req, res) => {
    const tc = await loadCase(req.user, req.params.id);
    await db.withTransaction(async (c) => {
      await c.query('DELETE FROM test_cases WHERE id = $1', [tc.id]);
      await logAudit({ userId: req.user.id, projectId: tc.project_id, action: 'delete', entityType: 'test_case', entityId: tc.id, details: { title: tc.title } }, c);
    });
    await invalidateFor(tc.project_id, { suites: true });
    res.status(204).end();
  })
);

router.patch(
  '/:id/assign',
  authorize(...CAN_MANAGE),
  validate(schemas.assign),
  asyncHandler(async (req, res) => {
    const tc = await loadCase(req.user, req.params.id);
    const { assigneeId } = req.valid.body;
    await assertAssignable(tc.project_id, assigneeId);
    const {
      rows: [row],
    } = await db.query('UPDATE test_cases SET assigned_to = $2, updated_by = $3, updated_at = NOW() WHERE id = $1 RETURNING *', [
      tc.id,
      assigneeId,
      req.user.id,
    ]);
    await logAudit({
      userId: req.user.id,
      projectId: tc.project_id,
      action: 'assign',
      entityType: 'test_case',
      entityId: tc.id,
      details: { assigned_to: { from: tc.assigned_to, to: assigneeId } },
    });
    await invalidateFor(tc.project_id);
    if (assigneeId) notifyAssignment(assigneeId, [row], req.user);
    res.json(row);
  })
);

// ---------- History (lazy-loaded by the UI), versions, comments, audit ----------

router.get(
  '/:id/executions',
  validate(schemas.page, 'query'),
  asyncHandler(async (req, res) => {
    const tc = await loadCase(req.user, req.params.id);
    const { page, pageSize } = req.valid.query;
    const total = (await db.query('SELECT COUNT(*)::int AS n FROM test_executions WHERE test_case_id = $1', [tc.id])).rows[0].n;
    const { rows } = await db.query(
      `SELECT e.id, e.status, e.comments, e.duration_seconds, e.executed_at, e.run_id, r.name AS run_name,
              u.name AS executed_by_name, e.executed_by,
              (SELECT COUNT(*)::int FROM execution_attachments a WHERE a.execution_id = e.id) AS attachment_count,
              (SELECT COALESCE(json_agg(json_build_object('id', d.id, 'title', d.title, 'status', d.status)), '[]')
                 FROM defects d WHERE d.execution_id = e.id) AS defects
         FROM test_executions e
         LEFT JOIN users u ON u.id = e.executed_by
         LEFT JOIN test_runs r ON r.id = e.run_id
        WHERE e.test_case_id = $1
        ORDER BY e.executed_at DESC, e.id DESC LIMIT $2 OFFSET $3`,
      [tc.id, pageSize, (page - 1) * pageSize]
    );
    res.json({ data: rows, total, page, pageSize });
  })
);

router.get(
  '/:id/versions',
  asyncHandler(async (req, res) => {
    const tc = await loadCase(req.user, req.params.id);
    const { rows } = await db.query(
      `SELECT v.version, v.snapshot, v.changed_at, u.name AS changed_by_name
         FROM test_case_versions v LEFT JOIN users u ON u.id = v.changed_by
        WHERE v.test_case_id = $1 ORDER BY v.version DESC`,
      [tc.id]
    );
    res.json({ data: rows });
  })
);

router.get(
  '/:id/comments',
  asyncHandler(async (req, res) => {
    const tc = await loadCase(req.user, req.params.id);
    const { rows } = await db.query(
      `SELECT c.id, c.body, c.created_at, c.user_id, u.name AS user_name, u.role AS user_role
         FROM test_case_comments c LEFT JOIN users u ON u.id = c.user_id
        WHERE c.test_case_id = $1 ORDER BY c.created_at, c.id`,
      [tc.id]
    );
    res.json({ data: rows });
  })
);

router.post(
  '/:id/comments',
  authorize(...CAN_EXECUTE),
  validate(schemas.comment),
  asyncHandler(async (req, res) => {
    const tc = await loadCase(req.user, req.params.id);
    const {
      rows: [row],
    } = await db.query('INSERT INTO test_case_comments (test_case_id, user_id, body) VALUES ($1, $2, $3) RETURNING *', [
      tc.id,
      req.user.id,
      req.valid.body.body,
    ]);
    await logAudit({ userId: req.user.id, projectId: tc.project_id, action: 'comment', entityType: 'test_case', entityId: tc.id });
    res.status(201).json({ ...row, user_name: req.user.name, user_role: req.user.role });
  })
);

router.get(
  '/:id/audit',
  asyncHandler(async (req, res) => {
    const tc = await loadCase(req.user, req.params.id);
    const { rows } = await db.query(
      `SELECT a.id, a.action, a.details, a.created_at, u.name AS user_name
         FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id
        WHERE (a.entity_type = 'test_case' AND a.entity_id = $1)
           OR (a.entity_type = 'test_execution' AND (a.details->>'testCaseId')::int = $1)
        ORDER BY a.created_at DESC, a.id DESC LIMIT 200`,
      [tc.id]
    );
    res.json({ data: rows });
  })
);

module.exports = router;
