import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, errorText } from '../api/client';
import { usePermissions } from '../context/PermissionsContext';
import { STATUS_COLORS, formatDateTime, pct } from '../lib/constants';
import { useDebounced } from '../lib/hooks';
import { useAsync } from '../lib/useAsync';
import { EmptyState, ErrorBanner, Modal, PageLoader, PriorityBadge, ProgressBar, StatusBadge } from '../components/ui';
import { SuiteModal } from './Suites';

export default function SuiteDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { can } = usePermissions();
  const suite = useAsync(() => api.get(`/api/testsuites/${id}`), [id]);
  const report = useAsync(() => api.get(`/api/testsuites/${id}/report`), [id]);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState(null);
  const [sort, setSort] = useState('position');

  const reloadAll = () => {
    suite.reload();
    report.reload();
  };

  // Sorted view of the suite's cases (memoised).
  const cases = useMemo(() => {
    const list = [...(suite.data?.cases || [])];
    const order = { Critical: 0, High: 1, Medium: 2, Low: 3 };
    if (sort === 'priority') list.sort((a, b) => order[a.priority] - order[b.priority]);
    if (sort === 'status') list.sort((a, b) => (a.last_status || 'zz').localeCompare(b.last_status || 'zz'));
    return list;
  }, [suite.data, sort]);

  if (suite.loading && !suite.data) return <PageLoader />;
  if (suite.error) return <ErrorBanner error={suite.error} onRetry={suite.reload} />;
  const s = suite.data;

  const startRun = async () => {
    setError(null);
    try {
      const run = await api.post(`/api/testsuites/${s.id}/runs`, {});
      navigate(`/runs/${run.id}`);
    } catch (err) {
      setError(errorText(err));
    }
  };
  const removeCase = async (caseId) => {
    try {
      await api.del(`/api/testsuites/${s.id}/cases/${caseId}`);
      reloadAll();
    } catch (err) {
      setError(errorText(err));
    }
  };
  const remove = async () => {
    try {
      await api.del(`/api/testsuites/${s.id}`);
      navigate('/suites');
    } catch (err) {
      setError(errorText(err));
    }
  };

  const r = report.data;
  return (
    <div className="page">
      <div className="breadcrumbs">
        <Link to="/suites">Suites</Link> / {s.name}
      </div>
      <div className="page-header">
        <div>
          <h1>{s.name}</h1>
          <p className="muted">{s.description}</p>
        </div>
        <div className="toolbar">
          {can('suite:run') && (
            <button type="button" className="btn btn-primary" onClick={startRun} disabled={!s.cases.length}>
              ▶ Run suite
            </button>
          )}
          {can('suite:manage') && (
            <>
              <button type="button" className="btn" onClick={() => setAdding(true)}>
                + Add cases
              </button>
              <button type="button" className="btn" onClick={() => setEditing(true)}>
                Edit
              </button>
              <button type="button" className="btn btn-danger" onClick={() => setConfirmDelete(true)}>
                Delete
              </button>
            </>
          )}
        </div>
      </div>
      <ErrorBanner error={error} />

      {r && (
        <section className="grid-2">
          <div className="card">
            <h2>Suite report</h2>
            <div className="stats-grid stats-grid-sm">
              <div className="stat">
                <div className="stat-label">Pass rate</div>
                <div className="stat-value">{pct(r.passRate * 100)}</div>
              </div>
              <div className="stat">
                <div className="stat-label">Executed</div>
                <div className="stat-value">
                  {r.executed}/{r.total}
                </div>
              </div>
            </div>
            <div className="stacked-bar" aria-label="Result breakdown">
              {Object.entries(r.breakdown).map(([k, v]) =>
                v ? <span key={k} style={{ flex: v, background: STATUS_COLORS[k] }} title={`${k}: ${v}`} /> : null
              )}
            </div>
            <div className="chip-row">
              {Object.entries(r.breakdown).map(([k, v]) => (
                <span key={k} className="chip">
                  <span className="dot" style={{ background: STATUS_COLORS[k] }} /> {k}: {v}
                </span>
              ))}
            </div>
          </div>
          <div className="card">
            <h2>Run history</h2>
            {r.runs.length ? (
              <table className="table table-compact">
                <thead>
                  <tr>
                    <th>Run</th>
                    <th>Progress</th>
                    <th>Pass / Fail</th>
                  </tr>
                </thead>
                <tbody>
                  {r.runs.map((run) => (
                    <tr key={run.id}>
                      <td>
                        <Link to={`/runs/${run.id}`}>{run.name}</Link>
                        <div className="muted small">
                          {formatDateTime(run.started_at)} · {run.status}
                        </div>
                      </td>
                      <td>
                        <ProgressBar value={run.executed} total={run.total} />
                      </td>
                      <td>
                        <span className="text-pass">{run.passed}</span> / <span className="text-fail">{run.failed}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="muted">This suite has not been run yet.</p>
            )}
          </div>
        </section>
      )}

      <div className="card">
        <div className="card-header">
          <h2>Test cases ({s.cases.length})</h2>
          <label className="inline-field">
            Sort
            <select value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="position">Suite order</option>
              <option value="priority">Priority</option>
              <option value="status">Last result</option>
            </select>
          </label>
        </div>
        {cases.length ? (
          <table className="table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Title</th>
                <th>Priority</th>
                <th className="hide-sm">Assignee</th>
                <th>Last result</th>
                {can('suite:manage') && <th />}
              </tr>
            </thead>
            <tbody>
              {cases.map((c) => (
                <tr key={c.id}>
                  <td className="muted">#{c.id}</td>
                  <td>
                    <Link to={`/testcases/${c.id}`}>{c.title}</Link>
                  </td>
                  <td>
                    <PriorityBadge priority={c.priority} />
                  </td>
                  <td className="hide-sm">{c.assignee_name || <span className="muted">—</span>}</td>
                  <td>
                    <StatusBadge status={c.last_status} />
                  </td>
                  {can('suite:manage') && (
                    <td>
                      <button type="button" className="btn btn-sm btn-ghost" onClick={() => removeCase(c.id)}>
                        Remove
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <EmptyState title="No test cases in this suite" />
        )}
      </div>

      {editing && (
        <SuiteModal
          projectId={s.project_id}
          suite={s}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            suite.reload();
          }}
        />
      )}
      {adding && (
        <AddCasesModal
          suite={s}
          onClose={() => setAdding(false)}
          onAdded={() => {
            setAdding(false);
            reloadAll();
          }}
        />
      )}
      {confirmDelete && (
        <Modal
          title="Delete suite?"
          onClose={() => setConfirmDelete(false)}
          footer={
            <>
              <button type="button" className="btn" onClick={() => setConfirmDelete(false)}>
                Cancel
              </button>
              <button type="button" className="btn btn-danger" onClick={remove}>
                Delete
              </button>
            </>
          }
        >
          <p>The suite is deleted; its test cases and their history are kept.</p>
        </Modal>
      )}
    </div>
  );
}

function AddCasesModal({ suite, onClose, onAdded }) {
  const [q, setQ] = useState('');
  const debounced = useDebounced(q);
  const [picked, setPicked] = useState(() => new Set());
  const [error, setError] = useState(null);
  const inSuite = useMemo(() => new Set(suite.cases.map((c) => c.id)), [suite.cases]);
  const { data, loading } = useAsync(() => api.get('/api/testcases', { projectId: suite.project_id, q: debounced, pageSize: 50, sort: 'id', order: 'asc' }), [debounced, suite.project_id]);
  const candidates = useMemo(() => (data?.data || []).filter((c) => !inSuite.has(c.id)), [data, inSuite]);
  const toggle = (id) =>
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const submit = async () => {
    try {
      await api.post(`/api/testsuites/${suite.id}/cases`, { testCaseIds: [...picked] });
      onAdded();
    } catch (err) {
      setError(err);
    }
  };
  return (
    <Modal
      title={`Add test cases to ${suite.name}`}
      onClose={onClose}
      wide
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" disabled={!picked.size} onClick={submit}>
            Add {picked.size || ''}
          </button>
        </>
      }
    >
      <ErrorBanner error={error} />
      <input type="search" placeholder="Search test cases…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
      <div className="pick-list">
        {loading && <p className="muted">Loading…</p>}
        {!loading && !candidates.length && <p className="muted">No matching test cases outside this suite.</p>}
        {candidates.map((c) => (
          <label key={c.id} className="check pick-row">
            <input type="checkbox" checked={picked.has(c.id)} onChange={() => toggle(c.id)} />
            <span className="muted">#{c.id}</span> {c.title} <PriorityBadge priority={c.priority} />
          </label>
        ))}
      </div>
    </Modal>
  );
}
