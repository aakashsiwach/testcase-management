import { createContext, useCallback, useContext, useMemo } from 'react';
import { can as canRole } from '../lib/permissions';
import { useAuth } from './AuthContext';

// Exposes can('testcase:edit') etc. for the logged-in user's role.
const PermissionsContext = createContext({ role: null, can: () => false });

export function PermissionsProvider({ children }) {
  const { user } = useAuth();
  const role = user?.role ?? null;
  const can = useCallback((action) => canRole(role, action), [role]);
  const value = useMemo(() => ({ role, can, readOnly: role === 'read-only' }), [role, can]);
  return <PermissionsContext.Provider value={value}>{children}</PermissionsContext.Provider>;
}

export const usePermissions = () => useContext(PermissionsContext);
