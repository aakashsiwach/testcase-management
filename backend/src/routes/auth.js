const router = require('express').Router();
const bcrypt = require('bcryptjs');
const db = require('../config/db');
const { auth: schemas } = require('../validators/schemas');
const { validate } = require('../middleware/validate');
const { authLimiter } = require('../middleware/rateLimiters');
const { authenticate, signToken } = require('../middleware/auth');
const { asyncHandler, HttpError } = require('../middleware/errors');
const { logAudit } = require('../services/audit');

const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, role: u.role });

// Registration always creates a `tester` (the column default); only admins can change roles.
router.post(
  '/register',
  authLimiter,
  validate(schemas.register),
  asyncHandler(async (req, res) => {
    const { name, email, password } = req.valid.body;
    const hash = await bcrypt.hash(password, 10);
    let user;
    try {
      ({
        rows: [user],
      } = await db.query(
        'INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, name, email, role',
        [name, email, hash]
      ));
    } catch (err) {
      if (err.code === '23505') throw new HttpError(409, 'An account with this email already exists');
      throw err;
    }
    await logAudit({ userId: user.id, action: 'register', entityType: 'user', entityId: user.id });
    res.status(201).json({ token: signToken(user), user: publicUser(user) });
  })
);

router.post(
  '/login',
  authLimiter,
  validate(schemas.login),
  asyncHandler(async (req, res) => {
    const { email, password } = req.valid.body;
    const { rows } = await db.query('SELECT * FROM users WHERE LOWER(email) = $1', [email]);
    const user = rows[0];
    // Compare against a dummy hash when the user is unknown to keep timing similar.
    const ok = await bcrypt.compare(password, user ? user.password_hash : '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvali');
    if (!user || !ok) throw new HttpError(401, 'Invalid email or password');
    if (!user.is_active) throw new HttpError(403, 'This account has been deactivated');
    res.json({ token: signToken(user), user: publicUser(user) });
  })
);

router.get('/me', authenticate, (req, res) => res.json({ user: publicUser(req.user) }));

module.exports = router;
