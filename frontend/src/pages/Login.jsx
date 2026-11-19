import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ErrorBanner, Field } from '../components/ui';

const DEMO = [
  ['Admin', 'admin@demo.com', 'Admin@123'],
  ['Test Lead', 'lead@demo.com', 'Lead@123'],
  ['Tester', 'tester@demo.com', 'Tester@123'],
  ['Read Only', 'viewer@demo.com', 'Viewer@123'],
];

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
      navigate(location.state?.from?.pathname || '/', { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-page">
      <form className="auth-card card" onSubmit={submit}>
        <div className="brand auth-brand">
          <img src="/favicon.svg" alt="" width="32" height="32" />
          <span>TestCase Manager</span>
        </div>
        <h1>Sign in</h1>
        <ErrorBanner error={error} />
        <Field label="Email">
          <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Field>
        <Field label="Password">
          <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </Field>
        <button className="btn btn-primary btn-block" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        <p className="muted center">
          No account? <Link to="/register">Register</Link>
        </p>
        <div className="demo-box">
          <div className="muted small">Demo accounts (click to fill)</div>
          <div className="demo-grid">
            {DEMO.map(([label, e, p]) => (
              <button
                type="button"
                key={e}
                className="btn btn-sm"
                onClick={() => {
                  setEmail(e);
                  setPassword(p);
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </form>
    </div>
  );
}
