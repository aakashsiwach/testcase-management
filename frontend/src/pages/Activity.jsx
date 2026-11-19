import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useProject } from '../context/ProjectContext';
import { describeDetails, formatDateTime } from '../lib/constants';
import { useAsync } from '../lib/useAsync';
import { EmptyState, ErrorBanner, PageLoader, Pager } from '../components/ui';

const ENTITY_LINK = {
  test_case: (id) => `/testcases/${id}`,
  test_suite: (id) => `/suites/${id}`,
  test_run: (id) => `/runs/${id}`,
  project: (id) => `/projects/${id}`,
  defect: (id) => `/defects?focus=${id}`,
};
const ENTITY_LABEL = { test_case: 'Test case', test_suite: 'Suite', test_run: 'Run', test_execution: 'Execution', defect: 'Defect', project: 'Project' };

// Project-wide audit trail: who changed what and when.
export default function Activity() {
  const { projectId, project } = useProject();
  const [page, setPage] = useState(1);
  const [entityType, setEntityType] = useState('');
  const { data, error, loading, reload } = useAsync(() => api.get(`/api/projects/${projectId}/audit`, { page, pageSize: 50, entityType }), [projectId, page, entityType]);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Audit log</h1>
          <p className="muted">Every change in {project?.name}, newest first.</p>
        </div>
        <select value={entityType} onChange={(e) => (setEntityType(e.target.value), setPage(1))} aria-label="Entity type">
          <option value="">All entities</option>
          {Object.entries(ENTITY_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </div>
      <ErrorBanner error={error} onRetry={reload} />
      {loading && !data ? (
        <PageLoader />
      ) : data && !data.data.length ? (
        <EmptyState title="No activity yet" />
      ) : (
        data && (
          <div className="card table-card">
            <table className="table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Who</th>
                  <th>Action</th>
                  <th>Entity</th>
                  <th className="hide-sm">Details</th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((a) => {
                  const link = a.entity_type === 'test_execution' && a.details?.testCaseId ? `/testcases/${a.details.testCaseId}` : ENTITY_LINK[a.entity_type]?.(a.entity_id);
                  const label = `${ENTITY_LABEL[a.entity_type] || a.entity_type}${a.entity_id ? ` #${a.entity_id}` : ''}`;
                  return (
                    <tr key={a.id}>
                      <td className="nowrap">{formatDateTime(a.created_at)}</td>
                      <td>{a.user_name || '—'}</td>
                      <td>{a.action.replace(/_/g, ' ')}</td>
                      <td>{link && a.entity_id ? <Link to={link}>{label}</Link> : label}</td>
                      <td className="small hide-sm">{describeDetails(a.details)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <Pager page={page} pageSize={50} total={data.total} onPage={setPage} />
          </div>
        )
      )}
    </div>
  );
}
