import { useCallback, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client';
import { useProject } from '../context/ProjectContext';
import { useMembers, useSuites } from '../lib/hooks';
import { useAsync } from '../lib/useAsync';
import TestCaseForm from '../components/TestCaseForm';
import { ErrorBanner, PageLoader } from '../components/ui';

export default function TestCaseEditor() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const { projectId } = useProject();
  const [error, setError] = useState(null);
  const existing = useAsync(() => api.get(`/api/testcases/${id}`), [id], { enabled: isEdit });
  const targetProject = isEdit ? existing.data?.project_id : projectId;
  const { data: members } = useMembers(targetProject);
  const { data: suites } = useSuites(isEdit ? null : projectId);

  const onSubmit = useCallback(
    async (body) => {
      setError(null);
      try {
        const saved = isEdit ? await api.put(`/api/testcases/${id}`, body) : await api.post('/api/testcases', { projectId, ...body });
        navigate(`/testcases/${saved.id}`);
      } catch (err) {
        setError(err);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    },
    [isEdit, id, projectId, navigate]
  );

  if (isEdit && existing.loading) return <PageLoader />;
  if (isEdit && existing.error) return <ErrorBanner error={existing.error} />;

  return (
    <div className="page page-narrow">
      <div className="page-header">
        <h1>{isEdit ? `Edit test case #${id}` : 'New test case'}</h1>
      </div>
      <ErrorBanner error={error} />
      <TestCaseForm
        key={existing.data?.id || 'new'}
        initial={existing.data}
        members={members || []}
        suites={suites || []}
        showSuites={!isEdit}
        onSubmit={onSubmit}
        onCancel={() => navigate(-1)}
        submitLabel={isEdit ? 'Save changes' : 'Create test case'}
      />
    </div>
  );
}
