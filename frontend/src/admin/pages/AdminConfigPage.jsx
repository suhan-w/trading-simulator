import { useCallback, useEffect, useState } from "react";
import { api } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { isSuperAdmin } from "../isAdmin";

export default function AdminConfigPage() {
  const { user } = useAuth();
  const superUser = isSuperAdmin(user?.role);
  const [rows, setRows] = useState([]);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(true);
  const [editing, setEditing] = useState(null);
  const [valueStr, setValueStr] = useState("");
  const [desc, setDesc] = useState("");
  const [saveError, setSaveError] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      const list = await api.admin.configList();
      setRows(Array.isArray(list) ? list : []);
    } catch (e) {
      setError(e?.message || "Failed to load config");
      setRows([]);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function openEdit(row) {
    setEditing(row.key);
    setValueStr(
      typeof row.value === "string" || typeof row.value === "number"
        ? String(row.value)
        : JSON.stringify(row.value, null, 2)
    );
    setDesc(row.description ?? "");
    setSaveError(null);
  }

  async function save() {
    if (!editing) return;
    setSaveError(null);
    let parsed;
    try {
      parsed = JSON.parse(valueStr);
    } catch {
      setSaveError("Value must be valid JSON (e.g. a number, string, or object).");
      return;
    }
    try {
      const body = { value: parsed };
      if (desc.trim()) body.description = desc.trim();
      await api.admin.patchConfig(editing, body);
      setEditing(null);
      await load();
    } catch (e) {
      setSaveError(e?.message || "Save failed");
    }
  }

  if (busy && rows.length === 0 && !error) {
    return <p className="text-sm text-muted">Loading config…</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="cs-page-title">Platform config</h1>
        <p className="cs-page-desc mt-1">
          Key/value settings stored on the server.{!superUser ? " Only super admins can edit." : ""}
        </p>
      </div>

      {error ? <div className="rounded-lg border border-red-100 bg-red-50 text-red-800 text-sm px-4 py-3">{error}</div> : null}

      <div className="overflow-x-auto cs-card">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-ink/10 text-left text-muted uppercase tracking-wide">
              <th className="p-3 font-semibold">Key</th>
              <th className="p-3 font-semibold">Value</th>
              <th className="p-3 font-semibold">Description</th>
              <th className="p-3 font-semibold">Updated</th>
              {superUser ? <th className="p-3 font-semibold" /> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-b border-ink/[0.06] align-top">
                <td className="p-3 font-mono font-medium">{r.key}</td>
                <td className="p-3 font-mono text-[10px] max-w-xs truncate" title={JSON.stringify(r.value)}>
                  {JSON.stringify(r.value)}
                </td>
                <td className="p-3 text-muted">{r.description ?? "—"}</td>
                <td className="p-3 text-muted whitespace-nowrap">
                  {r.updated_at ? new Date(r.updated_at).toLocaleString() : "—"}
                </td>
                {superUser ? (
                  <td className="p-3 text-right">
                    <button type="button" className="cs-btn-side text-xs" onClick={() => openEdit(r)}>
                      Edit
                    </button>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {superUser && editing ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/40">
          <div className="cs-card max-w-lg w-full p-5 space-y-3">
            <h2 className="text-sm font-semibold">Edit {editing}</h2>
            <label className="cs-label">Value (JSON)</label>
            <textarea className="cs-input w-full min-h-[120px] text-xs font-mono" value={valueStr} onChange={(e) => setValueStr(e.target.value)} />
            <label className="cs-label">Description</label>
            <input className="cs-input w-full text-xs" value={desc} onChange={(e) => setDesc(e.target.value)} />
            {saveError ? <p className="text-xs text-red-700">{saveError}</p> : null}
            <div className="flex gap-2">
              <button type="button" className="cs-btn-buy flex-1 text-xs" onClick={() => void save()}>
                Save
              </button>
              <button type="button" className="cs-btn-neutral flex-1 text-xs" onClick={() => setEditing(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
