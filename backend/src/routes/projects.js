const router = require('express').Router();
const db = require('../config/db');
const env = require('../config/env');
const { projects: schemas } = require('../validators/schemas');
const { validate } = require('../middleware/validate');
const { authorize, CAN_MANAGE } = require('../middleware/auth');
const { assertProjectAccess } = require('../middleware/projectAccess');
const { asyncHandler, HttpError } = require('../middleware/errors');
const { logAudit, diff } = require('../services/audit');
const cache = require('../services/cache');

const PROJECT_COLUMNS = `p.id, p.name, p.description, p.version, p.status, p.created_by, p.created_at, p.updated_at,
  (SELECT COUNT(*)::int FROM project_members m WHERE m.project_id = p.id) AS member_count`;

const invalidateProject = (id) =>
  cache.invalidate(cache.keys.project(id), cache.keys.projectsAllUsers());

// List projects visible to the current user (cached 1 h per user).
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const data = await cache.getOrSet(
      cache.keys.projectsForUser(req.user.id),
      env.ttl.project,
      async () => {
        const { rows } =
          req.user.role === 'admin'
            ? await db.query(`SELECT ${PROJECT_COLUMNS} FROM projects p ORDER BY p.status = 'archived', p.name`)
            : await db.query(
                `SELECT ${PROJECT_COLUMNS} FROM projects p
                   JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = $1
                  ORDER BY p.status = 'archived', p.name`,
                [req.user.id]
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
    const { name, description, version, status } = req.valid.body;
    const project = await db.withTransaction(async (c) => {
      const {
        rows: [p],
      } = await c.query(
        `INSERT INTO projects (name, description, version, status, created_by)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [name, description, version, status, req.user.id]
      );
      await c.query('INSERT INTO project_members (project_id, user_id) VALUES ($1, $2)', [p.id, req.user.id]);
      await logAudit({ userId: req.user.id, projectId: p.id, action: 'create', entityType: 'project', entityId: p.id, details: { name } }, c);
      return p;
    });
    await cache.invalidate(cache.keys.projectsAllUsers());
    res.status(201).json(project);
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = await assertProjectAccess(req.user, req.params.id);
    const project = await cache.getOrSet(
      cache.keys.project(id),
      env.ttl.project,
      async () => {
        const { rows } = await db.query(
          `SELECT ${PROJECT_COLUMNS}, u.name AS created_by_name
             FROM projects p LEFT JOIN users u ON u.id = p.created_by WHERE p.id = $1`,
          [id]
        );
        return rows[0];
      },
      res
    );
    res.json(project);
  })
);

router.put(
  '/:id',
  authorize(...CAN_MANAGE),
  validate(schemas.update),
  asyncHandler(async (req, res) => {
    const id = await assertProjectAccess(req.user, req.params.id);
    const b = req.valid.body;
    const before = (await db.query('SELECT * FROM projects WHERE id = $1', [id])).rows[0];
    const { rows } = await db.query(
      `UPDATE projects SET name = COALESCE($2, name), description = COALESCE($3, description),
              version = COALESCE($4, version), status = COALESCE($5, status), updated_at = NOW()
        WHERE id = $1 RETURNING *`,
      [id, b.name ?? null, b.description ?? null, b.version ?? null, b.status ?? null]
    );
    await logAudit({
      userId: req.user.id,
      projectId: id,
      action: 'update',
      entityType: 'project',
      entityId: id,
      details: diff(before, rows[0], ['name', 'description', 'version', 'status']),
    });
    await invalidateProject(id);
    res.json(rows[0]);
  })
);

router.delete(
  '/:id',
  authorize('admin'),
  asyncHandler(async (req, res) => {
    const id = await assertProjectAccess(req.user, req.params.id);
    const { rows } = await db.query('DELETE FROM projects WHERE id = $1 RETURNING name', [id]);
    await logAudit({ userId: req.user.id, action: 'delete', entityType: 'project', entityId: id, details: { name: rows[0].name } });
    await Promise.all([
      invalidateProject(id),
      cache.invalidate(cache.keys.analyticsAll(id), cache.keys.suites(id)),
    ]);
    res.status(204).end();
  })
);

// ---- Members ----

router.get(
  '/:id/members',
  asyncHandler(async (req, res) => {
    const id = await assertProjectAccess(req.user, req.params.id);
    const { rows } = await db.query(
      `SELECT u.id, u.name, u.email, u.role, m.added_at
         FROM project_members m JOIN users u ON u.id = m.user_id
        WHERE m.project_id = $1 AND u.is_active ORDER BY u.name`,
      [id]
    );
    res.json({ data: rows });
  })
);

// Active users who are not yet members: used by admins / leads to pick new members.
router.get(
  '/:id/candidates',
  authorize(...CAN_MANAGE),
  asyncHandler(async (req, res) => {
    const id = await assertProjectAccess(req.user, req.params.id);
    const { rows } = await db.query(
      `SELECT u.id, u.name, u.email, u.role FROM users u
        WHERE u.is_active AND NOT EXISTS (SELECT 1 FROM project_members m WHERE m.project_id = $1 AND m.user_id = u.id)
        ORDER BY u.name`,
      [id]
    );
    res.json({ data: rows });
  })
);

router.post(
  '/:id/members',
  authorize(...CAN_MANAGE),
  validate(schemas.addMember),
  asyncHandler(async (req, res) => {
    const id = await assertProjectAccess(req.user, req.params.id);
    const { userId } = req.valid.body;
    const user = (await db.query('SELECT id, name, is_active FROM users WHERE id = $1', [userId])).rows[0];
    if (!user || !user.is_active) throw new HttpError(404, 'User not found');
    const { rowCount } = await db.query(
      'INSERT INTO project_members (project_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [id, userId]
    );
    if (!rowCount) throw new HttpError(409, 'User is already a member');
    await logAudit({ userId: req.user.id, projectId: id, action: 'add_member', entityType: 'project', entityId: id, details: { member: user.name, memberId: userId } });
    await invalidateProject(id);
    res.status(201).json({ projectId: id, userId });
  })
);

router.delete(
  '/:id/members/:userId',
  authorize(...CAN_MANAGE),
  asyncHandler(async (req, res) => {
    const id = await assertProjectAccess(req.user, req.params.id);
    const userId = Number(req.params.userId);
    const { rowCount } = await db.query('DELETE FROM project_members WHERE project_id = $1 AND user_id = $2', [id, userId]);
    if (!rowCount) throw new HttpError(404, 'Member not found');
    // Unassign their open test cases in this project so nothing stays assigned to a non-member.
    await db.query('UPDATE test_cases SET assigned_to = NULL WHERE project_id = $1 AND assigned_to = $2', [id, userId]);
    await logAudit({ userId: req.user.id, projectId: id, action: 'remove_member', entityType: 'project', entityId: id, details: { memberId: userId } });
    await Promise.all([invalidateProject(id), cache.invalidate(cache.keys.analyticsAll(id))]);
    res.status(204).end();
  })
);

// ---- Audit trail for the project ----
router.get(
  '/:id/audit',
  validate(schemas.audit, 'query'),
  asyncHandler(async (req, res) => {
    const id = await assertProjectAccess(req.user, req.params.id);
    const { page, pageSize, entityType } = req.valid.query;
    const params = [id];
    let filter = '';
    if (entityType) {
      params.push(entityType);
      filter = 'AND a.entity_type = $2';
    }
    const total = (await db.query(`SELECT COUNT(*)::int AS n FROM audit_logs a WHERE a.project_id = $1 ${filter}`, params)).rows[0].n;
    params.push(pageSize, (page - 1) * pageSize);
    const { rows } = await db.query(
      `SELECT a.id, a.action, a.entity_type, a.entity_id, a.details, a.created_at, u.name AS user_name
         FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id
        WHERE a.project_id = $1 ${filter}
        ORDER BY a.created_at DESC, a.id DESC
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    res.json({ data: rows, total, page, pageSize });
  })
);

module.exports = router;
