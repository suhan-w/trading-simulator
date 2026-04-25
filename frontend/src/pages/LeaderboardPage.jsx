import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import CodeMirror from "@uiw/react-codemirror";
import { python } from "@codemirror/lang-python";
import { api } from "../api/client";
import { STRATEGY_LOAD_PAYLOAD_KEY } from "../constants/strategyLoadPayload";

const STORAGE_TAB = "leaderboard_active_tab";
const STORAGE_COMMUNITY_SUBTAB = "community_ranking_subtab";
const STORAGE_ALLTIME_WINDOW = "alltime_ranking_window";
const LEGACY_COMMUNITY_WINDOW = "community_ranking_window";
const STORAGE_STRATEGY_LAB_CAT = "strategylab_active_category";

const MONO = "'SF Mono', 'Fira Code', ui-monospace, monospace";

const STRATEGY_LAB_LABELS = {
  return: "Highest Return",
  sharpe: "Best Sharpe",
  drawdown: "Lowest Drawdown",
  trades: "Most Active",
};

function loadStoredTab() {
  try {
    const v = localStorage.getItem(STORAGE_TAB);
    if (v === "community" || v === "strategy-lab") return v;
  } catch {
    /* ignore */
  }
  return "community";
}

function loadStoredCommunitySubtab() {
  try {
    const v = localStorage.getItem(STORAGE_COMMUNITY_SUBTAB);
    if (v === "monthly" || v === "hof" || v === "alltime") return v;
  } catch {
    /* ignore */
  }
  return "monthly";
}

function loadStoredAlltimeWindow() {
  try {
    let v = localStorage.getItem(STORAGE_ALLTIME_WINDOW);
    if (!v) v = localStorage.getItem(LEGACY_COMMUNITY_WINDOW);
    if (v === "all" || v === "90d" || v === "30d") return v;
  } catch {
    /* ignore */
  }
  return "all";
}

function loadStoredCategory() {
  try {
    const v = localStorage.getItem(STORAGE_STRATEGY_LAB_CAT);
    if (v === "return" || v === "sharpe" || v === "drawdown" || v === "trades") return v;
  } catch {
    /* ignore */
  }
  return "return";
}

function fmtPeriod(start, end) {
  const a = new Date(`${start}T00:00:00`);
  const b = new Date(`${end}T00:00:00`);
  const fa = a.toLocaleDateString(undefined, { month: "short", year: "numeric" });
  const fb = b.toLocaleDateString(undefined, { month: "short", year: "numeric" });
  return `${fa} - ${fb}`;
}

function rankCell(rank) {
  if (rank === 1) return <span className="lb-rank-sq lb-rank-gold" aria-label="Rank 1" />;
  if (rank === 2) return <span className="lb-rank-sq lb-rank-grey" aria-label="Rank 2" />;
  if (rank === 3) return <span className="lb-rank-sq lb-rank-beige" aria-label="Rank 3" />;
  return <span className="lb-rank-num">#{rank}</span>;
}

function keyMetricClass(catKey, value) {
  if (catKey === "drawdown") return "lb-key-metric neg";
  return Number(value) >= 0 ? "lb-key-metric pos" : "lb-key-metric neg";
}

function fmtSignedPct(n) {
  if (n == null || Number.isNaN(Number(n))) return "—";
  const v = Number(n);
  const s = v >= 0 ? "+" : "";
  return `${s}${v.toFixed(2)}%`;
}

function metricValClass(label, valStr) {
  if (label === "Total Return") {
    return String(valStr).trim().startsWith("-")
      ? "lb-metric-val mono lb-num-neg"
      : "lb-metric-val mono lb-num-pos";
  }
  if (label === "Max Drawdown") return "lb-metric-val mono lb-num-neg";
  if (label === "Sharpe Ratio") {
    const n = parseFloat(String(valStr));
    if (Number.isNaN(n)) return "lb-metric-val mono";
    return n >= 0 ? "lb-metric-val mono lb-num-pos" : "lb-metric-val mono lb-num-neg";
  }
  if (label === "Win Rate") return "lb-metric-val mono lb-num-pos";
  return "lb-metric-val mono";
}

function formatCountdown(closesAtIso) {
  const end = new Date(closesAtIso).getTime();
  const ms = Math.max(0, end - Date.now());
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return {
    label: `Closes in ${d}d ${h}h ${m}m`,
    urgent: ms > 0 && ms < 24 * 3600000,
  };
}

function MonthlyCountdown({ closesAt }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((x) => x + 1), 60_000);
    return () => clearInterval(id);
  }, []);
  const { label, urgent } = formatCountdown(closesAt);
  return <span className={`lb-countdown-mono ${urgent ? "lb-countdown--urgent" : ""}`}>{label}</span>;
}

export default function LeaderboardPage() {
  const navigate = useNavigate();

  const [mainTab, setMainTab] = useState(() => loadStoredTab());
  const [communitySubTab, setCommunitySubTab] = useState(() => loadStoredCommunitySubtab());
  const [alltimeWindow, setAlltimeWindow] = useState(() => loadStoredAlltimeWindow());
  const [strategyLabCat, setStrategyLabCat] = useState(() => loadStoredCategory());

  const [bundle, setBundle] = useState(null);
  const [bundleError, setBundleError] = useState("");
  const [bundleLoading, setBundleLoading] = useState(true);

  const [monthly, setMonthly] = useState(null);
  const [monthlyError, setMonthlyError] = useState("");
  const [monthlyLoading, setMonthlyLoading] = useState(false);

  const [hof, setHof] = useState(null);
  const [hofError, setHofError] = useState("");
  const [hofLoading, setHofLoading] = useState(false);

  const [alltime, setAlltime] = useState(null);
  const [alltimeError, setAlltimeError] = useState("");
  const [alltimeLoading, setAlltimeLoading] = useState(false);

  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [toast, setToast] = useState("");

  const loadStrategyLabBundle = useCallback(() => {
    let done = false;
    setBundleLoading(true);
    setBundleError("");
    const today = new Date().toISOString().slice(0, 10);
    api
      .leaderboard("2000-01-01", today)
      .then((b) => {
        if (!done) setBundle(b);
      })
      .catch((e) => {
        if (!done) setBundleError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!done) setBundleLoading(false);
      });
    return () => {
      done = true;
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_TAB, mainTab);
    } catch {
      /* ignore */
    }
  }, [mainTab]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_COMMUNITY_SUBTAB, communitySubTab);
    } catch {
      /* ignore */
    }
  }, [communitySubTab]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_ALLTIME_WINDOW, alltimeWindow);
    } catch {
      /* ignore */
    }
  }, [alltimeWindow]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_STRATEGY_LAB_CAT, strategyLabCat);
    } catch {
      /* ignore */
    }
  }, [strategyLabCat]);

  useEffect(() => loadStrategyLabBundle(), [loadStrategyLabBundle]);

  useEffect(() => {
    if (mainTab !== "strategy-lab") return undefined;
    return loadStrategyLabBundle();
  }, [mainTab, loadStrategyLabBundle]);

  useEffect(() => {
    if (mainTab !== "community" || communitySubTab !== "monthly") return undefined;
    let done = false;
    setMonthlyLoading(true);
    setMonthlyError("");
    api
      .leaderboardCommunityMonthly()
      .then((d) => {
        if (!done) setMonthly(d);
      })
      .catch((e) => {
        if (!done) setMonthlyError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!done) setMonthlyLoading(false);
      });
    return () => {
      done = true;
    };
  }, [mainTab, communitySubTab]);

  useEffect(() => {
    if (mainTab !== "community" || communitySubTab !== "hof") return undefined;
    let done = false;
    setHofLoading(true);
    setHofError("");
    api
      .leaderboardCommunityHallOfFame()
      .then((d) => {
        if (!done) setHof(d);
      })
      .catch((e) => {
        if (!done) setHofError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!done) setHofLoading(false);
      });
    return () => {
      done = true;
    };
  }, [mainTab, communitySubTab]);

  useEffect(() => {
    if (mainTab !== "community" || communitySubTab !== "alltime") return undefined;
    let done = false;
    setAlltimeLoading(true);
    setAlltimeError("");
    api
      .leaderboardCommunityAlltime(alltimeWindow)
      .then((d) => {
        if (!done) setAlltime(d);
      })
      .catch((e) => {
        if (!done) setAlltimeError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!done) setAlltimeLoading(false);
      });
    return () => {
      done = true;
    };
  }, [mainTab, communitySubTab, alltimeWindow]);

  useEffect(() => {
    if (!selected) return;
    api.leaderboardEntry(selected).then(setDetail).catch(() => setDetail(null));
  }, [selected]);

  useEffect(() => {
    if (!toast) return undefined;
    const id = setTimeout(() => setToast(""), 2500);
    return () => clearTimeout(id);
  }, [toast]);

  const categories = useMemo(() => bundle?.categories || [], [bundle]);

  const activeCategory = useMemo(
    () => categories.find((c) => c.key === strategyLabCat) || categories[0],
    [categories, strategyLabCat]
  );

  useEffect(() => {
    if (!categories.length) return;
    if (!categories.some((c) => c.key === strategyLabCat)) {
      setStrategyLabCat(categories[0].key);
    }
  }, [categories, strategyLabCat]);

  const strategyLabBestLine = useMemo(() => {
    if (!bundle?.best_rank) return "Run a backtest to appear here.";
    const labelMap = {
      "Highest Total Return": STRATEGY_LAB_LABELS.return,
      "Best Sharpe Ratio": STRATEGY_LAB_LABELS.sharpe,
      "Lowest Max Drawdown": STRATEGY_LAB_LABELS.drawdown,
      "Most Active": STRATEGY_LAB_LABELS.trades,
    };
    const short =
      labelMap[bundle.best_rank.category_label] ||
      bundle.best_rank.category_label ||
      STRATEGY_LAB_LABELS.return;
    return `Your best rank: #${bundle.best_rank.best_rank} in ${short} · ${bundle.best_rank.strategy_label}`;
  }, [bundle]);

  const allTimeBannerLine = useMemo(() => {
    if (!alltime) return "";
    const y = alltime.you;
    if (y.eligible && y.rank != null && y.total_return_pct != null) {
      return `Your all-time rank: #${y.rank} · ${fmtSignedPct(y.total_return_pct)} since ${alltime.since_label}`;
    }
    if (y.banner_kind === "insufficient_trades") {
      return "Make 10 trades to appear on the all-time leaderboard.";
    }
    if (y.banner_kind === "opt_out") {
      return "Set your paper account to Public on Account (or use the Backtesting quick toggle) to appear here.";
    }
    if (y.banner_kind === "no_overlap") {
      return "No qualifying paper snapshot for this time window.";
    }
    return "Make 10 trades to appear on the all-time leaderboard.";
  }, [alltime]);

  const monthlyUserStrip = useMemo(() => {
    if (!monthly?.you) return "";
    const y = monthly.you;
    if (y.eligible && y.rank != null && y.monthly_return_pct != null) {
      return `You are #${y.rank} this month · ${fmtSignedPct(y.monthly_return_pct)} · ${y.trades_this_month} trades`;
    }
    if (y.banner_kind === "low_trades") {
      return `Make ${y.min_trades} trades this month to appear on the leaderboard. You have ${y.trades_this_month} so far.`;
    }
    if (y.banner_kind === "opt_out") {
      return "Set your paper account to Public on Account (or use the Backtesting quick toggle) to appear here.";
    }
    if (y.banner_kind === "no_paper" || y.banner_kind === "no_baseline") {
      return "Set your paper account to Public on Account (or use the Backtesting quick toggle) to appear here.";
    }
    return "Set your paper account to Public on Account (or use the Backtesting quick toggle) to appear here.";
  }, [monthly]);

  const copyToStrategy = useCallback(() => {
    if (!detail?.strategy_code) return;
    try {
      sessionStorage.setItem(
        STRATEGY_LOAD_PAYLOAD_KEY,
        JSON.stringify({
          code: detail.strategy_code,
          visualBlocks: null,
          source: "leaderboard",
          strategyName: detail.strategy_label || "Copied strategy",
        })
      );
    } catch {
      /* ignore */
    }
    setToast("Strategy copied to your Backtesting editor");
    navigate("/backtesting?tab=backtest");
  }, [detail, navigate]);

  const windowPills = [
    { key: "all", label: "All time" },
    { key: "90d", label: "90 days" },
    { key: "30d", label: "30 days" },
  ];

  const communitySubPills = [
    { key: "monthly", label: "Monthly Season" },
    { key: "hof", label: "Hall of Fame" },
    { key: "alltime", label: "All-Time" },
  ];

  const catPills = [
    { key: "return", label: STRATEGY_LAB_LABELS.return },
    { key: "sharpe", label: STRATEGY_LAB_LABELS.sharpe },
    { key: "drawdown", label: STRATEGY_LAB_LABELS.drawdown },
    { key: "trades", label: STRATEGY_LAB_LABELS.trades },
  ];

  return (
    <div className="backtesting-leaderboard lb-page-root">
      <div className="lb-main-tabs" role="tablist" aria-label="Leaderboard sections">
        <button
          type="button"
          role="tab"
          aria-selected={mainTab === "community"}
          className={`lb-main-tab ${mainTab === "community" ? "lb-main-tab--active" : ""}`}
          onClick={() => setMainTab("community")}
        >
          Community Rankings
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mainTab === "strategy-lab"}
          className={`lb-main-tab ${mainTab === "strategy-lab" ? "lb-main-tab--active" : ""}`}
          onClick={() => setMainTab("strategy-lab")}
        >
          Strategy Lab
        </button>
      </div>

      {mainTab === "community" ? (
        <div className="lb-tab-panel">
          <div className="lb-community-subtabs" role="tablist" aria-label="Community rankings view">
            {communitySubPills.map((p) => (
              <button
                key={p.key}
                type="button"
                role="tab"
                aria-selected={communitySubTab === p.key}
                className={`lb-community-subtab-pill ${communitySubTab === p.key ? "lb-community-subtab-pill--active" : ""}`}
                onClick={() => setCommunitySubTab(p.key)}
              >
                {p.label}
              </button>
            ))}
          </div>

          {communitySubTab === "monthly" ? (
            monthlyLoading ? (
              <p className="lb-muted-load">Loading monthly season…</p>
            ) : monthlyError ? (
              <p className="lb-error-text">{monthlyError}</p>
            ) : monthly ? (
              <>
                <div className="lb-countdown-banner">
                  <div className="lb-countdown-banner-left">
                    <span className="lb-rank-sq lb-rank-gold" aria-hidden />
                    <span className="lb-countdown-season-title">{monthly.season_title}</span>
                  </div>
                  <MonthlyCountdown closesAt={monthly.closes_at} />
                </div>

                <div
                  className={`lb-user-rank-strip ${monthly?.you?.eligible ? "lb-user-rank-strip--highlight" : "lb-user-rank-strip--muted"}`}
                >
                  {monthlyUserStrip}
                </div>

                <section className="lb-card lb-card--table-only lb-card--community">
                  <div className="lb-table-scroll">
                    <table className="lb-table lb-table-fixed lb-table--community">
                      <colgroup>
                        <col style={{ width: 52 }} />
                        <col style={{ width: "22%" }} />
                        <col style={{ width: "12%" }} />
                        <col style={{ width: "20%" }} />
                        <col style={{ width: "12%" }} />
                        <col style={{ width: "12%" }} />
                      </colgroup>
                      <thead className="lb-thead">
                        <tr>
                          <th>Rank</th>
                          <th>Trader</th>
                          <th className="lb-td-right">Trades</th>
                          <th className="lb-td-right">Monthly Return</th>
                          <th className="lb-td-right">Sharpe</th>
                          <th className="lb-td-right">Win Rate</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(monthly.rows || []).slice(0, 10).map((row) => (
                          <tr key={`${row.rank}-${row.trader_label}`} className={row.is_mine ? "lb-row--mine" : ""}>
                            <td className="lb-td-mono">{rankCell(row.rank)}</td>
                            <td className="lb-td-mono">{row.trader_label}</td>
                            <td className="lb-td-mono lb-td-right">{row.trades_this_month}</td>
                            <td className={`lb-td-right lb-td-key ${row.monthly_return_pct >= 0 ? "lb-num-pos" : "lb-num-neg"}`}>
                              {fmtSignedPct(row.monthly_return_pct)}
                            </td>
                            <td className="lb-td-mono lb-td-right">{row.sharpe_ratio == null ? "—" : Number(row.sharpe_ratio).toFixed(2)}</td>
                            <td className="lb-td-mono lb-td-right">
                              {row.win_rate_pct == null ? "—" : `${Number(row.win_rate_pct).toFixed(1)}%`}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              </>
            ) : null
          ) : communitySubTab === "hof" ? (
            hofLoading ? (
              <p className="lb-muted-load">Loading Hall of Fame…</p>
            ) : hofError ? (
              <p className="lb-error-text">{hofError}</p>
            ) : hof?.has_winner ? (
              <>
                <div className="lb-hof-wrap">
                  <div className="lb-hof-card">
                    <div className="lb-hof-icon" aria-hidden />
                    <p className="lb-hof-kicker">Last Season&apos;s Champion</p>
                    <p className="lb-hof-name">{hof.trader_label}</p>
                    <p className="lb-hof-month">{hof.month_label}</p>
                    <p className={`lb-hof-return ${hof.return_pct >= 0 ? "lb-num-pos" : "lb-num-neg"}`}>{fmtSignedPct(hof.return_pct)}</p>
                    <div className="lb-hof-meta">
                      <span>{hof.trade_count} trades</span>
                      <span aria-hidden> · </span>
                      <span>{hof.sharpe_ratio == null ? "—" : `${Number(hof.sharpe_ratio).toFixed(2)} Sharpe`}</span>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="lb-hof-wrap">
                <div className="lb-hof-empty">
                  <div className="lb-hof-icon gold" aria-hidden />
                  <p className="lb-hof-empty-title">No seasons completed yet</p>
                  <p className="lb-hof-empty-sub">Check back at the end of the month.</p>
                </div>
              </div>
            )
          ) : communitySubTab === "alltime" ? (
            alltimeLoading ? (
              <p className="lb-muted-load">Loading all-time rankings…</p>
            ) : alltimeError ? (
              <p className="lb-error-text">{alltimeError}</p>
            ) : alltime ? (
              <>
                <div className={`lb-slim-banner ${alltime?.you?.banner_kind === "insufficient_trades" ? "lb-user-rank-strip--muted" : ""}`}>
                  {allTimeBannerLine}
                </div>

                <section className="lb-card lb-card--table-only lb-card--community">
                  <div className="lb-card-toolbar">
                    <span className="lb-card-title" style={{ margin: 0 }}>
                      All-time rankings
                    </span>
                    <div className="lb-window-toggle" role="group" aria-label="All-time ranking window">
                      {windowPills.map((p) => (
                        <button
                          key={p.key}
                          type="button"
                          className={`lb-window-pill ${alltimeWindow === p.key ? "lb-window-pill--active" : ""}`}
                          onClick={() => setAlltimeWindow(p.key)}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="lb-table-scroll">
                    <table className="lb-table lb-table-fixed lb-table--community">
                      <colgroup>
                        <col style={{ width: 52 }} />
                        <col style={{ width: "18%" }} />
                        <col style={{ width: "14%" }} />
                        <col style={{ width: "11%" }} />
                        <col style={{ width: "20%" }} />
                        <col style={{ width: "11%" }} />
                        <col style={{ width: "11%" }} />
                      </colgroup>
                      <thead className="lb-thead">
                        <tr>
                          <th>Rank</th>
                          <th>Trader</th>
                          <th>Since</th>
                          <th className="lb-td-right">Trades</th>
                          <th className="lb-td-right">All-Time Return</th>
                          <th className="lb-td-right">Sharpe</th>
                          <th className="lb-td-right">Win Rate</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(alltime.rows || []).slice(0, 10).map((row) => (
                          <tr key={`${row.rank}-${row.trader_label}`} className={row.is_mine ? "lb-row--mine" : ""}>
                            <td className="lb-td-mono">{rankCell(row.rank)}</td>
                            <td className="lb-td-mono">{row.trader_label}</td>
                            <td className="lb-td-mono">{row.member_since}</td>
                            <td className="lb-td-mono lb-td-right">{row.total_trades}</td>
                            <td className={`lb-td-right lb-td-key ${row.total_return_pct >= 0 ? "lb-num-pos" : "lb-num-neg"}`}>
                              {fmtSignedPct(row.total_return_pct)}
                            </td>
                            <td className="lb-td-mono lb-td-right">{row.sharpe_ratio == null ? "—" : Number(row.sharpe_ratio).toFixed(2)}</td>
                            <td className="lb-td-mono lb-td-right">{row.win_rate_pct == null ? "—" : `${Number(row.win_rate_pct).toFixed(1)}%`}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
                <p className="lb-opt-out-note">
                  Your performance is visible to the community. Set your paper account to Private on Account (or use the
                  Backtesting quick toggle) to opt out.
                </p>
              </>
            ) : null
          ) : null}
        </div>
      ) : (
        <div className="lb-tab-panel">
          {bundleLoading ? (
            <p className="lb-muted-load">Loading Strategy Lab…</p>
          ) : bundleError ? (
            <p className="lb-error-text">{bundleError}</p>
          ) : (
            <>
              <div className="lb-slim-banner">{strategyLabBestLine}</div>

              <div className="lb-category-pills" role="tablist" aria-label="Strategy Lab category">
                {catPills.map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    role="tab"
                    aria-selected={strategyLabCat === p.key}
                    className={`lb-cat-pill ${strategyLabCat === p.key ? "lb-cat-pill--active" : ""}`}
                    onClick={() => setStrategyLabCat(p.key)}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              {bundle?.show_empty_state ? (
                <section className="lb-card lb-empty-state lb-empty-state--inset">
                  <span className="lb-rank-sq lb-rank-gold" />
                  <h3>No strategies yet</h3>
                  <p>Be the first — run a backtest on the Backtesting tab.</p>
                </section>
              ) : activeCategory ? (
                <section className="lb-card lb-card--table-only">
                  <div className="lb-table-scroll">
                    <table className="lb-table lb-table-fixed lb-table--strategy-lab">
                      <colgroup>
                        <col style={{ width: 52 }} />
                        <col style={{ width: "16%" }} />
                        <col style={{ width: "11%" }} />
                        <col style={{ width: "16%" }} />
                        <col style={{ width: "18%" }} />
                        <col style={{ width: "10%" }} />
                        <col style={{ width: "10%" }} />
                        <col style={{ width: 88 }} />
                      </colgroup>
                      <thead className="lb-thead">
                        <tr>
                          <th>Rank</th>
                          <th>Strategy</th>
                          <th>Ticker</th>
                          <th>Period</th>
                          <th className="lb-td-center">Key Metric</th>
                          <th className="lb-td-right">Sharpe</th>
                          <th className="lb-td-right">Drawdown</th>
                          <th className="lb-td-action">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(activeCategory.rows || []).slice(0, 10).map((row, idx) => (
                          <tr key={row.id} className={row.is_mine ? "lb-row--mine" : ""}>
                            <td className="lb-td-mono">{rankCell(idx + 1)}</td>
                            <td className="lb-td-mono">{row.strategy_label}</td>
                            <td className="lb-td-mono">{row.ticker || "—"}</td>
                            <td className="lb-td-mono">{fmtPeriod(row.period_start, row.period_end)}</td>
                            <td className={`lb-td-key lb-td-center ${keyMetricClass(strategyLabCat, row.value)}`}>
                              {row.value_label}
                            </td>
                            <td className="lb-td-mono lb-td-right">{row.sharpe_ratio == null ? "—" : Number(row.sharpe_ratio).toFixed(2)}</td>
                            <td className={`lb-td-mono lb-td-right ${row.max_drawdown_pct != null && row.max_drawdown_pct > 0 ? "lb-num-neg" : ""}`}>
                              {row.max_drawdown_pct == null ? "—" : `${Number(row.max_drawdown_pct).toFixed(2)}%`}
                            </td>
                            <td className="lb-td-action">
                              <button type="button" className="lb-view-btn" onClick={() => setSelected(row.id)}>
                                View
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              ) : null}
            </>
          )}
        </div>
      )}

      {selected ? (
        <button type="button" className="lb-drawer-overlay" aria-label="Close drawer" onClick={() => setSelected(null)} />
      ) : null}
      <aside className={`lb-drawer ${selected ? "open" : ""}`} aria-hidden={!selected}>
        {detail ? (
          <>
            <button type="button" className="lb-drawer-close" onClick={() => setSelected(null)} aria-label="Close">
              ×
            </button>
            <h2 className="lb-drawer-title">{detail.strategy_label}</h2>
            <div className="lb-drawer-line" />
            <div className="lb-metric-grid">
              {[
                ["Total Return", `${detail.total_return_pct >= 0 ? "+" : ""}${Number(detail.total_return_pct).toFixed(2)}%`, "Overall return across the backtest period."],
                ["Sharpe Ratio", detail.sharpe_ratio == null ? "—" : Number(detail.sharpe_ratio).toFixed(2), "Higher means better return per unit of volatility."],
                ["Max Drawdown", detail.max_drawdown_pct == null ? "—" : `${Number(detail.max_drawdown_pct).toFixed(2)}%`, "Worst drop from a previous equity peak."],
                ["Win Rate", detail.win_rate_pct == null ? "—" : `${Number(detail.win_rate_pct).toFixed(1)}%`, "Percentage of profitable completed trades."],
              ].map(([label, val, note]) => (
                <div key={label} className="lb-metric-card">
                  <div className="lb-metric-title">
                    <span className="lb-gold-sq" />
                    {label}
                  </div>
                  <div className={metricValClass(label, String(val))}>{val}</div>
                  <p>{note}</p>
                </div>
              ))}
            </div>
            <div className="lb-code-head">
              <span className="lb-gold-sq" />
              Strategy Code
            </div>
            <CodeMirror
              value={detail.strategy_code || "# No code available"}
              extensions={[python()]}
              editable={false}
              theme="dark"
              height="320px"
              className="lb-code"
              basicSetup={{ lineNumbers: true }}
            />
            <button type="button" className="lb-copy-btn" onClick={copyToStrategy}>
              Copy to my Backtesting editor
            </button>
          </>
        ) : selected ? (
          <p className="lb-muted-load">Loading strategy details…</p>
        ) : null}
      </aside>

      {toast ? (
        <div className="lb-toast" style={{ fontFamily: MONO }}>
          {toast}
        </div>
      ) : null}
    </div>
  );
}
