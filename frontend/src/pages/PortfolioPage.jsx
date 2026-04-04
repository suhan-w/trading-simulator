import { useCallback, useEffect, useState } from "react";
import { api } from "../api/client";
import { formatAud } from "../formatAud";

export default function PortfolioPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    setError(null);
    api
      .portfolio()
      .then(setData)
      .catch((e) => {
        setData(null);
        setError(e?.message || "Failed to load portfolio");
      });
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 45_000);
    return () => clearInterval(id);
  }, [load]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-white tracking-tight">Portfolio</h1>
        <p className="text-slate-400 text-sm mt-1">Holdings marked to market (Yahoo Finance ASX), unrealised P/L in AUD.</p>
      </div>

      {error && <p className="text-danger text-sm">{error}</p>}

      <div className="grid sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-surface-700 bg-surface-800/50 p-4">
          <div className="text-[11px] uppercase tracking-wide text-slate-500">Cash</div>
          <div className="font-mono text-xl text-accent font-semibold mt-1">
            {data != null ? formatAud(data.cash_balance) : "—"}
          </div>
        </div>
        <div className="rounded-xl border border-surface-700 bg-surface-800/50 p-4">
          <div className="text-[11px] uppercase tracking-wide text-slate-500">Total value</div>
          <div className="font-mono text-xl text-white font-semibold mt-1">
            {data != null ? formatAud(data.total_equity) : "—"}
          </div>
        </div>
        <div className="rounded-xl border border-surface-700 bg-surface-800/50 p-4">
          <div className="text-[11px] uppercase tracking-wide text-slate-500">Total return</div>
          <div
            className={`font-mono text-xl font-semibold mt-1 ${
              data && data.total_return_pct >= 0 ? "text-accent" : "text-danger"
            }`}
          >
            {data != null ? `${data.total_return_pct >= 0 ? "+" : ""}${data.total_return_pct.toFixed(2)}%` : "—"}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-surface-700 overflow-hidden">
        <div className="px-4 py-3 border-b border-surface-700 bg-surface-800/60">
          <h2 className="text-sm font-medium text-slate-300">Holdings</h2>
        </div>
        {!data ? (
          <p className="p-6 text-slate-500 text-sm">Loading…</p>
        ) : data.holdings.length === 0 ? (
          <p className="p-6 text-slate-500 text-sm">No positions yet. Execute a buy on the Trading page.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b border-surface-700">
                  <th className="px-4 py-3 font-medium">Ticker</th>
                  <th className="px-4 py-3 font-medium text-right">Qty</th>
                  <th className="px-4 py-3 font-medium text-right">Avg cost</th>
                  <th className="px-4 py-3 font-medium text-right">Last</th>
                  <th className="px-4 py-3 font-medium text-right">Value</th>
                  <th className="px-4 py-3 font-medium text-right">P/L</th>
                  <th className="px-4 py-3 font-medium text-right">P/L %</th>
                </tr>
              </thead>
              <tbody className="font-mono text-xs sm:text-sm">
                {data.holdings.map((h) => (
                  <tr key={h.ticker} className="border-b border-surface-700/80 hover:bg-surface-800/30">
                    <td className="px-4 py-3 text-white">{h.ticker}</td>
                    <td className="px-4 py-3 text-right text-slate-300">{h.quantity}</td>
                    <td className="px-4 py-3 text-right text-slate-400">{formatAud(h.avg_cost)}</td>
                    <td className="px-4 py-3 text-right text-slate-300">{formatAud(h.current_price)}</td>
                    <td className="px-4 py-3 text-right text-slate-200">{formatAud(h.market_value)}</td>
                    <td
                      className={`px-4 py-3 text-right ${h.unrealized_pnl >= 0 ? "text-accent" : "text-danger"}`}
                    >
                      {h.unrealized_pnl >= 0 ? "+" : ""}
                      {formatAud(h.unrealized_pnl)}
                    </td>
                    <td
                      className={`px-4 py-3 text-right ${h.unrealized_pnl_pct >= 0 ? "text-accent" : "text-danger"}`}
                    >
                      {h.unrealized_pnl_pct >= 0 ? "+" : ""}
                      {h.unrealized_pnl_pct.toFixed(2)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
