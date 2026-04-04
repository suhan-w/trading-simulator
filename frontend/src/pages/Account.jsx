import { useState } from "react";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";

export default function Account() {
  const { user, refreshMe } = useAuth();
  const [apiKey, setApiKey] = useState("");
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  async function onSave(e) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    if (apiKey.trim().length < 8) {
      setError("API key must be at least 8 characters.");
      return;
    }
    setSaving(true);
    try {
      await api.updateAlphaVantageKey(apiKey.trim());
      setApiKey("");
      setMessage("API key saved.");
      await refreshMe();
    } catch (err) {
      setError(err?.message || "Could not save key");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-lg mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-white tracking-tight">Account</h1>
        <p className="text-slate-400 text-sm mt-1">
          Your Alpha Vantage key is stored with this account and used for every quote and chart request (subject to
          Alpha Vantage rate limits).
        </p>
      </div>

      <div className="rounded-xl border border-surface-700 bg-surface-800/40 p-6 space-y-4">
        <div>
          <div className="text-xs text-slate-500 uppercase tracking-wide">Signed in as</div>
          <div className="font-mono text-slate-200 mt-1">{user?.email}</div>
        </div>
        <div>
          <div className="text-xs text-slate-500 uppercase tracking-wide">Alpha Vantage</div>
          <div className="mt-1 text-sm">
            {user?.has_alpha_vantage_key ? (
              <span className="text-accent">API key on file</span>
            ) : (
              <span className="text-amber-400">No key — add one below to fetch live ASX prices.</span>
            )}
          </div>
        </div>

        <form onSubmit={onSave} className="space-y-3 pt-2 border-t border-surface-700">
          <label className="block text-sm text-slate-400">Update API key</label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={user?.has_alpha_vantage_key ? "Enter a new key to replace" : "Paste your API key"}
            className="w-full px-3 py-2 rounded-lg bg-surface-900 border border-surface-600 text-white font-mono text-sm placeholder:text-slate-600"
            autoComplete="off"
          />
          {message && <p className="text-sm text-accent">{message}</p>}
          {error && <p className="text-sm text-danger">{error}</p>}
          <button
            type="submit"
            disabled={saving || !apiKey.trim()}
            className="px-4 py-2 rounded-lg bg-accent text-surface-900 font-semibold hover:bg-accent-dim disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save API key"}
          </button>
        </form>

        <p className="text-xs text-slate-500">
          Get a free key at{" "}
          <a href="https://www.alphavantage.co/support/#api-key" className="text-accent hover:underline" target="_blank" rel="noreferrer">
            alphavantage.co
          </a>
          . Free tier is rate-limited (about 5 calls/minute); large performance reports may take a while.
        </p>
      </div>
    </div>
  );
}
