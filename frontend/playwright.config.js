import { defineConfig, devices } from '@playwright/test';

// E2E smoke tests: boots the API on a freshly reseeded test database and the Vite dev server.
const API_PORT = 4001;
const WEB_PORT = 5174;
const DATABASE_URL = process.env.E2E_DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/testcase_test';
const REDIS_URL = process.env.E2E_REDIS_URL || 'redis://localhost:6379/3';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  outputDir: './e2e/.results',
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    ...devices['Desktop Chrome'],
    viewport: { width: 1366, height: 860 },
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      cwd: '../backend',
      command: `npm run db:reset && node -e "const R=require('ioredis');const r=new R(process.env.REDIS_URL);r.flushdb().then(()=>process.exit(0))" && node src/server.js`,
      url: `http://localhost:${API_PORT}/api/health`,
      timeout: 120_000,
      reuseExistingServer: false,
      env: {
        PORT: String(API_PORT),
        DATABASE_URL,
        REDIS_URL,
        CORS_ORIGIN: `http://localhost:${WEB_PORT}`,
        RATE_LIMIT_AUTH_MAX: '1000',
        RATE_LIMIT_TESTCASE_MAX: '10000',
        RATE_LIMIT_ANALYTICS_MAX: '10000',
      },
    },
    {
      command: `npx vite --port ${WEB_PORT} --strictPort`,
      url: `http://localhost:${WEB_PORT}`,
      timeout: 60_000,
      reuseExistingServer: false,
      env: { VITE_API_URL: `http://localhost:${API_PORT}` },
    },
  ],
});
