import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useProject } from '../context/ProjectContext';
import { usePermissions } from '../context/PermissionsContext';
import { PROJECT_STATUSES, formatDate } from '../lib/constants';
import { Badge, EmptyState, ErrorBanner, Field, Modal } from '../components/ui';

const STATUS_COLOR = { active: '#16a34a', 'on-hold': '#d97706', completed: '#2563eb', archived: '#64748b' };
export const ProjectStatus = ({ status }) => <Badge color={STATUS_COLOR[status]}>{status}</Badge>;

export function ProjectModal({ project, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: project?.name || '',
    description: project?.description || '',
    version: project?.version || '1.0',
    status: project?.status || 'active',
  });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      onSaved(project ? await api.put(`/api/projects/${project.id}`, form) : await api.post('/api/projects', form));
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };
  return (
    <Modal
      title={project ? 'Edit project' : 'New project'}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="project-form" className="btn btn-primary" disabled={busy}>
            Save
          </button>
        </>
      }
    >
      <form id="project-form" className="form" onSubmit={submit}>
        <ErrorBanner error={error} />
        <Field label="Name">
          <input value={form.name} onChange={set('name')} minLength={2} maxLength={150} required />
        </Field>
        <Field label="Description">
          <textarea rows={3} value={form.description} onChange={set('description')} maxLength={5000} />
        </Field>
        <div className="form-grid form-grid-2">
          <Field label="Version">
            <input value={form.version} onChange={set('version')} maxLength={50} required />
          </Field>
          <Field label="Status">
            <select value={form.status} onChange={set('status')}>
              {PROJECT_STATUSES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </Field>
        </div>
      </form>
    </Modal>
  );
}

export default function Projects() {
  const { projects, projectId, setProjectId, refreshProjects, error, loading } = useProject();
  const { can } = usePermissions();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Projects</h1>
          <p className="muted">{can('project:delete') ? 'All projects (admin).' : 'Projects you are a member of.'}</p>
        </div>
        {can('project:create') && (
          <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
            + New project
          </button>
        )}
      </div>
      <ErrorBanner error={error} onRetry={refreshProjects} />
      {!loading && !projects.length && <EmptyState title="No projects" />}
      <div className="card-grid">
        {projects.map((p) => (
          <div key={p.id} className={`card ${p.id === projectId ? 'card-current' : ''}`}>
            <div className="card-header">
              <h2>
                <Link to={`/projects/${p.id}`}>{p.name}</Link>
              </h2>
              <ProjectStatus status={p.status} />
            </div>
            <p className="muted clamp-2">{p.description || 'No description'}</p>
            <div className="chip-row">
              <span className="chip">v{p.version}</span>
              <span className="chip">{p.member_count} members</span>
              <span className="chip">since {formatDate(p.created_at)}</span>
            </div>
            <div className="toolbar">
              {p.id === projectId ? (
                <span className="muted small">Current project</span>
              ) : (
                <button type="button" className="btn btn-sm" onClick={() => setProjectId(p.id)}>
                  Switch to
                </button>
              )}
              <Link className="btn btn-sm btn-ghost" to={`/projects/${p.id}`}>
                Details & members
              </Link>
            </div>
          </div>
        ))}
      </div>
      {creating && (
        <ProjectModal
          onClose={() => setCreating(false)}
          onSaved={async (p) => {
            setCreating(false);
            await refreshProjects();
            setProjectId(p.id);
            navigate(`/projects/${p.id}`);
          }}
        />
      )}
    </div>
  );
}
