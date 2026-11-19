import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useProject } from '../context/ProjectContext';
import { formatDateTime } from '../lib/constants';
import { useAsync } from '../lib/useAsync';
import { EmptyState, ErrorBanner, PageLoader, Pager, ProgressBar } from '../components/ui';

export default function Runs() {
  const { projectId } = useProject();
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useAsync(() => api.get('/api/testruns', { projectId, page, pageSize: 20 }), [projectId, page]);

  if (loading && !data) return <PageLoader />;
  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Test Runs</h1>
          <p className="muted">
            Start a run from a <Link to="/suites">suite</Link>; progress shows executed vs total cases.
          </p>
        </div>
      </div>
      <ErrorBanner error={error} onRetry={reload} />
      {data && !data.data.length && <EmptyState title="No runs yet">Open a suite and click “Run suite”.</EmptyState>}
      {data?.data.length > 0 && (
        <div className="card table-card">
          <table className="table">
            <thead>
              <tr>
                <th>Run</th>
                <th className="hide-sm">Suite</th>
                <th>Status</th>
                <th>Progress</th>
                <th className="hide-sm">Started</th>
              </tr>
            </thead>
            <tbody>
              {data.data.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link to={`/runs/${r.id}`}>{r.name}</Link>
                  </td>
                  <td className="hide-sm">{r.suite_name || '—'}</td>
                  <td>
                    <span className={`run-status run-${r.status}`}>{r.status}</span>
                  </td>
                  <td style={{ minWidth: 160 }}>
                    <ProgressBar value={r.executed} total={r.total} />
                  </td>
                  <td className="hide-sm">
                    {formatDateTime(r.started_at)}
                    <div className="muted small">{r.started_by_name}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pager page={page} pageSize={20} total={data.total} onPage={setPage} />
        </div>
      )}
    </div>
  );
}
