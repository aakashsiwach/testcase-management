const jwt = require('jsonwebtoken');
const env = require('../config/env');
const db = require('../config/db');
const { HttpError, asyncHandler } = require('./errors');

const ROLES = ['admin', 'test-lead', 'tester', 'read-only'];

const signToken = (user) =>
  jwt.sign({ sub: user.id, role: user.role, name: user.name }, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn,
    algorithm: 'HS256',
  });

// Verifies the Bearer JWT and loads the (active) user. The role is re-read from the DB
// so a role change or deactivation takes effect immediately.
const authenticate = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) throw new HttpError(401, 'Missing or malformed Authorization header');
  let payload;
  try {
    payload = jwt.verify(token, env.jwtSecret, { algorithms: ['HS256'] });
  } catch {
    throw new HttpError(401, 'Invalid or expired token');
  }
  const { rows } = await db.query('SELECT id, name, email, role, is_active FROM users WHERE id = $1', [payload.sub]);
  const user = rows[0];
  if (!user || !user.is_active) throw new HttpError(401, 'User not found or inactive');
  req.user = user;
  next();
});

const authorize =
  (...roles) =>
  (req, res, next) => {
    if (!req.user) return next(new HttpError(401, 'Not authenticated'));
    if (!roles.includes(req.user.role)) {
      return next(new HttpError(403, `Forbidden: requires role ${roles.join(' or ')}`));
    }
    next();
  };

// Role groups used across routes
const CAN_MANAGE = ['admin', 'test-lead'];
const CAN_EXECUTE = ['admin', 'test-lead', 'tester'];

module.exports = { ROLES, CAN_MANAGE, CAN_EXECUTE, signToken, authenticate, authorize };
