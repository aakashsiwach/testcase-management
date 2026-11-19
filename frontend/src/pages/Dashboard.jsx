import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useProject } from '../context/ProjectContext';
import { useAsync } from '../lib/useAsync';
import { pct, formatDateTime } from '../lib/constants';
import { ErrorBanner, PageLoader, ProgressBar } from '../components/ui';
import { DefectBar, RateBar, StatusPie, TesterBar, TrendLine } from '../components/charts/Charts';

function Stat({ label, value, sub, tone }) {
  return (
    <div className={`stat ${tone ? `stat-${tone}` : ''}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

export default function Dashboard() {
  const { project, projectId } = useProject();
  const [days, setDays] = useState(30);
  const [trendMode, setTrendMode] = useState('count');
  const [dimension, setDimension] = useState('priority');
  // One request for the whole dashboard (cached 15 min server-side, analytics limit 50/h).
  const { data, error, loading, reload } = useAsync(() => api.get('/api/analytics', { projectId, days }), [projectId, days]);

  // Derived statistics (memoised so re-renders from filters don't recompute).
  const stats = useMemo(() => {
    if (!data) return null;
    const { summary, trend } = data;
    const periodExecutions = trend.reduce((a, t) => a + t.total, 0);
    const periodPass = trend.reduce((a, t) => a + t.Pass, 0);
    const half = Math.floor(trend.length / 2);
    const rateOf = (rows) => {
      const total = rows.reduce((a, t) => a + t.total, 0);
      return total ? (rows.reduce((a, t) => a + t.Pass, 0) / total) * 100 : null;
    };
    const earlier = rateOf(trend.slice(0, half));
    const later = rateOf(trend.slice(half));
    return {
      executed: summary.total - summary.Pending,
      periodExecutions,
      periodPassRate: periodExecutions ? (periodPass / periodExecutions) * 100 : 0,
      trendDelta: earlier !== null && later !== null ? later - earlier : null,
    };
  }, [data]);

  const barRows = useMemo(() => (data ? (dimension === 'priority' ? data.byPriority : data.byType) : []), [data, dimension]);

  if (loading && !data) return <PageLoader label="Loading analytics…" />;
  if (error && !data) return <ErrorBanner error={error} onRetry={reload} />;
  if (!data) return null;
  const { summary, coverage, defects } = data;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Dashboard</h1>
          <p className="muted">
            {project?.name} · v{project?.version} · updated {formatDateTime(data.generatedAt)}
            {data.__cache && <span className={`cache-tag cache-${data.__cache.toLowerCase()}`}>cache {data.__cache}</span>}
          </p>
        </div>
        <div className="toolbar">
          <label className="inline-field">
            Period
            <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
              <option value={7}>7 days</option>
              <option value={14}>14 days</option>
              <option value={30}>30 days</option>
              <option value={90}>90 days</option>
            </select>
          </label>
          <button type="button" className="btn btn-sm" onClick={reload} disabled={loading}>
            Refresh
          </button>
        </div>
      </div>
      <ErrorBanner error={error} />

      <section className="stats-grid" aria-label="Execution summary">
        <Stat label="Test cases" value={summary.total} sub={`${stats.executed} executed`} />
        <Stat label="Passed" value={summary.Pass} tone="pass" sub={`${pct(summary.passRate)} pass rate`} />
        <Stat label="Failed" value={summary.Fail} tone="fail" />
        <Stat label="Blocked" value={summary.Blocked} tone="blocked" />
        <Stat label="Skipped" value={summary.Skipped} tone="skipped" />
        <Stat label="Pending" value={summary.Pending} tone="pending" sub="never executed" />
      </section>

      <section className="grid-2">
        <div className="card">
          <h2>Test status distribution</h2>
          <p className="muted small">Latest result of each test case. Click a legend item to hide it.</p>
          <StatusPie summary={summary} />
        </div>
        <div className="card">
          <div className="card-header">
            <h2>Execution trend</h2>
            <div className="segmented" role="group" aria-label="Trend mode">
              <button type="button" className={trendMode === 'count' ? 'active' : ''} onClick={() => setTrendMode('count')}>
                Results
              </button>
              <button type="button" className={trendMode === 'rate' ? 'active' : ''} onClick={() => setTrendMode('rate')}>
                Pass rate
              </button>
            </div>
          </div>
          <p className="muted small">
            {stats.periodExecutions} executions in {days} days · {pct(stats.periodPassRate)} passed
            {stats.trendDelta !== null && (
              <span className={stats.trendDelta >= 0 ? 'text-pass' : 'text-fail'}>
                {' '}
                ({stats.trendDelta >= 0 ? '▲' : '▼'} {Math.abs(stats.trendDelta).toFixed(1)} pts vs first half)
              </span>
            )}
          </p>
          <TrendLine trend={data.trend} mode={trendMode} />
        </div>
      </section>

      <section className="grid-2">
        <div className="card">
          <div className="card-header">
            <h2>Pass / fail rate by {dimension}</h2>
            <div className="segmented" role="group" aria-label="Group by">
              <button type="button" className={dimension === 'priority' ? 'active' : ''} onClick={() => setDimension('priority')}>
                Priority
              </button>
              <button type="button" className={dimension === 'type' ? 'active' : ''} onClick={() => setDimension('type')}>
                Type
              </button>
            </div>
          </div>
          <RateBar rows={barRows} dimension={dimension} />
          <table className="table table-compact">
            <thead>
              <tr>
                <th>{dimension === 'priority' ? 'Priority' : 'Type'}</th>
                <th>Cases</th>
                <th>Pass</th>
                <th>Fail</th>
                <th>Pending</th>
              </tr>
            </thead>
            <tbody>
              {barRows.map((r) => (
                <tr key={r[dimension]}>
                  <td>{r[dimension]}</td>
                  <td>{r.total}</td>
                  <td>{r.Pass}</td>
                  <td>{r.Fail}</td>
                  <td>{r.Pending}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card">
          <h2>Execution progress by tester</h2>
          <p className="muted small">Latest result of the test cases assigned to each person.</p>
          <TesterBar rows={data.byTester} />
          <div className="tester-progress">
            {data.byTester.map((t) => (
              <div key={t.id} className="tester-row">
                <span>{t.name}</span>
                <ProgressBar value={t.executed} total={t.assigned} />
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid-2">
        <div className="card">
          <h2>Test coverage</h2>
          <div className="coverage">
            {[
              ['Executed at least once', coverage.executedPct],
              [`Executed in last ${days} days`, coverage.executedInPeriodPct],
              ['Included in a suite', coverage.inSuitePct],
              ['Have test steps', coverage.withStepsPct],
              ['Assigned to a tester', coverage.assignedPct],
            ].map(([label, value]) => (
              <div key={label} className="coverage-row">
                <span>{label}</span>
                <ProgressBar value={value} total={100} label={pct(value)} />
              </div>
            ))}
          </div>
          <h3>Recent runs</h3>
          {data.recentRuns.length ? (
            data.recentRuns.map((r) => (
              <div key={r.id} className="coverage-row">
                <Link to={`/runs/${r.id}`}>{r.name}</Link>
                <ProgressBar value={r.executed} total={r.total} />
              </div>
            ))
          ) : (
            <p className="muted">No runs yet.</p>
          )}
        </div>
        <div className="card">
          <h2>Defect density</h2>
          <div className="stats-grid stats-grid-sm">
            <Stat label="Total defects" value={defects.total} />
            <Stat label="Open" value={defects.open} tone="fail" />
            <Stat label="Per test case" value={defects.densityPerCase} />
            <Stat label="Per executed case" value={defects.densityPerExecutedCase} />
          </div>
          <DefectBar rows={defects.byPriority} />
          <div className="chip-row">
            {Object.entries(defects.byStatus).map(([s, n]) => (
              <span key={s} className="chip">
                {s}: {n}
              </span>
            ))}
            {Object.entries(defects.bySeverity).map(([s, n]) => (
              <span key={s} className="chip">
                {s} severity: {n}
              </span>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
