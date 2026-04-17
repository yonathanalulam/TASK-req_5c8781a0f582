import React, { createContext, useContext, useEffect, useState } from 'react';
import { api } from '../services/api';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const t = localStorage.getItem('token');
    if (!t) { setLoading(false); return; }
    api('/auth/me').then(u => setUser(u)).catch(() => {
      localStorage.removeItem('token');
    }).finally(() => setLoading(false));
  }, []);

  async function login(username, password) {
    setError(null);
    try {
      const r = await api('/auth/login', { method: 'POST', body: { username, password } });
      localStorage.setItem('token', r.token);
      setUser(r.user);
      return r.user;
    } catch (e) { setError(e.message); throw e; }
  }

  async function logout() {
    try { await api('/auth/logout', { method: 'POST' }); } catch {}
    localStorage.removeItem('token');
    setUser(null);
  }

  const hasRole = (r) => user && user.roles && user.roles.includes(r);
  const hasAnyRole = (...rs) => rs.some(hasRole);

  return (
    <AuthCtx.Provider value={{ user, setUser, loading, error, login, logout, hasRole, hasAnyRole }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth() { return useContext(AuthCtx); }
