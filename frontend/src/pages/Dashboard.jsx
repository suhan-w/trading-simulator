import { useCallback, useEffect, useState } from "react";
import { api } from "../api/client";
import PortfolioEquityChart from "../components/PortfolioEquityChart";
import { formatAud } from "../formatAud";

export default function Dashboard() {
  const [portfolio, setPortfolio] = useState(null);
  const [equityPoints, setEquityPoints] = useState([]);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    setErr("");
    try {
      const [p, eq] = await Promise.all([api.portfolio(), api.equityHistory()]);
      setPortfolio(p);
      setEquityPoints(eq);
    } catch (e) {
      setErr(e.message);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [load]);

  if (!portfolio && !err) {
    return <p className="text-slate-400">Loading…</p>;
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold mb-1">Performance</h1>
        <p className="text-slate-400 text-sm">
          ASX paper portfolio (AUD) with live Yahoo Finance <span className="font-mono">.AX</span> prices. Refreshes
          every 30 seconds.
        </p>
      </div>

      {err && (
        <div className="rounded-lg bg-red-950/50 border border-red-800 text-red-200 px-4 py-3 text-sm">{err}</div>
      )}

      {portfolio && (
        <>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Stat label="Portfolio value (AUD)" value={formatAud(portfolio.total_equity)} />
            <Stat label="Cash (AUD)" value={formatAud(portfolio.cash_balance)} />
            <Stat
              label="Total return"
              value={`${portfolio.total_return_pct >= 0 ? "+" : ""}${portfolio.total_return_pct.toFixed(2)}%`}
              positive={portfolio.total_return_pct >= 0}
            />
            <Stat
              label="Unrealized P/L (AUD)"
              value={formatAud(portfolio.total_unrealized_pnl)}
              positive={portfolio.total_unrealized_pnl >= 0}
            />
          </div>

          <div>
            <h2 className="text-lg font-medium mb-4">Portfolio value over time (AUD)</h2>
            <PortfolioEquityChart points={equityPoints} />
          </div>

          <div>
            <h2 className="text-lg font-medium mb-4">Holdings</h2>
            <div className="rounded-xl border border-surface-700 bg-surface-800/50 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-surface-700 text-left text-slate-400">
                      <th className="px-4 py-3 font-medium">Ticker</th>
                      <th className="px-4 py-3 font-medium">Qty</th>
                      <th className="px-4 py-3 font-medium">Avg cost</th>
                      <th className="px-4 py-3 font-medium">Price</th>
                      <th className="px-4 py-3 font-medium">Value</th>
                      <th className="px-4 py-3 font-medium">P/L</th>
                      <th className="px-4 py-3 font-medium">P/L %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {portfolio.holdings.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                          No positions — place a trade to build your portfolio.
                        </td>
                      </tr>
                    ) : (
                      portfolio.holdings.map((h) => (
                        <tr key={h.ticker} className="border-b border-surface-700/60 font-mono">
                          <td className="px-4 py-3 text-white">{h.ticker}</td>
                          <td className="px-4 py-3">{h.quantity.toFixed(4)}</td>
                          <td className="px-4 py-3">{formatAud(h.avg_cost)}</td>
                          <td className="px-4 py-3">{formatAud(h.current_price)}</td>
                          <td className="px-4 py-3">{formatAud(h.market_value)}</td>
                          <td className={`px-4 py-3 ${h.unrealized_pnl >= 0 ? "text-accent" : "text-danger"}`}>
                            {formatAud(h.unrealized_pnl)}
                          </td>
                          <td className={`px-4 py-3 ${h.unrealized_pnl_pct >= 0 ? "text-accent" : "text-danger"}`}>
                            {h.unrealized_pnl_pct.toFixed(2)}%
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, positive }) {
  return (
    <div className="rounded-xl border border-surface-700 bg-surface-800/80 p-4">
      <div className="text-slate-400 text-xs uppercase tracking-wide mb-1">{label}</div>
      <div className={`text-xl font-mono font-semibold ${positive === false ? "text-danger" : positive ? "text-accent" : "text-white"}`}>
        {value}
      </div>
    </div>
  );
}
