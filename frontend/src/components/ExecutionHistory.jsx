import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errorText } from '../api/client';
import { formatBytes, formatDateTime } from '../lib/constants';
import { EmptyState, ErrorBanner, PageLoader, StatusBadge } from './ui';

// Lazy-loaded (React.lazy) and only fetches when its tab is opened.
export default function ExecutionHistory({ testCaseId, refreshKey }) {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState({});

  const load = useCallback(
    async (p) => {
      setLoading(true);
      setError(null);
      try {
        const res = await api.get(`/api/testcases/${testCaseId}/executions`, { page: p, pageSize: 10 });
        setRows((r) => (p === 1 ? res.data : [...r, ...res.data]));
        setTotal(res.total);
        setPage(p);
      } catch (err) {
        setError(err);
      } finally {
        setLoading(false);
      }
    },
    [testCaseId]
  );

  useEffect(() => {
    load(1);
  }, [load, refreshKey]);

  const toggle = async (id) => {
    if (expanded[id]) return setExpanded((e) => ({ ...e, [id]: undefined }));
    setExpanded((e) => ({ ...e, [id]: { loading: true } }));
    try {
      const detail = await api.get(`/api/testexecutions/${id}`);
      setExpanded((e) => ({ ...e, [id]: { attachments: detail.attachments } }));
    } catch (err) {
      setExpanded((e) => ({ ...e, [id]: { error: errorText(err) } }));
    }
  };

  if (loading && !rows.length) return <PageLoader label="Loading history…" />;
  return (
    <div>
      <ErrorBanner error={error} onRetry={() => load(page)} />
      {!rows.length ? (
        <EmptyState title="Not executed yet" />
      ) : (
        <ol className="timeline">
          {rows.map((e) => (
            <li key={e.id} className="timeline-item">
              <div className="timeline-head">
                <StatusBadge status={e.status} />
                <span>
                  <strong>{e.executed_by_name || 'Unknown'}</strong> · {formatDateTime(e.executed_at)}
                  {e.duration_seconds != null && <span className="muted"> · {Math.round(e.duration_seconds / 60) || '<1'} min</span>}
                </span>
                {e.run_name && (
                  <Link to={`/runs/${e.run_id}`} className="small">
                    {e.run_name}
                  </Link>
                )}
              </div>
              {e.comments && <p className="timeline-body">{e.comments}</p>}
              <div className="timeline-meta">
                {e.defects.map((d) => (
                  <Link key={d.id} to={`/defects?focus=${d.id}`} className="chip chip-danger">
                    Defect #{d.id} · {d.status}
                  </Link>
                ))}
                {e.attachment_count > 0 && (
                  <button type="button" className="btn btn-sm btn-ghost" onClick={() => toggle(e.id)}>
                    {expanded[e.id] ? 'Hide' : 'Show'} {e.attachment_count} attachment(s)
                  </button>
                )}
              </div>
              {expanded[e.id]?.loading && <span className="muted small">Loading…</span>}
              {expanded[e.id]?.error && <span className="text-fail small">{expanded[e.id].error}</span>}
              {expanded[e.id]?.attachments && (
                <ul className="attachments">
                  {expanded[e.id].attachments.map((a) => (
                    <li key={a.id}>
                      <button type="button" className="link-btn" onClick={() => api.download(`/api/testexecutions/attachments/${a.id}`, null, a.filename)}>
                        {a.filename}
                      </button>{' '}
                      <span className="muted small">{formatBytes(a.size_bytes)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
      )}
      {rows.length < total && (
        <button type="button" className="btn btn-sm" onClick={() => load(page + 1)} disabled={loading}>
          {loading ? 'Loading…' : `Load more (${total - rows.length} older)`}
        </button>
      )}
    </div>
  );
}
