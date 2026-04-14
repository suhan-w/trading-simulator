import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { ComparisonChartPanel } from "./LineChartPanel";
import PerStockPnlBars from "./PerStockPnlBars";

const INK = "#111111";
const GREY = "#aaaaaa";
const GREEN = "#2d8a55";
const RED = "#c0392b";

const PIXEL = [0, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 0];

function PixelLogo() {
  return (
    <div className="tpr-pixel-logo" aria-hidden>
      {PIXEL.map((on, i) => (
        <span key={i} className={on ? "on" : ""} />
      ))}
    </div>
  );
}

function fmtPct(x, digits = 2) {
  if (x === null || x === undefined || Number.isNaN(Number(x))) return "—";
  const n = Number(x);
  return `${n >= 0 ? "+" : ""}${n.toFixed(digits)}%`;
}

function fmtNum(x, digits = 2) {
  if (x === null || x === undefined || Number.isNaN(Number(x))) return "—";
  return Number(x).toFixed(digits);
}

/** @param {{ report: object; summary: object }} props */
function paperKpis(report, summary) {
  const cum = report?.cumulative_return_daily || [];
  let total =
    cum.length > 0 ? Number(cum[cum.length - 1]?.cumulative_return_pct) : null;
  if (total == null || Number.isNaN(total)) {
    const a = report?.aligned_portfolio_return_pct;
    total = a != null ? Number(a) : null;
  }
  const bench = report?.aligned_benchmark_return_pct != null ? Number(report.aligned_benchmark_return_pct) : null;
  return {
    total,
    bench,
    sharpe: report?.sharpe_ratio != null ? Number(report.sharpe_ratio) : null,
    maxDd: report?.max_drawdown_pct != null ? Number(report.max_drawdown_pct) : null,
    winRate: report?.win_rate_pct != null ? Number(report.win_rate_pct) : null,
    sells: report?.sell_count ?? 0,
  };
}

function metricRowFromTable(summary, name) {
  const rows = summary?.metrics_table || [];
  return rows.find((r) => r.name === name) || null;
}

function interpretTotalReturnCard(tr, bench) {
  if (tr == null || Number.isNaN(tr)) return "Return could not be computed for this period.";
  if (bench == null || Number.isNaN(bench)) {
    return `Your portfolio return was ${fmtPct(tr)} over this period. Benchmark comparison was not available for every day in range.`;
  }
  if (tr >= bench) {
    return `Your portfolio grew by ${fmtPct(tr)} over this period, ahead of the ASX 200 benchmark at ${fmtPct(bench)}.`;
  }
  return `Your portfolio returned ${fmtPct(tr)} over this period, behind the ASX 200 benchmark at ${fmtPct(bench)}.`;
}

function interpretSharpeCard(sh) {
  if (sh == null || Number.isNaN(sh)) return "Sharpe ratio could not be computed for this window.";
  if (sh >= 1) {
    return "A Sharpe Ratio above 1 indicates good risk-adjusted returns — you were well compensated for the risk taken.";
  }
  return "Sharpe is below 1 — returns were modest relative to day-to-day volatility in this window.";
}

function interpretMaxDdCard(dd) {
  if (dd == null || Number.isNaN(dd)) return "Drawdown could not be summarised.";
  const v = Math.abs(dd);
  return `Your portfolio dropped a maximum of ${v.toFixed(2)}% from its peak, suggesting ${
    v <= 8 ? "controlled downside risk." : "elevated drawdown versus peak — review sizing and entries."
  }`;
}

function interpretWinRateCard(wr, sells) {
  if (wr == null || Number.isNaN(wr) || !sells) return "No closed sells in range, or win rate not applicable.";
  const w = Math.round(wr / 10);
  return `${w} out of every 10 closed trades were profitable.`;
}

function safePdfUsername(email) {
  return String(email || "user")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .slice(0, 40);
}

/**
 * @param {{
 *   open: boolean;
 *   onClose: () => void;
 *   report: object | null;
 *   summary: object | null;
 *   username: string;
 *   start: string;
 *   end: string;
 *   generatedAt: string;
 *   backtestRuns: import("../constants/backtestRunHistoryStorage").BacktestRunRecord[];
 * }} props
 */
export default function TradingPerformanceReportModal({
  open,
  onClose,
  report,
  summary,
  username,
  start,
  end,
  generatedAt,
  backtestRuns,
}) {
  const bodyRef = useRef(null);
  const [pdfBusy, setPdfBusy] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  const downloadPdf = useCallback(async () => {
    if (!bodyRef.current) return;
    setPdfBusy(true);
    try {
      await new Promise((r) => setTimeout(r, 500));
      const canvas = await html2canvas(bodyRef.current, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: "#ffffff",
      });
      const imgData = canvas.toDataURL("image/png");
      const pdfW = 595;
      const margin = 20;
      const imgW = pdfW - margin * 2;
      const imgH = (canvas.height * imgW) / canvas.width;
      const pdfH = Math.min(Math.max(imgH + margin * 2, 842), 20000);
      const pdf = new jsPDF({ orientation: "p", unit: "pt", format: [pdfW, pdfH] });
      pdf.addImage(imgData, "PNG", margin, margin, imgW, imgH);
      const fn = `CowrieShell-Report-${safePdfUsername(username)}-${start}-${end}.pdf`;
      pdf.save(fn);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : String(e));
    } finally {
      setPdfBusy(false);
    }
  }, [username, start, end]);

  if (!open || !report || !summary) return null;

  const pk = paperKpis(report, summary);
  const pa = summary.portfolio_activity || {};
  const benchLabel = report.portfolio_vs_benchmark?.benchmark_label || "ASX 200";
  const mergedPnl = (report.per_stock_pnl || []).map((row) => {
    const perf = (report.per_stock_performance || []).find((p) => p.ticker === row.ticker);
    const rp = perf?.return_pct != null ? Number(perf.return_pct) : null;
    return { ticker: row.ticker, pnl: row.pnl, return_pct: rp != null && !Number.isNaN(rp) ? rp : null };
  });
  mergedPnl.sort((a, b) => b.pnl - a.pnl);
  const best = mergedPnl[0];
  const worst = mergedPnl.length ? mergedPnl[mergedPnl.length - 1] : null;

  const mergedStockRows = (report.per_stock_pnl || []).map((row) => {
    const perf = (report.per_stock_performance || []).find((p) => p.ticker === row.ticker);
    const rp = perf?.return_pct != null ? Number(perf.return_pct) : null;
    return {
      ticker: row.ticker,
      pnl: row.pnl,
      return_pct: rp != null && !Number.isNaN(rp) ? rp : null,
    };
  });

  const fmtStockNote = (x) => {
    if (!x) return "";
    const pct =
      x.return_pct != null && !Number.isNaN(x.return_pct)
        ? ` (${x.return_pct >= 0 ? "+" : ""}${fmtNum(x.return_pct, 2)}% return)`
        : "";
    return `${x.ticker} ${x.pnl >= 0 ? "+" : ""}A$${fmtNum(x.pnl, 0)}${pct}`;
  };

  const betaRow = metricRowFromTable(summary, "Beta");
  const sharpeRow = metricRowFromTable(summary, "Sharpe Ratio");
  const maxDdRow = metricRowFromTable(summary, "Max Drawdown");

  const genAt = generatedAt || new Date().toISOString();

  const firstBt = backtestRuns[0];
  const firstBtTr =
    firstBt?.metrics && firstBt.metrics.total_return_pct != null ? Number(firstBt.metrics.total_return_pct) : null;
  const backtestVsPaperNote =
    firstBtTr != null && pk.total != null && !Number.isNaN(firstBtTr) && !Number.isNaN(pk.total)
      ? pk.total < firstBtTr
        ? `Your actual paper trading return of ${fmtPct(pk.total)} was lower than the backtest predicted ${fmtPct(firstBtTr)}, which is common due to real market timing differences.`
        : `Your actual paper trading return of ${fmtPct(pk.total)} met or exceeded the saved backtest figure of ${fmtPct(firstBtTr)} for the listed run — live fills and cash can still differ from the simulation.`
      : "Compare backtest windows to your Performance date range when interpreting differences.";

  return createPortal(
    <div className="tpr-overlay" role="presentation">
      <div className="tpr-topbar">
        <button type="button" className="tpr-pdf-btn" disabled={pdfBusy} onClick={() => void downloadPdf()}>
          {pdfBusy ? "Preparing PDF…" : "Download PDF"}
        </button>
        <button type="button" className="tpr-close-x" aria-label="Close" onClick={onClose}>
          ×
        </button>
      </div>
      <div className="tpr-scroll">
        <div ref={bodyRef} className="tpr-doc">
          <header className="tpr-header">
            <div className="tpr-header-top">
              <PixelLogo />
              <div className="tpr-header-text">
                <h1 className="tpr-title">Trading Performance Report</h1>
                <p className="tpr-meta">
                  <span className="tpr-mono">{username}</span>
                  <span className="tpr-meta-sep"> · </span>
                  <span className="tpr-mono">
                    {start} → {end}
                  </span>
                </p>
                <p className="tpr-generated">Generated {String(genAt).replace("T", " ").slice(0, 19)} UTC</p>
              </div>
            </div>
            <div className="tpr-divider" />
          </header>

          <section className="tpr-section">
            <h2 className="tpr-section-title">
              <span className="tpr-gold-sq" aria-hidden />
              Paper trading performance
            </h2>
            <div className="tpr-metric-grid">
              <div className="tpr-metric-card">
                <div className="tpr-metric-label">Total Return</div>
                <div className="tpr-metric-val">{fmtPct(pk.total)}</div>
                <p className="tpr-metric-note">{interpretTotalReturnCard(pk.total, pk.bench)}</p>
              </div>
              <div className="tpr-metric-card">
                <div className="tpr-metric-label">Sharpe Ratio</div>
                <div className="tpr-metric-val">{pk.sharpe != null ? fmtNum(pk.sharpe, 2) : "—"}</div>
                <p className="tpr-metric-note">{interpretSharpeCard(pk.sharpe)}</p>
              </div>
              <div className="tpr-metric-card">
                <div className="tpr-metric-label">Max Drawdown</div>
                <div className="tpr-metric-val" style={{ color: pk.maxDd != null && Number(pk.maxDd) < -12 ? RED : INK }}>
                  {pk.maxDd != null ? `${fmtNum(pk.maxDd, 2)}%` : "—"}
                </div>
                <p className="tpr-metric-note">{interpretMaxDdCard(pk.maxDd)}</p>
              </div>
              <div className="tpr-metric-card">
                <div className="tpr-metric-label">Win Rate</div>
                <div className="tpr-metric-val">{pk.winRate != null ? `${fmtNum(pk.winRate, 0)}%` : "—"}</div>
                <p className="tpr-metric-note">{interpretWinRateCard(pk.winRate, pk.sells)}</p>
              </div>
            </div>
          </section>

          <section className="tpr-section">
            <h2 className="tpr-section-title">
              <span className="tpr-gold-sq" aria-hidden />
              Portfolio activity
            </h2>
            <div className="tpr-two-col">
              <div className="tpr-stats">
                <div className="tpr-stat-row">
                  <span>Starting value</span>
                  <span className="tpr-mono">{pa.starting_value != null ? `$${fmtNum(pa.starting_value, 2)}` : "—"}</span>
                </div>
                <div className="tpr-stat-row">
                  <span>Ending value</span>
                  <span className="tpr-mono">{pa.ending_value != null ? `$${fmtNum(pa.ending_value, 2)}` : "—"}</span>
                </div>
                <div className="tpr-stat-row">
                  <span>Cash remaining</span>
                  <span className="tpr-mono">${fmtNum(pa.cash_remaining, 2)}</span>
                </div>
                <div className="tpr-stat-row">
                  <span>Total trades</span>
                  <span className="tpr-mono">{report.trade_count ?? "—"}</span>
                </div>
                <div className="tpr-stat-row">
                  <span>Buy trades</span>
                  <span className="tpr-mono">{pa.buy_trades ?? "—"}</span>
                </div>
                <div className="tpr-stat-row">
                  <span>Sell trades</span>
                  <span className="tpr-mono">{pa.sell_trades ?? "—"}</span>
                </div>
                <div className="tpr-stat-row">
                  <span>Most traded stock</span>
                  <span className="tpr-mono">
                    {pa.most_traded_ticker ? `${pa.most_traded_ticker} (${pa.most_traded_count})` : "—"}
                  </span>
                </div>
              </div>
              <div className="tpr-chart-box">
                <p className="tpr-chart-caption">Portfolio vs {benchLabel} (day-over-day %)</p>
                <ComparisonChartPanel
                  embedded
                  dailyPercentComparison
                  portfolio={report.portfolio_vs_benchmark?.portfolio || []}
                  benchmark={report.portfolio_vs_benchmark?.benchmark || []}
                  benchLabel={benchLabel}
                  height={200}
                />
              </div>
            </div>
            <h3 className="tpr-subsec-title">Paper trades executed ({summary.trades?.length ?? 0})</h3>
            <div className="tpr-trades-wrap">
              <table className="tpr-table tpr-table-compact">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Side</th>
                    <th>Ticker</th>
                    <th>Qty</th>
                    <th>Price</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {(summary.trades || []).map((t) => (
                    <tr key={t.id}>
                      <td className="tpr-mono">{t.executed_at ? t.executed_at.slice(0, 19) : "—"}</td>
                      <td>{t.side}</td>
                      <td className="tpr-mono">{t.ticker}</td>
                      <td className="tpr-mono">{fmtNum(t.quantity, 4)}</td>
                      <td className="tpr-mono">{fmtNum(t.price, 4)}</td>
                      <td className="tpr-mono">{fmtNum(t.total, 2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="tpr-section">
            <h2 className="tpr-section-title">
              <span className="tpr-gold-sq" aria-hidden />
              Stock performance
            </h2>
            <div className="tpr-chart-box">
              <PerStockPnlBars embedded barLayout="left" rows={mergedStockRows} />
            </div>
            <p className="tpr-note">
              {best ? `Best performer: ${fmtStockNote(best)}. ` : "No P/L by stock in this range. "}
              {worst && worst.ticker !== best?.ticker ? `Worst performer: ${fmtStockNote(worst)}.` : worst ? "" : ""}
            </p>
          </section>

          {backtestRuns.length ? (
            <section className="tpr-section">
              <h2 className="tpr-section-title">
                <span className="tpr-gold-sq" aria-hidden />
                Backtest results
              </h2>
              {backtestRuns.map((run) => {
                const m = run.metrics || {};
                const btTr = m.total_return_pct != null ? Number(m.total_return_pct) : null;
                const btWr = m.win_rate_pct != null ? Number(m.win_rate_pct) : null;
                const btDd = m.max_drawdown_pct != null ? Number(m.max_drawdown_pct) : null;
                const btSh = m.sharpe_ratio != null ? Number(m.sharpe_ratio) : null;
                const pTr = pk.total;
                const pWr = pk.winRate;
                const pDd = pk.maxDd;
                const pSh = pk.sharpe;
                const rows = [
                  { label: "Total Return", b: btTr, p: pTr, fmt: (x) => (x == null ? "—" : fmtPct(x)), kind: "pct" },
                  { label: "Win Rate", b: btWr, p: pWr, fmt: (x) => (x == null ? "—" : `${fmtNum(x, 0)}%`), kind: "wr" },
                  { label: "Max Drawdown", b: btDd, p: pDd, fmt: (x) => (x == null ? "—" : `${fmtNum(x, 2)}%`), kind: "dd" },
                  { label: "Sharpe Ratio", b: btSh, p: pSh, fmt: (x) => (x == null ? "—" : fmtNum(x, 2)), kind: "sh" },
                ];
                return (
                  <div key={run.id} className="tpr-bt-block">
                    <h3 className="tpr-bt-title">
                      {run.strategyName || "Saved backtest"}{" "}
                      <span className="tpr-mono">
                        {run.ticker} · ran {run.ranAt.slice(0, 10)} · tested {run.btStart} → {run.btEnd}
                      </span>
                    </h3>
                    <table className="tpr-table">
                      <thead>
                        <tr>
                          <th>Metric</th>
                          <th>Backtest</th>
                          <th>Actual paper trading</th>
                          <th>Difference</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r) => {
                          const diff =
                            r.b != null && r.p != null && !Number.isNaN(r.b) && !Number.isNaN(r.p) ? r.b - r.p : null;
                          let diffStr = "—";
                          if (diff != null && !Number.isNaN(diff)) {
                            if (r.kind === "pct") diffStr = fmtPct(diff);
                            else if (r.kind === "wr" || r.kind === "dd")
                              diffStr = `${diff >= 0 ? "+" : ""}${fmtNum(diff, 2)} pp`;
                            else diffStr = `${diff >= 0 ? "+" : ""}${fmtNum(diff, 3)}`;
                          }
                          return (
                            <tr key={r.label}>
                              <td>{r.label}</td>
                              <td className="tpr-mono">{r.fmt(r.b)}</td>
                              <td className="tpr-mono">{r.fmt(r.p)}</td>
                              <td className="tpr-mono" style={{ color: diff > 0 ? GREEN : diff < 0 ? RED : GREY }}>
                                {diffStr}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    <pre className="tpr-code-snippet">{String(run.code || "")}</pre>
                  </div>
                );
              })}
              <p className="tpr-note">{backtestVsPaperNote}</p>
            </section>
          ) : null}

          <section className="tpr-section">
            <h2 className="tpr-section-title">
              <span className="tpr-gold-sq" aria-hidden />
              Risk analysis
            </h2>
            <div className="tpr-risk-rows">
              <div className="tpr-risk-row">
                <div className="tpr-risk-head">
                  <span className="tpr-risk-label">Beta</span>
                  <span className="tpr-mono">{betaRow?.value ?? "—"}</span>
                </div>
                <p className="tpr-risk-note">{betaRow?.interpretation || "Beta could not be estimated."}</p>
              </div>
              <div className="tpr-risk-row">
                <div className="tpr-risk-head">
                  <span className="tpr-risk-label">Max drawdown</span>
                  <span className="tpr-mono">{maxDdRow?.value ?? "—"}</span>
                </div>
                <p className="tpr-risk-note">{maxDdRow?.interpretation || "—"}</p>
              </div>
              <div className="tpr-risk-row">
                <div className="tpr-risk-head">
                  <span className="tpr-risk-label">Sharpe ratio</span>
                  <span className="tpr-mono">{sharpeRow?.value ?? "—"}</span>
                </div>
                <p className="tpr-risk-note">{sharpeRow?.interpretation || "—"}</p>
              </div>
            </div>
          </section>

          <footer className="tpr-footer">
            <div className="tpr-divider" />
            <div className="tpr-footer-row">
              <span>Cowrie Shell Paper Trading Simulator</span>
              <span>Paper trading only — not financial advice.</span>
            </div>
          </footer>
        </div>
      </div>
    </div>,
    document.body
  );
}
