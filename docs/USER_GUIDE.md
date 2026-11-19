# User guide

Sign in at the app URL. On the login page, the **Demo accounts** buttons fill in the credentials for each role. Use the project selector in the top bar to switch projects; every page shows data for the current project. The ☾ / ☀ button toggles dark mode.

| Role | Email | Password |
|---|---|---|
| Admin | `admin@demo.com` | `Admin@123` |
| Test Lead | `lead@demo.com` | `Lead@123` |
| Tester | `tester@demo.com` | `Tester@123` |
| Read Only | `viewer@demo.com` | `Viewer@123` |

> Hosting is on free tiers: the first request after ~15 minutes of inactivity can take up to a minute while the API wakes up.

## Everyone (including Read Only)

- **Dashboard:** execution summary (total / passed / failed / blocked / skipped / pending), status pie, execution trend (switch between result counts and pass rate), pass/fail rate by priority or type, progress per tester, coverage and defect density. Change the period (7–90 days) at the top right. Click legend items to hide or show a series; hover for tooltips.
- **Test Cases:** search by text or `#id` and combine filters (priority, type, last result, tags, suite, assignee), then sort. The list loads more rows as you scroll. Filters stay in the URL, so you can bookmark or share a view. **Export CSV** downloads the project's cases.
- **Test case detail:** description, pre/post-conditions, steps, suites and assignee. The tabs at the bottom load on demand: **Execution history** (results with comments, attachments and linked defects), **Comments**, **Versions** (snapshot of every edit) and **Audit trail**.
- **Test Suites / Test Runs:** suite reports (result breakdown, pass rate, run history) and progress per run.
- **Defects**, **Audit Log** (every change in the project) and **Performance** (cache hit ratio and cached vs uncached latency).

Read Only users see the **Execute** panel with its buttons disabled and have no create, edit or delete controls.

## Tester

Everything above, plus:

1. **Execute a test:** open a test case, pick **Pass / Fail / Blocked / Skipped**, add comments and optionally attach screenshots or logs (png, jpg, gif, pdf, txt, log, csv; up to 5 files of 5 MB), then click **Record result**.
2. **Raise a defect:** after recording a **Fail**, click **Raise defect**. Title, description, steps and execution details are pre-filled. You can also create defects from the Defects page and update their status.
3. **Run a suite:** open a suite and click **▶ Run suite**. The runner lists every case on the left; record a result for each one (it moves to the next case automatically), then click **Complete run**.
4. **My work:** on Test Cases, set the assignee filter to **Assigned to me**.
5. Comment on test cases. You can change results you recorded yourself, not other people's.

## Test Lead

Everything a tester can do, plus:

- **Projects:** create projects, edit name, description, version and status, and add or remove team members (project page → *Team members*).
- **Test cases:** **+ New test case** with ordered steps (add, reorder, remove), tags, assignee and suites. Edit or delete from the detail page. Every edit creates a new version.
- **Bulk actions:** tick rows (or the header checkbox) in the list, then **Change priority**, **Add to suite**, **Assign** or **Delete**.
- **Import CSV:** columns `title` (required), `description`, `priority`, `type`, `preconditions`, `postconditions`, `tags` (`;` separated), `steps` (one per line, `action -> expected`). A file exported from the app can be imported again. The import is all-or-nothing, and errors are reported per row.
- **Assign** cases to testers (detail page or bulk). Assignees get an email when SMTP is configured; otherwise the notification is logged.
- **Suites:** create, edit and delete suites, and add or remove cases.
- **Performance:** run the cache benchmark.

## Admin

Everything a test lead can do, plus:

- Sees **all** projects (other roles only see projects they're members of) and can delete projects.
- **Users** page: change anyone's role, and deactivate or reactivate accounts. New registrations always start as **Tester**.
- Reset the cache metrics on the Performance page.
