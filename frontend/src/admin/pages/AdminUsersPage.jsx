import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";

function formatWhen(iso) {
  if (iso == null || iso === "") return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
}

export default function AdminUsersPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(true);
  const [page, setPage] = useState(1);
  const [draft, setDraft] = useState({ search: "", role: "", suspended: "", includeGuests: false });
  const [filters, setFilters] = useState({ search: "", role: "", suspended: "", includeGuests: false });

  const load = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      const params = { page, per_page: 50 };
      if (filters.search) params.search = filters.search;
      if (filters.role) params.role = filters.role;
      if (filters.suspended === "true" || filters.suspended === "false")
        params.is_suspended = filters.suspended === "true";
      if (filters.includeGuests) params.include_guests = true;
      const res = await api.admin.users(params);
      setData(res);
    } catch (e) {
      setError(e?.message || "Failed to load users");
      setData(null);
    } finally {
      setBusy(false);
    }
  }, [page, filters]);

  useEffect(() => {
    void load();
  }, [load]);

  function onSearchSubmit(e) {
    e.preventDefault();
    setFilters({
      search: draft.search.trim(),
      role: draft.role.trim(),
      suspended: draft.suspended,
      includeGuests: draft.includeGuests,
    });
    setPage(1);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="cs-page-title">Users</h1>
        <p className="cs-page-desc mt-1">
          Registered accounts only (guest <span className="font-mono text-[11px]">@guest.local</span> sessions are
          hidden by default). Search, filter, and open a user for moderation actions.
        </p>
      </div>

      <form onSubmit={onSearchSubmit} className="cs-card p-4 flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[160px]">
          <label className="cs-label">Search (email / username)</label>
          <input
            className="cs-input w-full mt-1"
            value={draft.search}
            onChange={(e) => setDraft((d) => ({ ...d, search: e.target.value }))}
            placeholder="search…"
          />
        </div>
        <div className="w-32">
          <label className="cs-label">Role</label>
          <input
            className="cs-input w-full mt-1"
            value={draft.role}
            onChange={(e) => setDraft((d) => ({ ...d, role: e.target.value }))}
            placeholder="user"
          />
        </div>
        <div className="w-36">
          <label className="cs-label">Suspended</label>
          <select
            className="cs-input w-full mt-1"
            value={draft.suspended}
            onChange={(e) => setDraft((d) => ({ ...d, suspended: e.target.value }))}
          >
            <option value="">Any</option>
            <option value="true">Yes</option>
            <option value="false">No</option>
          </select>
        </div>
        <label className="flex items-center gap-2 cursor-pointer pb-1">
          <input
            type="checkbox"
            checked={draft.includeGuests}
            onChange={(e) => setDraft((d) => ({ ...d, includeGuests: e.target.checked }))}
            className="rounded border-ink/20"
          />
          <span className="text-xs text-muted">Include guest sessions</span>
        </label>
        <button type="submit" className="cs-btn-buy text-xs">
          Apply
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
                  <th className="p-3 font-semibold">ID</th>
                  <th className="p-3 font-semibold">Email</th>
                  <th className="p-3 font-semibold">Username</th>
                  <th className="p-3 font-semibold">Verified</th>
                  <th className="p-3 font-semibold">Last active</th>
                  <th
                    className="p-3 font-semibold"
                    title="Alpha Vantage market-data API: requests used today / daily quota"
                  >
                    Quota (used/limit)
                  </th>
                  <th className="p-3 font-semibold">Role</th>
                  <th className="p-3 font-semibold">Suspended</th>
                  <th className="p-3 font-semibold" />
                </tr>
              </thead>
              <tbody>
                {data.users?.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="p-6 text-center text-muted">
                      No users match these filters.
                    </td>
                  </tr>
                ) : null}
                {data.users?.map((u) => {
                  const lastActive = formatWhen(u.last_active_at);
                  return (
                    <tr key={u.id} className="border-b border-ink/[0.06] hover:bg-ink/[0.02]">
                      <td className="p-3 tabular-nums">{u.id}</td>
                      <td className="p-3 font-medium">{u.email}</td>
                      <td className="p-3 text-muted">{u.username || <span className="opacity-50">not set</span>}</td>
                      <td className="p-3">{u.email_verified === false ? "No" : "Yes"}</td>
                      <td className="p-3 text-muted whitespace-nowrap">
                        {lastActive ?? <span className="opacity-50">Never</span>}
                      </td>
                      <td
                        className="p-3 tabular-nums"
                        title="Alpha Vantage market-data API requests used today / daily limit"
                      >
                        {u.alpha_vantage_requests_used_today ?? 0}/{u.alpha_vantage_daily_limit ?? "—"}
                      </td>
                      <td className="p-3">{u.role}</td>
                      <td className="p-3">{u.is_suspended ? "Yes" : "No"}</td>
                      <td className="p-3 text-right">
                        <Link
                          to={`/admin/users/${u.id}`}
                          className="text-ink font-semibold hover:underline whitespace-nowrap"
                        >
                          Open →
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between text-xs text-muted">
            <span>
              Page {data.page} of {data.pages} · {data.total} users
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
