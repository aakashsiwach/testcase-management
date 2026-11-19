import { useState } from 'react';
import { api } from '../api/client';
import { DEFECT_STATUSES, SEVERITIES } from '../lib/constants';
import { useMembers } from '../lib/hooks';
import { ErrorBanner, Field, Modal } from './ui';

const severityFor = (priority) => (SEVERITIES.includes(priority) ? priority : 'Medium');

// Create (optionally pre-filled from a failed execution) or edit a defect.
export default function DefectModal({ projectId, testCase, execution, defect, onClose, onSaved }) {
  const { data: members } = useMembers(projectId);
  const [form, setForm] = useState(() =>
    defect
      ? { title: defect.title, description: defect.description, severity: defect.severity, status: defect.status, assignedTo: defect.assigned_to ?? '' }
      : {
          title: testCase ? `Failure: ${testCase.title}`.slice(0, 255) : '',
          description: testCase
            ? [
                `Test case #${testCase.id}: ${testCase.title}`,
                execution ? `Execution #${execution.id} recorded ${execution.status} on ${new Date(execution.executed_at).toLocaleString()}` : '',
                execution?.comments ? `Tester notes: ${execution.comments}` : '',
                testCase.steps?.length ? `\nSteps to reproduce:\n${testCase.steps.map((s) => `${s.step_number}. ${s.action} (expected: ${s.expected_result || '—'})`).join('\n')}` : '',
              ]
                .filter(Boolean)
                .join('\n')
            : '',
          severity: severityFor(testCase?.priority),
          status: 'Open',
          assignedTo: '',
        }
  );
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const assignedTo = form.assignedTo === '' ? null : Number(form.assignedTo);
    try {
      const saved = defect
        ? await api.put(`/api/defects/${defect.id}`, { title: form.title, description: form.description, severity: form.severity, status: form.status, assignedTo })
        : await api.post('/api/defects', {
            projectId,
            title: form.title,
            description: form.description,
            severity: form.severity,
            assignedTo,
            ...(execution ? { executionId: execution.id } : testCase ? { testCaseId: testCase.id } : {}),
          });
      onSaved(saved);
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };

  return (
    <Modal
      title={defect ? `Edit defect #${defect.id}` : 'Raise defect'}
      onClose={onClose}
      wide
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="defect-form" className="btn btn-primary" disabled={busy}>
            {busy ? 'Saving…' : defect ? 'Save' : 'Create defect'}
          </button>
        </>
      }
    >
      <form id="defect-form" onSubmit={submit} className="form">
        <ErrorBanner error={error} />
        <Field label="Title">
          <input value={form.title} onChange={set('title')} minLength={3} maxLength={255} required />
        </Field>
        <Field label="Description">
          <textarea rows={7} value={form.description} onChange={set('description')} maxLength={10000} />
        </Field>
        <div className="form-grid">
          <Field label="Severity">
            <select value={form.severity} onChange={set('severity')}>
              {SEVERITIES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </Field>
          {defect && (
            <Field label="Status">
              <select value={form.status} onChange={set('status')}>
                {DEFECT_STATUSES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </Field>
          )}
          <Field label="Assignee">
            <select value={form.assignedTo} onChange={set('assignedTo')}>
              <option value="">Unassigned</option>
              {(members || []).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </form>
    </Modal>
  );
}
