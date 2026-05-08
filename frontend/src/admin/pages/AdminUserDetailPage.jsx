import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { isSuperAdmin } from "../isAdmin";

function Modal({ title, children, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/40" role="dialog" aria-modal="true">
      <div className="cs-card max-w-md w-full p-5 shadow-xl max-h-[90vh] overflow-y-auto">
        <h2 className="text-sm font-semibold text-ink mb-3">{title}</h2>
        {children}
        <button type="button" className="cs-btn-neutral w-full mt-4 text-xs" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}

export default function AdminUserDetailPage() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const id = Number(userId);
  const { user: me, refreshMe } = useAuth();
  const superUser = isSuperAdmin(me?.role);

  const [detail, setDetail] = useState(null);
  const [trades, setTrades] = useState([]);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(true);
  const [actionError, setActionError] = useState(null);

  const [suspendOpen, setSuspendOpen] = useState(false);
  const [suspendReason, setSuspendReason] = useState("");

  const [resetOpen, setResetOpen] = useState(false);
  const [resetAmount, setResetAmount] = useState("");
  const [resetReason, setResetReason] = useState("");

  const [grantOpen, setGrantOpen] = useState(false);
  const [grantRole, setGrantRole] = useState("moderator");

  const [deleteOpen, setDeleteOpen] = useState(false);

  const load = useCallback(async () => {
    if (!Number.isFinite(id)) return;
    setError(null);
    setBusy(true);
    try {
      const [u, t] = await Promise.all([
        api.admin.user(id),
        api.admin.userTrades(id, { limit: 100, offset: 0 }),
      ]);
      setDetail(u);
      setTrades(Array.isArray(t) ? t : []);
    } catch (e) {
      setError(e?.message || "Failed to load user");
      setDetail(null);
      setTrades([]);
    } finally {
      setBusy(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function runAction(fn, refreshSelf = false) {
    setActionError(null);
    try {
      const updated = await fn();
      if (updated && typeof updated === "object" && updated.id != null) setDetail(updated);
      else await load();
      if (refreshSelf) await refreshMe();
      return true;
    } catch (e) {
      setActionError(e?.message || "Action failed");
      return false;
    }
  }

  if (!Number.isFinite(id)) {
    return <p className="text-sm text-muted">Invalid user id.</p>;
  }

  if (busy && !detail) {
    return <p className="text-sm text-muted">Loading user…</p>;
  }

  if (error && !detail) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-red-100 bg-red-50 text-red-800 text-sm px-4 py-3">{error}</div>
        <Link to="/admin/users" className="text-sm font-semibold text-ink hover:underline">
          ← Back to users
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link to="/admin/users" className="text-xs font-semibold text-muted hover:text-ink">
            ← Users
          </Link>
          <h1 className="cs-page-title mt-2">User #{detail.id}</h1>
          <p className="text-sm text-muted">{detail.email}</p>
        </div>
      </div>

      {actionError ? (
        <div className="rounded-lg border border-red-100 bg-red-50 text-red-800 text-sm px-4 py-3">{actionError}</div>
      ) : null}

      <div className="grid md:grid-cols-2 gap-4">
        <div className="cs-card p-4 space-y-2 text-xs">
          <h2 className="font-semibold text-ink text-sm">Profile</h2>
          <p>
            <span className="text-muted">Username:</span> {detail.username ?? "—"}
          </p>
          <p>
            <span className="text-muted">Email verified:</span>{" "}
            {detail.email_verified === false ? "No" : "Yes"}
          </p>
          <p>
            <span className="text-muted">Last active:</span>{" "}
            {detail.last_active_at
              ? new Date(detail.last_active_at).toLocaleString(undefined, {
                  dateStyle: "medium",
                  timeStyle: "short",
                })
              : "—"}
          </p>
          <p>
            <span className="text-muted">Role:</span> {detail.role}
          </p>
          <p>
            <span className="text-muted">Suspended:</span> {detail.is_suspended ? "Yes" : "No"}
          </p>
          {detail.suspension_reason ? (
            <p>
              <span className="text-muted">Reason:</span> {detail.suspension_reason}
            </p>
          ) : null}
          <p>
            <span className="text-muted">Cash:</span> {Number(detail.cash_balance).toLocaleString()}
          </p>
          <p>
            <span className="text-muted">Total trades:</span> {detail.total_trades}
          </p>
          <p>
            <span className="text-muted">Total P/L:</span> {Number(detail.total_pnl).toFixed(2)}
          </p>
          <p>
            <span className="text-muted">Portfolio value:</span> {Number(detail.portfolio_value).toLocaleString()}
          </p>
        </div>

        <div className="cs-card p-4 space-y-2 text-xs">
          <h2 className="font-semibold text-ink text-sm">Alpha Vantage (today)</h2>
          <p>
            <span className="text-muted">API key on file:</span>{" "}
            {detail.has_alpha_vantage_key ? "Yes" : "No"}
          </p>
          <p>
            <span className="text-muted">Requests used / daily cap:</span>{" "}
            <span className="tabular-nums font-medium text-ink">
              {detail.alpha_vantage_requests_used_today ?? 0} / {detail.alpha_vantage_daily_limit ?? "—"}
            </span>
          </p>
        </div>

        <div className="cs-card p-4 space-y-3">
          <h2 className="font-semibold text-ink text-sm">Actions</h2>
          <div className="flex flex-wrap gap-2">
            {!detail.is_suspended ? (
              <button type="button" className="cs-btn-sell text-xs" onClick={() => setSuspendOpen(true)}>
                Suspend
              </button>
            ) : (
              <button
                type="button"
                className="cs-btn-buy text-xs"
                onClick={() => void runAction(() => api.admin.unsuspend(id))}
              >
                Unsuspend
              </button>
            )}
            <button
              type="button"
              className="cs-btn-neutral text-xs"
              onClick={() => void runAction(() => api.admin.forceLogout(id))}
            >
              Force logout
            </button>
            {superUser ? (
              <>
                <button type="button" className="cs-btn-side text-xs" onClick={() => setResetOpen(true)}>
                  Reset balance
                </button>
                <button type="button" className="cs-btn-gold text-xs" onClick={() => setGrantOpen(true)}>
                  Grant admin
                </button>
                <button
                  type="button"
                  className="cs-btn-neutral text-xs"
                  onClick={() => void runAction(() => api.admin.revokeAdmin(id))}
                >
                  Revoke admin
                </button>
                <button type="button" className="cs-btn-sell text-xs" onClick={() => setDeleteOpen(true)}>
                  Soft delete
                </button>
              </>
            ) : null}
          </div>
          {!superUser ? (
            <p className="text-[10px] text-muted leading-relaxed">Balance reset, grant/revoke admin, and delete require super admin.</p>
          ) : null}
        </div>
      </div>

      <div className="cs-card p-4">
        <h2 className="font-semibold text-ink text-sm mb-3">Recent trades</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-ink/10 text-left text-muted">
                <th className="p-2">Ticker</th>
                <th className="p-2">Side</th>
                <th className="p-2">Qty</th>
                <th className="p-2">Price</th>
                <th className="p-2">Total</th>
                <th className="p-2">Time</th>
              </tr>
            </thead>
            <tbody>
              {trades.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-3 text-muted">
                    No trades
                  </td>
                </tr>
              ) : (
                trades.map((t) => (
                  <tr key={t.id} className="border-b border-ink/[0.06]">
                    <td className="p-2 font-medium">{t.ticker}</td>
                    <td className="p-2">{t.side}</td>
                    <td className="p-2 tabular-nums">{t.quantity}</td>
                    <td className="p-2 tabular-nums">{t.price}</td>
                    <td className="p-2 tabular-nums">{t.total}</td>
                    <td className="p-2 text-muted whitespace-nowrap">
                      {t.executed_at ? new Date(t.executed_at).toLocaleString() : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {suspendOpen ? (
        <Modal title="Suspend user" onClose={() => setSuspendOpen(false)}>
          <p className="text-xs text-muted mb-2">Reason must be at least 10 characters.</p>
          <textarea
            className="cs-input w-full min-h-[80px] text-xs"
            value={suspendReason}
            onChange={(e) => setSuspendReason(e.target.value)}
            placeholder="Reason for suspension…"
          />
          <button
            type="button"
            className="cs-btn-sell w-full mt-3 text-xs"
            disabled={suspendReason.trim().length < 10}
            onClick={async () => {
              const ok = await runAction(() => api.admin.suspend(id, suspendReason.trim()));
              if (ok) {
                setSuspendOpen(false);
                setSuspendReason("");
              }
            }}
          >
            Confirm suspend
          </button>
        </Modal>
      ) : null}

      {resetOpen ? (
        <Modal title="Reset cash balance" onClose={() => setResetOpen(false)}>
          <label className="cs-label">New balance (AUD)</label>
          <input
            type="number"
            step="0.01"
            min="0.01"
            className="cs-input w-full mt-1 text-xs"
            value={resetAmount}
            onChange={(e) => setResetAmount(e.target.value)}
          />
          <label className="cs-label mt-3">Reason</label>
          <input
            className="cs-input w-full mt-1 text-xs"
            value={resetReason}
            onChange={(e) => setResetReason(e.target.value)}
          />
          <button
            type="button"
            className="cs-btn-buy w-full mt-3 text-xs"
            onClick={async () => {
              const amt = Number(resetAmount);
              if (!(amt > 0) || !resetReason.trim()) return;
              const ok = await runAction(() =>
                api.admin.resetBalance(id, { new_balance: amt, reason: resetReason.trim() })
              );
              if (ok) {
                setResetOpen(false);
                setResetAmount("");
                setResetReason("");
              }
            }}
          >
            Apply reset
          </button>
        </Modal>
      ) : null}

      {grantOpen ? (
        <Modal title="Grant admin role" onClose={() => setGrantOpen(false)}>
          <label className="cs-label">Role</label>
          <select className="cs-input w-full mt-1 text-xs" value={grantRole} onChange={(e) => setGrantRole(e.target.value)}>
            <option value="moderator">moderator</option>
            <option value="super_admin">super_admin</option>
          </select>
          <button
            type="button"
            className="cs-btn-gold w-full mt-3 text-xs"
            onClick={async () => {
              const ok = await runAction(() => api.admin.grantAdmin(id, grantRole), id === me?.id);
              if (ok) setGrantOpen(false);
            }}
          >
            Grant
          </button>
        </Modal>
      ) : null}

      {deleteOpen ? (
        <Modal title="Soft delete user?" onClose={() => setDeleteOpen(false)}>
          <p className="text-xs text-muted leading-relaxed mb-3">
            Marks the user deleted and anonymises email. This cannot be undone from the portal.
          </p>
          <button
            type="button"
            className="cs-btn-sell w-full text-xs"
            onClick={async () => {
              setActionError(null);
              try {
                await api.admin.deleteUser(id);
                setDeleteOpen(false);
                navigate("/admin/users");
              } catch (e) {
                setActionError(e?.message || "Delete failed");
              }
            }}
          >
            Confirm delete
          </button>
        </Modal>
      ) : null}
    </div>
  );
}
