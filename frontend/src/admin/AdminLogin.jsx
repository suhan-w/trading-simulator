import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import BrandMark from "../components/BrandMark";

export default function AdminLogin() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email.trim(), password);
    } catch (err) {
      setError(err?.message || "Sign-in failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-canvas font-sans text-ink">
      <div className="w-full max-w-md cs-card p-8 space-y-6">
        <div className="flex flex-col items-center gap-2">
          <BrandMark />
          <h1 className="text-sm font-semibold text-ink">Admin sign in</h1>
          <p className="text-xs text-muted text-center leading-relaxed">
            Use the email and password for an account with moderator or super admin privileges.
          </p>
        </div>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="cs-label" htmlFor="admin-email">
              Email
            </label>
            <input
              id="admin-email"
              className="cs-input w-full mt-1"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="cs-label" htmlFor="admin-password">
              Password
            </label>
            <input
              id="admin-password"
              className="cs-input w-full mt-1"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error ? <p className="text-xs text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p> : null}
          <button type="submit" className="cs-btn-buy w-full" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <p className="text-center text-xs text-muted">
          <Link to="/" className="text-ink font-semibold hover:underline">
            ← Back to trading app
          </Link>
        </p>
      </div>
    </div>
  );
}
