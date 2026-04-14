import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import CodeMirror from "@uiw/react-codemirror";
import { python } from "@codemirror/lang-python";
import { api } from "../api/client";
import SectionHeading from "../components/SectionHeading";
import { STRATEGY_LOAD_PAYLOAD_KEY } from "../constants/strategyLoadPayload";

const SUBTITLES = {
  "Highest Total Return": "Strategies with the highest overall return over their test period.",
  "Best Sharpe Ratio":
    "Best risk-adjusted return - higher means better return per unit of risk.",
  "Lowest Max Drawdown":
    "Strategies that lost the least from their peak - lowest drawdown wins.",
  "Most Active": "Strategies that generated the most trade signals.",
};

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

export default function LeaderboardPage() {
  const navigate = useNavigate();
  const [bundle, setBundle] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [toast, setToast] = useState("");

  useEffect(() => {
    let done = false;
    setLoading(true);
    const today = new Date().toISOString().slice(0, 10);
    api
      .leaderboard("2000-01-01", today)
      .then((b) => {
        if (!done) setBundle(b);
      })
      .catch((e) => {
        if (!done) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!done) setLoading(false);
      });
    return () => {
      done = true;
    };
  }, []);

  useEffect(() => {
    if (!selected) return;
    api.leaderboardEntry(selected).then(setDetail).catch(() => setDetail(null));
  }, [selected]);

  useEffect(() => {
    if (!toast) return undefined;
    const id = setTimeout(() => setToast(""), 1800);
    return () => clearTimeout(id);
  }, [toast]);

  const categories = useMemo(() => bundle?.categories || [], [bundle]);
  const bestLine = useMemo(() => {
    if (!bundle?.best_rank) return "Run a backtest to appear on the leaderboard.";
    return `Your best rank: #${bundle.best_rank.best_rank} in ${bundle.best_rank.category_label} - ${bundle.best_rank.strategy_label}`;
  }, [bundle]);

  const copyToStrategy = () => {
    if (!detail?.strategy_code) return;
    try {
      sessionStorage.setItem(
        STRATEGY_LOAD_PAYLOAD_KEY,
        JSON.stringify({ code: detail.strategy_code, visualBlocks: null })
      );
    } catch {
      // ignore
    }
    setToast("Strategy copied to your Strategy page.");
    navigate("/strategy");
  };

  if (loading) return <p className="text-sm text-muted">Loading leaderboard…</p>;
  if (error) return <p className="text-sm text-danger">{error}</p>;

  return (
    <div className="backtesting-leaderboard">
      <SectionHeading
        title="Leaderboard"
        subtitle="All time top performing strategies from the Cowrie Shell community. All entries anonymous."
      />
      <div className="lb-rank-banner">{bestLine}</div>
      {bundle?.show_empty_state ? (
        <div className="lb-empty-state">
          <span className="lb-gold-sq" />
          <h3>No strategies yet</h3>
          <p>Be the first - run a backtest on the Backtest tab.</p>
        </div>
      ) : (
        <div className="lb-table-stack">
          {categories.map((cat) => (
            <section key={cat.key} className="lb-card">
              <div className="lb-card-head">
                <span className="lb-gold-sq" />
                <div>
                  <h3>{cat.title}</h3>
                  <p>{SUBTITLES[cat.title]}</p>
                </div>
              </div>
              <table className="lb-table">
                <thead className="lb-thead">
                  <tr>
                    <th>Rank</th>
                    <th>Strategy ID</th>
                    <th>Ticker</th>
                    <th>Period</th>
                    <th>Key Metric</th>
                    <th>Total Return</th>
                    <th>Sharpe</th>
                    <th>Drawdown</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {(cat.rows || []).slice(0, 10).map((row, idx) => (
                    <tr
                      key={row.id}
                      className={`lb-row ${row.is_mine ? "own-strategy" : ""}`}
                      onClick={() => setSelected(row.id)}
                    >
                      <td>{rankCell(idx + 1)}</td>
                      <td className="mono">{row.strategy_label}</td>
                      <td className="mono">{row.ticker || "-"}</td>
                      <td className="mono">{fmtPeriod(row.period_start, row.period_end)}</td>
                      <td className={keyMetricClass(cat.key, row.value)}>{row.value_label}</td>
                      <td className="mono sub">{`${row.total_return_pct >= 0 ? "+" : ""}${Number(
                        row.total_return_pct
                      ).toFixed(2)}%`}</td>
                      <td className="mono sub">
                        {row.sharpe_ratio == null ? "-" : Number(row.sharpe_ratio).toFixed(2)}
                      </td>
                      <td className="mono sub">
                        {row.max_drawdown_pct == null ? "-" : `${Number(row.max_drawdown_pct).toFixed(2)}%`}
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
            </section>
          ))}
        </div>
      )}
      {selected ? <button type="button" className="lb-drawer-overlay" onClick={() => setSelected(null)} /> : null}
      <aside className={`lb-drawer ${selected ? "open" : ""}`}>
        {detail ? (
          <>
            <button type="button" className="lb-drawer-close" onClick={() => setSelected(null)}>
              ×
            </button>
            <h2>{detail.strategy_label}</h2>
            <div className="lb-drawer-line" />
            <div className="lb-metric-grid">
              {[
                ["Total Return", `${detail.total_return_pct >= 0 ? "+" : ""}${Number(detail.total_return_pct).toFixed(2)}%`, "Overall return across the backtest period."],
                ["Sharpe Ratio", detail.sharpe_ratio == null ? "-" : Number(detail.sharpe_ratio).toFixed(2), "Higher means better return per unit of volatility."],
                ["Max Drawdown", detail.max_drawdown_pct == null ? "-" : `${Number(detail.max_drawdown_pct).toFixed(2)}%`, "Worst drop from a previous equity peak."],
                ["Win Rate", detail.win_rate_pct == null ? "-" : `${Number(detail.win_rate_pct).toFixed(1)}%`, "Percentage of profitable completed trades."],
              ].map(([label, val, note]) => (
                <div key={label} className="lb-metric-card">
                  <div className="lb-metric-title">
                    <span className="lb-gold-sq" />
                    {label}
                  </div>
                  <div className="lb-metric-val mono">{val}</div>
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
            />
            <button type="button" className="lb-copy-btn" onClick={copyToStrategy}>
              Copy to my Strategy page
            </button>
          </>
        ) : (
          <p className="text-sm text-muted">Loading strategy details…</p>
        )}
      </aside>
      {toast ? <div className="lb-toast">{toast}</div> : null}
    </div>
  );
}
