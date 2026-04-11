import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import CodeMirror from "@uiw/react-codemirror";
import { python } from "@codemirror/lang-python";
import { EditorView } from "@codemirror/view";
import SectionHeading from "../components/SectionHeading";
import CardHeaderTitle from "../components/CardHeaderTitle";
import {
  BACKTEST_CHART_PLOT_HEIGHT,
  BacktestVsBenchmarkChart,
  BacktestDailyReturnsChart,
  BacktestDrawdownChart,
  BacktestSignalsChart,
} from "../components/BacktestCharts";
import { api } from "../api/client";
import { EXAMPLES, EXAMPLE_MA_CROSSOVER } from "../data/exampleStrategies";
import CowrieDateRangeBar from "../components/CowrieDateRangeBar";
import { TRADE_STRATEGY_REMINDER_KEY } from "../constants/tradeReminder";
import { loadStrategyBasket, saveStrategyBasket } from "../constants/strategyBasketStorage";

const STRATEGY_BASKET_MAX = 50;

/** @type {Record<"vs" | "signals" | "drawdown" | "daily", string>} */
const EXPAND_TITLES = {
  vs: "Strategy vs ASX 200",
  signals: "Price & signals",
  drawdown: "Drawdown",
  daily: "Daily returns",
};

const GOLD = "#c8963e";
const PROFIT = "#2d8a55";
const DANGER = "#c0392b";

/** 4×4 pixel motif, 6px cells = 24px (gold on canvas / white). */
const PIXEL_GOLD_PATTERN = [
  0, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 0,
];

function PixelGoldSquare() {
  return (
    <div className="backtest-pixel-gold" aria-hidden>
      {PIXEL_GOLD_PATTERN.map((on, i) => (
        <span key={i} className={on ? "on" : ""} />
      ))}
    </div>
  );
}

function AvailableLibrariesBlock() {
  return (
    <div className="backtest-imports-card" aria-label="Available imports (read only)">
      <p
        className="m-0 text-[10px] font-semibold uppercase tracking-[0.06em]"
        style={{ color: GOLD }}
      >
        Read only · Available imports
      </p>
      <div className="mt-2.5 max-h-40 space-y-0.5 overflow-auto font-mono text-[12px] leading-relaxed">
        <p className="m-0">
          <span style={{ color: GOLD }}>import</span> <span style={{ color: "#ffffff" }}>numpy</span>{" "}
          <span style={{ color: "#888888" }}>as</span> <span style={{ color: "#ffffff" }}>np</span>
        </p>
        <p className="m-0">
          <span style={{ color: GOLD }}>import</span> <span style={{ color: "#ffffff" }}>pandas</span>{" "}
          <span style={{ color: "#888888" }}>as</span> <span style={{ color: "#ffffff" }}>pd</span>
        </p>
        <p className="m-0">
          <span style={{ color: GOLD }}>import</span> <span style={{ color: "#ffffff" }}>yfinance</span>{" "}
          <span style={{ color: "#888888" }}>as</span> <span style={{ color: "#ffffff" }}>yf</span>
        </p>
        <p className="m-0">
          <span style={{ color: GOLD }}>from</span> <span style={{ color: "#ffffff" }}>scipy</span>{" "}
          <span style={{ color: GOLD }}>import</span> <span style={{ color: "#ffffff" }}>stats</span>
        </p>
      </div>
      <p className="mt-2.5 border-t border-white/[0.08] pt-2.5 text-[10px] leading-snug" style={{ color: "#666666" }}>
        The sandbox only allows <span style={{ color: "#888888" }}>yfinance</span>,{" "}
        <span style={{ color: "#888888" }}>pandas</span>, <span style={{ color: "#888888" }}>numpy</span>, and{" "}
        <span style={{ color: "#888888" }}>matplotlib</span> — other imports (including scipy) are blocked at run time.
      </p>
    </div>
  );
}

const cowrieEditorTheme = EditorView.theme(
  {
    "&": {
      minHeight: "min(52vh, 520px)",
      backgroundColor: "#ffffff",
      color: "#111111",
    },
    ".cm-scroller": { fontFamily: "JetBrains Mono, ui-monospace, monospace", overflow: "auto" },
    ".cm-content, .cm-gutter": {
      fontSize: "13px",
      lineHeight: "1.5",
    },
    ".cm-gutters": {
      backgroundColor: "#f5f3ef",
      color: "#aaaaaa",
      borderRight: "1px solid rgba(17,17,17,0.06)",
    },
    ".cm-activeLineGutter": { backgroundColor: "rgba(200,150,62,0.1)" },
    ".cm-activeLine": { backgroundColor: "rgba(200,150,62,0.07)" },
    ".cm-cursor": { borderLeftColor: "#c8963e" },
    ".cm-selectionBackground": { backgroundColor: "rgba(200,150,62,0.22)" },
    "&.cm-focused .cm-selectionBackground": { backgroundColor: "rgba(200,150,62,0.28)" },
  },
  { dark: false }
);

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

function defaultRange() {
  const end = new Date();
  const start = new Date();
  start.setFullYear(start.getFullYear() - 2);
  return { start: isoDate(start), end: isoDate(end) };
}

function fmtPct(x, digits = 2) {
  if (x === null || x === undefined) return "—";
  const n = Number(x);
  if (Number.isNaN(n)) return "—";
  return `${n >= 0 ? "+" : ""}${n.toFixed(digits)}%`;
}

/** @param {{ label: string, value: string, hint?: string, valueColor?: string }} props */
function BacktestMetricCard({ label, value, hint, valueColor = "#111111" }) {
  return (
    <div className="backtest-metric-card">
      <div className="grid grid-cols-[auto_1fr] items-center gap-2">
        <span className="h-2 w-2 shrink-0 rounded-[1px] bg-gold shadow-card-sm" aria-hidden />
        <p className="m-0 text-[10px] font-semibold uppercase tracking-wider text-[#bbbbbb]">{label}</p>
      </div>
      <p className="mb-0 mt-2 font-mono text-[20px] font-medium tabular-nums" style={{ color: valueColor }}>
        {value}
      </p>
      {hint ? <p className="mb-0 mt-1 text-[11px] leading-snug text-[#888888]">{hint}</p> : null}
    </div>
  );
}

function metricValueColors(m) {
  const tr = m?.total_return_pct;
  const totalColor =
    tr == null || Number.isNaN(Number(tr)) ? "#111111" : Number(tr) >= 0 ? PROFIT : DANGER;

  const al = m?.alpha_pct;
  const alphaColor =
    al == null || Number.isNaN(Number(al)) ? "#111111" : Number(al) >= 0 ? PROFIT : DANGER;

  const sh = m?.sharpe_ratio;
  let sharpeColor = "#111111";
  if (sh != null && !Number.isNaN(Number(sh))) {
    if (Number(sh) > 1) sharpeColor = PROFIT;
    else if (Number(sh) < 0) sharpeColor = DANGER;
  }

  const wr = m?.win_rate_pct;
  let winColor = "#111111";
  if (wr != null && !Number.isNaN(Number(wr))) {
    if (Number(wr) > 50) winColor = PROFIT;
    else if (Number(wr) < 50) winColor = DANGER;
  }

  return {
    totalColor,
    alphaColor,
    betaColor: "#111111",
    sharpeColor,
    maxDdColor: DANGER,
    winColor,
  };
}

export default function BacktestPage() {
  const navigate = useNavigate();
  const { start: defaultStart, end: defaultEnd } = useMemo(() => defaultRange(), []);
  const [ticker, setTicker] = useState("CBA.AX");
  const [start, setStart] = useState(defaultStart);
  const [end, setEnd] = useState(defaultEnd);
  const [code, setCode] = useState(EXAMPLE_MA_CROSSOVER);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [basketOpen, setBasketOpen] = useState(false);
  /** @type {{ id: string, title: string, code: string, savedAt?: string }[]} */
  const [basketItems, setBasketItems] = useState([]);
  /** @type {null | "vs" | "signals" | "drawdown" | "daily"} */
  const [expandedChart, setExpandedChart] = useState(null);
  const [editorExpanded, setEditorExpanded] = useState(false);
  const [modalPlotHeight, setModalPlotHeight] = useState(520);
  const [codeExpandEditorPx, setCodeExpandEditorPx] = useState(560);

  const extensions = useMemo(() => [python(), cowrieEditorTheme], []);

  useEffect(() => {
    setBasketItems(loadStrategyBasket());
  }, []);

  useEffect(() => {
    if (!expandedChart) return undefined;
    const update = () => {
      setModalPlotHeight(Math.min(Math.max(320, Math.floor(window.innerHeight * 0.62)), 720));
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [expandedChart]);

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

  useEffect(() => {
    if (!editorExpanded) return undefined;
    const update = () => {
      const reserve = 132;
      const cap = Math.min(window.innerHeight * 0.94 - reserve, window.innerHeight - reserve);
      setCodeExpandEditorPx(Math.max(360, Math.floor(cap)));
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [editorExpanded]);

  useEffect(() => {
    if (!editorExpanded) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") setEditorExpanded(false);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [editorExpanded]);

  const openExpand = useCallback((/** @type {"vs" | "signals" | "drawdown" | "daily"} */ id) => {
    return (/** @type {import("react").MouseEvent} */ e) => {
      if (e.target.closest("button")) return;
      setEditorExpanded(false);
      setExpandedChart(id);
    };
  }, []);

  const goPaperTrade = useCallback(() => {
    try {
      sessionStorage.setItem(TRADE_STRATEGY_REMINDER_KEY, code);
    } catch {
      /* quota / private mode */
    }
    navigate("/trade?from=backtest");
  }, [code, navigate]);

  const saveCurrentToBasket = useCallback(() => {
    if (!result) return;
    const defaultName = `Strategy ${basketItems.length + 1}`;
    const title = window.prompt("Name this strategy:", defaultName);
    if (title == null) return;
    const trimmed = title.trim();
    if (!trimmed) return;
    if (basketItems.length >= STRATEGY_BASKET_MAX) {
      window.alert(
        `You can save at most ${STRATEGY_BASKET_MAX} strategies. Remove one from the basket first.`
      );
      return;
    }
    const id =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `st-${Date.now()}`;
    const next = [
      ...basketItems,
      { id, title: trimmed, code, savedAt: new Date().toISOString() },
    ];
    setBasketItems(next);
    saveStrategyBasket(next);
  }, [result, basketItems, code]);

  const removeBasketItem = useCallback((id) => {
    setBasketItems((prev) => {
      const next = prev.filter((x) => x.id !== id);
      saveStrategyBasket(next);
      return next;
    });
  }, []);

  const loadFromBasket = useCallback((item) => {
    setCode(item.code);
    setBasketOpen(false);
  }, []);

  const run = useCallback(async () => {
    setError("");
    setResult(null);
    setLoading(true);
    try {
      const data = await api.runCodeBacktest({
        code,
        ticker: ticker.trim().toUpperCase(),
        start,
        end,
      });
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [code, ticker, start, end]);

  const m = result?.metrics;
  const colors = m ? metricValueColors(m) : null;

  const openCodeEditorExpand = useCallback(() => {
    setExpandedChart(null);
    setEditorExpanded(true);
  }, []);

  return (
    <>
    <div className="space-y-6 md:space-y-8">
      <SectionHeading
        title="Backtesting"
        subtitle="Paste Python, run against yfinance EOD data; benchmark is ASX 200 (^AXJO). Imports limited to yfinance, pandas, numpy, matplotlib — execution is isolated in a worker process."
        tooltipText="Define run(data) returning a dict with dates, equity (normalised curve starting near 1.0), optional trades and close_prices. The server validates imports, runs your code in a sandboxed subprocess with a timeout, and returns metrics plus chart series."
      />

      <div className="backtest-page">
        <div className="backtest-left">
          <div className="cs-card overflow-hidden">
            <div className="cs-card-header pb-2">
              <CardHeaderTitle
                title="Strategy code"
                tooltipText="Only import yfinance, pandas, numpy, or matplotlib. pd, np, yf, plt are pre-injected — you may still import those modules explicitly if you prefer."
                subtitle="Must define run(data) with keys symbol, price, benchmark (^AXJO) on data."
              />
            </div>
            <div className="space-y-3 border-t border-ink/[0.06] px-2 pb-2 pt-3">
              <AvailableLibrariesBlock />
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  className="rounded-lg border border-ink/[0.12] bg-white px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted shadow-card-sm transition-colors hover:border-gold/40 hover:text-ink"
                  onClick={openCodeEditorExpand}
                  aria-haspopup="dialog"
                  aria-expanded={editorExpanded}
                >
                  Expand editor
                </button>
              </div>
              <CodeMirror
                value={code}
                height="min(52vh, 520px)"
                theme="none"
                extensions={extensions}
                onChange={setCode}
                basicSetup={{ lineNumbers: true, highlightActiveLine: true, foldGutter: false }}
                className="overflow-hidden rounded-lg border border-ink/[0.08] text-left shadow-card-sm"
              />
            </div>
          </div>

          <div className="overflow-hidden rounded-[12px] border border-[#ede9e3] bg-white shadow-card-sm">
            <button
              type="button"
              className="grid w-full grid-cols-[1fr_auto] items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-black/[0.02]"
              onClick={() => setBasketOpen((v) => !v)}
              aria-expanded={basketOpen}
              aria-controls="backtest-strategy-basket-panel"
              id="backtest-strategy-basket-toggle"
            >
              <span className="grid grid-cols-[auto_1fr] items-center gap-2">
                <span className="h-2 w-2 shrink-0 rounded-[1px] bg-gold shadow-card-sm" aria-hidden />
                <span className="text-sm font-semibold text-ink">Strategy Basket</span>
              </span>
              <span className="font-mono text-sm font-medium text-muted" aria-hidden>
                {basketOpen ? "−" : "+"}
              </span>
            </button>
            {basketOpen && (
              <div
                id="backtest-strategy-basket-panel"
                role="region"
                aria-labelledby="backtest-strategy-basket-toggle"
                className="space-y-4 border-t border-ink/[0.06] bg-[#faf9f7] px-4 py-3"
              >
                {result ? (
                  <div className="space-y-2">
                    <p className="m-0 text-[10px] font-semibold uppercase tracking-wider text-muted">
                      After a successful run
                    </p>
                    <button
                      type="button"
                      className="rounded-lg border border-gold/40 bg-white px-3 py-2 text-left text-sm font-semibold text-ink shadow-sm transition-colors hover:border-gold/60 hover:bg-[#fffefb]"
                      onClick={saveCurrentToBasket}
                    >
                      Save current code to basket…
                    </button>
                  </div>
                ) : (
                  <p className="m-0 text-[11px] leading-snug text-muted">
                    Run a backtest successfully, then you can save the editor code here with a custom name.
                  </p>
                )}
                <div className="space-y-2">
                  <p className="m-0 text-[10px] font-semibold uppercase tracking-wider text-muted">
                    Built-in templates
                  </p>
                  <div className="backtest-example-pills">
                    {EXAMPLES.map((ex) => (
                      <button
                        key={ex.id}
                        type="button"
                        className="rounded-full border border-[#ede9e3] bg-white px-4 py-2 text-left text-sm font-medium text-black shadow-sm transition-colors hover:border-gold/45 hover:bg-white"
                        onClick={() => {
                          setCode(ex.code);
                          setBasketOpen(false);
                        }}
                      >
                        {ex.title}
                      </button>
                    ))}
                  </div>
                </div>
                {basketItems.length > 0 ? (
                  <div className="space-y-2">
                    <p className="m-0 text-[10px] font-semibold uppercase tracking-wider text-muted">
                      Your basket
                    </p>
                    <div className="backtest-example-pills">
                      {basketItems.map((item) => (
                        <div
                          key={item.id}
                          className="flex min-w-0 items-stretch overflow-hidden rounded-full border border-[#ede9e3] bg-white shadow-sm transition-colors hover:border-gold/45"
                        >
                          <button
                            type="button"
                            className="min-w-0 flex-1 truncate px-3 py-2 text-left text-sm font-medium text-black transition-colors hover:bg-white"
                            onClick={() => loadFromBasket(item)}
                          >
                            {item.title}
                          </button>
                          <button
                            type="button"
                            className="shrink-0 border-l border-[#ede9e3] px-2.5 text-base font-medium leading-none text-muted transition-colors hover:bg-black/[0.03] hover:text-ink"
                            aria-label={`Remove ${item.title} from basket`}
                            onClick={(e) => {
                              e.stopPropagation();
                              removeBasketItem(item.id);
                            }}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </div>

          <CowrieDateRangeBar
            variant="inline"
            start={start}
            end={end}
            onStartChange={setStart}
            onEndChange={setEnd}
            before={
              <label className="block min-w-[8rem] flex-1 sm:max-w-[14rem]">
                <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted">Ticker</span>
                <input
                  className="w-full rounded-lg border border-ink/[0.12] bg-white px-3 py-2 font-mono text-sm text-ink shadow-card-sm outline-none focus:ring-2 focus:ring-gold/30"
                  value={ticker}
                  onChange={(e) => setTicker(e.target.value)}
                  spellCheck={false}
                />
              </label>
            }
          />

          <button
            type="button"
            className="cs-btn-buy w-full py-3 font-semibold disabled:cursor-not-allowed disabled:opacity-60"
            onClick={() => void run()}
            disabled={loading || !code.trim()}
          >
            {loading ? "Running backtest…" : "Run Backtest"}
          </button>

          {error ? (
            <div
              role="alert"
              className="rounded-card border border-danger/30 bg-danger/[0.06] px-4 py-3 text-sm text-danger"
            >
              <p className="font-semibold">Backtest failed</p>
              <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-ink">
                {error}
              </pre>
            </div>
          ) : null}
        </div>

        <div className="backtest-right">
          {!result && !loading && !error && (
            <div className="backtest-empty-panel">
              <PixelGoldSquare />
              <h2 className="m-0 text-base font-medium text-ink">Run your first backtest</h2>
              <p className="mt-2 max-w-sm text-[13px] leading-relaxed text-[#888888]">
                Paste your strategy code on the left, set a ticker and date range, then click Run Backtest to see
                performance metrics and charts here.
              </p>
            </div>
          )}

          {loading && (
            <div className="backtest-loading-panel cs-card">
              <p className="m-0 font-mono text-sm font-semibold text-ink">Running sandboxed Python…</p>
              <p className="m-0 text-xs text-muted">Fetching yfinance data and executing your strategy in an isolated worker.</p>
            </div>
          )}

          {result && m && colors && (
            <>
              <div className="cs-card overflow-hidden">
                <div className="cs-card-header pb-2">
                  <CardHeaderTitle
                    title="Performance metrics"
                    tooltipText="Alpha is total strategy return minus ^AXJO buy-and-hold over the same dates. Beta uses covariance of daily strategy vs benchmark returns. Sharpe uses daily strategy returns (annualised)."
                  />
                </div>
                <div className="backtest-metrics-grid px-4 pb-3">
                  <BacktestMetricCard
                    label="Total return %"
                    value={fmtPct(m.total_return_pct)}
                    hint="Strategy over window"
                    valueColor={colors.totalColor}
                  />
                  <BacktestMetricCard
                    label="Alpha"
                    value={fmtPct(m.alpha_pct)}
                    hint="Excess vs ^AXJO total return"
                    valueColor={colors.alphaColor}
                  />
                  <BacktestMetricCard
                    label="Beta"
                    value={m.beta != null ? m.beta.toFixed(3) : "—"}
                    hint="Vs ^AXJO daily returns"
                    valueColor={colors.betaColor}
                  />
                  <BacktestMetricCard
                    label="Sharpe ratio"
                    value={m.sharpe_ratio != null ? m.sharpe_ratio.toFixed(2) : "—"}
                    hint="Daily returns, annualised"
                    valueColor={colors.sharpeColor}
                  />
                  <BacktestMetricCard
                    label="Max drawdown %"
                    value={`${Number(m.max_drawdown_pct).toFixed(2)}%`}
                    hint="Peak to trough on equity"
                    valueColor={colors.maxDdColor}
                  />
                  <BacktestMetricCard
                    label="Win rate"
                    value={m.win_rate_pct != null ? `${m.win_rate_pct.toFixed(1)}%` : "—"}
                    hint="Closed round-trips from trades"
                    valueColor={colors.winColor}
                  />
                </div>
                <div className="border-t border-ink/[0.06] px-4 py-2.5">
                  <p className="m-0 text-[11px] text-[#888888]">
                    Number of trades{" "}
                    <span className="font-mono font-medium tabular-nums text-ink">{String(m.trade_count)}</span>
                  </p>
                </div>
                <div className="space-y-3 border-t border-ink/[0.06] px-4 pb-4 pt-3">
                  <div className="backtest-benchmark-strip">
                    <span>^AXJO total return: {fmtPct(m.benchmark_total_return_pct)}</span>
                    {m.jensen_alpha_ann_pct != null ? (
                      <span>Jensen alpha (ann.): {fmtPct(m.jensen_alpha_ann_pct, 2)}</span>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    className="cs-btn-buy w-full border-l-[3px] border-solid border-l-[#c8963e] py-2.5 text-sm font-semibold"
                    onClick={goPaperTrade}
                  >
                    Start paper trading this strategy
                  </button>
                  <p className="m-0 text-center text-[10px] text-muted">
                    Opens Trade with your strategy code as a reminder — paper orders only.
                  </p>
                </div>
              </div>

              <div className="backtest-charts">
                <div
                  className="backtest-chart-cell backtest-chart-cell--expandable"
                  title="Click to expand"
                  onClick={openExpand("vs")}
                >
                  <BacktestVsBenchmarkChart
                    comparison={result.series?.comparison}
                    height={BACKTEST_CHART_PLOT_HEIGHT}
                  />
                </div>
                <div
                  className="backtest-chart-cell backtest-chart-cell--expandable"
                  title="Click to expand"
                  onClick={openExpand("signals")}
                >
                  <BacktestSignalsChart signals={result.series?.signals} height={BACKTEST_CHART_PLOT_HEIGHT} />
                </div>
                <div
                  className="backtest-chart-cell backtest-chart-cell--expandable"
                  title="Click to expand"
                  onClick={openExpand("drawdown")}
                >
                  <BacktestDrawdownChart
                    drawdown={result.series?.drawdown}
                    height={BACKTEST_CHART_PLOT_HEIGHT}
                  />
                </div>
                <div
                  className="backtest-chart-cell backtest-chart-cell--expandable"
                  title="Click to expand"
                  onClick={openExpand("daily")}
                >
                  <BacktestDailyReturnsChart
                    daily={result.series?.daily_returns}
                    height={BACKTEST_CHART_PLOT_HEIGHT}
                  />
                </div>
              </div>

              {expandedChart &&
                createPortal(
                  <div
                    className="backtest-chart-expand-overlay"
                    role="presentation"
                    onClick={() => setExpandedChart(null)}
                  >
                    <div
                      className="backtest-chart-expand-dialog"
                      role="dialog"
                      aria-modal="true"
                      aria-labelledby="backtest-expand-title"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="backtest-chart-expand-header">
                        <h3 id="backtest-expand-title" className="backtest-chart-expand-title">
                          {EXPAND_TITLES[expandedChart]}
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
                      <div className="backtest-chart-expand-body" style={{ height: modalPlotHeight }}>
                        {expandedChart === "vs" ? (
                          <BacktestVsBenchmarkChart
                            comparison={result.series?.comparison}
                            height={modalPlotHeight}
                            chrome="plot"
                          />
                        ) : null}
                        {expandedChart === "signals" ? (
                          <BacktestSignalsChart
                            signals={result.series?.signals}
                            height={modalPlotHeight}
                            chrome="plot"
                          />
                        ) : null}
                        {expandedChart === "drawdown" ? (
                          <BacktestDrawdownChart
                            drawdown={result.series?.drawdown}
                            height={modalPlotHeight}
                            chrome="plot"
                          />
                        ) : null}
                        {expandedChart === "daily" ? (
                          <BacktestDailyReturnsChart
                            daily={result.series?.daily_returns}
                            height={modalPlotHeight}
                            chrome="plot"
                          />
                        ) : null}
                      </div>
                    </div>
                  </div>,
                  document.body
                )}
            </>
          )}
        </div>
      </div>
    </div>

    {editorExpanded &&
      createPortal(
        <div
          className="backtest-chart-expand-overlay"
          role="presentation"
          onClick={() => setEditorExpanded(false)}
        >
          <div
            className="backtest-chart-expand-dialog backtest-code-expand-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="backtest-code-expand-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="backtest-chart-expand-header">
              <h3 id="backtest-code-expand-title" className="backtest-chart-expand-title">
                Strategy code
              </h3>
              <button
                type="button"
                className="backtest-chart-expand-close"
                onClick={() => setEditorExpanded(false)}
                aria-label="Close expanded editor"
              >
                ×
              </button>
            </div>
            <div className="backtest-code-expand-body">
              <CodeMirror
                value={code}
                height={`${codeExpandEditorPx}px`}
                theme="none"
                extensions={extensions}
                onChange={setCode}
                basicSetup={{ lineNumbers: true, highlightActiveLine: true, foldGutter: false }}
                className="overflow-hidden rounded-lg border border-ink/[0.08] text-left shadow-card-sm"
              />
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
