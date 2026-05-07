import { useCallback, useEffect, useState } from "react";
import { api } from "../../api/client";

function toIsoOrEmpty(v) {
  if (!v || !String(v).trim()) return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

const ACTION_OPTIONS = [
  { value: "", label: "Any action" },
  { value: "SUSPEND_USER", label: "Suspend user" },
  { value: "UNSUSPEND_USER", label: "Unsuspend user" },
  { value: "RESET_BALANCE", label: "Reset balance" },
  { value: "DELETE_USER", label: "Delete user" },
  { value: "GRANT_ADMIN", label: "Grant admin" },
  { value: "REVOKE_ADMIN", label: "Revoke admin" },
  { value: "FORCE_LOGOUT", label: "Force logout" },
  { value: "UPDATE_CONFIG", label: "Update config" },
  { value: "EXPORT_REPORT", label: "Export report" },
];

export default function AdminAuditPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(true);
  const [page, setPage] = useState(1);

  const [draft, setDraft] = useState({
    admin_id: "",
    action: "",
    target_user_id: "",
    from_date: "",
    to_date: "",
  });
  const [filters, setFilters] = useState({
    admin_id: "",
    action: "",
    target_user_id: "",
    from_date: "",
    to_date: "",
  });

  const load = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      const params = { page, per_page: 50 };
      if (filters.admin_id) {
        const n = Number(filters.admin_id);
        if (Number.isFinite(n)) params.admin_id = n;
      }
      if (filters.action) params.action = filters.action;
      if (filters.target_user_id) {
        const n = Number(filters.target_user_id);
        if (Number.isFinite(n)) params.target_user_id = n;
      }
      const fromIso = toIsoOrEmpty(filters.from_date);
      const toIso = toIsoOrEmpty(filters.to_date);
      if (fromIso) params.from_date = fromIso;
      if (toIso) params.to_date = toIso;
      const res = await api.admin.auditLog(params);
      setData(res);
    } catch (e) {
      setError(e?.message || "Failed to load audit log");
      setData(null);
    } finally {
      setBusy(false);
    }
  }, [page, filters]);

  useEffect(() => {
    void load();
  }, [load]);

  function applyFilters(e) {
    e.preventDefault();
    setFilters({ ...draft });
    setPage(1);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="cs-page-title">Audit log</h1>
        <p className="cs-page-desc mt-1">
          Every admin action is recorded here, newest first. Leave a filter blank to match anything.
        </p>
      </div>

      <form onSubmit={applyFilters} className="cs-card p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 items-end">
        <div>
          <label className="cs-label">Admin user ID</label>
          <input
            className="cs-input w-full mt-1 text-xs"
            value={draft.admin_id}
            onChange={(e) => setDraft((d) => ({ ...d, admin_id: e.target.value }))}
            placeholder="any"
          />
        </div>
        <div>
          <label className="cs-label">Action</label>
          <select
            className="cs-input w-full mt-1 text-xs"
            value={draft.action}
            onChange={(e) => setDraft((d) => ({ ...d, action: e.target.value }))}
          >
            {ACTION_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="cs-label">Target user ID</label>
          <input
            className="cs-input w-full mt-1 text-xs"
            value={draft.target_user_id}
            onChange={(e) => setDraft((d) => ({ ...d, target_user_id: e.target.value }))}
            placeholder="any"
          />
        </div>
        <div>
          <label className="cs-label">From</label>
          <input
            type="datetime-local"
            className="cs-input w-full mt-1 text-xs"
            value={draft.from_date}
            onChange={(e) => setDraft((d) => ({ ...d, from_date: e.target.value }))}
          />
          <p className="text-[10px] text-muted mt-1">Local time. Leave empty for no lower bound.</p>
        </div>
        <div>
          <label className="cs-label">To</label>
          <input
            type="datetime-local"
            className="cs-input w-full mt-1 text-xs"
            value={draft.to_date}
            onChange={(e) => setDraft((d) => ({ ...d, to_date: e.target.value }))}
          />
          <p className="text-[10px] text-muted mt-1">Local time. Leave empty for no upper bound.</p>
        </div>
        <button type="submit" className="cs-btn-buy text-xs">
          Apply filters
        </button>
      </form>

      {error ? <div className="rounded-lg border border-red-100 bg-red-50 text-red-800 text-sm px-4 py-3">{error}</div> : null}
      {busy && !data ? <p className="text-sm text-muted">Loading…</p> : null}

      {data ? (
        <>
          <div className="overflow-x-auto cs-card">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-ink/10 text-left text-muted uppercase tracking-wide">
                  <th className="p-2 font-semibold">Time</th>
                  <th className="p-2 font-semibold">Action</th>
                  <th className="p-2 font-semibold">Admin</th>
                  <th className="p-2 font-semibold">Target</th>
                  <th className="p-2 font-semibold">Payload</th>
                </tr>
              </thead>
              <tbody>
                {data.entries?.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-muted">
                      No audit entries match these filters.
                    </td>
                  </tr>
                ) : null}
                {data.entries?.map((row) => (
                  <tr key={row.id} className="border-b border-ink/[0.06] align-top">
                    <td className="p-2 whitespace-nowrap text-muted">
                      {row.created_at ? new Date(row.created_at).toLocaleString() : "—"}
                    </td>
                    <td className="p-2 font-medium">{row.action}</td>
                    <td className="p-2">
                      <span className="text-muted">{row.admin_id}</span> {row.admin_email}
                    </td>
                    <td className="p-2">
                      {row.target_user_id != null ? (
                        <>
                          <span className="text-muted">{row.target_user_id}</span> {row.target_email ?? ""}
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="p-2 max-w-[200px] truncate font-mono text-[10px]" title={JSON.stringify(row.payload)}>
                      {row.payload != null ? JSON.stringify(row.payload) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between text-xs text-muted">
            <span>
              Page {data.page} of {data.pages} · {data.total} entries
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                className="cs-btn-neutral text-xs"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </button>
              <button
                type="button"
                className="cs-btn-neutral text-xs"
                disabled={data.page >= data.pages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
