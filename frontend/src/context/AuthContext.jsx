import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, setUnauthorizedHandler, tokenStore } from '../api/client';

const AuthContext = createContext(null);
const USER_KEY = 'tcm.user';

const readUser = () => {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY));
  } catch {
    return null;
  }
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => (tokenStore.get() ? readUser() : null));
  const [checking, setChecking] = useState(Boolean(tokenStore.get()));

  const logout = useCallback(() => {
    tokenStore.clear();
    localStorage.removeItem(USER_KEY);
    setUser(null);
  }, []);

  const applySession = useCallback(({ token, user: u }) => {
    tokenStore.set(token);
    localStorage.setItem(USER_KEY, JSON.stringify(u));
    setUser(u);
  }, []);

  const login = useCallback(async (email, password) => applySession(await api.post('/api/auth/login', { email, password })), [applySession]);
  const register = useCallback(
    async (name, email, password) => applySession(await api.post('/api/auth/register', { name, email, password })),
    [applySession]
  );

  useEffect(() => {
    setUnauthorizedHandler(logout);
    if (!tokenStore.get()) return;
    // Re-validate the stored token (role may have changed server-side).
    api
      .get('/api/auth/me')
      .then(({ user: u }) => {
        localStorage.setItem(USER_KEY, JSON.stringify(u));
        setUser(u);
      })
      .catch((err) => {
        if (err.status === 401) logout();
      })
      .finally(() => setChecking(false));
  }, [logout]);

  const value = useMemo(() => ({ user, checking, login, register, logout }), [user, checking, login, register, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
