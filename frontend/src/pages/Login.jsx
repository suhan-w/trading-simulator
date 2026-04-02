import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setErr("");
    setPending(true);
    try {
      await login(email, password);
      nav("/");
    } catch (x) {
      setErr(x.message || "Login failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="max-w-md mx-auto">
      <h1 className="text-2xl font-semibold mb-2">Sign in</h1>
      <p className="text-slate-400 mb-8">Welcome back to your paper trading account.</p>
      <form onSubmit={onSubmit} className="space-y-4">
        {err && (
          <div className="rounded-lg bg-red-950/50 border border-red-800 text-red-200 px-4 py-3 text-sm">
            {err}
          </div>
        )}
        <div>
          <label className="block text-sm text-slate-400 mb-1">Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg bg-surface-800 border border-surface-700 px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-accent/40"
          />
        </div>
        <div>
          <label className="block text-sm text-slate-400 mb-1">Password</label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg bg-surface-800 border border-surface-700 px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-accent/40"
          />
        </div>
        <button
          type="submit"
          disabled={pending}
          className="w-full py-3 rounded-lg bg-accent text-surface-900 font-semibold hover:bg-accent-dim disabled:opacity-50"
        >
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <p className="mt-6 text-center text-slate-400 text-sm">
        No account?{" "}
        <Link to="/register" className="text-accent hover:underline">
          Register
        </Link>
      </p>
    </div>
  );
}
