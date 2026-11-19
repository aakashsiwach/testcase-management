const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const swaggerUi = require('swagger-ui-express');
const env = require('./config/env');
const db = require('./config/db');
const { isReady } = require('./config/redis');
const { authenticate } = require('./middleware/auth');
const { notFound, errorHandler } = require('./middleware/errors');
const limiters = require('./middleware/rateLimiters');
const openapi = require('./docs/openapi');

const app = express();
app.set('trust proxy', 1); // Render / Vercel sit behind a proxy
app.disable('x-powered-by');

app.use(
  cors({
    origin(origin, cb) {
      // Allow non-browser clients (no Origin) and configured frontends.
      if (!origin || env.corsOrigins.includes('*') || env.corsOrigins.includes(origin)) return cb(null, true);
      cb(new Error(`Not allowed by CORS: ${origin}`));
    },
    exposedHeaders: ['X-Cache', 'RateLimit', 'RateLimit-Policy', 'Retry-After', 'Content-Disposition'],
    maxAge: 86400,
  })
);

// Swagger UI needs inline scripts/styles; keep strict CSP everywhere else.
app.use('/api/docs', helmet({ contentSecurityPolicy: false }), swaggerUi.serve, swaggerUi.setup(openapi, { customSiteTitle: 'TCMS API docs' }));
app.get('/api/openapi.json', (req, res) => res.json(openapi));

app.use(helmet());
app.use(express.json({ limit: '1mb' }));

app.get('/', (req, res) => res.json({ name: 'Test Case Management API', docs: '/api/docs', health: '/api/health' }));

app.get('/api/health', async (req, res) => {
  let database = 'ok';
  try {
    await db.query('SELECT 1');
  } catch {
    database = 'down';
  }
  const redis = isReady() ? 'ok' : env.redisUrl ? 'down' : 'disabled';
  res.status(database === 'ok' ? 200 : 503).json({ status: database === 'ok' ? 'ok' : 'degraded', database, redis, uptime: Math.round(process.uptime()) });
});

app.use('/api/auth', require('./routes/auth'));

// Everything below requires a valid Bearer token.
app.use('/api', authenticate);
app.use('/api/users', limiters.generalLimiter, require('./routes/users'));
app.use('/api/projects', limiters.generalLimiter, require('./routes/projects'));
app.use('/api/testcases', require('./routes/testcases')); // limiter applied per route inside
app.use('/api/testsuites', limiters.generalLimiter, require('./routes/testsuites'));
app.use('/api/testruns', limiters.executionLimiter, require('./routes/testruns'));
app.use('/api/testexecutions', limiters.executionLimiter, require('./routes/testexecutions'));
app.use('/api/defects', limiters.generalLimiter, require('./routes/defects'));
app.use('/api/analytics', limiters.analyticsLimiter, require('./routes/analytics'));
app.use('/api/metrics', limiters.generalLimiter, require('./routes/metrics'));

app.use(notFound);
app.use(errorHandler);

module.exports = app;
