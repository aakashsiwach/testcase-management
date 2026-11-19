const router = require('express').Router();
const db = require('../config/db');
const { users: schemas } = require('../validators/schemas');
const { validate } = require('../middleware/validate');
const { authorize } = require('../middleware/auth');
const { asyncHandler, HttpError } = require('../middleware/errors');
const { logAudit } = require('../services/audit');
const cache = require('../services/cache');

// All user management is admin-only (AC-RBAC-05).
router.use(authorize('admin'));

router.get(
  '/',
  validate(schemas.list, 'query'),
  asyncHandler(async (req, res) => {
    const { q, page, pageSize } = req.valid.query;
    const params = [];
    let where = '';
    if (q) {
      params.push(`%${q}%`);
      where = `WHERE u.name ILIKE $1 OR u.email ILIKE $1`;
    }
    const total = (await db.query(`SELECT COUNT(*)::int AS n FROM users u ${where}`, params)).rows[0].n;
    params.push(pageSize, (page - 1) * pageSize);
    const { rows } = await db.query(
      `SELECT u.id, u.name, u.email, u.role, u.is_active, u.created_at,
              (SELECT COUNT(*)::int FROM project_members m WHERE m.user_id = u.id) AS project_count
         FROM users u ${where}
        ORDER BY u.id
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    res.json({ data: rows, total, page, pageSize });
  })
);

router.patch(
  '/:id',
  validate(schemas.update),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) throw new HttpError(400, 'Invalid user id');
    if (id === req.user.id) throw new HttpError(400, 'You cannot change your own role or status');
    const { role, isActive } = req.valid.body;
    const before = (await db.query('SELECT id, role, is_active FROM users WHERE id = $1', [id])).rows[0];
    if (!before) throw new HttpError(404, 'User not found');
    const { rows } = await db.query(
      `UPDATE users SET role = COALESCE($2, role), is_active = COALESCE($3, is_active), updated_at = NOW()
        WHERE id = $1 RETURNING id, name, email, role, is_active, created_at`,
      [id, role ?? null, isActive ?? null]
    );
    await logAudit({
      userId: req.user.id,
      action: 'update',
      entityType: 'user',
      entityId: id,
      details: { role: { from: before.role, to: rows[0].role }, isActive: { from: before.is_active, to: rows[0].is_active } },
    });
    await cache.invalidate(cache.keys.projectsForUser(id));
    res.json(rows[0]);
  })
);

module.exports = router;
