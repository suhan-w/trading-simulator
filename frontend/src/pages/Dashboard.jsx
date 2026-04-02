import { useCallback, useEffect, useState } from "react";
import { api } from "../api/client";
import PriceChart from "../components/PriceChart";

export default function Dashboard() {
  const [portfolio, setPortfolio] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [err, setErr] = useState("");
  const [chartTicker, setChartTicker] = useState("AAPL");
  const [period, setPeriod] = useState("3mo");
  const [bars, setBars] = useState([]);

  const load = useCallback(async () => {
    setErr("");
    try {
      const [p, tx] = await Promise.all([api.portfolio(), api.transactions()]);
      setPortfolio(p);
      setTransactions(tx);
      if (p.holdings?.length) {
        setChartTicker((prev) =>
          p.holdings.some((h) => h.ticker === prev) ? prev : p.holdings[0].ticker
        );
      }
    } catch (e) {
      setErr(e.message);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await api.chart(chartTicker, period);
        if (!cancelled) setBars(data);
      } catch {
        if (!cancelled) setBars([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [chartTicker, period]);

  if (!portfolio && !err) {
    return <p className="text-slate-400">Loading portfolio…</p>;
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold mb-1">Portfolio</h1>
        <p className="text-slate-400 text-sm">Updates every 30 seconds with live quotes.</p>
      </div>

      {err && (
        <div className="rounded-lg bg-red-950/50 border border-red-800 text-red-200 px-4 py-3 text-sm">{err}</div>
      )}

      {portfolio && (
        <>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Stat label="Total equity" value={`$${portfolio.total_equity.toLocaleString(undefined, { maximumFractionDigits: 2 })}`} />
            <Stat label="Cash" value={`$${portfolio.cash_balance.toLocaleString(undefined, { maximumFractionDigits: 2 })}`} />
            <Stat
              label="Total return"
              value={`${portfolio.total_return_pct >= 0 ? "+" : ""}${portfolio.total_return_pct.toFixed(2)}%`}
              positive={portfolio.total_return_pct >= 0}
            />
            <Stat
              label="Unrealized P/L"
              value={`$${portfolio.total_unrealized_pnl.toLocaleString(undefined, { maximumFractionDigits: 2 })}`}
              positive={portfolio.total_unrealized_pnl >= 0}
            />
          </div>

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
                        No positions yet — buy a stock in Trade.
                      </td>
                    </tr>
                  ) : (
                    portfolio.holdings.map((h) => (
                      <tr key={h.ticker} className="border-b border-surface-700/60 font-mono">
                        <td className="px-4 py-3 text-white">{h.ticker}</td>
                        <td className="px-4 py-3">{h.quantity.toFixed(4)}</td>
                        <td className="px-4 py-3">${h.avg_cost.toFixed(2)}</td>
                        <td className="px-4 py-3">${h.current_price.toFixed(2)}</td>
                        <td className="px-4 py-3">${h.market_value.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                        <td className={`px-4 py-3 ${h.unrealized_pnl >= 0 ? "text-accent" : "text-danger"}`}>
                          ${h.unrealized_pnl.toLocaleString(undefined, { maximumFractionDigits: 2 })}
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

          <div>
            <h2 className="text-lg font-medium mb-4">Transaction history</h2>
            <div className="rounded-xl border border-surface-700 overflow-hidden max-h-64 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-surface-800">
                  <tr className="border-b border-surface-700 text-left text-slate-400">
                    <th className="px-4 py-2 font-medium">Time</th>
                    <th className="px-4 py-2 font-medium">Side</th>
                    <th className="px-4 py-2 font-medium">Ticker</th>
                    <th className="px-4 py-2 font-medium">Qty</th>
                    <th className="px-4 py-2 font-medium">Price</th>
                    <th className="px-4 py-2 font-medium">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                        No trades yet.
                      </td>
                    </tr>
                  ) : (
                    transactions.slice(0, 50).map((t) => (
                      <tr key={t.id} className="border-b border-surface-700/60 font-mono text-xs">
                        <td className="px-4 py-2 text-slate-400 whitespace-nowrap">
                          {new Date(t.executed_at).toLocaleString()}
                        </td>
                        <td className={`px-4 py-2 ${t.side === "buy" ? "text-accent" : "text-danger"}`}>
                          {t.side}
                        </td>
                        <td className="px-4 py-2">{t.ticker}</td>
                        <td className="px-4 py-2">{t.quantity.toFixed(4)}</td>
                        <td className="px-4 py-2">${t.price.toFixed(2)}</td>
                        <td className="px-4 py-2">${t.total.toFixed(2)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <div className="flex flex-wrap items-center gap-4 mb-4">
              <h2 className="text-lg font-medium">Price chart</h2>
              <select
                value={chartTicker}
                onChange={(e) => setChartTicker(e.target.value)}
                className="rounded-lg bg-surface-800 border border-surface-700 px-3 py-2 text-sm"
              >
                {(portfolio.holdings.length
                  ? portfolio.holdings
                  : [{ ticker: "AAPL" }]
                ).map((h) => (
                  <option key={h.ticker} value={h.ticker}>
                    {h.ticker}
                  </option>
                ))}
              </select>
              <select
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                className="rounded-lg bg-surface-800 border border-surface-700 px-3 py-2 text-sm"
              >
                {["1d", "5d", "1mo", "3mo", "6mo", "1y", "2y", "5y"].map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <PriceChart bars={bars} />
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
