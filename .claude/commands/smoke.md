---
description: Smoke-test the API as all 4 roles (local or deployed) and report RBAC/cache/rate-limit results
argument-hint: [base URL, default http://localhost:4000]
---

Smoke-test the API at `${ARGUMENTS:-http://localhost:4000}`. Keep output compact: one line per check, then a summary table.

1. If `scripts/smoke.sh` doesn't exist, create it (bash + curl + jq-free parsing with `node -e`) and commit it as `test: add API smoke test script`. It must:
   - Log in as each demo user from CLAUDE.md and keep the tokens.
   - Check the brief's route protections, expecting these statuses:
     - `GET /api/testcases?projectId=…`: 200 for all 4 roles
     - `POST /api/testcases`: 201 for admin and lead; 403 for tester and viewer
     - `POST /api/testexecutions`: 201 for admin, lead and tester; 403 for viewer
     - `GET /api/analytics/dashboard?projectId=…`: 200 for all
     - `GET /api/users`: 200 for admin; 403 for the rest
     - `POST /api/projects`: 201 for admin and lead; 403 for tester and viewer
     - Any call with no token: 401
   - Call the analytics endpoint twice and expect `X-Cache: MISS` then `HIT`.
   - Print PASS/FAIL per line and exit non-zero on any FAIL.
   - Clean up anything it created.
2. Run it with `bash scripts/smoke.sh <url> 2>&1 | tail -40`.
3. For each FAIL: find the cause, fix it, commit, re-run. Don't burn the auth rate limit: reuse tokens, and don't loop logins.
4. Report: pass/fail counts, fixes made, and anything still failing.
