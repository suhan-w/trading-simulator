import { useCallback, useEffect, useState } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import BrandMark from "./BrandMark";
import MelbourneMarketStatus from "./MelbourneMarketStatus";
function navPill({ isActive }) {
  return [
    "whitespace-nowrap rounded-full px-4 py-2 text-xs font-semibold transition-colors",
    isActive ? "bg-ink text-white shadow-card-sm" : "text-muted hover:text-ink",
  ].join(" ");
}

const ASX200_REFRESH_MS = 5 * 60 * 1000;

export default function Layout() {
  const { user, logout } = useAuth();
  const [marketSession, setMarketSession] = useState(null);
  const [marketFetchedAt, setMarketFetchedAt] = useState(null);
  const [asx200, setAsx200] = useState(null);

  const loadMarketSession = useCallback(() => {
    api
      .marketSession()
      .then((s) => {
        setMarketSession(s);
        setMarketFetchedAt(Date.now());
      })
      .catch(() => {
        setMarketSession(null);
        setMarketFetchedAt(null);
      });
  }, []);

  const loadAsx200 = useCallback(() => {
    api
      .asx200Index()
      .then(setAsx200)
      .catch(() => setAsx200(null));
  }, []);

  useEffect(() => {
    if (!user) {
      setMarketSession(null);
      setMarketFetchedAt(null);
      setAsx200(null);
      return undefined;
    }
    loadMarketSession();
    const id = setInterval(loadMarketSession, 20000);
    return () => clearInterval(id);
  }, [user, loadMarketSession]);

  useEffect(() => {
    if (!user) {
      setAsx200(null);
      return undefined;
    }
    loadAsx200();
    const id = setInterval(loadAsx200, ASX200_REFRESH_MS);
    return () => clearInterval(id);
  }, [user, loadAsx200]);

  return (
    <div className="min-h-screen flex flex-col bg-canvas font-sans text-ink">
      <header className="sticky top-0 z-20 bg-card shadow-card">
        <div className="max-w-[1600px] mx-auto px-4 md:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3 py-3">
            <BrandMark />
            <nav className="hidden sm:flex flex-1 justify-center items-center gap-1 md:gap-2">
              <NavLink to="/" end className={navPill}>
                Portfolio
              </NavLink>
              <NavLink to="/trade" className={navPill}>
                Trade
              </NavLink>
              <NavLink to="/strategy" className={navPill} title="Strategy builder and backtests">
                Strategy
              </NavLink>
              <NavLink to="/backtesting" className={navPill}>
                Backtesting
              </NavLink>
              <NavLink to="/performance" className={navPill}>
                Performance
              </NavLink>
              <NavLink to="/account" className={navPill}>
                Account
              </NavLink>
            </nav>
            {user && (
              <button type="button" onClick={() => void logout()} className="cs-btn-neutral shrink-0">
                Sign out
              </button>
            )}
          </div>
          <nav className="flex sm:hidden items-center gap-1 overflow-x-auto pb-3 -mt-1">
            <NavLink to="/" end className={navPill}>
              Portfolio
            </NavLink>
            <NavLink to="/trade" className={navPill}>
              Trade
            </NavLink>
            <NavLink to="/strategy" className={navPill} title="Strategy builder and backtests">
              Strategy
            </NavLink>
            <NavLink to="/backtesting" className={navPill}>
              Backtesting
            </NavLink>
            <NavLink to="/performance" className={navPill}>
              Performance
            </NavLink>
            <NavLink to="/account" className={navPill}>
              Account
            </NavLink>
          </nav>
        </div>
        {user && (
          <div className="bg-card shadow-[0_4px_12px_rgba(17,17,17,0.04)]">
            <div className="max-w-[1600px] mx-auto px-4 md:px-6 py-2.5">
              <MelbourneMarketStatus session={marketSession} fetchedAt={marketFetchedAt} asx200={asx200} />
            </div>
          </div>
        )}
      </header>

      <main className="flex-1 w-full max-w-[1600px] mx-auto px-4 md:px-6 py-5 md:py-6">
        <Outlet
          context={{
            marketSession,
            marketFetchedAt,
            reloadMarketSession: loadMarketSession,
          }}
        />
      </main>

      <footer className="mt-auto py-4 px-4">
        {user && (
          <nav
            className="mb-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-ink/[0.06] pb-3 text-[11px] font-semibold text-muted"
            aria-label="Quick navigation"
          >
            <Link to="/" className="hover:text-ink">
              Portfolio
            </Link>
            <span className="text-ink/[0.15]" aria-hidden>
              ·
            </span>
            <Link to="/trade" className="hover:text-ink">
              Trade
            </Link>
            <span className="text-ink/[0.15]" aria-hidden>
              ·
            </span>
            <Link to="/strategy" className="hover:text-ink">
              Strategy
            </Link>
            <span className="text-ink/[0.15]" aria-hidden>
              ·
            </span>
            <Link to="/backtesting" className="text-gold hover:underline">
              Backtesting
            </Link>
            <span className="text-ink/[0.15]" aria-hidden>
              ·
            </span>
            <Link to="/performance" className="hover:text-ink">
              Performance
            </Link>
            <span className="text-ink/[0.15]" aria-hidden>
              ·
            </span>
            <Link to="/account" className="hover:text-ink">
              Account
            </Link>
          </nav>
        )}
        <p className="text-center text-xs leading-relaxed text-muted max-w-3xl mx-auto">
          <span className="font-semibold text-ink">Cowrie</span>
          <span className="font-semibold text-gold">Shell</span> · ASX Mon–Fri 10:00–16:00 Melbourne (AEST/AEDT);
          Victorian holidays closed. End-of-day prices via Alpha Vantage (free tier: 25 requests/day; cached per symbol).
          Paper trading only — not financial advice.
        </p>
      </footer>
    </div>
  );
}
