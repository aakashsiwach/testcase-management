import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { ProjectProvider } from './context/ProjectContext';
import { PermissionsProvider, usePermissions } from './context/PermissionsContext';
import Layout from './components/Layout';
import { PageLoader } from './components/ui';

// Route-based code splitting: every page is its own chunk.
const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const TestCases = lazy(() => import('./pages/TestCases'));
const TestCaseDetail = lazy(() => import('./pages/TestCaseDetail'));
const TestCaseEditor = lazy(() => import('./pages/TestCaseEditor'));
const Suites = lazy(() => import('./pages/Suites'));
const SuiteDetail = lazy(() => import('./pages/SuiteDetail'));
const Runs = lazy(() => import('./pages/Runs'));
const RunExecution = lazy(() => import('./pages/RunExecution'));
const Defects = lazy(() => import('./pages/Defects'));
const Projects = lazy(() => import('./pages/Projects'));
const ProjectDetail = lazy(() => import('./pages/ProjectDetail'));
const Activity = lazy(() => import('./pages/Activity'));
const Users = lazy(() => import('./pages/Users'));
const Performance = lazy(() => import('./pages/Performance'));
const NotFound = lazy(() => import('./pages/NotFound'));

function RequireAuth({ children }) {
  const { user, checking } = useAuth();
  const location = useLocation();
  if (checking && !user) return <PageLoader label="Restoring session…" />;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  return children;
}

function RequirePermission({ perm, children }) {
  const { can } = usePermissions();
  return can(perm) ? children : <Navigate to="/" replace />;
}

function PublicOnly({ children }) {
  const { user } = useAuth();
  return user ? <Navigate to="/" replace /> : children;
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <PermissionsProvider>
          <ProjectProvider>
            <BrowserRouter>
              <Suspense fallback={<PageLoader />}>
                <Routes>
                  <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
                  <Route path="/register" element={<PublicOnly><Register /></PublicOnly>} />
                  <Route element={<RequireAuth><Layout /></RequireAuth>}>
                    <Route index element={<Dashboard />} />
                    <Route path="testcases" element={<TestCases />} />
                    <Route path="testcases/new" element={<RequirePermission perm="testcase:create"><TestCaseEditor /></RequirePermission>} />
                    <Route path="testcases/:id" element={<TestCaseDetail />} />
                    <Route path="testcases/:id/edit" element={<RequirePermission perm="testcase:edit"><TestCaseEditor /></RequirePermission>} />
                    <Route path="suites" element={<Suites />} />
                    <Route path="suites/:id" element={<SuiteDetail />} />
                    <Route path="runs" element={<Runs />} />
                    <Route path="runs/:id" element={<RunExecution />} />
                    <Route path="defects" element={<Defects />} />
                    <Route path="projects" element={<Projects />} />
                    <Route path="projects/:id" element={<ProjectDetail />} />
                    <Route path="activity" element={<Activity />} />
                    <Route path="performance" element={<Performance />} />
                    <Route path="users" element={<RequirePermission perm="users:manage"><Users /></RequirePermission>} />
                    <Route path="*" element={<NotFound />} />
                  </Route>
                </Routes>
              </Suspense>
            </BrowserRouter>
          </ProjectProvider>
        </PermissionsProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
