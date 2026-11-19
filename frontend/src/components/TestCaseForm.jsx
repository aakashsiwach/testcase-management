import { memo, useCallback, useState } from 'react';
import { PRIORITIES, TYPES } from '../lib/constants';
import { Field } from './ui';

const emptyStep = () => ({ key: crypto.randomUUID?.() || String(Math.random()), action: '', expectedResult: '' });

const StepRow = memo(function StepRow({ step, index, count, onChange, onRemove, onMove }) {
  return (
    <div className="step-row">
      <span className="step-no">{index + 1}</span>
      <textarea rows={2} placeholder="Action" value={step.action} onChange={(e) => onChange(step.key, 'action', e.target.value)} aria-label={`Step ${index + 1} action`} required />
      <textarea rows={2} placeholder="Expected result" value={step.expectedResult} onChange={(e) => onChange(step.key, 'expectedResult', e.target.value)} aria-label={`Step ${index + 1} expected result`} />
      <div className="step-actions">
        <button type="button" className="icon-btn" disabled={index === 0} onClick={() => onMove(index, -1)} aria-label="Move step up">
          ↑
        </button>
        <button type="button" className="icon-btn" disabled={index === count - 1} onClick={() => onMove(index, 1)} aria-label="Move step down">
          ↓
        </button>
        <button type="button" className="icon-btn danger" onClick={() => onRemove(step.key)} aria-label="Remove step">
          ×
        </button>
      </div>
    </div>
  );
});

/**
 * Create / edit form. All handlers are memoised with useCallback so the memoised
 * StepRow components only re-render when their own step changes.
 */
export default function TestCaseForm({ initial, members, suites, showSuites, onSubmit, onCancel, submitLabel }) {
  const [form, setForm] = useState(() => ({
    title: initial?.title || '',
    description: initial?.description || '',
    priority: initial?.priority || 'Medium',
    type: initial?.type || 'Functional',
    preconditions: initial?.preconditions || '',
    postconditions: initial?.postconditions || '',
    tags: initial?.tags || [],
    assignedTo: initial?.assigned_to ?? '',
    suiteIds: [],
  }));
  const [steps, setSteps] = useState(() =>
    initial?.steps?.length ? initial.steps.map((s) => ({ ...emptyStep(), action: s.action, expectedResult: s.expected_result })) : [emptyStep()]
  );
  const [tagInput, setTagInput] = useState('');
  const [busy, setBusy] = useState(false);

  const setField = useCallback((e) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  }, []);

  const addTag = useCallback(() => {
    const t = tagInput.trim().toLowerCase().replace(/[^\w\- .]/g, '');
    if (t) setForm((f) => (f.tags.includes(t) || f.tags.length >= 20 ? f : { ...f, tags: [...f.tags, t] }));
    setTagInput('');
  }, [tagInput]);
  const removeTag = useCallback((t) => setForm((f) => ({ ...f, tags: f.tags.filter((x) => x !== t) })), []);
  const onTagKey = useCallback(
    (e) => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        addTag();
      }
    },
    [addTag]
  );

  const toggleSuite = useCallback(
    (id) => setForm((f) => ({ ...f, suiteIds: f.suiteIds.includes(id) ? f.suiteIds.filter((x) => x !== id) : [...f.suiteIds, id] })),
    []
  );

  const addStep = useCallback(() => setSteps((s) => [...s, emptyStep()]), []);
  const removeStep = useCallback((key) => setSteps((s) => s.filter((x) => x.key !== key)), []);
  const changeStep = useCallback((key, field, value) => setSteps((s) => s.map((x) => (x.key === key ? { ...x, [field]: value } : x))), []);
  const moveStep = useCallback(
    (index, dir) =>
      setSteps((s) => {
        const next = [...s];
        const [item] = next.splice(index, 1);
        next.splice(index + dir, 0, item);
        return next;
      }),
    []
  );

  const handleSubmit = useCallback(
    async (e) => {
      e.preventDefault();
      setBusy(true);
      try {
        await onSubmit({
          title: form.title,
          description: form.description,
          priority: form.priority,
          type: form.type,
          preconditions: form.preconditions,
          postconditions: form.postconditions,
          tags: form.tags,
          assignedTo: form.assignedTo === '' ? null : Number(form.assignedTo),
          steps: steps.filter((s) => s.action.trim()).map(({ action, expectedResult }) => ({ action, expectedResult })),
          ...(showSuites && form.suiteIds.length ? { suiteIds: form.suiteIds } : {}),
        });
      } finally {
        setBusy(false);
      }
    },
    [form, steps, onSubmit, showSuites]
  );

  return (
    <form className="form" onSubmit={handleSubmit}>
      <div className="card">
        <Field label="Title">
          <input name="title" value={form.title} onChange={setField} minLength={3} maxLength={255} required />
        </Field>
        <Field label="Description">
          <textarea name="description" rows={3} value={form.description} onChange={setField} maxLength={10000} />
        </Field>
        <div className="form-grid">
          <Field label="Priority">
            <select name="priority" value={form.priority} onChange={setField}>
              {PRIORITIES.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </Field>
          <Field label="Type">
            <select name="type" value={form.type} onChange={setField}>
              {TYPES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </Field>
          <Field label="Assigned to">
            <select name="assignedTo" value={form.assignedTo} onChange={setField}>
              <option value="">Unassigned</option>
              {members.filter((m) => m.role !== 'read-only').map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.role})
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="form-grid form-grid-2">
          <Field label="Pre-conditions">
            <textarea name="preconditions" rows={2} value={form.preconditions} onChange={setField} />
          </Field>
          <Field label="Post-conditions">
            <textarea name="postconditions" rows={2} value={form.postconditions} onChange={setField} />
          </Field>
        </div>
        <Field label="Tags" hint="Press Enter to add">
          <div className="tag-input">
            {form.tags.map((t) => (
              <span key={t} className="tag">
                {t}
                <button type="button" onClick={() => removeTag(t)} aria-label={`Remove tag ${t}`}>
                  ×
                </button>
              </span>
            ))}
            <input value={tagInput} onChange={(e) => setTagInput(e.target.value)} onKeyDown={onTagKey} onBlur={addTag} maxLength={40} placeholder="add tag" />
          </div>
        </Field>
        {showSuites && suites.length > 0 && (
          <fieldset className="field">
            <legend className="field-label">Add to suites</legend>
            <div className="chip-row">
              {suites.map((s) => (
                <label key={s.id} className="check chip">
                  <input type="checkbox" checked={form.suiteIds.includes(s.id)} onChange={() => toggleSuite(s.id)} />
                  {s.name}
                </label>
              ))}
            </div>
          </fieldset>
        )}
      </div>

      <div className="card">
        <div className="card-header">
          <h2>Test steps</h2>
          <button type="button" className="btn btn-sm" onClick={addStep}>
            + Add step
          </button>
        </div>
        {steps.map((s, i) => (
          <StepRow key={s.key} step={s} index={i} count={steps.length} onChange={changeStep} onRemove={removeStep} onMove={moveStep} />
        ))}
        {!steps.length && <p className="muted">No steps yet.</p>}
      </div>

      <div className="form-actions">
        <button type="button" className="btn" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn btn-primary" disabled={busy}>
          {busy ? 'Saving…' : submitLabel}
        </button>
      </div>
    </form>
  );
}
