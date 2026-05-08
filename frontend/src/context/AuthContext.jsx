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
    let hadToken = false;
    try {
      let token;
      try {
        token = getToken();
      } catch {
        setUser(null);
        setToken(null);
        setGuestError("This site needs local storage enabled to keep you signed in.");
        return;
      }
      hadToken = Boolean(token);
      if (!token) {
        setUser(null);
        return;
      }
      const u = await api.me();
      setUser(u);
    } catch (e) {
      setToken(null);
      setUser(null);
      const msg = e?.message || "Could not load session";
      if (hadToken && !/401|Not authenticated|Invalid token/i.test(msg)) {
        setGuestError(msg);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const onLogout = () => {
      setUser(null);
    };
    window.addEventListener("auth:logout", onLogout);
    return () => window.removeEventListener("auth:logout", onLogout);
  }, []);

  const startGuest = useCallback(async () => {
    setGuestError(null);
    setLoading(true);
    try {
      const { access_token } = await api.guest();
      setToken(access_token);
      const u = await api.me();
      setUser(u);
    } catch (e) {
      setGuestError(e?.message || "Could not start guest session");
      setUser(null);
      setToken(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const register = useCallback(async (body) => {
    setGuestError(null);
    setToken(null);
    const data = await api.register(body);
    /** Backend never returns a session until email is verified; require token + verified flag to treat as logged in. */
    const sessionReady = Boolean(data.access_token) && data.email_verified === true;
    if (sessionReady) {
      setToken(data.access_token);
      const u = await api.me();
      setUser(u);
      return {
        ok: true,
        needsVerification: false,
        message: data.message ?? null,
      };
    }
    setUser(null);
    return {
      ok: true,
      needsVerification: true,
      message: data.message || "Check your inbox for the 6-digit verification code.",
      devVerificationCode: data.dev_verification_code ?? null,
    };
  }, []);

  const verifyEmailCode = useCallback(async (email, code) => {
    setGuestError(null);
    const { access_token } = await api.verifyEmail({ email, code });
    setToken(access_token);
    const u = await api.me();
    setUser(u);
  }, []);

  const login = useCallback(async (email, password) => {
    setGuestError(null);
    setToken(null);
    const { access_token } = await api.login({ email, password });
    setToken(access_token);
    const u = await api.me();
    setUser(u);
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    setGuestError(null);
    api.logout().catch(() => {});
  }, []);

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
    <AuthContext.Provider
      value={{
        user,
        loading,
        guestError,
        logout,
        refresh,
        refreshMe,
        startGuest,
        register,
        verifyEmailCode,
        login,
        setGuestError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth outside provider");
  return ctx;
}
