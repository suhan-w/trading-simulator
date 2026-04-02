import { useCallback, useEffect, useState } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { formatAud } from "../formatAud";

const linkClass = ({ isActive }) =>
  `px-3 py-2 rounded-lg text-sm font-medium transition ${
    isActive ? "bg-surface-700 text-white" : "text-slate-400 hover:text-white hover:bg-surface-800"
  }`;

export default function Layout() {
  const { user, logout } = useAuth();
  const [session, setSession] = useState(null);

  const loadSession = useCallback(async () => {
    try {
      const s = await api.asxSession();
      setSession(s);
    } catch {
      setSession(null);
    }
  }, []);

  useEffect(() => {
    void loadSession();
    const id = setInterval(() => void loadSession(), 30_000);
    return () => clearInterval(id);
  }, [loadSession]);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-surface-700 bg-surface-800/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-4">
          <Link to="/" className="font-semibold text-lg tracking-tight text-white">
            PaperTrade{" "}
            <span className="text-slate-500 font-normal text-base">ASX</span>
          </Link>
          <nav className="flex flex-wrap items-center gap-1">
            <NavLink to="/" end className={linkClass}>
              Dashboard
            </NavLink>
            <NavLink to="/trade" className={linkClass}>
              Trade
            </NavLink>
            <NavLink to="/journal" className={linkClass}>
              Journal
            </NavLink>
          </nav>
          <div className="flex items-center gap-3 text-sm flex-wrap justify-end">
            {session && (
              <span
                className={`px-2 py-1 rounded-md text-xs font-medium font-mono ${
                  session.open ? "bg-emerald-950/80 text-emerald-300 border border-emerald-800" : "bg-slate-800 text-slate-400 border border-surface-600"
                }`}
                title={session.hours_note}
              >
                ASX {session.open ? "Open" : "Closed"}
              </span>
            )}
            {user && (
              <>
                <span className="text-slate-400 hidden sm:inline">Guest</span>
                <span className="font-mono text-accent">{formatAud(user.cash_balance)} cash</span>
                <button
                  type="button"
                  onClick={() => void logout()}
                  className="px-3 py-1.5 rounded-lg bg-surface-700 hover:bg-surface-600 text-slate-200"
                >
                  New session
                </button>
              </>
            )}
          </div>
        </div>
      </header>
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-8">
        <Outlet />
      </main>
      <footer className="border-t border-surface-700 py-6 text-center text-slate-500 text-sm space-y-2 px-4">
        <p className="text-slate-400 max-w-2xl mx-auto">
          ASX regular session: Monday to Friday, 10:00am–4:00pm Sydney time (Australia/Sydney). The &ldquo;Open&rdquo;
          / &ldquo;Closed&rdquo; badge follows that schedule only (public holidays not included).
        </p>
        <p>Paper trading for practice only — Yahoo Finance ASX (.AX) prices in AUD. Not financial advice.</p>
      </footer>
    </div>
  );
}
