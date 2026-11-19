import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, errorText } from '../api/client';
import { useProject } from '../context/ProjectContext';
import { usePermissions } from '../context/PermissionsContext';
import { formatDate } from '../lib/constants';
import { ROLE_LABELS } from '../lib/permissions';
import { useAsync } from '../lib/useAsync';
import { ErrorBanner, Modal, PageLoader } from '../components/ui';
import { ProjectModal, ProjectStatus } from './Projects';

export default function ProjectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { can } = usePermissions();
  const { refreshProjects, setProjectId, projectId } = useProject();
  const project = useAsync(() => api.get(`/api/projects/${id}`), [id]);
  const members = useAsync(() => api.get(`/api/projects/${id}/members`).then((r) => r.data), [id]);
  const candidates = useAsync(() => api.get(`/api/projects/${id}/candidates`).then((r) => r.data), [id], { enabled: can('project:members') });
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [newMember, setNewMember] = useState('');
  const [error, setError] = useState(null);

  if (project.loading && !project.data) return <PageLoader />;
  if (project.error) return <ErrorBanner error={project.error} />;
  const p = project.data;

  const refreshMembers = () => {
    members.reload();
    candidates.reload();
    project.reload();
    refreshProjects();
  };
  const addMember = async () => {
    setError(null);
    try {
      await api.post(`/api/projects/${p.id}/members`, { userId: Number(newMember) });
      setNewMember('');
      refreshMembers();
    } catch (err) {
      setError(errorText(err));
    }
  };
  const removeMember = async (userId) => {
    setError(null);
    try {
      await api.del(`/api/projects/${p.id}/members/${userId}`);
      refreshMembers();
    } catch (err) {
      setError(errorText(err));
    }
  };
  const remove = async () => {
    try {
      await api.del(`/api/projects/${p.id}`);
      await refreshProjects();
      navigate('/projects');
    } catch (err) {
      setError(errorText(err));
      setConfirmDelete(false);
    }
  };

  return (
    <div className="page">
      <div className="breadcrumbs">
        <Link to="/projects">Projects</Link> / {p.name}
      </div>
      <div className="page-header">
        <div>
          <h1>{p.name}</h1>
          <div className="chip-row">
            <ProjectStatus status={p.status} />
            <span className="chip">v{p.version}</span>
            <span className="muted small">
              Created {formatDate(p.created_at)} by {p.created_by_name || '—'}
            </span>
          </div>
        </div>
        <div className="toolbar">
          {p.id !== projectId && (
            <button type="button" className="btn" onClick={() => setProjectId(p.id)}>
              Make current
            </button>
          )}
          {can('project:edit') && (
            <button type="button" className="btn" onClick={() => setEditing(true)}>
              Edit
            </button>
          )}
          {can('project:delete') && (
            <button type="button" className="btn btn-danger" onClick={() => setConfirmDelete(true)}>
              Delete
            </button>
          )}
        </div>
      </div>
      <ErrorBanner error={error} />
      <div className="card">
        <h2>Description</h2>
        <p className="pre">{p.description || <span className="muted">No description</span>}</p>
      </div>
      <div className="card">
        <div className="card-header">
          <h2>Team members ({members.data?.length ?? '…'})</h2>
          {can('project:members') && (
            <div className="toolbar">
              <select value={newMember} onChange={(e) => setNewMember(e.target.value)} aria-label="User to add">
                <option value="">Add a member…</option>
                {(candidates.data || []).map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} · {ROLE_LABELS[u.role]}
                  </option>
                ))}
              </select>
              <button type="button" className="btn btn-primary btn-sm" disabled={!newMember} onClick={addMember}>
                Add
              </button>
            </div>
          )}
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th className="hide-sm">Email</th>
              <th>Role</th>
              <th className="hide-sm">Added</th>
              {can('project:members') && <th />}
            </tr>
          </thead>
          <tbody>
            {(members.data || []).map((m) => (
              <tr key={m.id}>
                <td>{m.name}</td>
                <td className="hide-sm">{m.email}</td>
                <td>
                  <span className={`role-pill role-${m.role}`}>{ROLE_LABELS[m.role]}</span>
                </td>
                <td className="hide-sm">{formatDate(m.added_at)}</td>
                {can('project:members') && (
                  <td>
                    <button type="button" className="btn btn-sm btn-ghost" onClick={() => removeMember(m.id)}>
                      Remove
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing && (
        <ProjectModal
          project={p}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            project.reload();
            refreshProjects();
          }}
        />
      )}
      {confirmDelete && (
        <Modal
          title="Delete project?"
          onClose={() => setConfirmDelete(false)}
          footer={
            <>
              <button type="button" className="btn" onClick={() => setConfirmDelete(false)}>
                Cancel
              </button>
              <button type="button" className="btn btn-danger" onClick={remove}>
                Delete everything
              </button>
            </>
          }
        >
          <p>This permanently deletes “{p.name}” with all its test cases, suites, runs, executions and defects.</p>
        </Modal>
      )}
    </div>
  );
}
