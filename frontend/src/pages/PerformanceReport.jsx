import { useCallback, useMemo, useState } from "react";
import { api } from "../api/client";
import { formatAud } from "../formatAud";
import { ComparisonChartPanel, LineChartPanel } from "../components/LineChartPanel";
import PerStockReturnBars from "../components/PerStockReturnBars";

function defaultRange() {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 90);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

function StatCard({ label, children, hint }) {
  return (
    <div className="rounded-xl border border-surface-700 bg-surface-800/50 p-4">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-semibold text-white font-mono tabular-nums">{children}</div>
      {hint && <p className="text-xs text-slate-500 mt-1">{hint}</p>}
    </div>
  );
}

export default function PerformanceReport() {
  const [{ start, end }, setRange] = useState(defaultRange);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    api
      .performanceReport(start, end)
      .then(setReport)
      .catch((e) => {
        setReport(null);
        setError(e?.message || "Could not load report");
      })
      .finally(() => setLoading(false));
  }, [start, end]);

  const equityPoints = useMemo(
    () => (report?.equity_curve || []).map((p) => ({ time: p.time, value: p.equity })),
    [report]
  );
  const returnPoints = useMemo(
    () => (report?.return_pct_series || []).map((p) => ({ time: p.time, value: p.return_pct })),
    [report]
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-white tracking-tight">Performance report</h1>
        <p className="text-slate-400 text-sm mt-1">
          Metrics and charts for your selected window. Win rate and best/worst trades use realised P/L on sells
          (FIFO). Sharpe and drawdown use forward-filled daily portfolio value.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-4 rounded-xl border border-surface-700 bg-surface-800/40 p-4">
        <div>
          <label className="block text-xs text-slate-500 mb-1">Start</label>
          <input
            type="date"
            value={start}
            onChange={(e) => setRange((r) => ({ ...r, start: e.target.value }))}
            className="px-3 py-2 rounded-lg bg-surface-900 border border-surface-600 text-white font-mono text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">End</label>
          <input
            type="date"
            value={end}
            onChange={(e) => setRange((r) => ({ ...r, end: e.target.value }))}
            className="px-3 py-2 rounded-lg bg-surface-900 border border-surface-600 text-white font-mono text-sm"
          />
        </div>
        <button
          type="button"
          onClick={() => load()}
          disabled={loading}
          className="px-5 py-2 rounded-lg bg-accent text-surface-900 font-semibold hover:bg-accent-dim disabled:opacity-50"
        >
          {loading ? "Loading…" : "Generate report"}
        </button>
      </div>

      {error && <p className="text-danger text-sm">{error}</p>}

      {report && (
        <>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <StatCard label="Win rate (sells)" hint={`${report.sell_count} sells in range`}>
              {report.win_rate_pct != null ? `${report.win_rate_pct}%` : "—"}
            </StatCard>
            <StatCard label="Total trades (fills)" hint="Buys and sells executed in range">
              {report.trade_count}
            </StatCard>
            <StatCard label="Max drawdown" hint="From daily equity peak in range">
              {report.max_drawdown_pct != null ? `${report.max_drawdown_pct}%` : "—"}
            </StatCard>
            <StatCard label="Sharpe (ann.)" hint="From daily returns; needs enough history">
              {report.sharpe_ratio != null ? report.sharpe_ratio : "—"}
            </StatCard>
            <StatCard label="Best trade (realised)" hint="Largest realised P/L on one sell">
              {report.best_trade ? (
                <span className={report.best_trade.realized_pnl >= 0 ? "text-accent" : "text-danger"}>
                  {report.best_trade.ticker} · {formatAud(report.best_trade.realized_pnl)}
                </span>
              ) : (
                "—"
              )}
            </StatCard>
            <StatCard label="Worst trade (realised)" hint="Smallest realised P/L on one sell">
              {report.worst_trade ? (
                <span className={report.worst_trade.realized_pnl >= 0 ? "text-accent" : "text-danger"}>
                  {report.worst_trade.ticker} · {formatAud(report.worst_trade.realized_pnl)}
                </span>
              ) : (
                "—"
              )}
            </StatCard>
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            <LineChartPanel title="Portfolio value over time" points={equityPoints} color="#22c55e" />
            <LineChartPanel title="Return % over time" points={returnPoints} color="#a78bfa" />
          </div>

          <ComparisonChartPanel
            title="Portfolio vs benchmark"
            portfolio={report.portfolio_vs_benchmark?.portfolio || []}
            benchmark={report.portfolio_vs_benchmark?.benchmark || []}
            benchLabel={report.portfolio_vs_benchmark?.benchmark_label || "S&P/ASX 200"}
          />

          <section className="rounded-xl border border-surface-700 bg-surface-800/40 p-4">
            <h3 className="text-sm font-medium text-slate-300 mb-1">Individual stock performance</h3>
            <p className="text-xs text-slate-500 mb-4">
              Total return % from first to last daily close in range (Yahoo), for tickers you traded or hold.
            </p>
            <PerStockReturnBars rows={report.per_stock_performance || []} />
          </section>
        </>
      )}

      {!report && !loading && !error && (
        <p className="text-slate-500 text-sm">Choose dates and click &ldquo;Generate report&rdquo;.</p>
      )}
    </div>
  );
}
