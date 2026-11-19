# Test Case Management System

A full-stack web app for QA teams to **create, organize, assign and execute test cases and suites**, record results and defects, and track quality on an analytics dashboard. Access is controlled by four roles.

Scope and status are tracked against the acceptance criteria in [`docs/REQUIREMENTS.md`](docs/REQUIREMENTS.md).

## Live demo

| | URL |
|---|---|
| App (Vercel) | _set after deployment_ |
| API (Render) | _set after deployment_ |
| API docs (Swagger) | `<API URL>/api/docs` |
| Health check | `<API URL>/api/health` |

### Demo credentials

| Role | Email | Password | Can do |
|---|---|---|---|
| Admin | `admin@demo.com` | `Admin@123` | Everything, including user management and deleting projects |
| Test Lead | `lead@demo.com` | `Lead@123` | Manage projects, members, test cases and suites; assign; execute |
| Tester | `tester@demo.com` | `Tester@123` | Execute tests, record results, raise defects, comment |
| Read Only | `viewer@demo.com` | `Viewer@123` | View test cases, results, reports and dashboards |

The seed also creates `sam@demo.com` / `priya@demo.com` (Tester@123) and `maya@demo.com` (Lead@123).

## Features

- **Auth & RBAC:** register and log in with JWT (`role` is a claim). New users are `tester`. Roles are enforced by Express middleware on every route, and non-admins are scoped to projects they're members of. The UI hides or disables actions per role.
- **Projects:** name, description, version, status; add and remove team members.
- **Test cases:** priority, type, pre/post-conditions, tags, ordered steps; multi-criteria search and filters; server-side pagination with virtual scrolling; bulk delete, priority change, add to suite and assign; CSV import and export; versioning and comments.
- **Execution:** Pass / Fail / Blocked / Skipped with comments and attachments (stored in Postgres); raise a pre-filled defect from a failure; execution history per case; audit trail; assignment to testers; progress per run and per tester.
- **Suites & runs:** group cases, run a whole suite step by step, suite reports (breakdown, pass rate, run history).
- **Dashboard:** summary, coverage, trend, priority/type distribution, progress by tester, defect density. Interactive Recharts charts (Pie, Line, Bar).
- **Performance:** Redis read-through cache (analytics 15 min, suite lists 30 min, project metadata 1 h) with invalidation on writes, plus a cache metrics page showing hit ratio and HIT vs MISS latency. Rate limits via `express-rate-limit`. Lazy routes and a lazy history tab.
- **Security:** helmet, CORS allow-list, parameterized SQL with whitelisted sort columns, zod validation, server-side HTML stripping (`xss`), bcrypt, upload type and magic-byte checks, `Content-Disposition: attachment` downloads, CSV formula-injection guard.

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite 6, React Router 6, Recharts, plain CSS with variables (light/dark) |
| Backend | Node.js 20+, Express 4, `pg`, `ioredis`, `zod`, `express-rate-limit`, `helmet`, `multer`, Swagger UI |
| Database | PostgreSQL 14+ (Neon in production) |
| Cache | Redis 6+ (Upstash in production) |
| Hosting | Vercel (frontend), Render free web service (API) |

## Repository structure

```
testcase-management/
├── backend/            Express API
│   ├── src/config/     env, pg pool, redis client
│   ├── src/middleware/ auth + RBAC, project access, rate limits, validation, uploads, errors
│   ├── src/routes/     auth, users, projects, testcases, testsuites, testruns, testexecutions, defects, analytics, metrics
│   ├── src/services/   cache (+ metrics), analytics, audit, csv, notifications
│   ├── src/db/         SQL migrations, migrate.js, seed.js
│   ├── src/docs/       OpenAPI spec (served at /api/docs)
│   └── tests/          node:test + supertest integration tests
├── frontend/           React SPA (pages, contexts, components, charts) + vercel.json
├── docs/               requirements, architecture, database schema, user guide, plan
└── render.yaml         Render blueprint for the API
```

## Local development

**Prerequisites:** Node.js 20+, PostgreSQL 14+, Redis 6+ (or Docker for both).

```bash
git clone https://github.com/aakashsiwach/testcase-management.git
cd testcase-management

# Optional: Postgres + Redis in Docker
docker run -d --name tcm-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=testcase_mgmt -p 5432:5432 postgres:16-alpine
docker run -d --name tcm-redis -p 6379:6379 redis:7-alpine

# Backend
cd backend
cp .env.example .env          # adjust DATABASE_URL / REDIS_URL / JWT_SECRET if needed
npm install
npm run db:migrate            # create schema
npm run db:seed               # demo users + sample data (npm run db:reset to start over)
npm run dev                   # http://localhost:4000 · Swagger at /api/docs

# Frontend (second terminal)
cd frontend
cp .env.example .env          # VITE_API_URL=http://localhost:4000
npm install
npm run dev                   # http://localhost:5173
```

### Scripts

| Where | Command | What it does |
|---|---|---|
| backend | `npm run dev` / `npm start` | API with file watch / production start |
| backend | `npm run db:migrate` | apply pending SQL migrations (idempotent) |
| backend | `npm run db:seed` / `npm run db:reset` | seed if empty / wipe and reseed |
| backend | `npm test` | integration tests (creates the `testcase_test` DB and uses Redis DB 15) |
| backend | `npm run lint` | ESLint |
| frontend | `npm run dev` / `npm run build` / `npm run preview` | dev server / production build / preview build |
| frontend | `npm test` / `npm run lint` | Vitest unit tests / ESLint |

### Environment variables

**Backend** (`backend/.env.example`)

| Variable | Required | Default | Notes |
|---|---|---|---|
| `NODE_ENV` | | `development` | `production` enforces a strong `JWT_SECRET` |
| `PORT` | | `4000` | Render sets this automatically |
| `DATABASE_URL` | ✅ | local | Neon: `postgresql://…/db?sslmode=require` |
| `DATABASE_SSL` | | `false` | `true` for Neon |
| `DATABASE_POOL_MAX` | | `10` | keep ≤ 5 on free Neon |
| `REDIS_URL` | | empty | Upstash: `rediss://default:<pw>@<host>:6379`. Without it the API serves from Postgres (`X-Cache: BYPASS`) |
| `JWT_SECRET` | ✅ prod | dev value | ≥ 32 chars in production |
| `JWT_EXPIRES_IN` | | `8h` | |
| `CORS_ORIGIN` | ✅ prod | `http://localhost:5173` | comma-separated frontend origins |
| `APP_URL` | | `http://localhost:5173` | link in assignment emails |
| `RATE_LIMIT_*_MAX` | | 5 / 100 / 200 / 50 / 300 | auth / testcase / execution / analytics / general |
| `CACHE_TTL_*` | | 900 / 1800 / 3600 | analytics / suites / project (seconds) |
| `MAX_UPLOAD_MB` | | `5` | per file, max 5 files |
| `SMTP_*`, `MAIL_FROM` | | empty | optional assignment emails |

**Frontend** (`frontend/.env.example`): `VITE_API_URL`, the API base URL (no trailing slash).

## API

Interactive docs: **`/api/docs`** (OpenAPI JSON at `/api/openapi.json`). Log in with `POST /api/auth/login`, click **Authorize**, and paste the token.

Route protections from the brief: `GET /api/testcases` all roles · `POST/PUT/DELETE /api/testcases` admin, test-lead · `POST /api/testexecutions` admin, test-lead, tester · `GET /api/analytics` all roles · `GET /api/users` admin · `POST /api/projects` admin, test-lead. The full matrix is in [ARCHITECTURE.md](docs/ARCHITECTURE.md#endpoint--role-matrix).

## Deployment (free tier: Neon + Upstash + Render + Vercel)

Nothing depends on the local filesystem: attachments live in Postgres, the cache in Redis, and sessions are stateless JWTs.

1. **Neon (PostgreSQL)** → create a project and database, then copy the *pooled* connection string (`…?sslmode=require`).
2. **Upstash (Redis)** → create a Redis database (TLS on), then copy the `rediss://default:…@….upstash.io:6379` URL.
3. **Render (API)** → **New → Blueprint**, select this repo (uses [`render.yaml`](render.yaml)), and fill in:
   - `DATABASE_URL` = Neon URL, `REDIS_URL` = Upstash URL
   - `CORS_ORIGIN` and `APP_URL` = your Vercel URL (set a placeholder now, update after step 4)
   - `JWT_SECRET` is generated automatically.

   Every start runs `npm run db:migrate && npm run db:seed && npm start`: migrations are idempotent and the seed only runs on an empty database. Render health-checks `/api/health` (200 when Postgres is reachable; it also reports Redis status).
4. **Vercel (frontend)** → **Add New Project**, import the repo, set **Root Directory = `frontend`** (Vite is detected; [`vercel.json`](frontend/vercel.json) adds SPA rewrites and security headers), add env var `VITE_API_URL` = Render API URL, and deploy.
5. Put the Vercel URL into `CORS_ORIGIN` / `APP_URL` on Render (multiple origins: comma-separated, e.g. to include preview URLs) and redeploy the API.
6. Smoke test: `GET <api>/api/health` → `{"status":"ok","database":"ok","redis":"ok"}`, then log in as each demo user.

To reseed production, run `npm run db:reset` locally with `DATABASE_URL` pointing at Neon.

**Free-tier notes:** the Render service sleeps after 15 minutes idle (the first request takes ~1 minute; the UI shows a "waking up" message). Rate limit counters are in memory, which is fine for one instance. Upstash's free tier allows plenty of commands for a demo.

## Documentation

| Doc | Contents |
|---|---|
| [Requirements](docs/REQUIREMENTS.md) | Acceptance criteria (`AC-*`) with status |
| [Architecture](docs/ARCHITECTURE.md) | Design, RBAC matrix, caching, rate limits, security |
| [Database schema](docs/DATABASE.md) | Tables, relationships, indexes, seed data |
| [User guide](docs/USER_GUIDE.md) | How to use the app for each role |
| [Delivery plan](docs/PLAN.md) | Milestones, deployment, risks |
| [Assignment brief](docs/ASSIGNMENT_BRIEF.md) | The original task |

## Author

**Aakash Siwach** · [github.com/aakashsiwach](https://github.com/aakashsiwach)
