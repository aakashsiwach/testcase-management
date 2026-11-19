import { Suspense, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useProject } from '../context/ProjectContext';
import { usePermissions } from '../context/PermissionsContext';
import { ROLE_LABELS } from '../lib/permissions';
import { EmptyState, ErrorBanner, PageLoader } from './ui';

const NAV = [
  { to: '/', label: 'Dashboard', icon: '◧', end: true },
  { to: '/testcases', label: 'Test Cases', icon: '☰' },
  { to: '/suites', label: 'Test Suites', icon: '▤' },
  { to: '/runs', label: 'Test Runs', icon: '▶' },
  { to: '/defects', label: 'Defects', icon: '⚑' },
  { to: '/projects', label: 'Projects', icon: '◫' },
  { to: '/activity', label: 'Audit Log', icon: '⏱' },
  { to: '/performance', label: 'Performance', icon: '⚡' },
  { to: '/users', label: 'Users', icon: '☺', perm: 'users:manage' },
];

// Pages that work without a selected project.
const PROJECT_FREE = ['/projects', '/users', '/performance'];

export default function Layout() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { projects, projectId, setProjectId, loading, error, refreshProjects } = useProject();
  const { can } = usePermissions();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const needsProject = !PROJECT_FREE.some((p) => location.pathname.startsWith(p));

  let content = (
    <Suspense fallback={<PageLoader />}>
      <Outlet />
    </Suspense>
  );
  if (needsProject && !projectId) {
    if (loading) content = <PageLoader label="Loading projects…" />;
    else if (error) content = <ErrorBanner error={error} onRetry={refreshProjects} />;
    else
      content = (
        <EmptyState title="No projects yet">
          {can('project:create') ? (
            <Link to="/projects">Create your first project</Link>
          ) : (
            'You are not a member of any project. Ask an admin or test lead to add you.'
          )}
        </EmptyState>
      );
  }

  return (
    <div className={`shell ${open ? 'nav-open' : ''}`}>
      <aside className="sidebar" aria-label="Main navigation">
        <div className="brand">
          <img src="/favicon.svg" alt="" width="28" height="28" />
          <span>TestCase Manager</span>
        </div>
        <nav onClick={() => setOpen(false)}>
          {NAV.filter((n) => !n.perm || can(n.perm)).map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              <span className="nav-icon" aria-hidden="true">
                {n.icon}
              </span>
              {n.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      {open && <div className="nav-backdrop" onClick={() => setOpen(false)} />}
      <div className="main">
        <header className="topbar">
          <button type="button" className="icon-btn menu-btn" onClick={() => setOpen((o) => !o)} aria-label="Toggle navigation">
            ☰
          </button>
          <label className="project-switcher">
            <span className="sr-only">Current project</span>
            <select value={projectId ?? ''} onChange={(e) => setProjectId(Number(e.target.value))} disabled={!projects.length}>
              {!projects.length && <option value="">No projects</option>}
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} {p.status !== 'active' ? `(${p.status})` : ''}
                </option>
              ))}
            </select>
          </label>
          <div className="topbar-right">
            <button type="button" className="icon-btn" onClick={toggleTheme} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`} title="Toggle theme">
              {theme === 'dark' ? '☀' : '☾'}
            </button>
            <div className="user-chip">
              <span className="user-name">{user.name}</span>
              <span className={`role-pill role-${user.role}`}>{ROLE_LABELS[user.role]}</span>
            </div>
            <button type="button" className="btn btn-sm" onClick={logout}>
              Log out
            </button>
          </div>
        </header>
        <main className="content">{content}</main>
      </div>
    </div>
  );
}
