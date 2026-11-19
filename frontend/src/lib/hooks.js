import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useAsync } from './useAsync';

export function useDebounced(value, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

// Small shared lookups for the current project.
export const useMembers = (projectId) =>
  useAsync(() => (projectId ? api.get(`/api/projects/${projectId}/members`).then((r) => r.data) : []), [projectId]);

export const useSuites = (projectId) =>
  useAsync(() => (projectId ? api.get('/api/testsuites', { projectId }).then((r) => r.data) : []), [projectId]);
