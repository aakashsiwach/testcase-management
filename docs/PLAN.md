# Delivery Plan

**Deadline:** Monday 23 Nov 2026, 11:00 AM IST · **Repo:** https://github.com/aakashsiwach/testcase-management

## Accounts

| Account | Purpose | Cost | Status |
|---|---|---|---|
| GitHub (`aakashsiwach`) | Source code; Render deploys from it | Free | ✅ |
| Render (sign in with GitHub) | API web service | Free, no card | ✅ deployed |
| Vercel | Frontend | Free | ✅ deployed |
| Neon | PostgreSQL | Free | ✅ connected |
| Upstash | Redis | Free | ✅ connected |
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
| M5 | Sat 21 Nov | **Deploy** to Render, seed production DB, smoke test all 4 roles | Live URLs work ✅ |
| M6 | Sun 22 Nov | Bonus (CSV import/export, versioning, comments, email), docs (schema, user guide, setup), bug fixes | REQUIREMENTS.md all checked |
| M7 | Mon 23 Nov, 9–10 AM | Wake the free services, final smoke test, send submission email | Email sent before 11:00 |

## Deployment

Free tier across four providers (full steps in the [README](../README.md#deployment-free-tier-neon--upstash--render--vercel)):

| Piece | Provider | Config |
|---|---|---|
| Frontend (static SPA) | Vercel | root `frontend/`, `vercel.json` (SPA rewrites, headers), env `VITE_API_URL` |
| API | Render web service (free) | `render.yaml` blueprint, health check `/api/health` |
| Database | Neon Postgres | `DATABASE_URL` (`sslmode=require`), `DATABASE_SSL=true` |
| Cache | Upstash Redis | `REDIS_URL` (`rediss://`) |

The API start command runs migrations (idempotent) and the seed (only on an empty DB) before booting.

### Free-tier constraints and how we handle them

| Constraint | Mitigation |
|---|---|
| Render web service sleeps after 15 min idle; ~1 min cold start | Open the site before submitting; mention it in the email; the frontend shows a "server may be waking up" message |
| Ephemeral filesystem | Attachments stored in Postgres `bytea`; no local state |
| Neon free compute auto-suspends | Pool max 5, 10 s connect timeout; first query after idle is slower |
| Upstash command quota | Cache only hot reads; API degrades to Postgres if Redis is unavailable |

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
- Live app:      https://testcase-management-eight.vercel.app/
- API:           https://testcase-api.onrender.com
- API docs:      https://testcase-api.onrender.com/api/docs
- GitHub repo:   https://github.com/aakashsiwach/testcase-management

DEMO CREDENTIALS
- Admin:      admin@demo.com / Admin@123
- Test Lead:  lead@demo.com / Lead@123
- Tester:     tester@demo.com / Tester@123
- Read Only:  viewer@demo.com / Viewer@123

Note: hosted on Render's free tier; the first request after inactivity may take ~1 minute to wake the server.

Regards,
Aakash Siwach
```
