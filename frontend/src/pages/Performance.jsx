import { useMemo, useState } from 'react';
import { api, errorText } from '../api/client';
import { useProject } from '../context/ProjectContext';
import { usePermissions } from '../context/PermissionsContext';
import { useAsync } from '../lib/useAsync';
import { ErrorBanner, PageLoader, ProgressBar } from '../components/ui';

const fmtMs = (v) => (v === null || v === undefined ? '—' : `${v.toFixed(v < 10 ? 2 : 1)} ms`);
const fmtTtl = (s) => (s >= 3600 ? `${s / 3600} h` : `${s / 60} min`);
const PREFIX_LABEL = { analytics: 'Execution analytics', suites: 'Suite lists', project: 'Project metadata', projects: 'Project lists (per user)' };

// Cache effectiveness: hit/miss ratio and cached vs uncached latency.
export default function Performance() {
  const { projectId } = useProject();
  const { can } = usePermissions();
  const { data, error, loading, reload } = useAsync(() => api.get('/api/metrics/cache'), []);
  const [bench, setBench] = useState(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState(null);

  const rows = useMemo(
    () =>
      (data?.prefixes || []).map((p) => ({
        ...p,
        label: PREFIX_LABEL[p.prefix] || p.prefix,
        speedup: p.avgHitMs && p.avgMissMs ? p.avgMissMs / p.avgHitMs : null,
      })),
    [data]
  );

  const runBenchmark = async () => {
    setBusy(true);
    setActionError(null);
    try {
      setBench(await api.post('/api/metrics/cache/benchmark', undefined, { projectId }));
      reload();
    } catch (err) {
      setActionError(errorText(err));
    } finally {
      setBusy(false);
    }
  };
  const reset = async () => {
    try {
      await api.post('/api/metrics/cache/reset');
      reload();
    } catch (err) {
      setActionError(errorText(err));
    }
  };

  if (loading && !data) return <PageLoader />;
  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Performance & caching</h1>
          <p className="muted">
            Redis: <strong className={data?.redis === 'connected' ? 'text-pass' : 'text-fail'}>{data?.redis}</strong>
            {data?.memoryUsed && ` · ${data.memoryUsed} used · ${data.cachedKeys} cached keys`}
          </p>
        </div>
        <div className="toolbar">
          <button type="button" className="btn btn-sm" onClick={reload}>
            Refresh
          </button>
          {can('metrics:benchmark') && projectId && (
            <button type="button" className="btn btn-primary btn-sm" onClick={runBenchmark} disabled={busy || data?.redis !== 'connected'}>
              {busy ? 'Measuring…' : 'Run cache benchmark'}
            </button>
          )}
          {can('metrics:reset') && (
            <button type="button" className="btn btn-sm btn-ghost" onClick={reset}>
              Reset metrics
            </button>
          )}
        </div>
      </div>
      <ErrorBanner error={error || actionError} />

      {data?.totals && (
        <div className="stats-grid">
          <div className="stat stat-pass">
            <div className="stat-label">Cache hits</div>
            <div className="stat-value">{data.totals.hits}</div>
          </div>
          <div className="stat stat-pending">
            <div className="stat-label">Cache misses</div>
            <div className="stat-value">{data.totals.misses}</div>
          </div>
          <div className="stat">
            <div className="stat-label">Hit ratio</div>
            <div className="stat-value">{(data.totals.hitRatio * 100).toFixed(1)}%</div>
          </div>
        </div>
      )}

      <div className="card table-card">
        <h2>By cached resource</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Resource</th>
              <th>TTL</th>
              <th>Hits / misses</th>
              <th>Hit ratio</th>
              <th>Avg cached (HIT)</th>
              <th>Avg uncached (MISS)</th>
              <th>Speed-up</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.prefix}>
                <td>{r.label}</td>
                <td>{r.prefix === 'analytics' ? fmtTtl(data.ttlSeconds.analytics) : r.prefix === 'suites' ? fmtTtl(data.ttlSeconds.suites) : fmtTtl(data.ttlSeconds.project)}</td>
                <td>
                  {r.hits} / {r.misses}
                </td>
                <td style={{ minWidth: 140 }}>
                  <ProgressBar value={Math.round(r.hitRatio * 100)} total={100} label={`${(r.hitRatio * 100).toFixed(0)}%`} />
                </td>
                <td>{fmtMs(r.avgHitMs)}</td>
                <td>{fmtMs(r.avgMissMs)}</td>
                <td>{r.speedup ? `${r.speedup.toFixed(1)}×` : '—'}</td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={7} className="muted">
                  No cache traffic recorded yet. Open the dashboard or suites a couple of times.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <p className="muted small">Latency is measured server-side inside the cache layer (Redis read vs. Postgres query + Redis write). Responses also carry an X-Cache header.</p>
      </div>

      {bench && (
        <div className="card">
          <h2>Benchmark (average of {bench.iterations} runs)</h2>
          <table className="table">
            <thead>
              <tr>
                <th>Resource</th>
                <th>Uncached</th>
                <th>Cached</th>
                <th>Speed-up</th>
              </tr>
            </thead>
            <tbody>
              {bench.results.map((b) => (
                <tr key={b.name}>
                  <td>{b.name}</td>
                  <td>{fmtMs(b.uncachedMs)}</td>
                  <td>{fmtMs(b.cachedMs)}</td>
                  <td>
                    <strong>{b.speedup.toFixed(1)}×</strong>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="card">
        <h2>Other performance measures</h2>
        <ul className="plain-list">
          <li>Every page is a lazily loaded route chunk (React.lazy + Suspense); charts load only with the dashboard.</li>
          <li>Test case lists use server-side pagination with virtual scrolling (only visible rows are rendered).</li>
          <li>Execution history is fetched only when its tab is opened.</li>
          <li>Rate limits: auth 5 / 15 min, test case CRUD 100 / h, executions 200 / h, analytics 50 / h.</li>
        </ul>
      </div>
    </div>
  );
}
