import { useState } from "react";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import SectionHeading from "../components/SectionHeading";

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
    <div className="max-w-lg mx-auto space-y-6 md:space-y-8">
      <SectionHeading
        title="Account"
        subtitle="Free tier: 25 API calls per calendar day. Each ticker is fetched once per day and cached — reuse is free."
      />

      <div className="cs-card p-5 space-y-5">
        <div>
          <div className="cs-label mb-2">Signed in as</div>
          <div className="font-mono text-sm text-ink tabular-nums font-semibold">{user?.email}</div>
        </div>
        <div>
          <div className="cs-label mb-2">Alpha Vantage</div>
          <div className="text-sm font-mono">
            {user?.has_alpha_vantage_key ? (
              <span className="font-bold text-profit">API key on file</span>
            ) : (
              <span className="text-muted">No key — add one below for EOD ASX prices.</span>
            )}
          </div>
        </div>

        <form onSubmit={onSave} className="space-y-4 border-t border-ink/8 pt-5">
          <div>
            <label className="cs-label mb-2">Update API key</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={user?.has_alpha_vantage_key ? "Enter a new key to replace" : "Paste your API key"}
              className="cs-input-mono"
              autoComplete="off"
            />
          </div>
          {message && <p className="text-sm font-mono font-bold text-profit">{message}</p>}
          {error && <p className="text-sm font-mono font-semibold text-danger">{error}</p>}
          <button type="submit" disabled={saving || !apiKey.trim()} className="cs-btn-buy w-full">
            {saving ? "Saving…" : "Save API key"}
          </button>
        </form>

        <p className="text-xs leading-relaxed text-muted font-mono">
          Free key:{" "}
          <a
            href="https://www.alphavantage.co/support/#api-key"
            className="font-semibold text-gold underline-offset-2 hover:underline"
            target="_blank"
            rel="noreferrer"
          >
            alphavantage.co
          </a>
          . ~5 calls/min; large reports may be slow.
        </p>
      </div>
    </div>
  );
}
