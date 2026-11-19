// Points the app at a dedicated test database / Redis DB before anything else is loaded.
require('dotenv').config({ quiet: true });

const base = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/testcase_mgmt';
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || base.replace(/\/[^/?]+(\?|$)/, '/testcase_test$1');
process.env.REDIS_URL = process.env.TEST_REDIS_URL ?? (process.env.REDIS_URL ? `${process.env.REDIS_URL.replace(/\/\d+$/, '')}/15` : '');
process.env.RATE_LIMIT_TESTCASE_MAX = '10000';
process.env.RATE_LIMIT_EXECUTION_MAX = '10000';
process.env.RATE_LIMIT_ANALYTICS_MAX = '10000';
process.env.RATE_LIMIT_GENERAL_MAX = '10000';

const { Client } = require('pg');
const request = require('supertest');

async function ensureDatabase() {
  const url = new URL(process.env.DATABASE_URL);
  const name = url.pathname.slice(1);
  url.pathname = '/postgres';
  const admin = new Client({ connectionString: url.toString() });
  await admin.connect();
  const { rowCount } = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
  if (!rowCount) await admin.query(`CREATE DATABASE "${name.replace(/"/g, '')}"`);
  await admin.end();
}

async function setup() {
  await ensureDatabase();
  const { seed } = require('../src/db/seed');
  await seed({ reset: true });
  const { client } = require('../src/config/redis');
  if (client) {
    await new Promise((resolve) => (client.status === 'ready' ? resolve() : client.once('ready', resolve)));
    await client.flushdb();
  }
  return require('../src/app');
}

async function teardown() {
  const { pool } = require('../src/config/db');
  const { client } = require('../src/config/redis');
  if (client) client.disconnect();
  await pool.end();
}

const CREDENTIALS = {
  admin: ['admin@demo.com', 'Admin@123'],
  lead: ['lead@demo.com', 'Lead@123'],
  tester: ['tester@demo.com', 'Tester@123'],
  viewer: ['viewer@demo.com', 'Viewer@123'],
};

async function login(app, who) {
  const [email, password] = CREDENTIALS[who];
  const res = await request(app).post('/api/auth/login').send({ email, password });
  if (res.status !== 200) throw new Error(`login ${who} failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.token;
}

module.exports = { setup, teardown, login, request };
