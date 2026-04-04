import { Link, NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const linkClass = ({ isActive }) =>
  `px-3 py-2 rounded-lg text-sm font-medium transition ${
    isActive ? "bg-surface-700 text-white" : "text-slate-400 hover:text-white hover:bg-surface-800"
  }`;

export default function Layout() {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-surface-700 bg-surface-800/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-4">
          <Link to="/" className="font-semibold text-lg tracking-tight text-white">
            Signal Trader <span className="text-slate-500 font-normal text-base">ASX · AUD</span>
          </Link>
          <nav className="flex flex-wrap items-center gap-1">
            <NavLink to="/" end className={linkClass}>
              Trading
            </NavLink>
            <NavLink to="/portfolio" className={linkClass}>
              Portfolio
            </NavLink>
            <NavLink to="/performance" className={linkClass}>
              Performance
            </NavLink>
          </nav>
          <div className="flex items-center gap-3 text-sm flex-wrap justify-end">
            {user && (
              <>
                <span className="text-slate-500 hidden sm:inline">Session</span>
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
      <footer className="border-t border-surface-700 py-6 text-center text-slate-500 text-sm px-4 space-y-2">
        <p className="text-slate-400 max-w-2xl mx-auto">
          Execute trades here when your own strategy code says to — this app does not generate or host signals. Live
          prices from Yahoo Finance (ASX .AX tickers, AUD). Paper trading for practice only; not financial advice.
        </p>
      </footer>
    </div>
  );
}
