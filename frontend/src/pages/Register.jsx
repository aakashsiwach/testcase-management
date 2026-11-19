import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ErrorBanner, Field } from '../components/ui';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await register(form.name, form.email, form.password);
      navigate('/', { replace: true });
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
        <h1>Create account</h1>
        <p className="muted small">New accounts get the Tester role. An admin can change it later.</p>
        <ErrorBanner error={error} />
        <Field label="Name">
          <input value={form.name} onChange={set('name')} minLength={2} maxLength={100} required autoComplete="name" />
        </Field>
        <Field label="Email">
          <input type="email" value={form.email} onChange={set('email')} required autoComplete="email" />
        </Field>
        <Field label="Password" hint="At least 8 characters, including a letter and a number">
          <input type="password" value={form.password} onChange={set('password')} minLength={8} required autoComplete="new-password" />
        </Field>
        <button className="btn btn-primary btn-block" disabled={busy}>
          {busy ? 'Creating…' : 'Create account'}
        </button>
        <p className="muted center">
          Already registered? <Link to="/login">Sign in</Link>
        </p>
      </form>
    </div>
  );
}
