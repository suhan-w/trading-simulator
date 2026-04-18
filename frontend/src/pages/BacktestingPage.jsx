import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { createPortal } from "react-dom";
import CodeMirror from "@uiw/react-codemirror";
import { python } from "@codemirror/lang-python";
import SectionHeading from "../components/SectionHeading";
import CardHeaderTitle from "../components/CardHeaderTitle";
import {
  BACKTEST_CHART_PLOT_HEIGHT,
  BacktestDailyReturnsChart,
  BacktestDrawdownChart,
  BacktestSignalsChart,
  BacktestVsBenchmarkChart,
} from "../components/BacktestCharts";
import { api } from "../api/client";
import LeaderboardPage from "./LeaderboardPage";
import { STRATEGY_LOAD_PAYLOAD_KEY } from "../constants/strategyLoadPayload";
import { TRADE_STRATEGY_REMINDER_KEY } from "../constants/tradeReminder";
import { pushBacktestRunHistory } from "../constants/backtestRunHistoryStorage";
import { loadVisualStrategies } from "../constants/visualStrategyStorage";
import { translateVisualBlocksToPython } from "../utils/strategyBuilderTranslate";

function defaultRange() {
  const end = new Date();
  const start = new Date();
  start.setFullYear(start.getFullYear() - 2);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

function fmtPct(x, digits = 2) {
  if (x === null || x === undefined) return "—";
  const n = Number(x);
  if (Number.isNaN(n)) return "—";
  return `${n >= 0 ? "+" : ""}${n.toFixed(digits)}%`;
}

function MetricCard({ label, value, hint }) {
  return (
    <div className="backtest-metric-card">
      <div className="grid grid-cols-[auto_1fr] items-center gap-2">
        <span className="h-2 w-2 shrink-0 rounded-[1px] bg-gold shadow-card-sm" />
        <p className="m-0 text-[10px] font-semibold uppercase tracking-wider text-[#bbbbbb]">{label}</p>
      </div>
      <p className="mb-0 mt-2 font-mono text-[20px] font-medium tabular-nums text-ink">{value}</p>
      {hint ? <p className="mb-0 mt-1 text-[11px] leading-snug text-[#888888]">{hint}</p> : null}
    </div>
  );
}

export default function BacktestingPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState("backtest");
  const { start: defaultStart, end: defaultEnd } = useMemo(() => defaultRange(), []);
  const [ticker, setTicker] = useState("CBA.AX");
  const [start, setStart] = useState(defaultStart);
  const [end, setEnd] = useState(defaultEnd);
  const [code, setCode] = useState("");
  const [strategySource, setStrategySource] = useState({ loaded: false, name: "", fromStrategyPage: false });
  const [basketOpen, setBasketOpen] = useState(true);
  const [savedStrategies, setSavedStrategies] = useState(() => loadVisualStrategies());
  /** @type {[null | "vs" | "signals" | "drawdown" | "daily", (v: null | "vs" | "signals" | "drawdown" | "daily") => void]} */
  const [expandedChart, setExpandedChart] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STRATEGY_LOAD_PAYLOAD_KEY);
      if (!raw) return;
      sessionStorage.removeItem(STRATEGY_LOAD_PAYLOAD_KEY);
      const p = JSON.parse(raw);
      if (typeof p?.code === "string" && p.code.trim()) {
        setCode(p.code);
      }
      const name = typeof p?.strategyName === "string" ? p.strategyName.trim() : "";
      const fromStrategyPage = p?.source === "strategy";
      setStrategySource({
        loaded: fromStrategyPage && Boolean(p?.code && String(p.code).trim()),
        name: name || "",
        fromStrategyPage,
      });
    } catch {
      // ignore
    }
  }, []);

  const goPaperTrade = useCallback(() => {
    try {
      sessionStorage.setItem(TRADE_STRATEGY_REMINDER_KEY, code);
    } catch {
      // ignore
    }
    navigate("/trade?from=backtesting");
  }, [code, navigate]);

  const run = useCallback(async () => {
    if (!code.trim()) return;
    setError("");
    setResult(null);
    setLoading(true);
    try {
      const body = { code, ticker: ticker.trim().toUpperCase(), start, end };
      const data = await api.runCodeBacktest(body);
      setResult(data);
      pushBacktestRunHistory({
        ticker: ticker.trim().toUpperCase(),
        btStart: start,
        btEnd: end,
        code,
        metrics: data.metrics ?? null,
        strategyName: `Code backtest (${ticker.trim().toUpperCase()})`,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [code, ticker, start, end]);

  const m = result?.metrics;

  useEffect(() => {
    if (!expandedChart) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") setExpandedChart(null);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [expandedChart]);

  const openExpanded = useCallback((key) => setExpandedChart(key), []);

  const onPlotKeyDown = useCallback(
    (e, key) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        setExpandedChart(key);
      }
    },
    []
  );

  return (
    <div>
      <div className="workflow-banner">
        <span>
          Build strategy on{" "}
          <Link className="workflow-link" to="/strategy">
            Strategy page
          </Link>{" "}
          → Run backtest here → Paper trade on{" "}
          <Link className="workflow-link" to="/trade">
            Trade page
          </Link>
        </span>
      </div>
      <div className="backtest-tabs">
        <button
          type="button"
          className={`backtest-tab ${tab === "backtest" ? "active" : ""}`}
          onClick={() => setTab("backtest")}
        >
          Backtest
        </button>
        <button
          type="button"
          className={`backtest-tab ${tab === "leaderboard" ? "active" : ""}`}
          onClick={() => setTab("leaderboard")}
        >
          Leaderboard
        </button>
      </div>
      {tab === "backtest" ? (
        <div className="space-y-6 md:space-y-8">
          <SectionHeading
            title="Backtesting"
            subtitle="Run tests, inspect results, and view the leaderboard."
            tooltipText="This page is for running backtests and reviewing results. Strategies can be loaded from the Strategy page and edited here before running."
          />

          <div className="backtest-layout">
            <div className="backtest-left">
              <div className="strategy-source-banner">
                {strategySource.loaded && strategySource.fromStrategyPage ? (
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full" style={{ background: "#2d8a55" }} aria-hidden />
                        <p className="m-0 text-[12px] font-medium text-ink">
                          Strategy loaded from Strategy page
                        </p>
                      </div>
                      <p className="m-0 mt-1 truncate font-mono text-[12px] text-muted">
                        {strategySource.name || "Unnamed strategy"}
                      </p>
                    </div>
                    <button type="button" className="strategy-source-link" onClick={() => navigate("/strategy")}>
                      Go to Strategy →
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-3">
                    <p className="m-0 text-[12px] text-muted">
                      No strategy loaded — go to Strategy page to build one.
                    </p>
                    <button type="button" className="strategy-source-link" onClick={() => navigate("/strategy")}>
                      Go to Strategy →
                    </button>
                  </div>
                )}
              </div>

              <div className="cs-card min-w-0 overflow-hidden">
                <div className="cs-card-header pb-2">
                  <CardHeaderTitle title="Strategy Code" />
                </div>
                <div className="min-w-0 border-t border-ink/[0.06] px-4 py-3">
                  <div className="backtest-code-editor">
                    <CodeMirror value={code} height="280px" extensions={[python()]} onChange={setCode} theme="dark" />
                  </div>
                </div>
              </div>

              <div className="cs-card min-w-0 overflow-hidden">
                <div className="cs-card-header pb-2">
                  <CardHeaderTitle title="Run Backtest" />
                </div>
                <div className="min-w-0 border-t border-ink/[0.06] px-4 py-3">
                  <div className="backtest-run-row">
                    <label className="backtest-run-strip-field">
                      <span className="backtest-run-strip-label">Ticker</span>
                      <input className="backtest-run-strip-input" value={ticker} onChange={(e) => setTicker(e.target.value)} />
                    </label>
                    <label className="backtest-run-strip-field">
                      <span className="backtest-run-strip-label">Start</span>
                      <input className="backtest-run-strip-input" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
                    </label>
                    <label className="backtest-run-strip-field">
                      <span className="backtest-run-strip-label">End</span>
                      <input className="backtest-run-strip-input" type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
                    </label>
                  </div>
                  <button type="button" className="backtest-run-btn" disabled={loading || !code.trim()} onClick={() => void run()}>
                    {loading ? "Running…" : "Run Backtest"}
                  </button>
                </div>
              </div>

              <div className="strategy-basket-card">
                <button
                  type="button"
                  className="strategy-basket-toggle"
                  onClick={() => setBasketOpen((v) => !v)}
                  aria-expanded={basketOpen}
                  aria-controls="backtest-basket-panel"
                  id="backtest-basket-toggle"
                >
                  <span className="grid grid-cols-[auto_1fr] items-center gap-2">
                    <span className="h-2 w-2 shrink-0 rounded-[1px] bg-gold shadow-card-sm" aria-hidden />
                    <span className="text-sm font-semibold text-ink">Strategy Basket</span>
                  </span>
                  <span className="font-mono text-sm font-medium text-muted" aria-hidden>
                    {basketOpen ? "−" : "+"}
                  </span>
                </button>
                {basketOpen ? (
                  <div id="backtest-basket-panel" role="region" aria-labelledby="backtest-basket-toggle" className="strategy-basket-panel">
                    <div className="space-y-2">
                      <p className="m-0 text-[10px] font-semibold uppercase tracking-wider text-muted">Built-in templates</p>
                      <div className="backtest-example-pills">
                        {[
                          { key: "ma", title: "Moving Average Crossover" },
                          { key: "rsi", title: "RSI Overbought/Oversold" },
                          { key: "bh", title: "Buy and Hold" },
                        ].map((t) => (
                          <button
                            key={t.key}
                            type="button"
                            className="strategy-pill"
                            onClick={() => {
                              const blocks =
                                t.key === "ma"
                                  ? [
                                      { type: "select_data" },
                                      { type: "sma", params: { period: 20 } },
                                      { type: "sma", params: { period: 50 } },
                                      { type: "if_cross_above" },
                                      { type: "buy", params: { mode: "all_cash" } },
                                      { type: "if_cross_below" },
                                      { type: "sell", params: { mode: "all" } },
                                    ]
                                  : t.key === "rsi"
                                    ? [
                                        { type: "select_data" },
                                        { type: "rsi", params: { period: 14 } },
                                        { type: "if_lt", params: { threshold: 30 } },
                                        { type: "buy", params: { mode: "all_cash" } },
                                        { type: "if_gt", params: { threshold: 70 } },
                                        { type: "sell", params: { mode: "all" } },
                                      ]
                                    : [
                                        { type: "select_data" },
                                        { type: "buy", params: { mode: "all_cash" } },
                                        { type: "hold" },
                                      ];
                              const py = translateVisualBlocksToPython(blocks, { ticker, start, end });
                              setCode(py);
                              setStrategySource({ loaded: false, name: t.title, fromStrategyPage: false });
                            }}
                          >
                            {t.title}
                          </button>
                        ))}
                      </div>
                    </div>

                    {savedStrategies.length > 0 ? (
                      <div className="space-y-2">
                        <p className="m-0 text-[10px] font-semibold uppercase tracking-wider text-muted">Saved strategies</p>
                        <div className="backtest-example-pills">
                          {savedStrategies.map((item) => (
                            <button
                              key={item.id}
                              type="button"
                              className="strategy-pill strategy-pill--saved"
                              onClick={() => {
                                const py = translateVisualBlocksToPython(item.blocks, { ticker, start, end });
                                setCode(py);
                                setStrategySource({ loaded: false, name: item.title, fromStrategyPage: false });
                                setBasketOpen(false);
                              }}
                            >
                              {item.title}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="backtest-right">
              <div className="cs-card overflow-hidden">
                <div className="cs-card-header pb-2">
                  <CardHeaderTitle title="Performance Metrics" />
                </div>
                <div className="backtest-metrics-grid px-4 pb-3">
                  <MetricCard label="Total Return" value={m ? fmtPct(m.total_return_pct) : "—"} />
                  <MetricCard label="Alpha" value={m ? fmtPct(m.alpha_pct) : "—"} />
                  <MetricCard label="Beta" value={m && m.beta != null ? m.beta.toFixed(3) : "—"} />
                  <MetricCard label="Sharpe Ratio" value={m && m.sharpe_ratio != null ? m.sharpe_ratio.toFixed(2) : "—"} />
                  <MetricCard label="Max Drawdown" value={m ? `${Number(m.max_drawdown_pct).toFixed(2)}%` : "—"} />
                  <MetricCard label="Win Rate" value={m && m.win_rate_pct != null ? `${m.win_rate_pct.toFixed(1)}%` : "—"} />
                </div>
              </div>

              {m ? (
                <div className="benchmark-note-bar">
                  <span className="font-mono text-[12px] text-muted">
                    ^AXJO total return: <span className="text-ink">{fmtPct(m.benchmark_total_return_pct)}</span>
                  </span>
                  <span className="font-mono text-[12px] text-muted">
                    Jensen alpha: <span className="text-ink">{fmtPct(m.alpha_pct)}</span>
                  </span>
                </div>
              ) : null}

              <button type="button" className="paper-trade-btn" disabled={!m || !code.trim()} onClick={goPaperTrade}>
                Start paper trading this strategy →
              </button>

              {error ? (
                <div role="alert" className="rounded-card border border-danger/30 bg-danger/[0.06] px-4 py-3 text-sm text-danger">
                  <p className="font-semibold">Backtest failed</p>
                  <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-ink">
                    {error}
                  </pre>
                </div>
              ) : null}

              <div className="backtest-charts-grid">
                <div className="backtest-chart-card-v3">
                  <div className="cs-card-header pb-2">
                    <CardHeaderTitle
                      headingLevel={3}
                      title="Strategy vs ASX 200"
                      tooltipText="Indexed to 100 at the first date — strategy equity vs ^AXJO total return over the same sessions."
                    />
                  </div>
                  <div
                    className="backtest-chart-plot backtest-chart-plot--clickable px-3 pb-2"
                    role="button"
                    tabIndex={0}
                    onClick={() => openExpanded("vs")}
                    onKeyDown={(e) => onPlotKeyDown(e, "vs")}
                    aria-label="Expand chart: Strategy vs ASX 200"
                  >
                    {result?.series?.comparison?.length ? (
                      <BacktestVsBenchmarkChart comparison={result.series.comparison} height={BACKTEST_CHART_PLOT_HEIGHT} chrome="plot" />
                    ) : (
                      <div className="chart-empty">
                        <span className="lb-gold-sq" aria-hidden />
                        <p className="m-0">Run a backtest to see this chart.</p>
                      </div>
                    )}
                  </div>
                </div>
                <div className="backtest-chart-card-v3">
                  <div className="cs-card-header pb-2">
                    <CardHeaderTitle
                      headingLevel={3}
                      title="Price and Signals"
                      tooltipText="Instrument close with buy/sell markers produced by your strategy."
                    />
                  </div>
                  <div
                    className="backtest-chart-plot backtest-chart-plot--clickable px-3 pb-2"
                    role="button"
                    tabIndex={0}
                    onClick={() => openExpanded("signals")}
                    onKeyDown={(e) => onPlotKeyDown(e, "signals")}
                    aria-label="Expand chart: Price and Signals"
                  >
                    {result?.series?.signals?.dates?.length ? (
                      <BacktestSignalsChart signals={result.series.signals} height={BACKTEST_CHART_PLOT_HEIGHT} chrome="plot" />
                    ) : (
                      <div className="chart-empty">
                        <span className="lb-gold-sq" aria-hidden />
                        <p className="m-0">Run a backtest to see this chart.</p>
                      </div>
                    )}
                  </div>
                </div>
                <div className="backtest-chart-card-v3">
                  <div className="cs-card-header pb-2">
                    <CardHeaderTitle
                      headingLevel={3}
                      title="Drawdown"
                      tooltipText="Peak-to-trough decline of the strategy equity curve (%)."
                    />
                  </div>
                  <div
                    className="backtest-chart-plot backtest-chart-plot--clickable px-3 pb-2"
                    role="button"
                    tabIndex={0}
                    onClick={() => openExpanded("drawdown")}
                    onKeyDown={(e) => onPlotKeyDown(e, "drawdown")}
                    aria-label="Expand chart: Drawdown"
                  >
                    {result?.series?.drawdown?.length ? (
                      <BacktestDrawdownChart drawdown={result.series.drawdown} height={BACKTEST_CHART_PLOT_HEIGHT} chrome="plot" />
                    ) : (
                      <div className="chart-empty">
                        <span className="lb-gold-sq" aria-hidden />
                        <p className="m-0">Run a backtest to see this chart.</p>
                      </div>
                    )}
                  </div>
                </div>
                <div className="backtest-chart-card-v3">
                  <div className="cs-card-header pb-2">
                    <CardHeaderTitle
                      headingLevel={3}
                      title="Daily Returns"
                      tooltipText="Per-session strategy return (%). Green positive, red negative."
                    />
                  </div>
                  <div
                    className="backtest-chart-plot backtest-chart-plot--clickable px-3 pb-2"
                    role="button"
                    tabIndex={0}
                    onClick={() => openExpanded("daily")}
                    onKeyDown={(e) => onPlotKeyDown(e, "daily")}
                    aria-label="Expand chart: Daily Returns"
                  >
                    {result?.series?.daily_returns?.length ? (
                      <BacktestDailyReturnsChart daily={result.series.daily_returns} height={BACKTEST_CHART_PLOT_HEIGHT} chrome="plot" />
                    ) : (
                      <div className="chart-empty">
                        <span className="lb-gold-sq" aria-hidden />
                        <p className="m-0">Run a backtest to see this chart.</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <LeaderboardPage />
      )}

      {expandedChart
        ? createPortal(
            <div className="backtest-chart-expand-overlay" role="presentation" onClick={() => setExpandedChart(null)}>
              <div
                className="backtest-chart-expand-dialog backtest-chart-expand-dialog--chart"
                role="dialog"
                aria-modal="true"
                aria-labelledby="backtest-chart-expand-title"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="backtest-chart-expand-header">
                  <h3 id="backtest-chart-expand-title" className="backtest-chart-expand-title">
                    {expandedChart === "vs"
                      ? "Strategy vs ASX 200"
                      : expandedChart === "signals"
                        ? "Price and Signals"
                        : expandedChart === "drawdown"
                          ? "Drawdown"
                          : "Daily Returns"}
                  </h3>
                  <button
                    type="button"
                    className="backtest-chart-expand-close"
                    onClick={() => setExpandedChart(null)}
                    aria-label="Close expanded chart"
                  >
                    ×
                  </button>
                </div>
                <div className="backtest-chart-expand-body">
                  {expandedChart === "vs" ? (
                    result?.series?.comparison?.length ? (
                      <BacktestVsBenchmarkChart comparison={result.series.comparison} height={520} chrome="plot" fillContainer />
                    ) : (
                      <div className="chart-empty chart-empty--expanded">
                        <span className="lb-gold-sq" aria-hidden />
                        <p className="m-0">Run a backtest to see this chart.</p>
                      </div>
                    )
                  ) : null}
                  {expandedChart === "signals" ? (
                    result?.series?.signals?.dates?.length ? (
                      <BacktestSignalsChart signals={result.series.signals} height={520} chrome="plot" fillContainer />
                    ) : (
                      <div className="chart-empty chart-empty--expanded">
                        <span className="lb-gold-sq" aria-hidden />
                        <p className="m-0">Run a backtest to see this chart.</p>
                      </div>
                    )
                  ) : null}
                  {expandedChart === "drawdown" ? (
                    result?.series?.drawdown?.length ? (
                      <BacktestDrawdownChart drawdown={result.series.drawdown} height={520} chrome="plot" fillContainer />
                    ) : (
                      <div className="chart-empty chart-empty--expanded">
                        <span className="lb-gold-sq" aria-hidden />
                        <p className="m-0">Run a backtest to see this chart.</p>
                      </div>
                    )
                  ) : null}
                  {expandedChart === "daily" ? (
                    result?.series?.daily_returns?.length ? (
                      <BacktestDailyReturnsChart daily={result.series.daily_returns} height={520} chrome="plot" fillContainer />
                    ) : (
                      <div className="chart-empty chart-empty--expanded">
                        <span className="lb-gold-sq" aria-hidden />
                        <p className="m-0">Run a backtest to see this chart.</p>
                      </div>
                    )
                  ) : null}
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
