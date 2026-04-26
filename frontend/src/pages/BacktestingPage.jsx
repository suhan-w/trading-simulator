import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
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
import { cowrieEditorTheme } from "../constants/cowrieCodeMirrorTheme";
import { STRATEGY_LOAD_PAYLOAD_KEY } from "../constants/strategyLoadPayload";
import { TRADE_STRATEGY_REMINDER_KEY } from "../constants/tradeReminder";
import { pushBacktestRunHistory } from "../constants/backtestRunHistoryStorage";
import { loadVisualStrategies, saveVisualStrategies } from "../constants/visualStrategyStorage";
import { loadStrategyBasket, saveStrategyBasket } from "../constants/strategyBasketStorage";
import { translateRulesToPython, translateVisualBlocksToPython } from "../utils/strategyBuilderTranslate";
import { randomId } from "../utils/randomId";
import { makeTemplateSimpleRules, templateTitle } from "../constants/strategyTemplates";

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

function normalizeCodeText(s) {
  return String(s || "").replace(/\r\n/g, "\n").trim();
}

function MetricCard({ label, value, hint }) {
  return (
    <div className="backtest-metric-card">
      <p className="m-0 text-[10px] font-semibold uppercase tracking-wider text-[#bbbbbb]">{label}</p>
      <p className="mb-0 mt-2 font-mono text-[20px] font-medium tabular-nums text-ink">{value}</p>
      {hint ? <p className="mb-0 mt-1 text-[11px] leading-snug text-[#888888]">{hint}</p> : null}
    </div>
  );
}

export default function BacktestingPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [tab, setTab] = useState("backtest");
  const { start: defaultStart, end: defaultEnd } = useMemo(() => defaultRange(), []);
  const [ticker, setTicker] = useState("CBA.AX");
  const [start, setStart] = useState(defaultStart);
  const [end, setEnd] = useState(defaultEnd);
  const [code, setCode] = useState("");
  const [strategySource, setStrategySource] = useState({ loaded: false, name: "", fromStrategyPage: false });
  const [basketOpen, setBasketOpen] = useState(true);
  const [savedStrategies, setSavedStrategies] = useState(() => loadVisualStrategies());
  const [savedCodeStrategies, setSavedCodeStrategies] = useState(() => loadStrategyBasket());
  const [selectedSavedCode, setSelectedSavedCode] = useState(null);
  const [selectedSavedVisual, setSelectedSavedVisual] = useState(null);
  const [saveCodeDraftName, setSaveCodeDraftName] = useState("");
  const [saveCodeFeedback, setSaveCodeFeedback] = useState("");
  /** When set, the next CodeMirror onChange with this normalized text is a sync, not a user edit. */
  const programmaticCodeRef = useRef(null);
  /** @type {[null | "vs" | "signals" | "drawdown" | "daily", (v: null | "vs" | "signals" | "drawdown" | "daily") => void]} */
  const [expandedChart, setExpandedChart] = useState(null);
  const [expandedCode, setExpandedCode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  useEffect(() => {
    const qp = new URLSearchParams(location.search);
    const requested = qp.get("tab");
    if (requested === "backtest" || requested === "leaderboard") {
      setTab(requested);
    }
  }, [location.search]);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STRATEGY_LOAD_PAYLOAD_KEY);
      if (!raw) return;
      sessionStorage.removeItem(STRATEGY_LOAD_PAYLOAD_KEY);
      const p = JSON.parse(raw);
      const name = typeof p?.strategyName === "string" ? p.strategyName.trim() : "";
      if (typeof p?.code === "string" && p.code.trim()) {
        programmaticCodeRef.current = normalizeCodeText(p.code);
        setCode(p.code);
        setSelectedSavedCode(null);
        setSelectedSavedVisual(null);
        if (name) {
          setSaveCodeDraftName(name);
        }
      } else if (name) {
        setSaveCodeDraftName(name);
      }
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
      const normalized = normalizeCodeText(code);
      let visual_json = null;
      const savedCodeMatch = selectedSavedCode?.id
        ? savedCodeStrategies.find((x) => x.id === selectedSavedCode.id) || null
        : savedCodeStrategies.find((x) => normalizeCodeText(x.code) === normalized) || null;
      if (savedCodeMatch) {
        const nameForRun =
          selectedSavedCode?.id === savedCodeMatch.id && saveCodeDraftName.trim()
            ? saveCodeDraftName.trim()
            : savedCodeMatch.title;
        visual_json = JSON.stringify({
          source: "saved_code_basket",
          id: savedCodeMatch.id,
          name: nameForRun,
        });
      } else if (selectedSavedVisual?.id) {
        visual_json = JSON.stringify({
          source: "saved_visual_basket",
          id: selectedSavedVisual.id,
          name: selectedSavedVisual.title,
        });
      }
      const body = { code, ticker: ticker.trim().toUpperCase(), start, end, visual_json };
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
  }, [code, ticker, start, end, savedCodeStrategies, saveCodeDraftName, selectedSavedCode, selectedSavedVisual]);

  const handleEditorCodeChange = useCallback((value) => {
    if (programmaticCodeRef.current !== null && normalizeCodeText(value) === programmaticCodeRef.current) {
      setCode(value);
      programmaticCodeRef.current = null;
      return;
    }
    setCode(value);
    setSelectedSavedCode(null);
    setSelectedSavedVisual(null);
  }, []);

  const m = result?.metrics;
  const canSaveCodeToBasket = Boolean(result && code.trim());

  const saveCurrentCodeToBasket = useCallback(() => {
    if (!canSaveCodeToBasket) return;
    const normalizedCode = normalizeCodeText(code);
    const duplicateByCode = savedCodeStrategies.some((x) => normalizeCodeText(x.code) === normalizedCode);
    if (duplicateByCode) {
      setSaveCodeFeedback("This strategy code is already saved.");
      return;
    }
    const requestedTitle = saveCodeDraftName.trim();
    if (!requestedTitle) {
      setSaveCodeFeedback("Please enter a strategy name.");
      return;
    }
    setSavedCodeStrategies((prev) => {
      const existingTitles = new Set(prev.map((x) => (x.title || "").toLowerCase()));
      let title = requestedTitle;
      let suffix = 2;
      while (existingTitles.has(title.toLowerCase())) {
        title = `${requestedTitle} (${suffix})`;
        suffix += 1;
      }
      const newItem = { id: randomId(), title, code: normalizedCode, savedAt: new Date().toISOString() };
      const next = [newItem, ...prev].slice(0, 30);
      setSelectedSavedCode({ id: newItem.id, title: newItem.title });
      setSelectedSavedVisual(null);
      saveStrategyBasket(next);
      return next;
    });
    setSaveCodeFeedback("Saved to Strategy Basket.");
    setSaveCodeDraftName("");
  }, [canSaveCodeToBasket, code, saveCodeDraftName, savedCodeStrategies]);

  const removeSavedCodeStrategy = useCallback((id) => {
    setSavedCodeStrategies((prev) => {
      const next = prev.filter((x) => x.id !== id);
      saveStrategyBasket(next);
      return next;
    });
    setSelectedSavedCode((s) => {
      if (s?.id === id) {
        queueMicrotask(() => setSaveCodeDraftName(""));
      }
      return s?.id === id ? null : s;
    });
    setSaveCodeFeedback("Removed from Strategy Basket.");
  }, []);

  const loadSavedCodeStrategyFromBasket = useCallback((item) => {
    programmaticCodeRef.current = normalizeCodeText(item.code);
    setCode(item.code);
    setSelectedSavedCode({ id: item.id, title: (item.title || "").trim() });
    setSaveCodeDraftName((item.title || "").trim());
    setSelectedSavedVisual(null);
    setStrategySource({ loaded: false, name: (item.title || "").trim(), fromStrategyPage: false });
    setBasketOpen(false);
  }, []);

  const onStrategyNameFieldBlur = useCallback(() => {
    if (!selectedSavedCode?.id) return;
    const id = selectedSavedCode.id;
    const t = saveCodeDraftName.trim();
    if (!t) {
      setSavedCodeStrategies((prev) => {
        const item = prev.find((x) => x.id === id);
        if (item) {
          queueMicrotask(() => setSaveCodeDraftName(item.title));
        }
        return prev;
      });
      setSaveCodeFeedback("Name cannot be empty.");
      return;
    }
    setSavedCodeStrategies((prev) => {
      const otherTaken = prev
        .filter((x) => x.id !== id)
        .some((x) => (x.title || "").trim().toLowerCase() === t.toLowerCase());
      if (otherTaken) {
        const item = prev.find((x) => x.id === id);
        queueMicrotask(() => {
          setSaveCodeDraftName(item?.title || "");
          setSaveCodeFeedback("A strategy with that name already exists.");
        });
        return prev;
      }
      const before = (prev.find((x) => x.id === id)?.title || "").trim();
      if (before === t) {
        return prev;
      }
      const next = prev.map((x) => (x.id === id ? { ...x, title: t } : x));
      saveStrategyBasket(next);
      queueMicrotask(() => {
        setSelectedSavedCode((s) => (s?.id === id ? { ...s, title: t } : s));
        setSaveCodeFeedback("Name updated.");
      });
      return next;
    });
  }, [selectedSavedCode, saveCodeDraftName]);

  const removeSavedVisualStrategy = useCallback((id) => {
    setSavedStrategies((prev) => {
      const next = prev.filter((x) => x.id !== id);
      saveVisualStrategies(next);
      return next;
    });
    setSaveCodeFeedback("Removed from saved strategies.");
  }, []);

  useEffect(() => {
    if (!saveCodeFeedback) return undefined;
    const t = setTimeout(() => setSaveCodeFeedback(""), 2000);
    return () => clearTimeout(t);
  }, [saveCodeFeedback]);

  useEffect(() => {
    if (!expandedChart && !expandedCode) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") {
        setExpandedChart(null);
        setExpandedCode(false);
      }
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [expandedChart, expandedCode]);

  const expandedCodeMirrorExtensions = useMemo(() => [python(), cowrieEditorTheme], []);

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
      <div className="backtest-page-header-row">
        <SectionHeading
          title="Backtesting"
          subtitle="Run tests, inspect results, and view the leaderboard."
          tooltipText="This page is for running backtests and reviewing results. Strategies can be loaded from the Strategy page and edited here before running."
          className="backtest-page-heading"
        />
        <div className="backtest-tabs backtest-tabs--header">
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
      </div>
      {tab === "backtest" ? (
        <div className="space-y-6 md:space-y-8">
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
                  <div className="flex w-full items-center justify-between gap-3">
                    <CardHeaderTitle title="Strategy Code" />
                    <button type="button" className="backtest-expand-btn" onClick={() => setExpandedCode(true)}>
                      Expand
                    </button>
                  </div>
                </div>
                <div className="min-w-0 border-t border-ink/[0.06] px-4 py-3">
                  <div className="backtest-code-editor">
                    <CodeMirror value={code} height="280px" extensions={[python()]} onChange={handleEditorCodeChange} theme="dark" />
                  </div>
                  <p className="mb-0 mt-2 text-[11px] text-muted">Paste or type your own Python `run(data)` strategy code here.</p>
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
                  <p className="mb-0 mt-2 text-[11px] text-muted">
                    Loading market data and running the strategy can take up to about a minute. If it stops with an error, try a
                    shorter date range.
                  </p>
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
                  title={
                    import.meta.env.VITE_COWRIE_BUNDLE
                      ? `Strategy Basket · build ${import.meta.env.VITE_COWRIE_BUNDLE}`
                      : "Strategy Basket"
                  }
                >
                  <span className="text-sm font-semibold text-ink">Strategy Basket</span>
                  <span className="font-mono text-sm font-medium text-muted" aria-hidden>
                    {basketOpen ? "−" : "+"}
                  </span>
                </button>
                {basketOpen ? (
                  <div id="backtest-basket-panel" role="region" aria-labelledby="backtest-basket-toggle" className="strategy-basket-panel">
                    {savedCodeStrategies.length > 0 ? (
                      <div className="space-y-2">
                        <p className="m-0 text-[10px] font-semibold uppercase tracking-wider text-muted">Saved code strategies</p>
                        <p className="m-0 text-[11px] text-muted">
                          <span className="font-semibold text-ink">Click a name</span> to open a strategy. Rename it only in{" "}
                          <span className="font-semibold text-ink">Strategy name</span> below.
                        </p>
                        {import.meta.env.VITE_COWRIE_BUNDLE ? (
                          <p className="m-0 text-[9px] font-mono text-muted/70" title="If the Load button still appears, the browser is not running this build — rebuild web and hard-refresh.">
                            This build: {import.meta.env.VITE_COWRIE_BUNDLE}
                          </p>
                        ) : null}
                        <div className="flex flex-col gap-2">
                          {savedCodeStrategies.map((item) => (
                            <div key={item.id} className="flex min-w-0 items-center gap-2">
                              <button
                                type="button"
                                data-saved-list-name-control="load"
                                className="min-w-0 flex-1 cursor-pointer rounded-md border border-ink/[0.12] bg-card/80 px-3 py-1.5 text-left text-[13px] text-ink outline-none transition-colors hover:border-ink/30 hover:bg-card"
                                onClick={() => loadSavedCodeStrategyFromBasket(item)}
                                title="Open this strategy in the editor"
                                aria-label={`Open strategy ${item.title}`}
                              >
                                <span className="block truncate">{item.title}</span>
                              </button>
                              <button
                                type="button"
                                aria-label={`Remove saved strategy ${item.title}`}
                                className="h-7 w-7 flex-shrink-0 rounded-full border border-ink/[0.16] bg-card text-[12px] leading-none text-muted hover:border-danger/40 hover:text-danger"
                                onClick={() => removeSavedCodeStrategy(item.id)}
                              >
                                ×
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    <div
                      className={
                        savedCodeStrategies.length > 0 ? "space-y-2 border-t border-ink/[0.06] pt-3 mt-2" : "space-y-2"
                      }
                    >
                      <p className="m-0 text-[10px] font-semibold uppercase tracking-wider text-muted">Strategy name</p>
                      <label className="block">
                        <span className="mb-1 block text-[11px] font-medium text-muted">
                          Set the name for the next save, or edit the name of the strategy you opened from the list above.
                        </span>
                        <input
                          type="text"
                          value={saveCodeDraftName}
                          onChange={(e) => setSaveCodeDraftName(e.target.value)}
                          onBlur={onStrategyNameFieldBlur}
                          className="w-full rounded-md border border-ink/[0.16] bg-card px-3 py-2 text-[13px] text-ink outline-none focus:border-ink/50"
                          placeholder="Enter strategy name"
                        />
                      </label>
                      <div className="backtest-example-pills">
                        <button
                          type="button"
                          className="strategy-pill strategy-pill--saved"
                          onClick={saveCurrentCodeToBasket}
                          disabled={!canSaveCodeToBasket}
                          title={canSaveCodeToBasket ? "Save tested code into Strategy Basket" : "Run a successful backtest first"}
                        >
                          {canSaveCodeToBasket ? "Save current code to basket" : "Run successful backtest to save"}
                        </button>
                      </div>
                      {saveCodeFeedback ? <p className="m-0 text-[11px] text-[#2d8a55]">{saveCodeFeedback}</p> : null}
                    </div>

                    <div className="space-y-2">
                      <p className="m-0 text-[10px] font-semibold uppercase tracking-wider text-muted">Built-in templates</p>
                      <div className="backtest-example-pills">
                        {["ma", "rsi", "bh"].map((key) => (
                          <button
                            key={key}
                            type="button"
                            className="strategy-pill"
                            onClick={() => {
                              const simpleRules = makeTemplateSimpleRules(key);
                              const py = translateRulesToPython(simpleRules, [], "simple", { ticker, start, end });
                              programmaticCodeRef.current = normalizeCodeText(py);
                              setCode(py);
                              setSelectedSavedCode(null);
                              setSelectedSavedVisual(null);
                              setStrategySource({ loaded: false, name: templateTitle(key), fromStrategyPage: false });
                            }}
                          >
                            {templateTitle(key)}
                          </button>
                        ))}
                      </div>
                    </div>

                    {savedStrategies.length > 0 ? (
                      <div className="space-y-2">
                        <p className="m-0 text-[10px] font-semibold uppercase tracking-wider text-muted">Saved strategies</p>
                        <div className="backtest-example-pills">
                          {savedStrategies.map((item) => (
                            <div key={item.id} className="flex items-center gap-2">
                              <button
                                type="button"
                                className="strategy-pill strategy-pill--saved"
                                onClick={() => {
                                  const py = translateVisualBlocksToPython(item.blocks, { ticker, start, end });
                                  programmaticCodeRef.current = normalizeCodeText(py);
                                  setCode(py);
                                  setSelectedSavedCode(null);
                                  setSelectedSavedVisual({ id: item.id, title: item.title });
                                  setStrategySource({ loaded: false, name: item.title, fromStrategyPage: false });
                                  setBasketOpen(false);
                                }}
                              >
                                {item.title}
                              </button>
                              <button
                                type="button"
                                aria-label={`Remove saved strategy ${item.title}`}
                                className="h-7 w-7 rounded-full border border-ink/[0.16] bg-card text-[12px] leading-none text-muted hover:border-danger/40 hover:text-danger"
                                onClick={() => removeSavedVisualStrategy(item.id)}
                              >
                                ×
                              </button>
                            </div>
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
                        <p className="m-0">Run a backtest to see this chart.</p>
                      </div>
                    )
                  ) : null}
                  {expandedChart === "signals" ? (
                    result?.series?.signals?.dates?.length ? (
                      <BacktestSignalsChart signals={result.series.signals} height={520} chrome="plot" fillContainer />
                    ) : (
                      <div className="chart-empty chart-empty--expanded">
                        <p className="m-0">Run a backtest to see this chart.</p>
                      </div>
                    )
                  ) : null}
                  {expandedChart === "drawdown" ? (
                    result?.series?.drawdown?.length ? (
                      <BacktestDrawdownChart drawdown={result.series.drawdown} height={520} chrome="plot" fillContainer />
                    ) : (
                      <div className="chart-empty chart-empty--expanded">
                        <p className="m-0">Run a backtest to see this chart.</p>
                      </div>
                    )
                  ) : null}
                  {expandedChart === "daily" ? (
                    result?.series?.daily_returns?.length ? (
                      <BacktestDailyReturnsChart daily={result.series.daily_returns} height={520} chrome="plot" fillContainer />
                    ) : (
                      <div className="chart-empty chart-empty--expanded">
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
      {expandedCode
        ? createPortal(
            <div className="backtest-chart-expand-overlay" role="presentation" onClick={() => setExpandedCode(false)}>
              <div
                className="backtest-chart-expand-dialog backtest-code-expand-dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby="backtest-code-expand-title"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="backtest-chart-expand-header">
                  <h3 id="backtest-code-expand-title" className="backtest-chart-expand-title">
                    Strategy Code
                  </h3>
                  <button
                    type="button"
                    className="backtest-chart-expand-close"
                    onClick={() => setExpandedCode(false)}
                    aria-label="Close expanded code editor"
                  >
                    ×
                  </button>
                </div>
                <div className="backtest-chart-expand-body">
                  <CodeMirror
                    value={code}
                    height="min(82vh, 820px)"
                    extensions={expandedCodeMirrorExtensions}
                    onChange={handleEditorCodeChange}
                    theme="none"
                    basicSetup={{ lineNumbers: true, highlightActiveLine: true, foldGutter: false }}
                    className="overflow-hidden rounded-lg border border-ink/[0.08] text-left shadow-card-sm"
                  />
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
