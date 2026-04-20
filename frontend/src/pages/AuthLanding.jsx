import { useState } from "react";
import { useAuth } from "../context/AuthContext";
export default function AuthLanding() {
  const { startGuest, register, login } = useAuth();
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function onRegister(e) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await register({
        email: email.trim(),
        password,
        alpha_vantage_api_key: apiKey.trim(),
      });
    } catch (err) {
      setError(err?.message || "Registration failed");
    } finally {
      setBusy(false);
    }
  }

  async function onLogin(e) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email.trim(), password);
    } catch (err) {
      setError(err?.message || "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-canvas font-sans text-ink">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center text-center space-y-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-card bg-ink shadow-card">
            <span className="text-sm font-bold tracking-tight text-white">CS</span>
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              <span className="text-ink">Cowrie</span>
              <span className="text-gold">Shell</span>
            </h1>
            <p className="mt-1 text-sm text-muted">Paper trading · ASX · AUD</p>
          </div>
          <p className="text-sm text-muted leading-relaxed max-w-sm">
            Live quotes with your{" "}
            <a
              href="https://www.alphavantage.co/support/#api-key"
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-gold underline-offset-2 hover:underline"
            >
              Alpha Vantage
            </a>{" "}
            key.
          </p>
        </div>

        <div className="flex gap-3 rounded-card bg-card p-1.5 shadow-card">
          <button
            type="button"
            onClick={() => {
              setMode("login");
              setError(null);
            }}
            className={`cs-btn-side ${mode === "login" ? "cs-btn-side-active" : ""}`}
          >
            Log in
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("register");
              setError(null);
            }}
            className={`cs-btn-side ${mode === "register" ? "cs-btn-side-active" : ""}`}
          >
            Register
          </button>
        </div>

        {mode === "register" ? (
          <form onSubmit={onRegister} className="cs-card space-y-4 p-5">
            <div>
              <label htmlFor="auth-register-email" className="cs-label mb-2">Email</label>
              <input
                id="auth-register-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="cs-input"
                autoComplete="email"
              />
            </div>
            <div>
              <label htmlFor="auth-register-password" className="cs-label mb-2">Password (min 8 characters)</label>
              <input
                id="auth-register-password"
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="cs-input"
                autoComplete="new-password"
              />
            </div>
            <div>
              <label htmlFor="auth-register-apikey" className="cs-label mb-2">Alpha Vantage API key</label>
              <input
                id="auth-register-apikey"
                type="password"
                required
                minLength={8}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="From alphavantage.co"
                className="cs-input-mono"
                autoComplete="off"
              />
            </div>
            {error && <p className="text-sm font-mono font-semibold text-danger" role="alert">{error}</p>}
            <button type="submit" disabled={busy} className="cs-btn-buy w-full">
              {busy ? "Creating account…" : "Create account"}
            </button>
          </form>
        ) : (
          <form onSubmit={onLogin} className="cs-card space-y-4 p-5">
            <div>
              <label htmlFor="auth-login-email" className="cs-label mb-2">Email</label>
              <input
                id="auth-login-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="cs-input"
                autoComplete="email"
              />
            </div>
            <div>
              <label htmlFor="auth-login-password" className="cs-label mb-2">Password</label>
              <input
                id="auth-login-password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="cs-input"
                autoComplete="current-password"
              />
            </div>
            {error && <p className="text-sm font-mono font-semibold text-danger" role="alert">{error}</p>}
            <button type="submit" disabled={busy} className="cs-btn-buy w-full">
              {busy ? "Signing in…" : "Log in"}
            </button>
          </form>
        )}

        <div className="relative text-center">
          <span className="relative z-[1] inline-flex items-center bg-canvas px-3 text-xs font-semibold uppercase tracking-wide text-muted">
            or
          </span>
          <div className="absolute left-0 right-0 top-1/2 h-px bg-ink/10 -z-0" />
        </div>

        <div className="text-center">
          <button
            type="button"
            onClick={() => void startGuest()}
            disabled={busy}
            className="text-sm font-semibold text-gold underline-offset-2 hover:underline disabled:opacity-40"
          >
            Continue as guest
          </button>
          <p className="mt-2 text-xs font-mono text-muted">Add an API key in Account for live prices.</p>
        </div>
      </div>
    </div>
  );
}
