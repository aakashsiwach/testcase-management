# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Git rules (mandatory)

- **Every commit is authored and committed by the repo owner:** `Aakash Siwach <aakashsiwach@users.noreply.github.com>`. Before the first commit in a new clone, run:
  ```bash
  git config user.name "Aakash Siwach"
  git config user.email "aakashsiwach@users.noreply.github.com"
  ```
- **Never** commit as Claude. **Never** add `Co-Authored-By: Claude ...`, `Claude-Session: ...`, "Generated with Claude Code", or any other AI attribution lines to commit messages or PR descriptions.
- Small, meaningful commits that show progress (the reviewers grade commit history). Use Conventional Commits and reference criteria IDs where useful, e.g. `feat(testcases): bulk priority update [AC-TC-06]`.
- Don't commit `.env` files or secrets; only `.env.example`.

## Project context

- Take-home assignment for a Full-stack Developer role. **Deadline: Mon 23 Nov 2026, 11:00 AM IST.**
- Source of truth for scope: `docs/REQUIREMENTS.md` (acceptance criteria `AC-*`). The original brief is in `docs/ASSIGNMENT_BRIEF.md`.
- Design to follow: `docs/ARCHITECTURE.md` (schema, endpoint/role matrix, cache keys and TTLs, rate limits, security).
- Milestones and deployment: `docs/PLAN.md`. Target hosting is the Render free tier.
- When a criterion is done and verified, tick it in `docs/REQUIREMENTS.md` in the same commit.

## Non-negotiable requirements (easy to miss)

- Stack: React 18+, Node + Express, PostgreSQL, Redis, Recharts (or Chart.js).
- Route protections exactly as in the brief (`GET /api/testcases` for all roles; `POST/PUT/DELETE /api/testcases` for admin and test-lead; `POST /api/testexecutions` for admin, test-lead and tester; `GET /api/analytics` for all; `GET /api/users` admin only; `POST /api/projects` for admin and test-lead).
- `users.role` defaults to `'tester'`.
- Cache TTLs: analytics 15 min, suite lists 30 min, project metadata 1 h, plus invalidation on writes.
- Rate limits via `express-rate-limit`: auth 5/15 min, test case CRUD 100/h, executions 200/h, analytics 50/h.
- Frontend must visibly use: `useContext` (auth, theme, current project, permissions), `useCallback` (test case form, execution components), `useMemo` (stats, filtered/sorted lists), `React.lazy` + `Suspense`, virtual scrolling, lazy-loaded execution history, and Pie + Line + Bar charts.
- Deliverables: Swagger at `/api/docs`, `docs/DATABASE.md`, `docs/USER_GUIDE.md`, setup steps in README, `.env.example` in both apps, seeded demo data, a cache metrics page.

## Conventions

- Backend: CommonJS, Express 4, raw parameterized SQL via `pg` (never string-concatenate user input into SQL; whitelist sort columns), `zod` for validation, `xss` for sanitizing strings.
- Attachments are stored in Postgres (`bytea`) because Render's free filesystem is ephemeral.
- Frontend: Vite + plain CSS with CSS variables for theming; no UI framework required.
- Demo credentials (seeded): `admin@demo.com / Admin@123`, `lead@demo.com / Lead@123`, `tester@demo.com / Tester@123`, `viewer@demo.com / Viewer@123`.
