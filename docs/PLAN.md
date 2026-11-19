# Delivery Plan

**Deadline:** Monday 23 Nov 2026, 11:00 AM IST · **Repo:** https://github.com/aakashsiwach/testcase-management

## Accounts

| Account | Purpose | Cost | Status |
|---|---|---|---|
| GitHub (`aakashsiwach`) | Source code; Render deploys from it | Free | ✅ |
| Render (sign in with GitHub) | API, static frontend, Postgres, Redis (Key Value) | Free, no card | ☐ create |
| Neon *(optional)* | Postgres that doesn't expire after 30 days | Free | only if needed |
| Brevo / Resend *(optional)* | Real email for assignment notifications | Free | only for bonus |

## Repositories

**One public monorepo**, with `backend/` and `frontend/` folders (the brief asks for "a GitHub repository" with separate folders). One `render.yaml` deploys everything.

## Milestones

| # | When | Milestone | Done when |
|---|---|---|---|
| M0 | Thu 19 Nov | Repo, requirements, architecture, plan | Docs pushed ✅ |
| M1 | Thu 19 Nov | **Backend foundation:** schema migration, seed, config, auth, RBAC middleware, error handling | Login works for all 4 demo users locally |
| M2 | Thu–Fri | **Backend features:** projects, test cases (CRUD, filters, bulk, steps), suites, runs, executions, attachments, defects, audit, analytics, caching, rate limits, Swagger | Every endpoint in the role matrix works via Swagger |
| M3 | Fri 20 Nov | **Frontend foundation:** Vite, router with lazy routes, contexts, API client, layout, login/register, theme | Login, logout and role-aware nav work |
| M4 | Fri–Sat | **Frontend features:** dashboard (charts), projects, test cases (virtual list, filters, bulk, form), detail (history, comments, versions), suites, suite runner, defects, users, performance page | All AC-FE criteria met |
| M5 | Sat 21 Nov | **Deploy** to Render, seed production DB, smoke test all 4 roles | Live URLs work |
| M6 | Sun 22 Nov | Bonus (CSV import/export, versioning, comments, email), docs (schema, user guide, setup), bug fixes | REQUIREMENTS.md all checked |
| M7 | Mon 23 Nov, 9–10 AM | Wake the free services, final smoke test, send submission email | Email sent before 11:00 |

## Deployment

On the Render free tier, from `render.yaml` (Blueprint):

| Service | Render type | Name (suggested) |
|---|---|---|
| API | Web Service (Node, free) | `testcase-api` |
| Frontend | Static Site (free) | `testcase-web` |
| Database | Postgres (free) | `testcase-db` |
| Cache | Key Value (free, Redis-compatible) | `testcase-redis` |

Steps:
1. Render → **New → Blueprint** → select this repo.
2. Set `JWT_SECRET` and `CORS_ORIGIN` (frontend URL) on the API; set `VITE_API_URL` (API URL) on the static site.
3. Run migrations and seed (`npm run db:migrate && npm run db:seed`) via the API build/start command.
4. Smoke test with each demo account.

### Free-tier constraints and how we handle them

| Constraint | Mitigation |
|---|---|
| Web service sleeps after 15 min idle; ~1 min cold start | Open the site before submitting; mention it in the email; frontend shows "waking server…" |
| Free Postgres expires 30 days after creation; one per workspace | Fine for review; migrate to Neon if needed later |
| Ephemeral filesystem | Attachments stored in Postgres `bytea` |
| Free Key Value is in-memory only (data lost on restart) | It's a cache, so losing it is fine; metrics reset is acceptable |

## Risks

| Risk | Mitigation |
|---|---|
| Auth limit (5/15 min) blocks reviewers switching accounts | Key auth limiter by IP + email |
| Analytics limit (50/h) hit by dashboard refreshes | Single combined dashboard endpoint + 15-min cache |
| Time | Core ACs first, bonus last; daily push to GitHub |

## Submission email template

```
Hi,

Please find my submission for the Full Stack Test Case Management System assignment.

IMPORTANT URLS
- Live app:      https://<frontend>.onrender.com
- API:           https://<api>.onrender.com
- API docs:      https://<api>.onrender.com/api/docs
- GitHub repo:   https://github.com/aakashsiwach/testcase-management

DEMO CREDENTIALS
- Admin:      admin@demo.com / <password>
- Test Lead:  lead@demo.com / <password>
- Tester:     tester@demo.com / <password>
- Read Only:  viewer@demo.com / <password>

Note: hosted on Render's free tier; the first request after inactivity may take ~1 minute to wake the server.

Regards,
Aakash Siwach
```
