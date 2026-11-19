const { client, isReady } = require('../config/redis');

const METRICS_PREFIX = 'cache:metrics:';
const prefixOf = (key) => key.split(':')[0];

async function recordMetric(key, hit, ms) {
  if (!isReady()) return;
  const metricsKey = METRICS_PREFIX + prefixOf(key);
  try {
    await client
      .multi()
      .hincrby(metricsKey, hit ? 'hits' : 'misses', 1)
      .hincrbyfloat(metricsKey, hit ? 'hit_ms' : 'miss_ms', ms)
      .exec();
  } catch {
    /* metrics are best effort */
  }
}

/**
 * Read-through cache. Returns the cached value or runs the loader and stores it.
 * When `res` is given, sets the X-Cache header (HIT | MISS | BYPASS).
 * If Redis is down the loader runs directly so the API never fails because of the cache.
 */
async function getOrSet(key, ttlSeconds, loader, res) {
  const started = process.hrtime.bigint();
  const elapsed = () => Number(process.hrtime.bigint() - started) / 1e6;

  if (!isReady()) {
    if (res) res.set('X-Cache', 'BYPASS');
    return loader();
  }
  try {
    const cached = await client.get(key);
    if (cached !== null) {
      const value = JSON.parse(cached);
      await recordMetric(key, true, elapsed());
      if (res) res.set('X-Cache', 'HIT');
      return value;
    }
  } catch (err) {
    console.warn('[cache] read failed:', err.message);
  }
  const value = await loader();
  try {
    await client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  } catch (err) {
    console.warn('[cache] write failed:', err.message);
  }
  await recordMetric(key, false, elapsed());
  if (res) res.set('X-Cache', 'MISS');
  return value;
}

// Deletes keys matching any of the glob patterns using SCAN (never KEYS).
async function invalidate(...patterns) {
  if (!isReady()) return 0;
  let deleted = 0;
  try {
    for (const pattern of patterns) {
      let cursor = '0';
      do {
        const [next, keys] = await client.scan(cursor, 'MATCH', pattern, 'COUNT', 200);
        cursor = next;
        if (keys.length) deleted += await client.del(...keys);
      } while (cursor !== '0');
    }
  } catch (err) {
    console.warn('[cache] invalidation failed:', err.message);
  }
  return deleted;
}

const keys = {
  analytics: (projectId, suffix = 'dashboard') => `analytics:${projectId}:${suffix}`,
  analyticsAll: (projectId) => `analytics:${projectId}:*`,
  suites: (projectId) => `suites:${projectId}:list`,
  project: (id) => `project:${id}`,
  projectsForUser: (userId) => `projects:user:${userId}`,
  projectsAllUsers: () => 'projects:user:*',
};

async function getMetrics() {
  const result = { redis: isReady() ? 'connected' : 'unavailable', prefixes: [] };
  if (!isReady()) return result;
  const metricKeys = [];
  let cursor = '0';
  do {
    const [next, found] = await client.scan(cursor, 'MATCH', `${METRICS_PREFIX}*`, 'COUNT', 100);
    cursor = next;
    metricKeys.push(...found);
  } while (cursor !== '0');

  let totalHits = 0;
  let totalMisses = 0;
  for (const k of metricKeys.sort()) {
    const h = await client.hgetall(k);
    const hits = Number(h.hits || 0);
    const misses = Number(h.misses || 0);
    totalHits += hits;
    totalMisses += misses;
    result.prefixes.push({
      prefix: k.slice(METRICS_PREFIX.length),
      hits,
      misses,
      hitRatio: hits + misses ? hits / (hits + misses) : 0,
      avgHitMs: hits ? Number(h.hit_ms) / hits : null,
      avgMissMs: misses ? Number(h.miss_ms) / misses : null,
    });
  }
  result.totals = {
    hits: totalHits,
    misses: totalMisses,
    hitRatio: totalHits + totalMisses ? totalHits / (totalHits + totalMisses) : 0,
  };
  try {
    // Some managed Redis providers (e.g. Upstash) restrict INFO; treat it as optional.
    const mem = /used_memory_human:(\S+)/.exec(await client.info('memory'));
    result.memoryUsed = mem ? mem[1] : null;
  } catch {
    result.memoryUsed = null;
  }
  result.cachedKeys = await countKeys(['analytics:*', 'suites:*', 'project:*', 'projects:*']);
  return result;
}

async function countKeys(patterns) {
  let n = 0;
  for (const p of patterns) {
    let cursor = '0';
    do {
      const [next, found] = await client.scan(cursor, 'MATCH', p, 'COUNT', 200);
      cursor = next;
      n += found.length;
    } while (cursor !== '0');
  }
  return n;
}

const resetMetrics = () => invalidate(`${METRICS_PREFIX}*`);

module.exports = { getOrSet, invalidate, keys, getMetrics, resetMetrics };
