const db = require('../config/db');

const LATEST = `latest AS (
  SELECT DISTINCT ON (test_case_id) test_case_id, status, executed_at
    FROM test_executions WHERE project_id = $1
   ORDER BY test_case_id, executed_at DESC, id DESC)`;

const STATUSES = ['Pass', 'Fail', 'Blocked', 'Skipped', 'Pending'];
const PRIORITIES = ['Critical', 'High', 'Medium', 'Low'];
const TYPES = ['Functional', 'Integration', 'Regression', 'Smoke', 'UI', 'API'];

const emptyCounts = () => Object.fromEntries(STATUSES.map((s) => [s, 0]));

// Builds the whole dashboard in one call so the UI makes a single (rate-limited, cached) request.
async function buildDashboard(projectId, days) {
  const [matrix, coverage, trend, testers, defects, defectsByPriority, runs] = await Promise.all([
    db.query(
      `WITH ${LATEST}
       SELECT tc.priority, tc.type, COALESCE(l.status, 'Pending') AS status, COUNT(*)::int AS count
         FROM test_cases tc LEFT JOIN latest l ON l.test_case_id = tc.id
        WHERE tc.project_id = $1 GROUP BY 1, 2, 3`,
      [projectId]
    ),
    db.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM test_executions e WHERE e.test_case_id = tc.id))::int AS executed,
              COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM test_suite_cases sc WHERE sc.test_case_id = tc.id))::int AS in_suite,
              COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM test_steps s WHERE s.test_case_id = tc.id))::int AS with_steps,
              COUNT(*) FILTER (WHERE tc.assigned_to IS NOT NULL)::int AS assigned,
              COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM test_executions e WHERE e.test_case_id = tc.id
                                               AND e.executed_at >= NOW() - make_interval(days => $2)))::int AS executed_in_period
         FROM test_cases tc WHERE tc.project_id = $1`,
      [projectId, days]
    ),
    db.query(
      `SELECT to_char(d, 'YYYY-MM-DD') AS date,
              COUNT(e.id) FILTER (WHERE e.status = 'Pass')::int AS "Pass",
              COUNT(e.id) FILTER (WHERE e.status = 'Fail')::int AS "Fail",
              COUNT(e.id) FILTER (WHERE e.status = 'Blocked')::int AS "Blocked",
              COUNT(e.id) FILTER (WHERE e.status = 'Skipped')::int AS "Skipped"
         FROM generate_series((CURRENT_DATE - ($2::int - 1))::timestamp, CURRENT_DATE::timestamp, '1 day') d
         LEFT JOIN test_executions e ON e.project_id = $1 AND e.executed_at >= d AND e.executed_at < d + INTERVAL '1 day'
        GROUP BY d ORDER BY d`,
      [projectId, days]
    ),
    db.query(
      `WITH ${LATEST}
       SELECT u.id, u.name, u.role,
              COUNT(tc.id)::int AS assigned,
              COUNT(tc.id) FILTER (WHERE l.status IS NOT NULL)::int AS executed,
              COUNT(tc.id) FILTER (WHERE l.status = 'Pass')::int AS passed,
              COUNT(tc.id) FILTER (WHERE l.status = 'Fail')::int AS failed,
              COUNT(tc.id) FILTER (WHERE l.status = 'Blocked')::int AS blocked,
              COUNT(tc.id) FILTER (WHERE l.status = 'Skipped')::int AS skipped,
              (SELECT COUNT(*)::int FROM test_executions e WHERE e.executed_by = u.id AND e.project_id = $1
                  AND e.executed_at >= NOW() - make_interval(days => $2)) AS executions_in_period
         FROM project_members m
         JOIN users u ON u.id = m.user_id
         LEFT JOIN test_cases tc ON tc.assigned_to = u.id AND tc.project_id = $1
         LEFT JOIN latest l ON l.test_case_id = tc.id
        WHERE m.project_id = $1 AND u.role <> 'read-only' AND u.is_active
        GROUP BY u.id ORDER BY u.name`,
      [projectId, days]
    ),
    db.query(
      `SELECT status, severity, COUNT(*)::int AS count FROM defects WHERE project_id = $1 GROUP BY 1, 2`,
      [projectId]
    ),
    db.query(
      `SELECT tc.priority, COUNT(DISTINCT tc.id)::int AS cases, COUNT(d.id)::int AS defects
         FROM test_cases tc LEFT JOIN defects d ON d.test_case_id = tc.id
        WHERE tc.project_id = $1 GROUP BY 1`,
      [projectId]
    ),
    db.query(
      `SELECT r.id, r.name, r.status, r.started_at, cardinality(r.case_ids) AS total,
              (SELECT COUNT(DISTINCT e.test_case_id)::int FROM test_executions e WHERE e.run_id = r.id) AS executed
         FROM test_runs r WHERE r.project_id = $1 ORDER BY r.started_at DESC LIMIT 5`,
      [projectId]
    ),
  ]);

  const summary = { total: 0, ...emptyCounts() };
  const byPriority = Object.fromEntries(PRIORITIES.map((p) => [p, { priority: p, total: 0, ...emptyCounts() }]));
  const byType = Object.fromEntries(TYPES.map((t) => [t, { type: t, total: 0, ...emptyCounts() }]));
  for (const r of matrix.rows) {
    summary.total += r.count;
    summary[r.status] += r.count;
    byPriority[r.priority].total += r.count;
    byPriority[r.priority][r.status] += r.count;
    byType[r.type].total += r.count;
    byType[r.type][r.status] += r.count;
  }
  const rate = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : 0);
  for (const row of [...Object.values(byPriority), ...Object.values(byType)]) {
    const executed = row.total - row.Pending;
    row.passRate = rate(row.Pass, executed);
    row.failRate = rate(row.Fail, executed);
  }
  const executedNow = summary.total - summary.Pending;

  const c = coverage.rows[0];
  const defectTotals = { total: 0, open: 0, byStatus: {}, bySeverity: {} };
  for (const r of defects.rows) {
    defectTotals.total += r.count;
    if (r.status === 'Open' || r.status === 'In Progress') defectTotals.open += r.count;
    defectTotals.byStatus[r.status] = (defectTotals.byStatus[r.status] || 0) + r.count;
    defectTotals.bySeverity[r.severity] = (defectTotals.bySeverity[r.severity] || 0) + r.count;
  }

  return {
    projectId,
    days,
    generatedAt: new Date().toISOString(),
    summary: { ...summary, executed: executedNow, passRate: rate(summary.Pass, executedNow) },
    coverage: {
      total: c.total,
      executedPct: rate(c.executed, c.total),
      inSuitePct: rate(c.in_suite, c.total),
      withStepsPct: rate(c.with_steps, c.total),
      assignedPct: rate(c.assigned, c.total),
      executedInPeriodPct: rate(c.executed_in_period, c.total),
    },
    trend: trend.rows.map((t) => {
      const executed = t.Pass + t.Fail + t.Blocked + t.Skipped;
      return { ...t, total: executed, passRate: executed ? rate(t.Pass, executed) : null };
    }),
    byPriority: PRIORITIES.map((p) => byPriority[p]),
    byType: TYPES.map((t) => byType[t]),
    byTester: testers.rows.map((t) => ({ ...t, progressPct: rate(t.executed, t.assigned) })),
    defects: {
      ...defectTotals,
      densityPerCase: c.total ? Math.round((defectTotals.total / c.total) * 100) / 100 : 0,
      densityPerExecutedCase: c.executed ? Math.round((defectTotals.total / c.executed) * 100) / 100 : 0,
      openPerHundredCases: c.total ? Math.round((defectTotals.open / c.total) * 1000) / 10 : 0,
      byPriority: PRIORITIES.map((p) => {
        const r = defectsByPriority.rows.find((x) => x.priority === p) || { cases: 0, defects: 0 };
        return { priority: p, cases: r.cases, defects: r.defects, density: r.cases ? Math.round((r.defects / r.cases) * 100) / 100 : 0 };
      }),
    },
    recentRuns: runs.rows.map((r) => ({ ...r, progressPct: rate(r.executed, r.total) })),
  };
}

module.exports = { buildDashboard };
