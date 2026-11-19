require('dotenv').config({ quiet: true });

const int = (v, d) => (v === undefined || v === '' || Number.isNaN(Number(v)) ? d : Number(v));
const isProd = process.env.NODE_ENV === 'production';

if (isProd && (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32)) {
  throw new Error('JWT_SECRET must be set to at least 32 characters in production');
}

module.exports = {
  isProd,
  isTest: process.env.NODE_ENV === 'test',
  port: int(process.env.PORT, 4000),
  databaseUrl: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/testcase_mgmt',
  databaseSsl: process.env.DATABASE_SSL === 'true',
  redisUrl: process.env.REDIS_URL || '',
  jwtSecret: process.env.JWT_SECRET || 'dev-only-insecure-secret-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
  corsOrigins: (process.env.CORS_ORIGIN || 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim().replace(/\/$/, ''))
    .filter(Boolean),
  rateLimits: {
    auth: int(process.env.RATE_LIMIT_AUTH_MAX, 5),
    testcase: int(process.env.RATE_LIMIT_TESTCASE_MAX, 100),
    execution: int(process.env.RATE_LIMIT_EXECUTION_MAX, 200),
    analytics: int(process.env.RATE_LIMIT_ANALYTICS_MAX, 50),
    general: int(process.env.RATE_LIMIT_GENERAL_MAX, 300),
  },
  ttl: {
    analytics: int(process.env.CACHE_TTL_ANALYTICS, 900),
    suites: int(process.env.CACHE_TTL_SUITES, 1800),
    project: int(process.env.CACHE_TTL_PROJECT, 3600),
  },
  maxUploadMb: int(process.env.MAX_UPLOAD_MB, 5),
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: int(process.env.SMTP_PORT, 587),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.MAIL_FROM || 'Test Case Manager <no-reply@example.com>',
  },
  appUrl: process.env.APP_URL || 'http://localhost:5173',
};
