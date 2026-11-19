# Architecture & Technical Design

This is the design to build against. Acceptance criteria IDs (`AC-*`) refer to [REQUIREMENTS.md](./REQUIREMENTS.md).

## 1. System overview

```
┌────────────────────┐   HTTPS + Bearer JWT   ┌──────────────────────────┐
│  React 18 SPA      │ ─────────────────────▶ │  Express API (Node 20)   │
│  (Vite, Recharts)  │ ◀───────────────────── │  /api/*  + /api/docs     │
└────────────────────┘        JSON            └───────┬───────────┬──────┘
                                                      │           │
                                           pg (pool)  │           │ ioredis
                                                      ▼           ▼
                                             ┌────────────┐  ┌──────────┐
                                             │ PostgreSQL │  │  Redis   │
                                             └────────────┘  └──────────┘
```

- **Frontend:** React 18, Vite, React Router 6, Recharts. A thin `fetch` wrapper attaches the JWT.
- **Backend:** Express 4, CommonJS, `pg` (raw parameterized SQL, no ORM), `ioredis`, `zod` validation.
- **Database:** PostgreSQL 16. Schema managed by plain SQL migrations in `backend/src/db/migrations`.
- **Cache:** Redis, used both as the read-through cache and as the store for cache metrics.
- **Hosting:** Vercel (frontend), Render free web service (API), Neon (Postgres), Upstash (Redis). See [README → Deployment](../README.md#deployment-free-tier-neon--upstash--render--vercel).

## 2. Repository layout (target)

```
testcase-management/
├── backend/
│   ├── src/
│   │   ├── app.js              # express app (middleware, routes)
│   │   ├── server.js           # boots app, connects db/redis
│   │   ├── config/             # env parsing, db pool, redis client
│   │   ├── middleware/         # auth, rbac, projectAccess, rateLimiters, validate, errorHandler, upload
│   │   ├── routes/             # auth, users, projects, testcases, testsuites, testexecutions, testruns, defects, analytics, metrics
│   │   ├── services/           # cache, audit, notification, csv, analytics queries
│   │   ├── validators/         # zod schemas
│   │   ├── db/
│   │   │   ├── migrations/     # 001_init.sql, ...
│   │   │   ├── seed.js         # demo users + sample projects (deterministic)
│   │   │   └── migrate.js      # runs migrations in order
│   │   └── docs/openapi.js     # Swagger spec served at /api/docs
│   ├── .env.example
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── main.jsx, App.jsx   # router with React.lazy routes
│   │   ├── api/client.js       # fetch wrapper, Bearer token, 401/429 handling
│   │   ├── context/            # AuthContext, ThemeContext, ProjectContext, PermissionsContext
│   │   ├── components/         # VirtualList, Layout, charts/, forms/, ...
│   │   ├── pages/              # Login, Register, Dashboard, Projects, TestCases, TestCaseDetail, Suites, SuiteRun, Defects, Users, Performance
│   │   └── styles/
│   ├── .env.example
│   └── package.json
├── docs/
├── render.yaml             # API blueprint (frontend/vercel.json for the SPA)
└── README.md
```

## 3. Database schema (AC-DB-01..03)

Required tables are in **bold**. The rest support execution, defects and bonus features.

| Table | Key columns | Notes |
|---|---|---|
| **users** | id, name, email (unique), password_hash, **role** (default `'tester'`, CHECK in 4 roles), is_active, created_at | bcrypt password hashes |
| **projects** | id, name, description, version, status (`active / on-hold / completed / archived`), created_by → users | |
| project_members | project_id → projects, user_id → users, PK (project_id, user_id) | "assign team members" |
| **test_cases** | id, project_id → projects, title, description, priority, type, preconditions, postconditions, tags `text[]`, assigned_to → users, version, created_by, updated_by, timestamps | CHECK constraints on priority and type |
| **test_steps** | id, test_case_id → test_cases ON DELETE CASCADE, step_number, action, expected_result | UNIQUE (test_case_id, step_number) |
| **test_suites** | id, project_id → projects, name, description, created_by | |
| **test_suite_cases** | suite_id → test_suites, test_case_id → test_cases, position, PK (suite_id, test_case_id) | many-to-many mapping |
| test_runs | id, project_id, suite_id → test_suites (nullable), name, status, case_ids `int[]` (snapshot), started_by, started_at, completed_at | one row per "execute entire suite" |
| **test_executions** | id, test_case_id → test_cases, project_id, run_id → test_runs (nullable), executed_by → users, status (`Pass / Fail / Blocked / Skipped`), comments, duration_seconds, executed_at | append-only history |
| execution_attachments | id, execution_id → test_executions, filename, mime_type, size_bytes, data `bytea`, uploaded_by | stored in Postgres because Render's free disk is ephemeral |
| defects | id, project_id, test_case_id, execution_id, title, description, severity, status, reported_by, assigned_to, timestamps | created from failed executions |
| test_case_versions | id, test_case_id, version, snapshot `jsonb`, changed_by, changed_at | bonus: versioning |
| test_case_comments | id, test_case_id, user_id, body, created_at | bonus: comments |
| audit_logs | id, user_id, project_id, action, entity_type, entity_id, details `jsonb`, created_at | audit trail (AC-EXEC-05) |

**Indexes (AC-DB-03):**
- `test_cases (project_id)`, `(project_id, priority)`, `(project_id, type)`, `(assigned_to)`
- GIN on `tags`, GIN full-text index on `to_tsvector(title || ' ' || description)`
- `test_executions (test_case_id, executed_at DESC)` for latest result and history
- `test_executions (project_id, executed_at)` for trends; `(executed_by)` for per-tester stats; `(run_id)`
- `test_suite_cases (test_case_id)`, `defects (project_id, status)`, `audit_logs (entity_type, entity_id)`, `project_members (user_id)`

**Derived values:** "latest status" of a test case is its most recent execution (`DISTINCT ON`). "Pending" means a test case with no execution, or one assigned in an open run that has no result yet.

## 4. Auth & RBAC (AC-AUTH, AC-RBAC)

- `POST /api/auth/register` and `POST /api/auth/login` return `{ token, user }`. The JWT is HS256, expires in 8h, and its payload is `{ sub, role, name }`.
- `authenticate` middleware: verifies `Authorization: Bearer`, loads the user, and rejects inactive users.
- `authorize(...roles)` middleware: 403 unless `req.user.role` is in the list.
- `requireProjectAccess` middleware: admins see everything; other roles see only projects they're members of ("for their/assigned projects" in the brief).
- Frontend: `PermissionsContext` exposes `can('testcase:edit')` etc., computed from the role with the same matrix as the backend. Buttons are hidden or disabled accordingly.

### Endpoint → role matrix

| Endpoint | admin | test-lead | tester | read-only | Rate limiter |
|---|:-:|:-:|:-:|:-:|---|
| `POST /api/auth/register`, `/login` | public | | | | auth (5/15m) |
| `GET /api/auth/me` | ✅ | ✅ | ✅ | ✅ | general |
| `GET /api/users` and user management | ✅ | | | | general |
| `GET /api/projects`, `/:id`, `/:id/members`, `/:id/audit` | ✅ | ✅ | ✅ | ✅ | general |
| `POST/PUT /api/projects`, members add/remove, `/:id/candidates` | ✅ | ✅ | | | general |
| `DELETE /api/projects/:id` | ✅ | | | | general |
| `GET /api/testcases`, `/:id`, export | ✅ | ✅ | ✅ | ✅ | testcase (100/h) |
| `GET /api/testcases/:id/executions`, `/versions`, `/comments`, `/audit`, `/tags` | ✅ | ✅ | ✅ | ✅ | general |
| `POST /api/testcases/:id/comments` | ✅ | ✅ | ✅ | | testcase (100/h) |
| `POST/PUT/DELETE /api/testcases`, bulk, import, assign | ✅ | ✅ | | | testcase (100/h) |
| `GET /api/testsuites` | ✅ | ✅ | ✅ | ✅ | general |
| `POST/PUT/DELETE /api/testsuites`, add/remove cases | ✅ | ✅ | | | general |
| `POST /api/testexecutions`, `PUT /:id` (testers: own only), attachments, `POST /api/testsuites/:id/runs`, `PATCH /api/testruns/:id` | ✅ | ✅ | ✅ | | execution (200/h) |
| `GET /api/testruns`, `/:id`, `GET /api/testexecutions/:id`, attachment download | ✅ | ✅ | ✅ | ✅ | execution (200/h) |
| `POST /api/defects`, `PUT /api/defects/:id` | ✅ | ✅ | ✅ | | execution (200/h) |
| `GET /api/analytics/*` | ✅ | ✅ | ✅ | ✅ | analytics (50/h) |
| `GET /api/metrics/cache` | ✅ | ✅ | ✅ | ✅ | general |
| `POST /api/metrics/cache/benchmark` | ✅ | ✅ | | | general |
| `POST /api/metrics/cache/reset` | ✅ | | | | general |

## 5. Caching (AC-CACHE)

Read-through cache via `cache.getOrSet(key, ttl, loader)`. Every response sets an `X-Cache: HIT|MISS` header.

| Data | Key pattern | TTL | Invalidated by |
|---|---|---|---|
| Execution analytics | `analytics:{projectId}:*` | 900 s (15 min) | new execution, test case create/update/delete, defect change |
| Suite lists | `suites:{projectId}:list` | 1800 s (30 min) | suite create/update/delete, add/remove cases, test case delete |
| Project metadata | `project:{id}`, `projects:user:{userId}` | 3600 s (1 h) | project update, member change |

- Invalidation deletes keys by pattern using `SCAN` (never `KEYS`).
- **Metrics (AC-DEMO-04):** hits, misses, hit ratio, and average latency for HITs vs. MISSes per key prefix, kept in Redis hashes. Exposed at `GET /api/metrics/cache` and shown on the frontend **Performance** page.
- If Redis is unreachable, the API logs a warning and serves from Postgres, so it never goes down because of the cache.

## 6. Rate limiting (AC-RATE)

`express-rate-limit` with `standardHeaders: 'draft-7'`, and `app.set('trust proxy', 1)` because Render sits behind a proxy. Counters use the in-memory store (single instance).

| Limiter | Window | Max | Key |
|---|---|---|---|
| auth | 15 min | 5 | IP + email (so switching between demo accounts doesn't lock reviewers out) |
| testcase | 1 h | 100 | user id |
| execution | 1 h | 200 | user id |
| analytics | 1 h | 50 | user id |
| general | 15 min | 300 | user id / IP |

All limits can be overridden by env vars. The frontend shows a friendly "Too many requests, retry in N min" message on 429. The dashboard loads all analytics in **one** request so it stays well inside 50/h.

## 7. Security (AC-SEC)

- **SQL injection:** only parameterized queries (`$1, $2`); sort and filter columns are mapped through whitelists.
- **XSS:** string inputs are sanitized server-side with the `xss` library; React escapes output; no `dangerouslySetInnerHTML`; `helmet` sets security headers.
- **Validation:** `zod` schemas on every write endpoint, with enums, lengths and step limits.
- **Tokens:** Bearer JWT on every call; secret from env; CORS restricted to the frontend origin.
- **Uploads:** `multer` memory storage, 5 MB per file and 5 files max, extension and MIME whitelist (png, jpg, gif, pdf, txt, log, csv), magic-byte check, filename sanitized. Downloads are served with `Content-Disposition: attachment` and `X-Content-Type-Options: nosniff`.
- Passwords hashed with bcrypt (cost 10). Request body size limited to 1 MB.

## 8. Frontend design (AC-FE)

| Requirement | Implementation |
|---|---|
| useContext | `AuthContext` (user, token, login/logout), `ThemeContext` (light/dark, saved), `ProjectContext` (current project), `PermissionsContext` (`can()`) |
| useCallback | step add/remove/reorder and field handlers in `TestCaseForm`; result handlers in `ExecutionPanel` / `SuiteRunner` rows wrapped in `React.memo` |
| useMemo | dashboard stats (pass rate, coverage), filtered and sorted test case list, chart datasets |
| React.lazy + Suspense | every page is a lazy route; `<Suspense fallback={<PageLoader/>}>` |
| Virtual scrolling | custom `VirtualList` (fixed row height, overscan) combined with infinite server pagination |
| Lazy execution history | `ExecutionHistory` component is `React.lazy`-loaded and fetches only when its tab opens |
| Charts | Recharts: Pie (status), Line (trend), Bar (by priority/type), plus a stacked bar per tester |

## 9. Seed data (AC-DEMO-02/03)

- 4 demo users, one per role (credentials in the README).
- Project **"E-Commerce Web App v2.3"** with 120+ realistic test cases across all types and priorities, 6 suites, about 30 days of execution history (for trend charts), defects, assignments and comments.
- A second, smaller project to show project switching and access scoping.
