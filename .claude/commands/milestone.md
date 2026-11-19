---
description: Implement one delivery milestone (M1–M7) end to end, verify, commit, push
argument-hint: <M1|M2|M3|M4|M5|M6|M7> [extra notes]
---

Implement milestone **$ARGUMENTS** of this project. Work autonomously until it's done; don't stop to ask unless something is irreversible or the spec contradicts itself.

## Token budget rules (follow strictly)
- CLAUDE.md is already loaded; don't re-read it. **Don't read whole docs.** Pull only what you need:
  - Criteria: `grep -nE "AC-(<PREFIXES>)" docs/REQUIREMENTS.md` using the prefixes from the table below.
  - Design: read only the relevant section of `docs/ARCHITECTURE.md` (`grep -n "^## " docs/ARCHITECTURE.md`, then Read with offset/limit).
- Never read `node_modules`, lockfiles, `dist/`, or generated files. Don't `cat` large outputs; pipe through `tail -30` or `grep`.
- Don't re-read a file you just wrote or edited. Prefer `Edit` over rewriting whole files.
- Write files directly from the design; no exploratory listing of an empty or known tree.
- Keep narration minimal. Final report ≤ 15 lines.
- For library APIs you're unsure of (express-rate-limit v8, ioredis, recharts, react-router 6), use the context7 MCP if it's connected, instead of guessing or web-searching widely.

## Milestone scope

| ID | Scope | AC prefixes |
|---|---|---|
| M1 | Backend foundation: `package.json` (pinned deps), config (env, pg pool, ioredis with in-memory fallback), `001_init.sql` (all tables, FKs, CHECKs, indexes from ARCHITECTURE §3), `migrate.js`, `seed.sql` (4 demo users via pgcrypto bcrypt, sample projects, 120+ cases, 30 days of executions, defects), app/server, error handler, auth routes (register/login/me), `authenticate`, `authorize`, `requireProjectAccess`, auth rate limiter | STACK-02,03 · AUTH-01,02,03,05,06 · RBAC-07 · DB · SEC-04 |
| M2 | Backend features: users, projects + members, test cases (CRUD, steps, filters, pagination, bulk, assign, versions, comments, CSV export/import), suites + cases, test runs, executions + attachments, defects, audit, analytics (single dashboard endpoint + parts), cache service (TTLs, SCAN invalidation, HIT/MISS metrics, `X-Cache` header), all rate limiters, zod + xss validation, secure uploads, Swagger at `/api/docs`, `/api/metrics/cache` | RBAC · PROJ · TC · EXEC · SUITE · CACHE · RATE · SEC · DOC-01 · BONUS-02..06 (backend) |
| M3 | Frontend foundation: Vite React 18, router with `React.lazy` + `Suspense`, API client (Bearer, 401 → logout, 429 message, "waking server" on slow first call), Auth/Theme/Project/Permissions contexts, layout + role-aware nav, login/register, dark mode | STACK-01 · AUTH-04,07 · FE-01,02,07,08 · BONUS-01 |
| M4 | Frontend features: dashboard (Pie/Line/Bar/stacked bar, `useMemo` stats), projects, test case list (custom `VirtualList` + infinite pagination, multi-filter, bulk), test case form (`useCallback`), detail (lazy `ExecutionHistory`, comments, versions), suites, suite runner (memoized rows), defects, users (admin), performance/cache metrics page, CSV import/export UI | PROJ · TC · EXEC · SUITE · DASH · PERF · FE-03..06,09..13 · DEMO-04 · BONUS-02..05 |
| M5 | Deploy: `render.yaml` (API web service, static site with SPA rewrite, Postgres, Key Value), build/start commands that run migrate + seed idempotently, health check `/api/health`. Then print the exact Render dashboard steps for the user. | DEMO-01..03 |
| M6 | Docs and polish: `docs/DATABASE.md` (ER diagram in Mermaid + tables), `docs/USER_GUIDE.md` (per role), complete README setup + live URLs placeholders, fix gaps found by `/smoke` | DOC-02..04 · DEL |
| M7 | Final audit: every AC in REQUIREMENTS.md checked against code; produce a list of unchecked items with file:line evidence; fill submission email in `docs/PLAN.md` | all |

## Workflow
1. `git config user.name` must print `Aakash Siwach`; if not, set it per CLAUDE.md. Pull latest.
2. Make a short task list (5–10 items) for this milestone.
3. Implement in small slices. After each slice: verify (see below), then commit with a Conventional Commit message referencing AC IDs. **No AI attribution lines.**
4. Verify for real, not by reading code:
   - Backend: `node --check` on changed files; run migrate + seed against local Postgres; start the server in the background and hit endpoints with `curl` as each relevant role (login → token → call). Check 401/403/429 cases and the `X-Cache` header where relevant.
   - Frontend: `npm run build` must pass; for logic-heavy pieces run a quick check rather than opening a browser.
5. Tick the verified ACs in `docs/REQUIREMENTS.md` (`[ ]` → `[x]`) in the same commit as the work.
6. `git push`.
7. If context is getting large before the milestone is done, commit, push, and finish with a **Resume note**: what's done, what's left, and the exact command to continue (e.g. `/milestone M2 continue from defects`).

## Final report
- Milestone status (done / partial), ACs ticked, commits pushed (count).
- Anything the user must do manually (accounts, env vars, Render clicks).
- Next command to run, e.g. `/clear` then `/milestone M3`.
