import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  clearToken,
  fetchAuthConfig,
  fetchSession,
  getToken,
  setToken,
} from '../lib/leviatanAuth';

const AuthContext = createContext({
  loading: true,
  user: null,
  entitlements: null,
  authConfig: { google: false, devLogin: false },
  refresh: async () => {},
  signOut: () => {},
  acceptToken: () => {},
});

export function AuthProvider({ children }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [entitlements, setEntitlements] = useState(null);
  const [authConfig, setAuthConfig] = useState({ google: false, devLogin: false });

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [cfg, session] = await Promise.all([fetchAuthConfig(), getToken() ? fetchSession() : Promise.resolve(null)]);
      setAuthConfig(cfg || { google: false, devLogin: false });
      setUser(session?.user || null);
      setEntitlements(session?.entitlements || null);
    } catch {
      setUser(null);
      setEntitlements(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const signOut = useCallback(() => {
    clearToken();
    setUser(null);
    setEntitlements(null);
  }, []);

  const acceptToken = useCallback(async (token) => {
    setToken(token);
    await refresh();
  }, [refresh]);

  return (
    <AuthContext.Provider
      value={{ loading, user, entitlements, authConfig, refresh, signOut, acceptToken }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
