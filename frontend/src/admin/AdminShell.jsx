import { Link, NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { isSuperAdmin } from "./isAdmin";

function navClass({ isActive }) {
  return [
    "block rounded-lg px-3 py-2 text-xs font-semibold transition-colors",
    isActive ? "bg-ink text-white" : "text-muted hover:text-ink hover:bg-ink/[0.06]",
  ].join(" ");
}

export default function AdminShell() {
  const { user, logout } = useAuth();
  const superUser = isSuperAdmin(user?.role);

  return (
    <div className="min-h-screen flex bg-canvas font-sans text-ink">
      <aside className="w-56 shrink-0 border-r border-ink/10 bg-card flex flex-col">
        <div className="p-4 border-b border-ink/10">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Cowrie Shell</p>
          <h1 className="text-sm font-semibold text-ink mt-0.5">Admin</h1>
          <p className="text-[11px] text-muted mt-1 truncate" title={user?.email}>
            {user?.email}
          </p>
          <p className="text-[10px] font-medium text-gold mt-1">{user?.role}</p>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          <NavLink to="/admin" end className={navClass}>
            Dashboard
          </NavLink>
          <NavLink to="/admin/users" className={navClass}>
            Users
          </NavLink>
          <NavLink to="/admin/audit" className={navClass}>
            Audit log
          </NavLink>
          <NavLink to="/admin/config" className={navClass}>
            Platform config
          </NavLink>
        </nav>
        <div className="p-3 border-t border-ink/10 space-y-2">
          <Link
            to="/"
            className="block text-center text-xs font-semibold text-muted hover:text-ink py-2 rounded-lg hover:bg-ink/[0.04]"
          >
            ← Trading app
          </Link>
          <button type="button" onClick={() => void logout()} className="cs-btn-neutral w-full text-xs">
            Sign out
          </button>
          {superUser ? (
            <p className="text-[10px] text-center text-muted leading-snug">Super admin: full access</p>
          ) : (
            <p className="text-[10px] text-center text-muted leading-snug">Moderator: some actions require super admin</p>
          )}
        </div>
      </aside>
      <main className="flex-1 overflow-auto min-h-screen">
        <div className="max-w-6xl mx-auto p-5 md:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
