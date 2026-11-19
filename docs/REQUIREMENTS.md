# Requirements & Acceptance Criteria

Extracted from the assignment brief ([ASSIGNMENT_BRIEF.md](./ASSIGNMENT_BRIEF.md)).
Every criterion has an ID so commits, PRs and tests can reference it (e.g. `feat(auth): JWT login [AC-AUTH-02]`).

**Deadline:** Monday 23 Nov 2026, 11:00 AM IST, with live demo links.

Legend: `[ ]` not started · `[~]` in progress · `[x]` done and verified (integration tests + local run; live-demo items stay open until deployed)

---

## Goal

Build a **Test Case Management System**: a web app where QA teams create, organize, assign and run test cases and test suites, record execution results and defects, and track quality through an analytics dashboard. Access is controlled by four roles.

The submission is judged on three things:
1. **Working features.** All 7 feature areas work end to end on a live, publicly reachable demo.
2. **Engineering quality.** RBAC enforced on the backend, Redis caching with invalidation, rate limiting, security hardening, and React performance patterns.
3. **Deliverables.** A clean repo with commit history, Swagger docs, setup guide, schema doc, a user guide for each role, demo credentials and seeded sample data.

## Mandatory tech stack

| Layer | Requirement | ID |
|---|---|---|
| Frontend | React 18+ | AC-STACK-01 |
| Backend | Node.js + Express.js | AC-STACK-02 |
| Database | PostgreSQL | AC-STACK-03 |
| Cache | Redis | AC-STACK-04 |
| Charts | Chart.js or Recharts | AC-STACK-05 |

---

## 1. User Authentication & RBAC

- [x] **AC-AUTH-01** A user can register (name, email, password); new users get role `tester` by default.
- [x] **AC-AUTH-02** A user can log in and receives a JWT; the JWT carries `role` as a claim.
- [x] **AC-AUTH-03** All non-auth API routes reject requests without a valid `Authorization: Bearer <token>` header (401).
- [x] **AC-AUTH-04** Frontend routes are protected: an unauthenticated user is redirected to `/login`.
- [x] **AC-AUTH-05** Four roles are supported: `admin`, `test-lead`, `tester`, `read-only`.
- [x] **AC-AUTH-06** Backend middleware restricts routes by the role in the JWT; a forbidden action returns 403.
- [x] **AC-AUTH-07** The frontend hides or disables actions the current role can't perform (e.g. Execute buttons are disabled for `read-only`).

### Role permissions (must hold on both backend and frontend)

| Capability | admin | test-lead | tester | read-only |
|---|:-:|:-:|:-:|:-:|
| View projects, test cases, suites, results, reports, dashboards | ✅ | ✅ (own projects) | ✅ (own projects) | ✅ (own projects) |
| Create / edit projects, assign members | ✅ | ✅ | ❌ | ❌ |
| Create / edit / delete test cases & suites | ✅ | ✅ | ❌ | ❌ |
| Assign test cases to testers | ✅ | ✅ | ❌ | ❌ |
| Execute tests, record / update results | ✅ | ✅ | ✅ | ❌ |
| Create defects | ✅ | ✅ | ✅ | ❌ |
| User management (list users, change roles) | ✅ | ❌ | ❌ | ❌ |

### Required route protections (from the brief, verbatim)

- [x] **AC-RBAC-01** `GET /api/testcases`: all roles
- [x] **AC-RBAC-02** `POST/PUT/DELETE /api/testcases`: admin, test-lead
- [x] **AC-RBAC-03** `POST /api/testexecutions`: admin, test-lead, tester
- [x] **AC-RBAC-04** `GET /api/analytics`: all roles
- [x] **AC-RBAC-05** `GET /api/users`: admin only
- [x] **AC-RBAC-06** `POST /api/projects`: admin, test-lead
- [x] **AC-RBAC-07** `users.role` column exists with default `'tester'`.

## 2. Project Management

- [x] **AC-PROJ-01** Create and manage multiple projects.
- [x] **AC-PROJ-02** A project has name, description, version and status.
- [x] **AC-PROJ-03** Team members can be assigned to and removed from a project.
- [x] **AC-PROJ-04** Only admin and test-lead can create or modify projects.

## 3. Test Case Management

- [x] **AC-TC-01** Create, edit and delete test cases (admin, test-lead only).
- [x] **AC-TC-02** Attributes: title, description, priority (`Low | Medium | High | Critical`), type (`Functional | Integration | Regression | Smoke | UI | API`), pre-conditions, post-conditions, tags/labels.
- [x] **AC-TC-03** Ordered test steps, each with an action and an expected result.
- [x] **AC-TC-04** Test cases can be organized into test suites.
- [x] **AC-TC-05** Search and filter by multiple criteria at once (text, priority, type, tags, suite, assignee, last result).
- [x] **AC-TC-06** Bulk operations: delete, update priority, assign to suite.
- [x] **AC-TC-07** `read-only` users can open and view test case details, with no edit controls.

## 4. Test Execution

- [x] **AC-EXEC-01** Execute a test case (admin, test-lead, tester).
- [x] **AC-EXEC-02** Record a result: `Pass | Fail | Blocked | Skipped`.
- [x] **AC-EXEC-03** Add comments and file attachments to an execution.
- [x] **AC-EXEC-04** Create a defect directly from a failed execution, pre-filled with test case and execution details.
- [x] **AC-EXEC-05** Execution history per test case, plus an audit trail of who changed what and when.
- [x] **AC-EXEC-06** Assign test cases to testers.
- [x] **AC-EXEC-07** Execution progress is visible (executed vs. total, per run and per tester).

## 5. Dashboard & Analytics (all roles, including read-only)

- [x] **AC-DASH-01** Execution summary: total, passed, failed, blocked, pending.
- [x] **AC-DASH-02** Test coverage metrics (e.g. % of cases executed, % in a suite, % with steps).
- [x] **AC-DASH-03** Pass/fail rate trend over time.
- [x] **AC-DASH-04** Distribution of tests by priority.
- [x] **AC-DASH-05** Execution progress by tester.
- [x] **AC-DASH-06** Defect density metrics.
- [x] **AC-DASH-07** Charts are interactive (tooltips, legend toggles, filters).
- [x] **AC-DASH-08** The dashboard is reachable by every role.

## 6. Test Suite Management

- [x] **AC-SUITE-01** Create, edit and delete suites.
- [x] **AC-SUITE-02** Add and remove test cases from a suite.
- [x] **AC-SUITE-03** Execute an entire suite as a test run, stepping through each case.
- [x] **AC-SUITE-04** Suite-level reporting (result breakdown, pass rate, run history).

## 7. Performance

- [x] **AC-PERF-01** Lazy loading of pages and components.
- [x] **AC-PERF-02** Server-side pagination for test case lists.
- [x] **AC-PERF-03** Caching of frequently accessed data (see AC-CACHE).
- [x] **AC-PERF-04** Rate limiting on API endpoints (see AC-RATE).
- [x] **AC-PERF-05** Virtual scrolling for large test case lists.

---

## Frontend technical requirements

### React hooks
- [x] **AC-FE-01** `useContext`: an **Auth** context and a **Theme** context.
- [x] **AC-FE-02** `useContext`: global state for the **current project** and the **user's permissions**.
- [x] **AC-FE-03** `useCallback`: event handlers in the test case form.
- [x] **AC-FE-04** `useCallback`: handlers in test execution components, to prevent re-renders (paired with `React.memo`).
- [x] **AC-FE-05** `useMemo`: expensive calculations (statistics, pass rates, coverage).
- [x] **AC-FE-06** `useMemo`: filtered and sorted test case lists.

### Lazy loading
- [x] **AC-FE-07** `React.lazy()` for route-based code splitting.
- [x] **AC-FE-08** `React.Suspense` with loading fallbacks.
- [x] **AC-FE-09** Virtual scrolling for large test case lists.
- [x] **AC-FE-10** Test execution history is lazy loaded (fetched and rendered only when opened).

### Charts (at least 3 types)
- [x] **AC-FE-11** Pie chart: test status distribution.
- [x] **AC-FE-12** Line chart: execution trend over time.
- [x] **AC-FE-13** Bar chart: pass/fail rate by priority or type.

## Backend technical requirements

### Caching (Redis)
- [x] **AC-CACHE-01** Redis is used for frequently accessed data.
- [x] **AC-CACHE-02** Execution analytics cached for **15 minutes**.
- [x] **AC-CACHE-03** Test suite lists cached for **30 minutes**.
- [x] **AC-CACHE-04** Project metadata cached for **1 hour**.
- [x] **AC-CACHE-05** Cache is invalidated when the underlying data changes.

### Rate limiting (`express-rate-limit`)
- [x] **AC-RATE-01** Auth endpoints: **5 requests / 15 minutes**.
- [x] **AC-RATE-02** Test case CRUD endpoints: **100 requests / hour**.
- [x] **AC-RATE-03** Test execution endpoints: **200 requests / hour**.
- [x] **AC-RATE-04** Analytics endpoints: **50 requests / hour**.

### Security
- [x] **AC-SEC-01** XSS protection (input sanitization, safe rendering, security headers).
- [x] **AC-SEC-02** SQL injection protection (parameterized queries only; whitelisted sort and filter columns).
- [x] **AC-SEC-03** Input validation and sanitization for test case data.
- [x] **AC-SEC-04** Token-based API calls (Bearer JWT on every request).
- [x] **AC-SEC-05** Secure file upload for attachments (size limit, type whitelist, content check, safe download headers).

### Database schema
- [x] **AC-DB-01** Tables: `users` (with `role`), `projects`, `test_cases`, `test_suites`, `test_suite_cases` (mapping), `test_executions`, `test_steps`.
- [x] **AC-DB-02** Proper foreign keys between them.
- [x] **AC-DB-03** Indexes on frequently queried fields.

---

## Deliverables

### Code repository
- [x] **AC-DEL-01** Well-organized GitHub repo with a clear README.
- [x] **AC-DEL-02** Commit history showing development progress (small, meaningful commits).
- [x] **AC-DEL-03** Separate `frontend/` and `backend/` folders.
- [x] **AC-DEL-04** Environment configuration examples (`.env.example`).

### Documentation
- [x] **AC-DOC-01** API documentation with Swagger/OpenAPI.
- [x] **AC-DOC-02** Local development setup instructions.
- [x] **AC-DOC-03** Database schema documentation.
- [x] **AC-DOC-04** User guide for each role.

### Live demo
- [x] **AC-DEMO-01** Working, publicly reachable application (frontend on Vercel, API on Render; health check reports database and Redis ok).
- [x] **AC-DEMO-02** Demo credentials for admin, test-lead, tester and read-only.
- [x] **AC-DEMO-03** Sample project with pre-populated test cases, suites, executions and defects.
- [x] **AC-DEMO-04** Performance metrics showing caching effectiveness (hit/miss ratio, cached vs. uncached latency).

### Submission email must include
- [ ] **AC-SUB-01** Important URLs: frontend, API, Swagger docs, GitHub repo.
- [ ] **AC-SUB-02** Demo credentials (user ID and password) for every role.

---

## Bonus (optional, in priority order)

| ID | Feature | Plan |
|---|---|---|
| AC-BONUS-01 | Dark mode toggle | ✅ Done (ThemeContext, saved per browser) |
| AC-BONUS-02 | Export test cases to CSV | ✅ Done |
| AC-BONUS-03 | Import test cases from CSV | ✅ Done (all-or-nothing, per-row errors) |
| AC-BONUS-04 | Test case versioning | ✅ Done (JSON snapshot per version) |
| AC-BONUS-05 | Collaborative comments on test cases | ✅ Done |
| AC-BONUS-06 | Email notification on test assignment | ✅ Done: logged by default; sends real email if SMTP is configured |
| AC-BONUS-07 | CI/CD integration (bulk results API + GitHub Actions example) | ❌ Not implemented |
| AC-BONUS-08 | Test run scheduling | ❌ Not implemented |
