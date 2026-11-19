import { memo, useCallback, useState } from 'react';
import { api, errorText } from '../api/client';
import { RESULTS, STATUS_COLORS } from '../lib/constants';
import DefectModal from './DefectModal';

const ResultButton = memo(function ResultButton({ result, active, onSelect, disabled }) {
  return (
    <button
      type="button"
      className={`result-btn ${active ? 'active' : ''}`}
      style={{ '--result': STATUS_COLORS[result] }}
      onClick={() => onSelect(result)}
      disabled={disabled}
      aria-pressed={active}
    >
      {result}
    </button>
  );
});

const ACCEPT = '.png,.jpg,.jpeg,.gif,.pdf,.txt,.log,.csv';

/**
 * Records a result (with comment + attachments) for one test case, optionally within a run.
 * Handlers are memoised so ResultButton (React.memo) doesn't re-render on every keystroke.
 */
function ExecutionPanel({ testCase, projectId, runId, disabled, onRecorded }) {
  const [result, setResult] = useState(null);
  const [comments, setComments] = useState('');
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [lastExecution, setLastExecution] = useState(null);
  const [defectFor, setDefectFor] = useState(null);
  const [defectCreated, setDefectCreated] = useState(null);
  const [started] = useState(() => Date.now());

  const selectResult = useCallback((r) => setResult(r), []);
  const onComment = useCallback((e) => setComments(e.target.value), []);
  const onFiles = useCallback((e) => {
    const list = Array.from(e.target.files || []);
    if (list.length > 5) setError('You can attach at most 5 files.');
    else if (list.some((f) => f.size > 5 * 1024 * 1024)) setError('Each file must be 5 MB or less.');
    else setError(null);
    setFiles(list.slice(0, 5));
  }, []);

  const submit = useCallback(async () => {
    if (!result) return;
    setBusy(true);
    setError(null);
    try {
      const execution = await api.post('/api/testexecutions', {
        testCaseId: testCase.id,
        status: result,
        comments,
        durationSeconds: Math.round((Date.now() - started) / 1000),
        ...(runId ? { runId } : {}),
      });
      if (files.length) {
        const form = new FormData();
        files.forEach((f) => form.append('files', f));
        await api.upload(`/api/testexecutions/${execution.id}/attachments`, form);
      }
      setLastExecution(execution);
      setDefectCreated(null);
      setComments('');
      setFiles([]);
      setResult(null);
      onRecorded?.(execution);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }, [result, comments, files, testCase.id, runId, started, onRecorded]);

  const openDefect = useCallback(() => setDefectFor(lastExecution), [lastExecution]);
  const closeDefect = useCallback(() => setDefectFor(null), []);
  const defectSaved = useCallback((d) => {
    setDefectFor(null);
    setDefectCreated(d);
  }, []);

  return (
    <div className="execution-panel">
      <div className="result-buttons" role="group" aria-label="Result">
        {RESULTS.map((r) => (
          <ResultButton key={r} result={r} active={result === r} onSelect={selectResult} disabled={disabled || busy} />
        ))}
      </div>
      <textarea rows={3} placeholder="Comments (what happened, environment, build…)" value={comments} onChange={onComment} disabled={disabled || busy} maxLength={5000} aria-label="Execution comments" />
      <div className="execution-footer">
        <label className="file-input">
          <input type="file" multiple accept={ACCEPT} onChange={onFiles} disabled={disabled || busy} />
          <span className="muted small">{files.length ? `${files.length} file(s): ${files.map((f) => f.name).join(', ')}` : 'Attach screenshots / logs (max 5 × 5 MB)'}</span>
        </label>
        <button type="button" className="btn btn-primary" onClick={submit} disabled={disabled || busy || !result}>
          {busy ? 'Saving…' : 'Record result'}
        </button>
      </div>
      {disabled && <p className="muted small">Your role can view results but not execute tests.</p>}
      {error && (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      )}
      {lastExecution && (
        <div className="alert alert-info" role="status">
          <span>
            Recorded <strong>{lastExecution.status}</strong> (execution #{lastExecution.id}).
            {defectCreated && ` Defect #${defectCreated.id} created.`}
          </span>
          {lastExecution.status === 'Fail' && !defectCreated && (
            <button type="button" className="btn btn-sm btn-danger" onClick={openDefect}>
              Raise defect
            </button>
          )}
        </div>
      )}
      {defectFor && <DefectModal projectId={projectId} testCase={testCase} execution={defectFor} onClose={closeDefect} onSaved={defectSaved} />}
    </div>
  );
}

export default memo(ExecutionPanel);
