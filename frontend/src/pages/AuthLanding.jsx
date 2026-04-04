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
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-surface-900">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <h1 className="text-2xl font-semibold text-white tracking-tight">Signal Trader</h1>
          <p className="text-slate-400 text-sm mt-2">
            ASX paper trading with live quotes from your{" "}
            <a
              href="https://www.alphavantage.co/support/#api-key"
              target="_blank"
              rel="noreferrer"
              className="text-accent hover:underline"
            >
              Alpha Vantage
            </a>{" "}
            API key.
          </p>
        </div>

        <div className="flex rounded-lg border border-surface-600 p-0.5 bg-surface-800/50">
          <button
            type="button"
            onClick={() => {
              setMode("login");
              setError(null);
            }}
            className={`flex-1 py-2 text-sm font-medium rounded-md transition ${
              mode === "login" ? "bg-surface-700 text-white" : "text-slate-400 hover:text-white"
            }`}
          >
            Log in
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("register");
              setError(null);
            }}
            className={`flex-1 py-2 text-sm font-medium rounded-md transition ${
              mode === "register" ? "bg-surface-700 text-white" : "text-slate-400 hover:text-white"
            }`}
          >
            Register
          </button>
        </div>

        {mode === "register" ? (
          <form onSubmit={onRegister} className="space-y-4 rounded-xl border border-surface-700 bg-surface-800/40 p-6">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-surface-900 border border-surface-600 text-white text-sm"
                autoComplete="email"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Password (min 8 characters)</label>
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-surface-900 border border-surface-600 text-white text-sm"
                autoComplete="new-password"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Alpha Vantage API key</label>
              <input
                type="password"
                required
                minLength={8}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Paste your key from alphavantage.co"
                className="w-full px-3 py-2 rounded-lg bg-surface-900 border border-surface-600 text-white text-sm font-mono placeholder:text-slate-600"
                autoComplete="off"
              />
            </div>
            {error && <p className="text-sm text-danger">{error}</p>}
            <button
              type="submit"
              disabled={busy}
              className="w-full py-3 rounded-lg bg-accent text-surface-900 font-semibold hover:bg-accent-dim disabled:opacity-50"
            >
              {busy ? "Creating account…" : "Create account"}
            </button>
          </form>
        ) : (
          <form onSubmit={onLogin} className="space-y-4 rounded-xl border border-surface-700 bg-surface-800/40 p-6">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-surface-900 border border-surface-600 text-white text-sm"
                autoComplete="email"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-surface-900 border border-surface-600 text-white text-sm"
                autoComplete="current-password"
              />
            </div>
            {error && <p className="text-sm text-danger">{error}</p>}
            <button
              type="submit"
              disabled={busy}
              className="w-full py-3 rounded-lg bg-accent text-surface-900 font-semibold hover:bg-accent-dim disabled:opacity-50"
            >
              {busy ? "Signing in…" : "Log in"}
            </button>
          </form>
        )}

        <div className="relative text-center">
          <span className="text-slate-600 text-xs px-2 bg-surface-900 relative z-[1]">or</span>
          <div className="absolute left-0 right-0 top-1/2 h-px bg-surface-700 -z-0" />
        </div>

        <div className="text-center">
          <button
            type="button"
            onClick={() => void startGuest()}
            disabled={busy}
            className="text-sm text-slate-400 hover:text-white underline disabled:opacity-50"
          >
            Continue as guest (no live prices until you add an API key in Account)
          </button>
        </div>
      </div>
    </div>
  );
}
