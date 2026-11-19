# Test Case Management System

A full-stack web app for QA teams to **create, organize, assign and execute test cases and suites**, record results and defects, and track quality on an analytics dashboard, with four access roles.

> 🚧 **Status: in development.** Submission deadline: **Mon 23 Nov 2026, 11:00 AM IST**.
> Progress is tracked against the acceptance criteria in [`docs/REQUIREMENTS.md`](docs/REQUIREMENTS.md).

## Live demo

| | URL |
|---|---|
| App | _coming soon_ |
| API | _coming soon_ |
| API docs (Swagger) | _coming soon_ (`/api/docs`) |

### Demo credentials

| Role | Email | Password | Can do |
|---|---|---|---|
| Admin | `admin@demo.com` | `Admin@123` | Everything, including user management |
| Test Lead | `lead@demo.com` | `Lead@123` | Manage projects, test cases and suites; assign; execute |
| Tester | `tester@demo.com` | `Tester@123` | Execute tests, record results, raise defects |
| Read Only | `viewer@demo.com` | `Viewer@123` | View test cases, results and dashboards only |

## Goal

Build a Test Case Management System that lets teams manage test cases, test suites and execution results for software projects. It's built to production standards: RBAC enforced on the server, Redis caching with invalidation, per-endpoint rate limiting, security hardening, and a fast React frontend (lazy routes, virtual scrolling, memoization).

## Features

- **Authentication & RBAC:** register and log in with JWT; roles `admin`, `test-lead`, `tester`, `read-only`; enforced by backend middleware and reflected in the UI.
- **Projects:** multiple projects with name, description, version and status; team membership.
- **Test cases:** priority, type, pre/post-conditions, ordered steps with expected results, tags; multi-criteria search and filters; bulk delete, priority change and suite assignment.
- **Test suites:** group cases, run an entire suite, suite-level reports.
- **Execution:** Pass / Fail / Blocked / Skipped with comments and attachments; raise a defect from a failed test; history and audit trail; assign cases to testers; progress tracking.
- **Dashboard:** status summary, coverage, pass/fail trend, priority distribution, progress by tester, defect density, using interactive Recharts charts.
- **Performance:** lazy-loaded pages, pagination, virtual scrolling, Redis caching (15 min / 30 min / 1 h), rate limiting.
- **Bonus:** dark mode, CSV import/export, test case versioning, comments on test cases, assignment email notifications.

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, React Router 6, Recharts |
| Backend | Node.js 20, Express 4, `pg`, `ioredis`, `zod`, `express-rate-limit`, `helmet`, `multer`, Swagger UI |
| Database | PostgreSQL 16 |
| Cache | Redis 7 |
| Hosting | Render (free tier): Web Service, Static Site, Postgres, Key Value |

## Repository structure

```
testcase-management/
├── backend/      Express API, SQL migrations, seed data, Swagger spec
├── frontend/     React 18 single-page app
├── docs/         Requirements, architecture, plan, schema, user guide
└── render.yaml   One-click deploy blueprint for Render
```

## Documentation

| Doc | What's in it |
|---|---|
| [Assignment brief](docs/ASSIGNMENT_BRIEF.md) | The original task, verbatim |
| [Requirements & acceptance criteria](docs/REQUIREMENTS.md) | Every requirement as a checkable `AC-*` item |
| [Architecture](docs/ARCHITECTURE.md) | System design, schema, RBAC matrix, caching, rate limits, security |
| [Delivery plan](docs/PLAN.md) | Milestones, deployment, accounts, risks, submission template |
| Database schema | _coming:_ `docs/DATABASE.md` |
| User guide by role | _coming:_ `docs/USER_GUIDE.md` |
| API reference | Swagger UI at `/api/docs` once the backend runs |

## Local development

> These instructions become complete as the backend and frontend land.

**Prerequisites:** Node.js 20+, PostgreSQL 14+, Redis 6+

```bash
git clone https://github.com/aakashsiwach/testcase-management.git
cd testcase-management

# Backend
cd backend
cp .env.example .env          # set DATABASE_URL, REDIS_URL, JWT_SECRET
npm install
npm run db:migrate
npm run db:seed
npm run dev                   # http://localhost:4000, docs at /api/docs

# Frontend (new terminal)
cd frontend
cp .env.example .env          # VITE_API_URL=http://localhost:4000
npm install
npm run dev                   # http://localhost:5173
```

## Author

**Aakash Siwach** · [github.com/aakashsiwach](https://github.com/aakashsiwach)
