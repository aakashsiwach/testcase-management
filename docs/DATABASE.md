# Database schema

PostgreSQL 14+ (tested on 16). The schema lives in plain SQL migrations under `backend/src/db/migrations/` and is applied by `npm run db:migrate`, which records applied files in `schema_migrations` (each file runs in a transaction; re-running is a no-op).

## Entity relationships

```
users ─┬─< project_members >── projects ─┬─< test_cases ─┬─< test_steps
       │                                 │               ├─< test_case_versions
       │                                 │               ├─< test_case_comments
       │                                 │               ├─< test_suite_cases >── test_suites
       │                                 │               └─< test_executions ──< execution_attachments
       │                                 ├─< test_suites ──< test_runs ──< test_executions
       │                                 ├─< defects (→ test_case, → execution)
       │                                 └─< audit_logs
       └── referenced as created_by / updated_by / assigned_to / executed_by / reported_by
```

## Tables

### users
| Column | Type | Notes |
|---|---|---|
| id | serial PK | |
| name | varchar(100) | |
| email | varchar(255) | unique, case-insensitive (`users_email_lower_idx` on `LOWER(email)`) |
| password_hash | text | bcrypt, cost 10 |
| role | varchar(20) | **default `'tester'`**, CHECK in `admin`, `test-lead`, `tester`, `read-only` |
| is_active | boolean | deactivated users cannot log in or use existing tokens |
| created_at, updated_at | timestamptz | |

### projects
| Column | Type | Notes |
|---|---|---|
| id | serial PK | |
| name | varchar(150) | |
| description | text | |
| version | varchar(50) | e.g. `2.3.0` |
| status | varchar(20) | CHECK `active`, `on-hold`, `completed`, `archived` |
| created_by | → users (SET NULL) | |

### project_members
`(project_id → projects CASCADE, user_id → users CASCADE)` primary key, `added_at`. Non-admin users only see projects they are members of. Index on `user_id`.

### test_cases
| Column | Type | Notes |
|---|---|---|
| id | serial PK | |
| project_id | → projects CASCADE | |
| title | varchar(255) | |
| description, preconditions, postconditions | text | |
| priority | varchar(10) | CHECK `Low`, `Medium`, `High`, `Critical` |
| type | varchar(20) | CHECK `Functional`, `Integration`, `Regression`, `Smoke`, `UI`, `API` |
| tags | text[] | GIN-indexed |
| assigned_to | → users (SET NULL) | must be a non-read-only project member (enforced in the API) |
| version | integer | incremented on every edit |
| created_by, updated_by | → users (SET NULL) | |

### test_steps
`id`, `test_case_id → test_cases CASCADE`, `step_number` (> 0), `action`, `expected_result`; `UNIQUE (test_case_id, step_number)` keeps steps ordered.

### test_suites / test_suite_cases
`test_suites(id, project_id → projects CASCADE, name, description, created_by)`.
`test_suite_cases(suite_id → test_suites CASCADE, test_case_id → test_cases CASCADE, position)` with PK `(suite_id, test_case_id)`: the many-to-many mapping, ordered by `position`.

### test_runs
One row per "execute an entire suite". `case_ids integer[]` snapshots the suite's cases when the run starts so later suite edits don't change the run's denominator. `status` is `in-progress`, `completed` or `aborted`.

### test_executions
Append-only history of results. `test_case_id → test_cases CASCADE`, `project_id`, `run_id → test_runs (SET NULL, nullable)`, `executed_by`, `status` CHECK `Pass | Fail | Blocked | Skipped`, `comments`, `duration_seconds`, `executed_at`.
The **latest result** of a test case is its most recent execution; a case with no execution is **Pending**.

### execution_attachments
`execution_id → test_executions CASCADE`, `filename`, `mime_type`, `size_bytes`, `data bytea`, `uploaded_by`. Stored in Postgres because free hosting has an ephemeral filesystem. Uploads are limited to 5 files × 5 MB and png/jpg/gif/pdf/txt/log/csv with a magic-byte check.

### defects
`project_id`, `test_case_id` (SET NULL), `execution_id` (SET NULL), `title`, `description`, `severity` CHECK `Low…Critical`, `status` CHECK `Open | In Progress | Resolved | Closed`, `reported_by`, `assigned_to`.

### test_case_versions
`(test_case_id, version)` unique, `snapshot jsonb` (all fields + steps), `changed_by`, `changed_at`. Written on create, edit and bulk priority change.

### test_case_comments
`test_case_id → CASCADE`, `user_id`, `body`, `created_at`.

### audit_logs
`user_id`, `project_id` (SET NULL), `action` (e.g. `create`, `update`, `execute`, `bulk_delete`, `add_member`), `entity_type`, `entity_id`, `details jsonb` (field diffs as `{field: {from, to}}`), `created_at`. Written in the same transaction as the change where possible.

## Indexes

| Index | Purpose |
|---|---|
| `test_cases (project_id)`, `(project_id, priority)`, `(project_id, type)` | list filters |
| `test_cases (assigned_to)` | "assigned to me", per-tester progress |
| GIN `test_cases (tags)` | tag filter (`tags && $1`) |
| GIN `to_tsvector('english', title ‖ ' ' ‖ description)` | full-text search |
| `test_executions (test_case_id, executed_at DESC)` | latest result (`LATERAL … LIMIT 1`) and history |
| `test_executions (project_id, executed_at)` | trend chart |
| `test_executions (executed_by)`, `(run_id)` | per-tester and per-run progress |
| `test_suite_cases (test_case_id)` | suites of a case, suite filter |
| `test_runs (project_id, started_at DESC)`, `(suite_id)` | run lists, suite reports |
| `defects (project_id, status)`, `(test_case_id)` | defect lists, density |
| `audit_logs (entity_type, entity_id)`, `(project_id, created_at DESC)` | audit trails |
| `project_members (user_id)` | project scoping |
| `execution_attachments (execution_id)`, `test_case_comments (test_case_id, created_at)` | detail views |

## Seed data

`npm run db:seed` (skips when users exist) or `npm run db:reset` (truncates and reseeds) creates:

- 7 users: the four demo accounts plus two more testers and a second test lead.
- **E-Commerce Web App v2.3**: 126 test cases (12 modules × 10 scenarios + 6 drafts), steps, tags, assignments, 6 suites, ~500 executions over 30 days, a completed and an in-progress run, 22 defects, comments, versions and audit entries.
- **Mobile Banking App** (smaller; not visible to the read-only demo user) and **Internal HR Portal** (admin and second lead only) to show project scoping.
