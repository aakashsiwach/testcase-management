---
description: Build the whole project end to end (M1→M7) in one run, using a fresh subagent per milestone to save tokens
argument-hint: "[resume-from: M1..M7] [notes]"
---

Build the complete Test Case Management System in one run, from milestone **M1** through **M7** (start from `$ARGUMENTS` if it names a milestone). Work autonomously. Don't ask questions unless something is irreversible.

## How to run it (token-efficient orchestration)

You are the **orchestrator**. Keep your own context small:
- **Don't** read docs or write code yourself. For each milestone, launch **one subagent** (Agent tool, `general-purpose`, foreground) whose prompt is exactly:

  > Read `.claude/commands/milestone.md` and follow it fully for milestone **<ID>**. Obey CLAUDE.md git rules: commit as Aakash Siwach, no AI attribution lines. Verify by running things, not by reading code. Commit and push in small slices. Return ONLY: status (done/partial), ACs ticked, commit count, manual steps for the user, and a resume note if partial (max 12 lines).

- Run milestones **in order**, one at a time (they depend on each other): **M1 → M2 → smoke → M3 → M4 → M5 → M6 → M7**.
- After each subagent returns, keep only its ≤12-line report. If it's **partial**, launch another subagent for the same milestone with its resume note. Retry at most 2 times, then record the gap and move on.
- **smoke** step (after M2): launch a subagent with the prompt "Read `.claude/commands/smoke.md` and follow it against http://localhost:4000. Return pass/fail counts and fixes only (max 8 lines)."
- **M5 (deploy):** the subagent writes `render.yaml` and the deploy docs. Real deployment needs the user's Render account, so collect the manual steps it returns and continue with M6 and M7 without waiting.

## Preconditions (check once, briefly)
1. `git config user.name` → must be `Aakash Siwach`; otherwise set it per CLAUDE.md. Run `git pull`.
2. Postgres and Redis reachable locally (`pg_isready`, `redis-cli ping`). If not, try `docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=postgres postgres:16` and `docker run -d -p 6379:6379 redis:7`. If Docker is unavailable, stop and tell the user exactly what to start.
3. Create the local database if missing: `createdb testcase_mgmt` (or via psql).

## Rules
- Each milestone must end with everything committed and pushed.
- Never put secrets in commits.
- Don't duplicate work: each subagent checks `git log --oneline | head -20` and the ticked ACs before starting.

## Final output (to the user, ≤ 25 lines)
1. Table: milestone → status → commits.
2. Count of ACs ticked in `docs/REQUIREMENTS.md` vs. total; list any unticked ones.
3. **Your manual steps** to go live (Render Blueprint deploy, env vars to set), copied from M5.
4. After deploying: `/smoke https://<api>.onrender.com`, then fill in the URLs in the README and the submission email in `docs/PLAN.md`.
