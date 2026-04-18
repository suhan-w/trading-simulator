import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import CodeMirror from "@uiw/react-codemirror";
import { python } from "@codemirror/lang-python";
import { api } from "../api/client";
import { STRATEGY_LOAD_PAYLOAD_KEY } from "../constants/strategyLoadPayload";

const STORAGE_TAB = "leaderboard_active_tab";
const STORAGE_COMMUNITY_WINDOW = "community_ranking_window";
const STORAGE_STRATEGY_LAB_CAT = "strategylab_active_category";

const MONO = "'SF Mono', 'Fira Code', ui-monospace, monospace";

const STRATEGY_LAB_SUBTITLES = {
  return: "Strategies with the highest overall return over their test period.",
  sharpe: "Best risk-adjusted return — higher means better return per unit of risk.",
  drawdown: "Strategies that lost the least from their peak.",
  trades: "Strategies that generated the most trade signals.",
};

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

function loadStoredWindow() {
  try {
    const v = localStorage.getItem(STORAGE_COMMUNITY_WINDOW);
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

export default function LeaderboardPage() {
  const navigate = useNavigate();

  const [mainTab, setMainTab] = useState(() => loadStoredTab());
  const [communityWindow, setCommunityWindow] = useState(() => loadStoredWindow());
  const [strategyLabCat, setStrategyLabCat] = useState(() => loadStoredCategory());

  const [bundle, setBundle] = useState(null);
  const [bundleError, setBundleError] = useState("");
  const [bundleLoading, setBundleLoading] = useState(true);

  const [community, setCommunity] = useState(null);
  const [communityError, setCommunityError] = useState("");
  const [communityLoading, setCommunityLoading] = useState(true);

  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [toast, setToast] = useState("");

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_TAB, mainTab);
    } catch {
      /* ignore */
    }
  }, [mainTab]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_COMMUNITY_WINDOW, communityWindow);
    } catch {
      /* ignore */
    }
  }, [communityWindow]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_STRATEGY_LAB_CAT, strategyLabCat);
    } catch {
      /* ignore */
    }
  }, [strategyLabCat]);

  useEffect(() => {
    let done = false;
    setBundleLoading(true);
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
    let done = false;
    setCommunityLoading(true);
    api
      .leaderboardCommunityPaper(communityWindow)
      .then((c) => {
        if (!done) setCommunity(c);
      })
      .catch((e) => {
        if (!done) setCommunityError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!done) setCommunityLoading(false);
      });
    return () => {
      done = true;
    };
  }, [communityWindow]);

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

  const communityBannerLine = useMemo(() => {
    if (!community) return "";
    const y = community.you;
    if (y.eligible && y.rank != null && y.total_return_pct != null) {
      return `Your rank: #${y.rank} · ${fmtSignedPct(y.total_return_pct)} return since ${community.since_label}`;
    }
    if (y.banner_kind === "opt_out") {
      return "Enable public ranking in Account settings to appear here.";
    }
    if (y.banner_kind === "insufficient_trades") {
      return "Place at least 10 paper trades to qualify for community rankings.";
    }
    if (y.banner_kind === "no_overlap") {
      return "No qualifying paper snapshot for this time window.";
    }
    return "Enable public ranking in Account settings to appear here.";
  }, [community]);

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
    setToast("Strategy copied to your Strategy page");
    navigate("/strategy");
  }, [detail, navigate]);

  const windowPills = [
    { key: "all", label: "All Time" },
    { key: "90d", label: "90 Days" },
    { key: "30d", label: "30 Days" },
  ];

  const catPills = [
    { key: "return", label: STRATEGY_LAB_LABELS.return },
    { key: "sharpe", label: STRATEGY_LAB_LABELS.sharpe },
    { key: "drawdown", label: STRATEGY_LAB_LABELS.drawdown },
    { key: "trades", label: STRATEGY_LAB_LABELS.trades },
  ];

  const participants = community?.stats?.participant_count ?? 0;
  const avgRet = community?.stats?.average_return_pct;
  const topRet = community?.stats?.top_return_pct;

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
          {communityLoading ? (
            <p className="lb-muted-load">Loading community rankings…</p>
          ) : communityError ? (
            <p className="lb-error-text">{communityError}</p>
          ) : (
            <>
              <div className="lb-slim-banner mono">{communityBannerLine}</div>

              <div className="lb-metric-pill-row">
                <div className="lb-metric-pill">
                  <div className="lb-metric-pill-value mono">{participants}</div>
                  <div className="lb-metric-pill-label">Total Participants</div>
                </div>
                <div className="lb-metric-pill">
                  <div className="lb-metric-pill-value mono">{avgRet == null ? "—" : fmtSignedPct(avgRet)}</div>
                  <div className="lb-metric-pill-label">Average Return</div>
                </div>
                <div className="lb-metric-pill">
                  <div className="lb-metric-pill-value mono">{topRet == null ? "—" : fmtSignedPct(topRet)}</div>
                  <div className="lb-metric-pill-label">Top Return</div>
                </div>
              </div>

              <section className="lb-card lb-card--community">
                <div className="lb-card-head-row">
                  <div className="lb-card-head">
                    <span className="lb-gold-sq lb-gold-sq--12" />
                    <div>
                      <h3 className="lb-card-title">All-Time Total Return</h3>
                      <p className="lb-card-sub">
                        Ranked by total portfolio return since account creation. Minimum 10 trades to appear.
                      </p>
                    </div>
                  </div>
                  <div className="lb-window-toggle" role="group" aria-label="Community ranking window">
                    {windowPills.map((p) => (
                      <button
                        key={p.key}
                        type="button"
                        className={`lb-window-pill ${communityWindow === p.key ? "lb-window-pill--active" : ""}`}
                        onClick={() => setCommunityWindow(p.key)}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="lb-table-scroll">
                  <table className="lb-table lb-table--community">
                    <thead className="lb-thead">
                      <tr>
                        <th>Rank</th>
                        <th>Trader ID</th>
                        <th>Member Since</th>
                        <th className="text-right">Total Trades</th>
                        <th className="text-right">Total Return</th>
                        <th className="text-right">Sharpe</th>
                        <th className="text-right">Win Rate</th>
                        <th className="text-right">Avg Hold Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(community?.rows || []).map((row) => (
                        <tr key={`${row.rank}-${row.trader_label}`} className={`lb-row ${row.is_mine ? "lb-row--mine" : ""}`}>
                          <td>{rankCell(row.rank)}</td>
                          <td className="mono">{row.trader_label}</td>
                          <td className="mono">{row.member_since}</td>
                          <td className="mono text-right">{row.total_trades}</td>
                          <td className={`mono text-right ${row.total_return_pct >= 0 ? "lb-num-pos" : "lb-num-neg"}`}>
                            {fmtSignedPct(row.total_return_pct)}
                          </td>
                          <td className="mono text-right sub">
                            {row.sharpe_ratio == null ? "—" : Number(row.sharpe_ratio).toFixed(2)}
                          </td>
                          <td className="mono text-right sub">
                            {row.win_rate_pct == null ? "—" : `${Number(row.win_rate_pct).toFixed(1)}%`}
                          </td>
                          <td className="mono text-right sub">{row.avg_hold_time_label}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <p className="lb-opt-out-note">
                  Your performance is visible to the community. Disable in Account → Privacy.
                </p>
              </section>
            </>
          )}
        </div>
      ) : (
        <div className="lb-tab-panel">
          {bundleLoading ? (
            <p className="lb-muted-load">Loading Strategy Lab…</p>
          ) : bundleError ? (
            <p className="lb-error-text">{bundleError}</p>
          ) : (
            <>
              <div className="lb-slim-banner mono">{strategyLabBestLine}</div>

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
                  <span className="lb-gold-sq lb-gold-sq--12" />
                  <h3>No strategies yet</h3>
                  <p>Be the first — run a backtest on the Backtesting tab.</p>
                </section>
              ) : activeCategory ? (
                <section className="lb-card">
                  <div className="lb-card-head">
                    <span className="lb-gold-sq lb-gold-sq--12" />
                    <div>
                      <h3 className="lb-card-title">{STRATEGY_LAB_LABELS[strategyLabCat]}</h3>
                      <p className="lb-card-sub">{STRATEGY_LAB_SUBTITLES[strategyLabCat]}</p>
                    </div>
                  </div>

                  <div className="lb-table-scroll">
                    <table className="lb-table lb-table--strategy-lab">
                      <thead className="lb-thead">
                        <tr>
                          <th>Rank</th>
                          <th>Strategy ID</th>
                          <th>Ticker</th>
                          <th>Period</th>
                        <th>Key Metric</th>
                        <th className="text-right">Total Return</th>
                        <th className="text-right">Sharpe</th>
                        <th className="text-right">Drawdown</th>
                        <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(activeCategory.rows || []).slice(0, 10).map((row, idx) => (
                          <tr key={row.id} className={`lb-row ${row.is_mine ? "lb-row--mine" : ""}`}>
                            <td>{rankCell(idx + 1)}</td>
                            <td className="mono">{row.strategy_label}</td>
                            <td className="mono">{row.ticker || "—"}</td>
                            <td className="mono sub">{fmtPeriod(row.period_start, row.period_end)}</td>
                            <td className={keyMetricClass(strategyLabCat, row.value)}>{row.value_label}</td>
                            <td
                              className={`mono sub ${row.total_return_pct >= 0 ? "lb-num-pos" : "lb-num-neg"}`}
                            >
                              {`${row.total_return_pct >= 0 ? "+" : ""}${Number(row.total_return_pct).toFixed(2)}%`}
                            </td>
                            <td className="mono sub">
                              {row.sharpe_ratio == null ? "—" : Number(row.sharpe_ratio).toFixed(2)}
                            </td>
                            <td className="mono sub">
                              {row.max_drawdown_pct == null ? "—" : `${Number(row.max_drawdown_pct).toFixed(2)}%`}
                            </td>
                            <td>
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
              Copy to my Strategy page
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
