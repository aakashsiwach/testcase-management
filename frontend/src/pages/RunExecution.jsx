import { memo, useCallback, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, errorText } from '../api/client';
import { usePermissions } from '../context/PermissionsContext';
import { formatDateTime } from '../lib/constants';
import { useAsync } from '../lib/useAsync';
import ExecutionPanel from '../components/ExecutionPanel';
import { ErrorBanner, Modal, PageLoader, PriorityBadge, ProgressBar, StatusBadge } from '../components/ui';

const CaseRow = memo(function CaseRow({ item, index, active, onSelect }) {
  return (
    <li>
      <button type="button" className={`runner-case ${active ? 'active' : ''}`} onClick={() => onSelect(index)} aria-current={active}>
        <span className="muted small">{index + 1}.</span>
        <span className="runner-case-title">{item.title}</span>
        {item.result ? <StatusBadge status={item.result} /> : <span className="muted small">pending</span>}
      </button>
    </li>
  );
});

// Steps through every case of a suite run, recording a result for each.
export default function RunExecution() {
  const { id } = useParams();
  const { can } = usePermissions();
  const { data: run, error, loading, reload } = useAsync(() => api.get(`/api/testruns/${id}`), [id]);
  const [index, setIndex] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [actionError, setActionError] = useState(null);

  const firstPending = useMemo(() => {
    const i = run?.cases.findIndex((c) => !c.result) ?? -1;
    return i === -1 ? 0 : i;
  }, [run]);
  const current = index ?? firstPending;

  const counts = useMemo(() => {
    const c = { Pass: 0, Fail: 0, Blocked: 0, Skipped: 0 };
    run?.cases.forEach((x) => x.result && (c[x.result] += 1));
    return c;
  }, [run]);

  const select = useCallback((i) => setIndex(i), []);
  const onRecorded = useCallback(async () => {
    await reload();
    setIndex((i) => (run && (i ?? firstPending) < run.cases.length - 1 ? (i ?? firstPending) + 1 : i));
  }, [reload, run, firstPending]);

  if (loading && !run) return <PageLoader />;
  if (error) return <ErrorBanner error={error} onRetry={reload} />;
  if (!run) return null;

  const tc = run.cases[current];
  const open = run.status === 'in-progress';
  const finish = async (status) => {
    setActionError(null);
    try {
      await api.patch(`/api/testruns/${run.id}`, { status });
      setConfirm(null);
      reload();
    } catch (err) {
      setActionError(errorText(err));
      setConfirm(null);
    }
  };

  return (
    <div className="page">
      <div className="breadcrumbs">
        <Link to="/runs">Runs</Link> / {run.name}
      </div>
      <div className="page-header">
        <div>
          <h1>{run.name}</h1>
          <p className="muted">
            {run.suite_name && (
              <>
                Suite <Link to={`/suites/${run.suite_id}`}>{run.suite_name}</Link> ·{' '}
              </>
            )}
            started {formatDateTime(run.started_at)} by {run.started_by_name} · <span className={`run-status run-${run.status}`}>{run.status}</span>
          </p>
        </div>
        {open && can('suite:run') && (
          <div className="toolbar">
            <button type="button" className="btn" onClick={() => setConfirm('aborted')}>
              Abort
            </button>
            <button type="button" className="btn btn-primary" onClick={() => setConfirm('completed')}>
              Complete run
            </button>
          </div>
        )}
      </div>
      <ErrorBanner error={actionError} />

      <div className="card run-progress">
        <ProgressBar value={run.executed} total={run.total} label={`${run.executed} of ${run.total} executed`} />
        <div className="chip-row">
          {Object.entries(counts).map(([k, v]) => (
            <span key={k} className="chip">
              {k}: {v}
            </span>
          ))}
          {run.byTester.map((t) => (
            <span key={t.id} className="chip">
              {t.name}: {t.executed} run ({t.passed} pass / {t.failed} fail)
            </span>
          ))}
        </div>
      </div>

      <div className="runner">
        <ol className="runner-list card" aria-label="Cases in this run">
          {run.cases.map((c, i) => (
            <CaseRow key={c.id} item={c} index={i} active={i === current} onSelect={select} />
          ))}
        </ol>
        {tc && (
          <div className="card runner-main">
            <div className="card-header">
              <div>
                <div className="muted small">
                  Case {current + 1} of {run.cases.length}
                </div>
                <h2>
                  <Link to={`/testcases/${tc.id}`}>
                    #{tc.id} {tc.title}
                  </Link>
                </h2>
                <div className="chip-row">
                  <PriorityBadge priority={tc.priority} />
                  <span className="chip">{tc.type}</span>
                  {tc.result && (
                    <span className="small">
                      Result in this run: <StatusBadge status={tc.result} /> by {tc.executed_by_name}
                    </span>
                  )}
                </div>
              </div>
              <div className="toolbar">
                <button type="button" className="btn btn-sm" disabled={current === 0} onClick={() => setIndex(current - 1)}>
                  ‹ Prev
                </button>
                <button type="button" className="btn btn-sm" disabled={current >= run.cases.length - 1} onClick={() => setIndex(current + 1)}>
                  Next ›
                </button>
              </div>
            </div>
            {tc.description && <p className="pre">{tc.description}</p>}
            {tc.preconditions && (
              <p className="small">
                <strong>Pre-conditions:</strong> {tc.preconditions}
              </p>
            )}
            {tc.steps.length > 0 && (
              <table className="table table-compact">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Action</th>
                    <th>Expected</th>
                  </tr>
                </thead>
                <tbody>
                  {tc.steps.map((s) => (
                    <tr key={s.step_number}>
                      <td>{s.step_number}</td>
                      <td>{s.action}</td>
                      <td>{s.expected_result}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {open ? (
              <ExecutionPanel key={tc.id} testCase={tc} projectId={run.project_id} runId={run.id} disabled={!can('execution:create')} onRecorded={onRecorded} />
            ) : (
              <p className="muted">This run is {run.status}; results can no longer be recorded.</p>
            )}
          </div>
        )}
      </div>

      {confirm && (
        <Modal
          title={confirm === 'completed' ? 'Complete run?' : 'Abort run?'}
          onClose={() => setConfirm(null)}
          footer={
            <>
              <button type="button" className="btn" onClick={() => setConfirm(null)}>
                Cancel
              </button>
              <button type="button" className={`btn ${confirm === 'completed' ? 'btn-primary' : 'btn-danger'}`} onClick={() => finish(confirm)}>
                {confirm === 'completed' ? 'Complete' : 'Abort'}
              </button>
            </>
          }
        >
          <p>
            {run.total - run.executed} case(s) have no result yet. After {confirm === 'completed' ? 'completing' : 'aborting'}, no more results can be recorded in this run.
          </p>
        </Modal>
      )}
    </div>
  );
}
