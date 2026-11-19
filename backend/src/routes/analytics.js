const router = require('express').Router();
const env = require('../config/env');
const { analytics: schemas } = require('../validators/schemas');
const { validate } = require('../middleware/validate');
const { assertProjectAccess } = require('../middleware/projectAccess');
const { asyncHandler } = require('../middleware/errors');
const { buildDashboard } = require('../services/analytics');
const cache = require('../services/cache');

// Available to every role (AC-RBAC-04). Cached for 15 minutes per project + period.
const dashboard = asyncHandler(async (req, res) => {
  const { projectId: pid, days } = req.valid.query;
  const projectId = await assertProjectAccess(req.user, pid);
  const data = await cache.getOrSet(
    cache.keys.analytics(projectId, `dashboard:${days}`),
    env.ttl.analytics,
    () => buildDashboard(projectId, days),
    res
  );
  res.json(data);
});

router.get('/', validate(schemas.query, 'query'), dashboard);
router.get('/dashboard', validate(schemas.query, 'query'), dashboard);

module.exports = router;
