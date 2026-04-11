import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import CardHeaderTitle from "../components/CardHeaderTitle";
import PerformanceSummaryModal from "../components/PerformanceSummaryModal";
import SectionHeading from "../components/SectionHeading";
import DailyReturnHistogram from "../components/DailyReturnHistogram";
import { ComparisonChartPanel, LineChartPanel } from "../components/LineChartPanel";
import PerStockPnlBars from "../components/PerStockPnlBars";
import WinRateDonut from "../components/WinRateDonut";

const CHART_H = 180;

function defaultRange() {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 90);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

function fmtPct(x, digits = 2) {
  if (x === null || x === undefined) return "—";
  const n = Number(x);
  if (Number.isNaN(n)) return "—";
  return `${n >= 0 ? "+" : ""}${n.toFixed(digits)}%`;
}

/** @param {{ label: string, value: string, hint?: string, valueTone?: "profit" | "ink" | "danger" }} props */
function PerfMetricCard({ label, value, hint, valueTone = "ink" }) {
  const valCls =
    valueTone === "profit"
      ? "perf-mcard-val green"
      : valueTone === "danger"
        ? "perf-mcard-val red"
        : "perf-mcard-val";
  return (
    <div className="perf-mcard">
      <div className="perf-mcard-label">{label}</div>
      <p className={valCls}>{value}</p>
      {hint ? <p className="perf-mcard-sub">{hint}</p> : null}
    </div>
  );
}

/** @param {{ title: string, subtitle?: string, tooltipText?: string, children: import("react").ReactNode }} props */
function PerfChartCard({ title, subtitle, tooltipText, children }) {
  return (
    <div className="perf-chart-card">
      <div className="perf-chart-header">
        <CardHeaderTitle
          headingLevel={4}
          title={title}
          tooltipText={tooltipText}
          titleClassName="perf-chart-card-heading"
          className="min-w-0 flex-1"
        />
      </div>
      {subtitle ? <p className="perf-chart-sub">{subtitle}</p> : null}
      <div className="perf-chart-card-body">{children}</div>
    </div>
  );
}

function usePerformanceKpis(report) {
  return useMemo(() => {
    if (!report) return null;
    const cum = report.cumulative_return_daily || [];
    const totalReturn = cum.length ? Number(cum[cum.length - 1].cumulative_return_pct) : null;
    let alpha = report.aligned_alpha_pct;
    if (alpha != null && Number.isNaN(Number(alpha))) alpha = null;
    return {
      totalReturn,
      alpha,
      sharpe: report.sharpe_ratio,
      maxDd: report.max_drawdown_pct,
    };
  }, [report]);
}

export default function PerformanceReport() {
  const [{ start, end }, setRange] = useState(defaultRange);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [summaryData, setSummaryData] = useState(null);
  const [summaryBusy, setSummaryBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .performanceReport(start, end)
      .then((r) => {
        if (!cancelled) setReport(r);
      })
      .catch(() => {
        if (!cancelled) {
          setReport(null);
          setError("nodata");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [start, end]);

  const kpis = usePerformanceKpis(report);

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

  const generateSummaryReport = useCallback(async () => {
    setSummaryBusy(true);
    try {
      const data = await api.performanceSummaryReport(start, end);
      setSummaryData(data);
      setSummaryOpen(true);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : String(e));
    } finally {
      setSummaryBusy(false);
    }
  }, [start, end]);

  const maxDdTone = kpis != null && Number(kpis.maxDd) < 0 ? "danger" : "ink";
  const totalReturnTone =
    kpis != null && kpis.totalReturn != null && !Number.isNaN(Number(kpis.totalReturn)) && Number(kpis.totalReturn) >= 0
      ? "profit"
      : kpis != null && kpis.totalReturn != null
        ? "danger"
        : "ink";

  return (
    <div className="performance-page">
      <header className="perf-span-full">
        <SectionHeading
          title="Performance"
          subtitle="Pick a date range to review returns, risk, and how you compare to the benchmark."
          tooltipText="Paper-trading portfolio metrics for the selected dates: cumulative return, drawdown, daily return distribution, win rate on sells, per-stock P/L, and portfolio vs the ASX benchmark. Figures use your paper fills and marks."
        />
        <div className="perf-backtest-banner">
          You&apos;re viewing live paper trading performance. Want to test a strategy on historical data first?{" "}
          <Link to="/backtest">Run a backtest →</Link>
        </div>
      </header>

      <div className="perf-date-bar perf-span-full">
        <div className="perf-date-bar-row">
          <div className="flex flex-wrap items-center gap-3">
            <span className="perf-date-label">Date range</span>
            <div className="perf-date-inputs">
              <input
                type="date"
                value={start}
                onChange={(e) => setRange((r) => ({ ...r, start: e.target.value }))}
                className="perf-date-input"
              />
              <span className="perf-date-sep">→</span>
              <input
                type="date"
                value={end}
                onChange={(e) => setRange((r) => ({ ...r, end: e.target.value }))}
                className="perf-date-input"
              />
              {loading ? <span className="font-mono text-[11px] text-[#aaa]">Loading…</span> : null}
            </div>
          </div>
          <div className="perf-date-bar-actions">
            <button
              type="button"
              className="perf-generate-report-btn"
              disabled={loading || !report || !!error || summaryBusy}
              onClick={() => void generateSummaryReport()}
            >
              {summaryBusy ? "Generating…" : "Generate Report"}
            </button>
          </div>
        </div>
      </div>

      <PerformanceSummaryModal
        open={summaryOpen}
        onClose={() => setSummaryOpen(false)}
        start={start}
        end={end}
        data={summaryData}
      />

      {loading && !report ? (
        <p className="perf-span-full py-10 text-center font-mono text-sm text-[#aaa]">Loading…</p>
      ) : null}

      {error ? (
        <div className="perf-span-full py-16 text-center font-mono text-sm text-[#888]">
          <p>No data available for this range</p>
        </div>
      ) : null}

      {report && kpis && !error && (
        <>
          <div className="perf-metrics perf-span-full">
            <PerfMetricCard
              label="Total Return"
              value={fmtPct(kpis.totalReturn)}
              hint="Over selected period"
              valueTone={totalReturnTone}
            />
            <PerfMetricCard
              label="Alpha"
              value={fmtPct(kpis.alpha)}
              hint="Overlapping window vs benchmark"
              valueTone="ink"
            />
            <PerfMetricCard
              label="Sharpe Ratio"
              value={kpis.sharpe != null ? Number(kpis.sharpe).toFixed(2) : "—"}
              hint="Annualised"
              valueTone="ink"
            />
            <PerfMetricCard
              label="Max Drawdown"
              value={`${Number(kpis.maxDd).toFixed(2)}%`}
              hint="From running peak"
              valueTone={maxDdTone}
            />
          </div>

          <div className="perf-charts-matrix perf-span-full">
            <div className="perf-chart-slot-portfolio">
              <PerfChartCard
                title="Portfolio Value vs ASX Benchmark"
                subtitle="Day-over-day % change on aligned dates — portfolio equity vs benchmark close."
                tooltipText="Each point is one day’s percentage move from the prior day on dates where both portfolio (forward-filled equity) and benchmark EOD exist."
              >
                <ComparisonChartPanel
                  embedded
                  dailyPercentComparison
                  portfolio={report.portfolio_vs_benchmark?.portfolio || []}
                  benchmark={report.portfolio_vs_benchmark?.benchmark || []}
                  benchLabel={report.portfolio_vs_benchmark?.benchmark_label || "S&P/ASX 200"}
                  height={CHART_H}
                />
              </PerfChartCard>
            </div>

            <div className="perf-chart-slot-daily">
              <PerfChartCard
                title="Daily Returns"
                subtitle="Each bar is one day’s percentage change in portfolio value."
                tooltipText="Histogram of daily portfolio return %."
              >
                <div className="perf-chart-area">
                  <DailyReturnHistogram embedded rows={report.daily_return_bars || []} height={CHART_H} />
                </div>
              </PerfChartCard>
            </div>

            <div className="perf-chart-slot-win">
              <PerfChartCard
                title="Win Rate"
                subtitle="Completed sells in this range."
                tooltipText="Share of sells that finished with a gain, loss, or flat."
              >
                <div className="perf-chart-area perf-scroll-y">
                  <WinRateDonut
                    embedded
                    breakdown={
                      report.win_rate_breakdown ?? {
                        winning_sells: 0,
                        losing_sells: 0,
                        breakeven_sells: 0,
                      }
                    }
                  />
                </div>
              </PerfChartCard>
            </div>

            <div className="perf-chart-slot-cumulative">
              <PerfChartCard
                title="Cumulative Return"
                subtitle="Total percentage return since the start of the selected period."
                tooltipText="Cumulative return from the first day in range."
              >
                <div className="perf-chart-area">
                  {cumulativePoints?.length ? (
                    <LineChartPanel
                      embedded
                      embeddedTight
                      points={cumulativePoints}
                      height={CHART_H}
                      variant="gold"
                    />
                  ) : (
                    <p className="py-8 text-center font-mono text-sm text-[#888]">No data available for this range</p>
                  )}
                </div>
              </PerfChartCard>
            </div>

            <div className="perf-chart-slot-drawdown">
              <PerfChartCard
                title="Drawdown from Peak"
                subtitle="Percentage below the running high-water mark of portfolio value (forward-filled daily)."
                tooltipText="Peak-to-trough decline of portfolio value in the selected period."
              >
                <div className="perf-chart-area">
                  {drawdownPoints?.length ? (
                    <LineChartPanel
                      embedded
                      embeddedTight
                      points={drawdownPoints}
                      height={CHART_H}
                      variant="performance-drawdown"
                    />
                  ) : (
                    <p className="py-8 text-center font-mono text-sm text-[#888]">No data available for this range</p>
                  )}
                </div>
              </PerfChartCard>
            </div>

            <div className="perf-chart-slot-pl">
              <PerfChartCard
                title="P/L by Stock"
                subtitle="Realised on sells in range plus current unrealised per ticker."
                tooltipText="Profit and loss attributed to each ticker."
              >
                <div className="perf-chart-area perf-scroll-y">
                  <PerStockPnlBars embedded barLayout="left" rows={report.per_stock_pnl || []} />
                </div>
              </PerfChartCard>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
