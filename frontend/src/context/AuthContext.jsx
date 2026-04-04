import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, getToken, setToken } from "../api/client";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [guestError, setGuestError] = useState(null);

  const refresh = useCallback(async () => {
    setGuestError(null);
    setLoading(true);
    try {
      if (!getToken()) {
        const { access_token } = await api.guest();
        setToken(access_token);
      }
      try {
        const u = await api.me();
        setUser(u);
      } catch {
        setToken(null);
        const { access_token } = await api.guest();
        setToken(access_token);
        const u = await api.me();
        setUser(u);
      }
    } catch (e) {
      setUser(null);
      setToken(null);
      setGuestError(e?.message || "Could not start session");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const onLogout = () => {
      setUser(null);
    };
    window.addEventListener("auth:logout", onLogout);
    return () => window.removeEventListener("auth:logout", onLogout);
  }, []);

  const logout = useCallback(async () => {
    setToken(null);
    setUser(null);
    setGuestError(null);
    api.logout().catch(() => {});
    await refresh();
  }, [refresh]);

  const refreshMe = useCallback(async () => {
    if (!getToken()) return;
    try {
      const u = await api.me();
      setUser(u);
    } catch {
      /* ignore */
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, guestError, logout, refresh, refreshMe }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth outside provider");
  return ctx;
}
