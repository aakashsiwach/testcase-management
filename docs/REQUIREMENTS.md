# Requirements & Acceptance Criteria

Extracted from the assignment brief ([ASSIGNMENT_BRIEF.md](./ASSIGNMENT_BRIEF.md)).
Every criterion has an ID so commits, PRs and tests can reference it (e.g. `feat(auth): JWT login [AC-AUTH-02]`).

**Deadline:** Monday 23 Nov 2026, 11:00 AM IST, with live demo links.

Legend: `[ ]` not started · `[~]` in progress · `[x]` done and verified on the live demo

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

- [ ] **AC-AUTH-01** A user can register (name, email, password); new users get role `tester` by default.
- [ ] **AC-AUTH-02** A user can log in and receives a JWT; the JWT carries `role` as a claim.
- [ ] **AC-AUTH-03** All non-auth API routes reject requests without a valid `Authorization: Bearer <token>` header (401).
- [ ] **AC-AUTH-04** Frontend routes are protected: an unauthenticated user is redirected to `/login`.
- [ ] **AC-AUTH-05** Four roles are supported: `admin`, `test-lead`, `tester`, `read-only`.
- [ ] **AC-AUTH-06** Backend middleware restricts routes by the role in the JWT; a forbidden action returns 403.
- [ ] **AC-AUTH-07** The frontend hides or disables actions the current role can't perform (e.g. Execute buttons are disabled for `read-only`).

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

- [ ] **AC-RBAC-01** `GET /api/testcases`: all roles
- [ ] **AC-RBAC-02** `POST/PUT/DELETE /api/testcases`: admin, test-lead
- [ ] **AC-RBAC-03** `POST /api/testexecutions`: admin, test-lead, tester
- [ ] **AC-RBAC-04** `GET /api/analytics`: all roles
- [ ] **AC-RBAC-05** `GET /api/users`: admin only
- [ ] **AC-RBAC-06** `POST /api/projects`: admin, test-lead
- [ ] **AC-RBAC-07** `users.role` column exists with default `'tester'`.

## 2. Project Management

- [ ] **AC-PROJ-01** Create and manage multiple projects.
- [ ] **AC-PROJ-02** A project has name, description, version and status.
- [ ] **AC-PROJ-03** Team members can be assigned to and removed from a project.
- [ ] **AC-PROJ-04** Only admin and test-lead can create or modify projects.

## 3. Test Case Management

- [ ] **AC-TC-01** Create, edit and delete test cases (admin, test-lead only).
- [ ] **AC-TC-02** Attributes: title, description, priority (`Low | Medium | High | Critical`), type (`Functional | Integration | Regression | Smoke | UI | API`), pre-conditions, post-conditions, tags/labels.
- [ ] **AC-TC-03** Ordered test steps, each with an action and an expected result.
- [ ] **AC-TC-04** Test cases can be organized into test suites.
- [ ] **AC-TC-05** Search and filter by multiple criteria at once (text, priority, type, tags, suite, assignee, last result).
- [ ] **AC-TC-06** Bulk operations: delete, update priority, assign to suite.
- [ ] **AC-TC-07** `read-only` users can open and view test case details, with no edit controls.

## 4. Test Execution

- [ ] **AC-EXEC-01** Execute a test case (admin, test-lead, tester).
- [ ] **AC-EXEC-02** Record a result: `Pass | Fail | Blocked | Skipped`.
- [ ] **AC-EXEC-03** Add comments and file attachments to an execution.
- [ ] **AC-EXEC-04** Create a defect directly from a failed execution, pre-filled with test case and execution details.
- [ ] **AC-EXEC-05** Execution history per test case, plus an audit trail of who changed what and when.
- [ ] **AC-EXEC-06** Assign test cases to testers.
- [ ] **AC-EXEC-07** Execution progress is visible (executed vs. total, per run and per tester).

## 5. Dashboard & Analytics (all roles, including read-only)

- [ ] **AC-DASH-01** Execution summary: total, passed, failed, blocked, pending.
- [ ] **AC-DASH-02** Test coverage metrics (e.g. % of cases executed, % in a suite, % with steps).
- [ ] **AC-DASH-03** Pass/fail rate trend over time.
- [ ] **AC-DASH-04** Distribution of tests by priority.
- [ ] **AC-DASH-05** Execution progress by tester.
- [ ] **AC-DASH-06** Defect density metrics.
- [ ] **AC-DASH-07** Charts are interactive (tooltips, legend toggles, filters).
- [ ] **AC-DASH-08** The dashboard is reachable by every role.

## 6. Test Suite Management

- [ ] **AC-SUITE-01** Create, edit and delete suites.
- [ ] **AC-SUITE-02** Add and remove test cases from a suite.
- [ ] **AC-SUITE-03** Execute an entire suite as a test run, stepping through each case.
- [ ] **AC-SUITE-04** Suite-level reporting (result breakdown, pass rate, run history).

## 7. Performance

- [ ] **AC-PERF-01** Lazy loading of pages and components.
- [ ] **AC-PERF-02** Server-side pagination for test case lists.
- [ ] **AC-PERF-03** Caching of frequently accessed data (see AC-CACHE).
- [ ] **AC-PERF-04** Rate limiting on API endpoints (see AC-RATE).
- [ ] **AC-PERF-05** Virtual scrolling for large test case lists.

---

## Frontend technical requirements

### React hooks
- [ ] **AC-FE-01** `useContext`: an **Auth** context and a **Theme** context.
- [ ] **AC-FE-02** `useContext`: global state for the **current project** and the **user's permissions**.
- [ ] **AC-FE-03** `useCallback`: event handlers in the test case form.
- [ ] **AC-FE-04** `useCallback`: handlers in test execution components, to prevent re-renders (paired with `React.memo`).
- [ ] **AC-FE-05** `useMemo`: expensive calculations (statistics, pass rates, coverage).
- [ ] **AC-FE-06** `useMemo`: filtered and sorted test case lists.

### Lazy loading
- [ ] **AC-FE-07** `React.lazy()` for route-based code splitting.
- [ ] **AC-FE-08** `React.Suspense` with loading fallbacks.
- [ ] **AC-FE-09** Virtual scrolling for large test case lists.
- [ ] **AC-FE-10** Test execution history is lazy loaded (fetched and rendered only when opened).

### Charts (at least 3 types)
- [ ] **AC-FE-11** Pie chart: test status distribution.
- [ ] **AC-FE-12** Line chart: execution trend over time.
- [ ] **AC-FE-13** Bar chart: pass/fail rate by priority or type.

## Backend technical requirements

### Caching (Redis)
- [ ] **AC-CACHE-01** Redis is used for frequently accessed data.
- [ ] **AC-CACHE-02** Execution analytics cached for **15 minutes**.
- [ ] **AC-CACHE-03** Test suite lists cached for **30 minutes**.
- [ ] **AC-CACHE-04** Project metadata cached for **1 hour**.
- [ ] **AC-CACHE-05** Cache is invalidated when the underlying data changes.

### Rate limiting (`express-rate-limit`)
- [ ] **AC-RATE-01** Auth endpoints: **5 requests / 15 minutes**.
- [ ] **AC-RATE-02** Test case CRUD endpoints: **100 requests / hour**.
- [ ] **AC-RATE-03** Test execution endpoints: **200 requests / hour**.
- [ ] **AC-RATE-04** Analytics endpoints: **50 requests / hour**.

### Security
- [ ] **AC-SEC-01** XSS protection (input sanitization, safe rendering, security headers).
- [ ] **AC-SEC-02** SQL injection protection (parameterized queries only; whitelisted sort and filter columns).
- [ ] **AC-SEC-03** Input validation and sanitization for test case data.
- [ ] **AC-SEC-04** Token-based API calls (Bearer JWT on every request).
- [ ] **AC-SEC-05** Secure file upload for attachments (size limit, type whitelist, content check, safe download headers).

### Database schema
- [ ] **AC-DB-01** Tables: `users` (with `role`), `projects`, `test_cases`, `test_suites`, `test_suite_cases` (mapping), `test_executions`, `test_steps`.
- [ ] **AC-DB-02** Proper foreign keys between them.
- [ ] **AC-DB-03** Indexes on frequently queried fields.

---

## Deliverables

### Code repository
- [ ] **AC-DEL-01** Well-organized GitHub repo with a clear README.
- [ ] **AC-DEL-02** Commit history showing development progress (small, meaningful commits).
- [ ] **AC-DEL-03** Separate `frontend/` and `backend/` folders.
- [ ] **AC-DEL-04** Environment configuration examples (`.env.example`).

### Documentation
- [ ] **AC-DOC-01** API documentation with Swagger/OpenAPI.
- [ ] **AC-DOC-02** Local development setup instructions.
- [ ] **AC-DOC-03** Database schema documentation.
- [ ] **AC-DOC-04** User guide for each role.

### Live demo
- [ ] **AC-DEMO-01** Working, publicly reachable application.
- [ ] **AC-DEMO-02** Demo credentials for admin, test-lead, tester and read-only.
- [ ] **AC-DEMO-03** Sample project with pre-populated test cases, suites, executions and defects.
- [ ] **AC-DEMO-04** Performance metrics showing caching effectiveness (hit/miss ratio, cached vs. uncached latency).

### Submission email must include
- [ ] **AC-SUB-01** Important URLs: frontend, API, Swagger docs, GitHub repo.
- [ ] **AC-SUB-02** Demo credentials (user ID and password) for every role.

---

## Bonus (optional, in priority order)

| ID | Feature | Plan |
|---|---|---|
| AC-BONUS-01 | Dark mode toggle | ✅ Planned (comes with ThemeContext) |
| AC-BONUS-02 | Export test cases to CSV | ✅ Planned |
| AC-BONUS-03 | Import test cases from CSV | ✅ Planned |
| AC-BONUS-04 | Test case versioning | ✅ Planned |
| AC-BONUS-05 | Collaborative comments on test cases | ✅ Planned |
| AC-BONUS-06 | Email notification on test assignment | ⚠️ Logged by default; sends real email if SMTP is configured |
| AC-BONUS-07 | CI/CD integration (bulk results API + GitHub Actions example) | ⏳ If time allows |
| AC-BONUS-08 | Test run scheduling | ⏳ If time allows |
