import { useCallback, useEffect, useState } from "react";
import { api } from "../api/client";
import { formatAud } from "../formatAud";

export default function Journal() {
  const [rows, setRows] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(null);

  const load = useCallback(async () => {
    setErr("");
    try {
      const tx = await api.transactions();
      setRows(tx);
      const d = {};
      for (const t of tx) {
        d[t.id] = t.notes ?? "";
      }
      setDrafts(d);
    } catch (e) {
      setErr(e.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function saveNote(id) {
    setMsg("");
    setSaving(id);
    try {
      await api.updateTransactionNotes(id, drafts[id] || null);
      setMsg("Saved.");
      await load();
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold mb-1">Trade journal</h1>
        <p className="text-slate-400 text-sm">Add notes to any fill. Your journal is private to this session.</p>
      </div>

      {err && <div className="text-danger text-sm">{err}</div>}
      {msg && <div className="text-accent text-sm">{msg}</div>}

      <div className="space-y-4">
        {rows.length === 0 ? (
          <p className="text-slate-500">No trades yet.</p>
        ) : (
          rows.map((t) => (
            <div
              key={t.id}
              className="rounded-xl border border-surface-700 bg-surface-800/50 p-4 space-y-3"
            >
              <div className="flex flex-wrap gap-3 text-sm font-mono text-slate-300">
                <span className="text-slate-500">{new Date(t.executed_at).toLocaleString()}</span>
                <span className={t.side === "buy" ? "text-accent" : "text-danger"}>{t.side}</span>
                <span>
                  {t.quantity.toFixed(4)} {t.ticker} @ {formatAud(t.price)}
                </span>
                <span className="text-slate-400">Total {formatAud(t.total)}</span>
                {t.portfolio_equity_after != null && (
                  <span className="text-slate-500">Portfolio after: {formatAud(t.portfolio_equity_after)}</span>
                )}
              </div>
              <textarea
                className="w-full min-h-[88px] rounded-lg bg-surface-900 border border-surface-700 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600"
                placeholder="Why did you take this trade? What will you watch next?"
                value={drafts[t.id] ?? ""}
                onChange={(e) => setDrafts((prev) => ({ ...prev, [t.id]: e.target.value }))}
              />
              <button
                type="button"
                disabled={saving === t.id}
                onClick={() => saveNote(t.id)}
                className="px-4 py-2 rounded-lg bg-surface-700 hover:bg-surface-600 text-sm text-slate-200 disabled:opacity-50"
              >
                {saving === t.id ? "Saving…" : "Save note"}
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
