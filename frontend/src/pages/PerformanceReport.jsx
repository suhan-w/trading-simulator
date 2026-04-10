import { useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import DailyReturnHistogram from "../components/DailyReturnHistogram";
import { ComparisonChartPanel, LineChartPanel } from "../components/LineChartPanel";
import PerStockPnlBars from "../components/PerStockPnlBars";
import CardHeaderTitle from "../components/CardHeaderTitle";
import SectionHeading from "../components/SectionHeading";
import WinRateDonut from "../components/WinRateDonut";

function defaultRange() {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 90);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

export default function PerformanceReport() {
  const [{ start, end }, setRange] = useState(defaultRange);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .performanceReport(start, end)
      .then((r) => {
        if (!cancelled) setReport(r);
      })
      .catch((e) => {
        if (!cancelled) {
          setReport(null);
          setError(e?.message || "Could not load report");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [start, end]);

  const cumulativePoints = useMemo(
    () =>
      (report?.cumulative_return_daily || []).map((p) => ({
        time: p.date,
        value: p.cumulative_return_pct,
      })),
    [report]
  );

  const drawdownPoints = useMemo(
    () =>
      (report?.drawdown_series || []).map((p) => ({
        time: p.date,
        value: p.drawdown_pct,
      })),
    [report]
  );

  return (
    <div className="space-y-6 md:space-y-8">
      <SectionHeading
        title="Performance"
        subtitle="Pick a date range to review returns, risk, and how you compare to the benchmark."
        tooltipText="Analyse how your trading strategy performed over a selected period."
      />

      <section className="cs-card overflow-hidden">
        <div className="cs-card-header pb-4 border-b border-ink/[0.06]">
          <CardHeaderTitle
            title="Date range filter"
            tooltipText="Choose the period for all performance charts below."
            subtitle="All six charts below use this range and refresh automatically when you change start or end."
            right={loading ? <span className="text-xs font-mono text-muted">Loading…</span> : null}
          />
        </div>
        <div className="flex flex-wrap items-end gap-4 p-5 pt-4">
          <div>
            <label className="cs-label mb-2">Start</label>
            <input
              type="date"
              value={start}
              onChange={(e) => setRange((r) => ({ ...r, start: e.target.value }))}
              className="cs-input-mono w-auto min-w-[11rem]"
            />
          </div>
          <div>
            <label className="cs-label mb-2">End</label>
            <input
              type="date"
              value={end}
              onChange={(e) => setRange((r) => ({ ...r, end: e.target.value }))}
              className="cs-input-mono w-auto min-w-[11rem]"
            />
          </div>
        </div>
      </section>

      {error && <p className="text-sm font-mono font-semibold text-danger">{error}</p>}

      {report && (
        <div className="performance-layout">
          <div className="performance-span-full">
            <ComparisonChartPanel
              title="Portfolio value vs ASX 200 benchmark"
              tooltipText="Compare your portfolio to the ASX 200 benchmark over the selected range."
              portfolio={report.portfolio_vs_benchmark?.portfolio || []}
              benchmark={report.portfolio_vs_benchmark?.benchmark || []}
              benchLabel={report.portfolio_vs_benchmark?.benchmark_label || "S&P/ASX 200"}
            />
          </div>

          <DailyReturnHistogram
            title="Daily return %"
            tooltipText="Each bar is one day’s percentage change in portfolio value."
            rows={report.daily_return_bars || []}
            height={220}
          />

          <LineChartPanel
            title="Cumulative return %"
            tooltipText="Total percentage return since the start of the selected period."
            points={cumulativePoints}
            height={220}
          />

          <WinRateDonut
            title="Win rate (sells)"
            tooltipText="Share of completed sells that finished with a gain, a loss, or flat."
            breakdown={
              report.win_rate_breakdown ?? {
                winning_sells: 0,
                losing_sells: 0,
                breakeven_sells: 0,
              }
            }
          />

          <PerStockPnlBars
            title="P/L by stock"
            tooltipText="Profit and loss attributed to each ticker over the selected range."
            rows={report.per_stock_pnl || []}
          />

          <div className="performance-span-full space-y-2">
            <LineChartPanel
              title="Drawdown from peak"
              tooltipText="How far portfolio value fell below its running peak in the selected period."
              points={drawdownPoints}
              height={240}
              variant="danger"
            />
            <p className="px-5 text-[11px] font-mono text-muted">
              Percentage below the running high-water mark of portfolio value (forward-filled daily).
            </p>
          </div>
        </div>
      )}

      {!report && !loading && !error && (
        <p className="text-sm font-mono text-muted">Adjust the date range to load the report.</p>
      )}
    </div>
  );
}
