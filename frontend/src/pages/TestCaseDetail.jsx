import { lazy, Suspense, useCallback, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, errorText } from '../api/client';
import { usePermissions } from '../context/PermissionsContext';
import { describeDetails, formatDateTime } from '../lib/constants';
import { useMembers } from '../lib/hooks';
import { useAsync } from '../lib/useAsync';
import ExecutionPanel from '../components/ExecutionPanel';
import { EmptyState, ErrorBanner, Modal, PageLoader, PriorityBadge, StatusBadge } from '../components/ui';

// History is code-split and only loaded when its tab is opened.
const ExecutionHistory = lazy(() => import('../components/ExecutionHistory'));

const TABS = [
  ['history', 'Execution history'],
  ['comments', 'Comments'],
  ['versions', 'Versions'],
  ['audit', 'Audit trail'],
];

export default function TestCaseDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { can } = usePermissions();
  const { data: tc, error, loading, reload } = useAsync(() => api.get(`/api/testcases/${id}`), [id]);
  const [tab, setTab] = useState(null);
  const [historyKey, setHistoryKey] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [actionError, setActionError] = useState(null);

  const onRecorded = useCallback(() => {
    setHistoryKey((k) => k + 1);
    reload();
  }, [reload]);

  if (loading && !tc) return <PageLoader />;
  if (error) return <ErrorBanner error={error} onRetry={reload} />;
  if (!tc) return null;

  const remove = async () => {
    try {
      await api.del(`/api/testcases/${tc.id}`);
      navigate('/testcases');
    } catch (err) {
      setActionError(errorText(err));
      setConfirmDelete(false);
    }
  };

  return (
    <div className="page">
      <div className="breadcrumbs">
        <Link to="/testcases">Test cases</Link> / #{tc.id}
      </div>
      <div className="page-header">
        <div>
          <h1>{tc.title}</h1>
          <div className="chip-row">
            <PriorityBadge priority={tc.priority} />
            <span className="chip">{tc.type}</span>
            <StatusBadge status={tc.last_status} />
            <span className="muted small">
              v{tc.version} · updated {formatDateTime(tc.updated_at)} by {tc.updated_by_name || '—'}
            </span>
          </div>
        </div>
        {can('testcase:edit') && (
          <div className="toolbar">
            <Link className="btn" to={`/testcases/${tc.id}/edit`}>
              Edit
            </Link>
            <button type="button" className="btn btn-danger" onClick={() => setConfirmDelete(true)}>
              Delete
            </button>
          </div>
        )}
      </div>
      <ErrorBanner error={actionError} />

      <div className="grid-2 grid-detail">
        <div className="card">
          <h2>Details</h2>
          <dl className="details">
            <dt>Description</dt>
            <dd className="pre">{tc.description || <span className="muted">—</span>}</dd>
            <dt>Pre-conditions</dt>
            <dd className="pre">{tc.preconditions || <span className="muted">—</span>}</dd>
            <dt>Post-conditions</dt>
            <dd className="pre">{tc.postconditions || <span className="muted">—</span>}</dd>
            <dt>Tags</dt>
            <dd>
              {tc.tags.length ? (
                tc.tags.map((t) => (
                  <Link key={t} className="tag" to={`/testcases?tags=${encodeURIComponent(t)}`}>
                    {t}
                  </Link>
                ))
              ) : (
                <span className="muted">—</span>
              )}
            </dd>
            <dt>Suites</dt>
            <dd>
              {tc.suites.length ? (
                tc.suites.map((s) => (
                  <Link key={s.id} className="chip" to={`/suites/${s.id}`}>
                    {s.name}
                  </Link>
                ))
              ) : (
                <span className="muted">Not in a suite</span>
              )}
            </dd>
            <dt>Assigned to</dt>
            <dd>
              <AssignControl tc={tc} canAssign={can('testcase:assign')} onChanged={reload} />
            </dd>
            <dt>Defects</dt>
            <dd>
              {tc.defects.total ? (
                <Link to={`/defects?testCaseId=${tc.id}`}>
                  {tc.defects.open} open / {tc.defects.total} total
                </Link>
              ) : (
                <span className="muted">None</span>
              )}
            </dd>
            <dt>Created</dt>
            <dd>
              {formatDateTime(tc.created_at)} by {tc.created_by_name || '—'}
            </dd>
          </dl>
          <h2>Steps</h2>
          {tc.steps.length ? (
            <table className="table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Action</th>
                  <th>Expected result</th>
                </tr>
              </thead>
              <tbody>
                {tc.steps.map((s) => (
                  <tr key={s.id}>
                    <td>{s.step_number}</td>
                    <td className="pre">{s.action}</td>
                    <td className="pre">{s.expected_result}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="muted">No steps defined.</p>
          )}
        </div>
        <div className="card">
          <h2>Execute</h2>
          <ExecutionPanel testCase={tc} projectId={tc.project_id} disabled={!can('execution:create')} onRecorded={onRecorded} />
        </div>
      </div>

      <div className="card">
        <div className="tabs" role="tablist">
          {TABS.map(([key, label]) => (
            <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? 'active' : ''} onClick={() => setTab(tab === key ? null : key)}>
              {label}
            </button>
          ))}
        </div>
        {!tab && <p className="muted">Open a tab to load it.</p>}
        {tab === 'history' && (
          <Suspense fallback={<PageLoader label="Loading history…" />}>
            <ExecutionHistory testCaseId={tc.id} refreshKey={historyKey} />
          </Suspense>
        )}
        {tab === 'comments' && <Comments testCaseId={tc.id} canComment={can('testcase:comment')} />}
        {tab === 'versions' && <Versions testCaseId={tc.id} />}
        {tab === 'audit' && <AuditTrail testCaseId={tc.id} refreshKey={historyKey} />}
      </div>

      {confirmDelete && (
        <Modal
          title="Delete test case?"
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
          <p>
            “{tc.title}” and its steps, versions and execution history will be deleted. Defects stay but lose the link.
          </p>
        </Modal>
      )}
    </div>
  );
}

function AssignControl({ tc, canAssign, onChanged }) {
  const { data: members } = useMembers(canAssign ? tc.project_id : null);
  const [error, setError] = useState(null);
  if (!canAssign) return tc.assignee_name || <span className="muted">Unassigned</span>;
  const change = async (e) => {
    setError(null);
    try {
      await api.patch(`/api/testcases/${tc.id}/assign`, { assigneeId: e.target.value ? Number(e.target.value) : null });
      onChanged();
    } catch (err) {
      setError(errorText(err));
    }
  };
  return (
    <>
      <select value={tc.assigned_to ?? ''} onChange={change} aria-label="Assignee">
        <option value="">Unassigned</option>
        {(members || []).filter((m) => m.role !== 'read-only').map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>
      {error && <div className="text-fail small">{error}</div>}
    </>
  );
}

function Comments({ testCaseId, canComment }) {
  const { data, error, loading, reload } = useAsync(() => api.get(`/api/testcases/${testCaseId}/comments`).then((r) => r.data), [testCaseId]);
  const [body, setBody] = useState('');
  const [postError, setPostError] = useState(null);
  const post = async (e) => {
    e.preventDefault();
    setPostError(null);
    try {
      await api.post(`/api/testcases/${testCaseId}/comments`, { body });
      setBody('');
      reload();
    } catch (err) {
      setPostError(errorText(err));
    }
  };
  if (loading && !data) return <PageLoader />;
  return (
    <div>
      <ErrorBanner error={error} />
      {data?.length ? (
        <ul className="comments">
          {data.map((c) => (
            <li key={c.id}>
              <div className="comment-head">
                <strong>{c.user_name || 'Deleted user'}</strong> <span className="muted small">{c.user_role} · {formatDateTime(c.created_at)}</span>
              </div>
              <p className="pre">{c.body}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">No comments yet.</p>
      )}
      {canComment && (
        <form onSubmit={post} className="comment-form">
          <textarea rows={2} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Add a comment…" maxLength={5000} required aria-label="Comment" />
          <button className="btn btn-primary" disabled={!body.trim()}>
            Comment
          </button>
          {postError && <span className="text-fail small">{postError}</span>}
        </form>
      )}
    </div>
  );
}

function Versions({ testCaseId }) {
  const { data, error, loading } = useAsync(() => api.get(`/api/testcases/${testCaseId}/versions`).then((r) => r.data), [testCaseId]);
  const [open, setOpen] = useState(null);
  if (loading) return <PageLoader />;
  if (error) return <ErrorBanner error={error} />;
  if (!data.length) return <EmptyState title="No versions recorded" />;
  return (
    <table className="table">
      <thead>
        <tr>
          <th>Version</th>
          <th>Changed by</th>
          <th>When</th>
          <th>Snapshot</th>
        </tr>
      </thead>
      <tbody>
        {data.map((v) => (
          <tr key={v.version}>
            <td>v{v.version}</td>
            <td>{v.changed_by_name || '—'}</td>
            <td>{formatDateTime(v.changed_at)}</td>
            <td>
              <button type="button" className="link-btn" onClick={() => setOpen(open === v.version ? null : v.version)}>
                {open === v.version ? 'Hide' : 'View'}
              </button>
              {open === v.version && (
                <div className="snapshot">
                  <div>
                    <strong>{v.snapshot.title}</strong> · {v.snapshot.priority} · {v.snapshot.type}
                  </div>
                  {v.snapshot.tags?.length > 0 && <div className="muted small">Tags: {v.snapshot.tags.join(', ')}</div>}
                  {v.snapshot.steps?.length > 0 && (
                    <ol>
                      {v.snapshot.steps.map((s, i) => (
                        <li key={i}>
                          {s.action} → <span className="muted">{s.expectedResult}</span>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function AuditTrail({ testCaseId, refreshKey }) {
  const { data, error, loading } = useAsync(() => api.get(`/api/testcases/${testCaseId}/audit`).then((r) => r.data), [testCaseId, refreshKey]);
  if (loading && !data) return <PageLoader />;
  if (error) return <ErrorBanner error={error} />;
  if (!data.length) return <EmptyState title="No audit entries" />;
  return (
    <table className="table">
      <thead>
        <tr>
          <th>When</th>
          <th>Who</th>
          <th>Action</th>
          <th>Details</th>
        </tr>
      </thead>
      <tbody>
        {data.map((a) => (
          <tr key={a.id}>
            <td className="nowrap">{formatDateTime(a.created_at)}</td>
            <td>{a.user_name || '—'}</td>
            <td>{a.action.replace(/_/g, ' ')}</td>
            <td className="small">{describeDetails(a.details)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
