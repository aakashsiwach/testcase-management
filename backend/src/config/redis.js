const Redis = require('ioredis');
const env = require('./env');

let client = null;

if (env.redisUrl) {
  client = new Redis(env.redisUrl, {
    lazyConnect: false,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    connectTimeout: 5000,
    retryStrategy: (times) => Math.min(times * 500, 10000),
  });
  let warned = false;
  client.on('error', (err) => {
    if (!warned) console.warn('[redis] unavailable, serving from Postgres:', err.message);
    warned = true;
  });
  client.on('ready', () => {
    warned = false;
    if (!env.isTest) console.log('[redis] connected');
  });
} else if (!env.isTest) {
  console.warn('[redis] REDIS_URL not set; caching disabled');
}

const isReady = () => Boolean(client && client.status === 'ready');

module.exports = { client, isReady };
