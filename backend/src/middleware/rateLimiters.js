const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const env = require('../config/env');

const HOUR = 60 * 60 * 1000;
const QUARTER = 15 * 60 * 1000;

const handler = (req, res, next, options) => {
  const retryAfter = Math.ceil((req.rateLimit.resetTime - Date.now()) / 1000);
  res.status(options.statusCode).json({
    error: `Too many requests. Limit is ${options.limit} per ${options.windowMs / 60000} minutes.`,
    retryAfterSeconds: Math.max(retryAfter, 1),
  });
};

const userKey = (req) => (req.user ? `u:${req.user.id}` : `ip:${ipKeyGenerator(req.ip)}`);

const make = (name, windowMs, limit, keyGenerator = userKey) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: (req) => `${name}:${keyGenerator(req)}`,
    handler,
  });

// Auth is keyed by IP + email so reviewers switching between demo accounts aren't locked out.
const authKey = (req) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.toLowerCase().trim() : '';
  return `${ipKeyGenerator(req.ip)}:${email}`;
};

module.exports = {
  authLimiter: make('auth', QUARTER, env.rateLimits.auth, authKey),
  testcaseLimiter: make('testcase', HOUR, env.rateLimits.testcase),
  executionLimiter: make('execution', HOUR, env.rateLimits.execution),
  analyticsLimiter: make('analytics', HOUR, env.rateLimits.analytics),
  generalLimiter: make('general', QUARTER, env.rateLimits.general),
};
