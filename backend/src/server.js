const env = require('./config/env');
const app = require('./app');
const { pool } = require('./config/db');
const { client: redis } = require('./config/redis');

const server = app.listen(env.port, () => {
  console.log(`[api] listening on :${env.port} (docs at /api/docs)`);
});

const shutdown = (signal) => {
  console.log(`[api] ${signal} received, shutting down`);
  server.close(async () => {
    await pool.end().catch(() => {});
    if (redis) redis.disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
