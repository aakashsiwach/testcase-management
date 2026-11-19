import { useState } from 'react';
import { api, errorText } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { ROLES, formatDate } from '../lib/constants';
import { ROLE_LABELS } from '../lib/permissions';
import { useDebounced } from '../lib/hooks';
import { useAsync } from '../lib/useAsync';
import { ErrorBanner, PageLoader, Pager } from '../components/ui';

// Admin-only user management: change roles, activate / deactivate.
export default function Users() {
  const { user: me } = useAuth();
  const [q, setQ] = useState('');
  const debounced = useDebounced(q);
  const [page, setPage] = useState(1);
  const [error, setError] = useState(null);
  const { data, error: loadError, loading, reload } = useAsync(() => api.get('/api/users', { q: debounced, page, pageSize: 25 }), [debounced, page]);

  const update = async (id, body) => {
    setError(null);
    try {
      await api.patch(`/api/users/${id}`, body);
      reload();
    } catch (err) {
      setError(errorText(err));
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Users</h1>
          <p className="muted">New registrations get the Tester role; change it here.</p>
        </div>
        <input type="search" placeholder="Search name or email…" value={q} onChange={(e) => (setQ(e.target.value), setPage(1))} aria-label="Search users" />
      </div>
      <ErrorBanner error={error || loadError} />
      {loading && !data ? (
        <PageLoader />
      ) : (
        data && (
          <div className="card table-card">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th className="hide-sm">Email</th>
                  <th>Role</th>
                  <th className="hide-sm">Projects</th>
                  <th className="hide-sm">Joined</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((u) => (
                  <tr key={u.id} className={u.is_active ? '' : 'row-muted'}>
                    <td>{u.name}</td>
                    <td className="hide-sm">{u.email}</td>
                    <td>
                      {u.id === me.id ? (
                        <span className={`role-pill role-${u.role}`}>{ROLE_LABELS[u.role]} (you)</span>
                      ) : (
                        <select value={u.role} onChange={(e) => update(u.id, { role: e.target.value })} aria-label={`Role of ${u.name}`}>
                          {ROLES.map((r) => (
                            <option key={r} value={r}>
                              {ROLE_LABELS[r]}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td className="hide-sm">{u.project_count}</td>
                    <td className="hide-sm">{formatDate(u.created_at)}</td>
                    <td>
                      {u.id !== me.id && (
                        <button type="button" className={`btn btn-sm ${u.is_active ? 'btn-ghost' : ''}`} onClick={() => update(u.id, { isActive: !u.is_active })}>
                          {u.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pager page={page} pageSize={25} total={data.total} onPage={setPage} />
          </div>
        )
      )}
    </div>
  );
}
