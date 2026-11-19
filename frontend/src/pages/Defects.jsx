import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { useProject } from '../context/ProjectContext';
import { usePermissions } from '../context/PermissionsContext';
import { DEFECT_STATUSES, PRIORITY_COLORS, SEVERITIES, formatDate } from '../lib/constants';
import { useDebounced } from '../lib/hooks';
import { useAsync } from '../lib/useAsync';
import DefectModal from '../components/DefectModal';
import { Badge, EmptyState, ErrorBanner, PageLoader, Pager } from '../components/ui';

const STATUS_COLORS = { Open: '#dc2626', 'In Progress': '#d97706', Resolved: '#16a34a', Closed: '#64748b' };

export default function Defects() {
  const { projectId } = useProject();
  const { can } = usePermissions();
  const [params] = useSearchParams();
  const testCaseId = params.get('testCaseId') || undefined;
  const focus = Number(params.get('focus')) || null;
  const [status, setStatus] = useState(testCaseId || focus ? '' : 'Open,In Progress');
  const [severity, setSeverity] = useState('');
  const [q, setQ] = useState('');
  const debouncedQ = useDebounced(q);
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);
  const { data, error, loading, reload } = useAsync(
    () => api.get('/api/defects', { projectId, status, severity, q: debouncedQ, testCaseId, page, pageSize: 25 }),
    [projectId, status, severity, debouncedQ, testCaseId, page]
  );

  const saved = () => {
    setEditing(null);
    setCreating(false);
    reload();
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Defects</h1>
          {testCaseId && (
            <p className="muted">
              For <Link to={`/testcases/${testCaseId}`}>test case #{testCaseId}</Link> · <Link to="/defects">show all</Link>
            </p>
          )}
        </div>
        {can('defect:create') && (
          <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
            + New defect
          </button>
        )}
      </div>
      <div className="filters card">
        <input type="search" className="search" placeholder="Search defects…" value={q} onChange={(e) => (setQ(e.target.value), setPage(1))} aria-label="Search defects" />
        <select value={status} onChange={(e) => (setStatus(e.target.value), setPage(1))} aria-label="Status">
          <option value="Open,In Progress">Open + In progress</option>
          <option value="">All statuses</option>
          {DEFECT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select value={severity} onChange={(e) => (setSeverity(e.target.value), setPage(1))} aria-label="Severity">
          <option value="">All severities</option>
          {SEVERITIES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </div>
      <ErrorBanner error={error} onRetry={reload} />
      {loading && !data ? (
        <PageLoader />
      ) : data && !data.data.length ? (
        <EmptyState title="No defects match" />
      ) : (
        data && (
          <div className="card table-card">
            <table className="table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Title</th>
                  <th>Severity</th>
                  <th>Status</th>
                  <th className="hide-sm">Test case</th>
                  <th className="hide-sm">Assignee</th>
                  <th className="hide-sm">Reported</th>
                  {can('defect:update') && <th />}
                </tr>
              </thead>
              <tbody>
                {data.data.map((d) => (
                  <tr key={d.id} className={focus === d.id ? 'row-focus' : ''}>
                    <td className="muted">#{d.id}</td>
                    <td>
                      {d.title}
                      {d.description && <div className="muted small clamp-2">{d.description}</div>}
                    </td>
                    <td>
                      <Badge color={PRIORITY_COLORS[d.severity]}>{d.severity}</Badge>
                    </td>
                    <td>
                      <Badge color={STATUS_COLORS[d.status]}>{d.status}</Badge>
                    </td>
                    <td className="hide-sm">{d.test_case_id ? <Link to={`/testcases/${d.test_case_id}`}>#{d.test_case_id}</Link> : '—'}</td>
                    <td className="hide-sm">{d.assignee_name || '—'}</td>
                    <td className="hide-sm">
                      {formatDate(d.created_at)}
                      <div className="muted small">{d.reported_by_name}</div>
                    </td>
                    {can('defect:update') && (
                      <td>
                        <button type="button" className="btn btn-sm" onClick={() => setEditing(d)}>
                          Edit
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            <Pager page={page} pageSize={25} total={data.total} onPage={setPage} />
          </div>
        )
      )}
      {editing && <DefectModal projectId={projectId} defect={editing} onClose={() => setEditing(null)} onSaved={saved} />}
      {creating && <DefectModal projectId={projectId} onClose={() => setCreating(false)} onSaved={saved} />}
    </div>
  );
}
