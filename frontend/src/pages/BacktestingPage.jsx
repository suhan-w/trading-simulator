import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
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
import ShareLeaderboardBanner from "../components/ShareLeaderboardBanner";
import { api } from "../api/client";
import LeaderboardPage from "./LeaderboardPage";
import { STRATEGY_LOAD_PAYLOAD_KEY } from "../constants/strategyLoadPayload";
import { TRADE_STRATEGY_REMINDER_KEY } from "../constants/tradeReminder";
import { PERF_REPORT_STRATEGY_DRAFT_KEY } from "../constants/perfReportDraft";
import { pushBacktestRunHistory } from "../constants/backtestRunHistoryStorage";

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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [leaderboardEntryId, setLeaderboardEntryId] = useState(null);
  const [sharePublic, setSharePublic] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STRATEGY_LOAD_PAYLOAD_KEY);
      if (!raw) return;
      const p = JSON.parse(raw);
      if (typeof p?.code === "string" && p.code.trim()) {
        setCode(p.code);
      }
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

  const goPerformanceWithBacktestContext = useCallback(() => {
    try {
      sessionStorage.setItem(
        PERF_REPORT_STRATEGY_DRAFT_KEY,
        JSON.stringify({
          strategy_title: `Sandbox backtest (${ticker.trim() || "ticker"})`,
          strategy_notes: `Historical window ${start} -> ${end}.`,
        })
      );
    } catch {
      // ignore
    }
    navigate("/performance");
  }, [ticker, start, end, navigate]);

  const run = useCallback(async () => {
    if (!code.trim()) return;
    setError("");
    setResult(null);
    setLoading(true);
    setLeaderboardEntryId(null);
    setSharePublic(false);
    try {
      const body = { code, ticker: ticker.trim().toUpperCase(), start, end };
      const data = await api.runCodeBacktest(body);
      setResult(data);
      if (data.leaderboard_entry_id != null) setLeaderboardEntryId(data.leaderboard_entry_id);
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

  const onShareToggle = useCallback(
    async (next) => {
      if (leaderboardEntryId == null) return;
      setShareBusy(true);
      try {
        await api.patchLeaderboardEntry(leaderboardEntryId, { share_public: next });
        setSharePublic(next);
      } catch (e) {
        window.alert(e instanceof Error ? e.message : String(e));
      } finally {
        setShareBusy(false);
      }
    },
    [leaderboardEntryId]
  );

  const m = result?.metrics;

  return (
    <div>
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
            subtitle="Run sandboxed strategy backtests and inspect performance, charts, and leaderboard status."
          />
          <div className="cs-card overflow-hidden">
            <div className="cs-card-header pb-2">
              <CardHeaderTitle title="Backtest Setup" subtitle="Ticker, range, and strategy code." />
            </div>
            <div className="border-t border-ink/[0.06] px-4 py-3">
              <div className="backtest-run-strip">
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
                <button type="button" className="strategy-builder-run backtest-run-strip-submit" disabled={loading} onClick={() => void run()}>
                  {loading ? "Running…" : "Run Backtest"}
                </button>
              </div>
              <div className="mt-3 overflow-hidden rounded-lg border border-ink/[0.08]">
                <CodeMirror value={code} height="300px" extensions={[python()]} onChange={setCode} />
              </div>
            </div>
          </div>

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
            {m ? (
              <div className="space-y-3 border-t border-ink/[0.06] px-4 pb-4 pt-3">
                <button type="button" className="cs-btn-buy w-full border-l-[3px] border-solid border-l-[#c8963e] py-2.5 text-sm font-semibold" onClick={goPaperTrade}>
                  Start paper trading this strategy
                </button>
                <button type="button" className="w-full rounded-lg border border-ink/[0.12] bg-white py-2.5 text-sm font-semibold text-ink shadow-card-sm transition-colors hover:border-gold/40" onClick={goPerformanceWithBacktestContext}>
                  Prefill performance report
                </button>
              </div>
            ) : null}
          </div>

          {error ? (
            <div role="alert" className="rounded-card border border-danger/30 bg-danger/[0.06] px-4 py-3 text-sm text-danger">
              <p className="font-semibold">Backtest failed</p>
              <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-ink">
                {error}
              </pre>
            </div>
          ) : null}

          <div className="backtest-charts-grid-v2">
            <div className="backtest-chart-cell">
              <BacktestVsBenchmarkChart comparison={result?.series?.comparison} height={BACKTEST_CHART_PLOT_HEIGHT} />
            </div>
            <div className="backtest-chart-cell">
              <BacktestSignalsChart signals={result?.series?.signals} height={BACKTEST_CHART_PLOT_HEIGHT} />
            </div>
            <div className="backtest-chart-cell">
              <BacktestDrawdownChart drawdown={result?.series?.drawdown} height={BACKTEST_CHART_PLOT_HEIGHT} />
            </div>
            <div className="backtest-chart-cell">
              <BacktestDailyReturnsChart daily={result?.series?.daily_returns} height={BACKTEST_CHART_PLOT_HEIGHT} />
            </div>
          </div>

          {result && m ? (
            <ShareLeaderboardBanner
              entryId={leaderboardEntryId}
              sharePublic={sharePublic}
              onChangeShare={(v) => void onShareToggle(v)}
              disabled={shareBusy}
            />
          ) : null}
        </div>
      ) : (
        <LeaderboardPage />
      )}
    </div>
  );
}
