import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from './AuthContext';

// Global "current project" state shared by every page.
const ProjectContext = createContext(null);
const KEY = 'tcm.project';

export function ProjectProvider({ children }) {
  const { user } = useAuth();
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectIdState] = useState(() => Number(localStorage.getItem(KEY)) || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const refreshProjects = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get('/api/projects');
      setProjects(data);
      setProjectIdState((current) => {
        const next = data.some((p) => p.id === current) ? current : data[0]?.id ?? null;
        if (next) localStorage.setItem(KEY, String(next));
        return next;
      });
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) refreshProjects();
    else setProjects([]);
  }, [user, refreshProjects]);

  const setProjectId = useCallback((id) => {
    setProjectIdState(id);
    localStorage.setItem(KEY, String(id));
  }, []);

  const project = useMemo(() => projects.find((p) => p.id === projectId) || null, [projects, projectId]);
  const value = useMemo(
    () => ({ projects, project, projectId: project?.id ?? null, setProjectId, refreshProjects, loading, error }),
    [projects, project, setProjectId, refreshProjects, loading, error]
  );
  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
}

export const useProject = () => useContext(ProjectContext);
