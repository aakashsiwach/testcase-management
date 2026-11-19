const router = require('express').Router();
const db = require('../config/db');
const env = require('../config/env');
const { authorize, CAN_MANAGE } = require('../middleware/auth');
const { assertProjectAccess } = require('../middleware/projectAccess');
const { asyncHandler, HttpError } = require('../middleware/errors');
const { buildDashboard } = require('../services/analytics');
const { isReady } = require('../config/redis');
const cache = require('../services/cache');

router.get(
  '/cache',
  asyncHandler(async (req, res) => {
    res.json({
      ttlSeconds: env.ttl,
      ...(await cache.getMetrics()),
    });
  })
);

router.post(
  '/cache/reset',
  authorize('admin'),
  asyncHandler(async (req, res) => {
    await cache.resetMetrics();
    res.status(204).end();
  })
);

const time = async (fn) => {
  const t = process.hrtime.bigint();
  await fn();
  return Number(process.hrtime.bigint() - t) / 1e6;
};

// Measures uncached (cold) vs cached (warm) latency for each cached resource of a project.
router.post(
  '/cache/benchmark',
  authorize(...CAN_MANAGE),
  asyncHandler(async (req, res) => {
    if (!isReady()) throw new HttpError(503, 'Redis is not connected; cannot benchmark the cache');
    const projectId = await assertProjectAccess(req.user, req.query.projectId);
    const iterations = 5;
    const targets = [
      {
        name: 'Analytics dashboard',
        key: cache.keys.analytics(projectId, 'dashboard:30'),
        ttl: env.ttl.analytics,
        load: () => buildDashboard(projectId, 30),
      },
      {
        name: 'Suite list',
        key: cache.keys.suites(projectId),
        ttl: env.ttl.suites,
        load: async () =>
          (
            await db.query(
              `SELECT s.*, (SELECT COUNT(*)::int FROM test_suite_cases sc WHERE sc.suite_id = s.id) AS case_count
                 FROM test_suites s WHERE s.project_id = $1 ORDER BY s.name`,
              [projectId]
            )
          ).rows,
      },
      {
        name: 'Project metadata',
        key: cache.keys.project(projectId),
        ttl: env.ttl.project,
        load: async () => (await db.query('SELECT * FROM projects WHERE id = $1', [projectId])).rows[0],
      },
    ];
    const results = [];
    for (const t of targets) {
      let cold = 0;
      let warm = 0;
      for (let i = 0; i < iterations; i++) {
        await cache.invalidate(t.key);
        cold += await time(() => cache.getOrSet(t.key, t.ttl, t.load));
        warm += await time(() => cache.getOrSet(t.key, t.ttl, t.load));
      }
      // Leave a fresh entry behind, but invalidate the suite/project shapes the routes own.
      if (t.key !== cache.keys.analytics(projectId, 'dashboard:30')) await cache.invalidate(t.key);
      results.push({ name: t.name, uncachedMs: cold / iterations, cachedMs: warm / iterations, speedup: cold / Math.max(warm, 0.001) });
    }
    res.json({ iterations, results });
  })
);

module.exports = router;
