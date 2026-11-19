import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useProject } from '../context/ProjectContext';
import { usePermissions } from '../context/PermissionsContext';
import { formatDateTime } from '../lib/constants';
import { useAsync } from '../lib/useAsync';
import { EmptyState, ErrorBanner, Field, Modal, PageLoader } from '../components/ui';

export function SuiteModal({ projectId, suite, onClose, onSaved }) {
  const [name, setName] = useState(suite?.name || '');
  const [description, setDescription] = useState(suite?.description || '');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const saved = suite ? await api.put(`/api/testsuites/${suite.id}`, { name, description }) : await api.post('/api/testsuites', { projectId, name, description });
      onSaved(saved);
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };
  return (
    <Modal
      title={suite ? 'Edit suite' : 'New test suite'}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="suite-form" className="btn btn-primary" disabled={busy}>
            Save
          </button>
        </>
      }
    >
      <form id="suite-form" className="form" onSubmit={submit}>
        <ErrorBanner error={error} />
        <Field label="Name">
          <input value={name} onChange={(e) => setName(e.target.value)} minLength={2} maxLength={150} required />
        </Field>
        <Field label="Description">
          <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={5000} />
        </Field>
      </form>
    </Modal>
  );
}

export default function Suites() {
  const { projectId } = useProject();
  const { can } = usePermissions();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const { data, error, loading, reload } = useAsync(() => api.get('/api/testsuites', { projectId }), [projectId]);

  if (loading && !data) return <PageLoader />;
  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Test Suites</h1>
          <p className="muted">
            Group test cases and run them together.
            {data?.__cache && <span className={`cache-tag cache-${data.__cache.toLowerCase()}`}>cache {data.__cache}</span>}
          </p>
        </div>
        {can('suite:manage') && (
          <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
            + New suite
          </button>
        )}
      </div>
      <ErrorBanner error={error} onRetry={reload} />
      {data && !data.data.length && <EmptyState title="No suites yet" />}
      <div className="card-grid">
        {data?.data.map((s) => (
          <Link key={s.id} to={`/suites/${s.id}`} className="card card-link">
            <h2>{s.name}</h2>
            <p className="muted clamp-2">{s.description || 'No description'}</p>
            <div className="chip-row">
              <span className="chip">{s.case_count} test cases</span>
              {s.last_run_id ? (
                <span className="chip">
                  Last run {formatDateTime(s.last_run_at)} · {s.last_run_status}
                </span>
              ) : (
                <span className="chip">Never run</span>
              )}
            </div>
          </Link>
        ))}
      </div>
      {creating && <SuiteModal projectId={projectId} onClose={() => setCreating(false)} onSaved={(s) => navigate(`/suites/${s.id}`)} />}
    </div>
  );
}
