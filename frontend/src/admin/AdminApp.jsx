import { useEffect, useState } from "react";
import { Link, Route, Routes } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { isAdminRole } from "./isAdmin";
import AdminLogin from "./AdminLogin";
import AdminShell from "./AdminShell";
import AdminDashboard from "./pages/AdminDashboard";
import AdminUsersPage from "./pages/AdminUsersPage";
import AdminUserDetailPage from "./pages/AdminUserDetailPage";
import AdminAuditPage from "./pages/AdminAuditPage";
import AdminConfigPage from "./pages/AdminConfigPage";

export default function AdminApp() {
  const { user, loading, logout, refreshMe } = useAuth();
  /** Re-fetch /me so role matches DB (e.g. after promotion) — SPA state can be stale. */
  const [sessionChecked, setSessionChecked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await refreshMe();
      if (!cancelled) setSessionChecked(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshMe]);

  if (loading || (user && !sessionChecked)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-canvas font-sans">
        <span className="text-sm font-medium text-muted">Loading…</span>
      </div>
    );
  }

  if (!user) {
    return <AdminLogin />;
  }

  if (!isAdminRole(user.role)) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-canvas font-sans text-ink">
        <div className="cs-card max-w-md p-8 text-center space-y-4">
          <h1 className="text-sm font-semibold text-ink">No admin access</h1>
          <p className="text-sm text-muted leading-relaxed">
            Signed in as <span className="font-medium text-ink">{user.email}</span> with role{" "}
            <span className="font-mono text-xs">{user.role || "user"}</span>. This portal is for moderators and super admins
            only.
          </p>
          <div className="flex flex-col gap-2">
            <Link to="/" className="cs-btn-buy text-center text-xs">
              Go to trading app
            </Link>
            <button type="button" className="cs-btn-neutral text-xs" onClick={() => void logout()}>
              Sign out
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <Routes>
      <Route element={<AdminShell />}>
        <Route index element={<AdminDashboard />} />
        <Route path="users" element={<AdminUsersPage />} />
        <Route path="users/:userId" element={<AdminUserDetailPage />} />
        <Route path="audit" element={<AdminAuditPage />} />
        <Route path="config" element={<AdminConfigPage />} />
      </Route>
    </Routes>
  );
}
