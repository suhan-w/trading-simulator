import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, downloadAdminExport } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { isSuperAdmin } from "../isAdmin";

function Metric({ label, value }) {
  return (
    <div className="cs-card p-4">
      <p className="text-[10px] font-bold uppercase tracking-wide text-muted">{label}</p>
      <p className="text-xl font-semibold text-ink mt-1 tabular-nums">{value}</p>
    </div>
  );
}

export default function AdminDashboard() {
  const { user } = useAuth();
  const superUser = isSuperAdmin(user?.role);
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(true);
  const [exportBusy, setExportBusy] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      const s = await api.admin.stats();
      setStats(s);
    } catch (e) {
      setError(e?.message || "Could not load stats");
      setStats(null);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onExportUsers() {
    setExportBusy("csv");
    try {
      await downloadAdminExport("/api/admin/reports/users/export", "users_export.csv");
    } catch (e) {
      alert(e?.message || "Export failed");
    } finally {
      setExportBusy(null);
    }
  }

  async function onExportPdf() {
    setExportBusy("pdf");
    try {
      await downloadAdminExport("/api/admin/reports/trades/pdf", "trades_summary.pdf");
    } catch (e) {
      alert(e?.message || "Export failed");
    } finally {
      setExportBusy(null);
    }
  }

  if (busy && !stats) {
    return <p className="text-sm text-muted">Loading dashboard…</p>;
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="cs-page-title">Dashboard</h1>
        <p className="cs-page-desc mt-1">Platform overview. Admin sessions expire after 30 minutes — sign in again if requests fail.</p>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-100 bg-red-50 text-red-800 text-sm px-4 py-3">{error}</div>
      ) : null}

      {stats ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          <Metric label="Total users" value={stats.total_users} />
          <Metric label="Active today" value={stats.active_today} />
          <Metric label="Active (7d)" value={stats.active_this_week} />
          <Metric label="Suspended" value={stats.suspended_users} />
          <Metric label="Total trades" value={stats.total_trades} />
          <Metric label="Trades today" value={stats.trades_today} />
          <Metric label="Avg P/L / user" value={Number(stats.avg_pnl).toFixed(2)} />
          <Metric label="Portfolio value (sum)" value={Number(stats.total_portfolio_value).toLocaleString()} />
        </div>
      ) : null}

      <div className="cs-card p-5 space-y-4">
        <h2 className="text-xs font-semibold text-ink">Quick actions</h2>
        <div className="flex flex-wrap gap-3">
          <Link to="/admin/users" className="cs-btn-side text-xs">
            Manage users
          </Link>
          <Link to="/admin/audit" className="cs-btn-side text-xs">
            View audit log
          </Link>
          <button type="button" className="cs-btn-side text-xs" onClick={() => void onExportUsers()} disabled={exportBusy}>
            {exportBusy === "csv" ? "Exporting…" : "Export users (CSV)"}
          </button>
          {superUser ? (
            <button type="button" className="cs-btn-gold text-xs" onClick={() => void onExportPdf()} disabled={exportBusy}>
              {exportBusy === "pdf" ? "Generating…" : "Export trades (PDF)"}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
