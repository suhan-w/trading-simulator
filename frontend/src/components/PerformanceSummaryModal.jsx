import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import BrandMark from "./BrandMark";
import { api } from "../api/client";

/** @param {{ n: number | null | undefined }} props */
function Num({ n, digits = 2 }) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) {
    return <span className="summary-num">—</span>;
  }
  const v = Number(n);
  const cls = v >= 0 ? "summary-num summary-pos" : "summary-num summary-neg";
  const sign = v >= 0 ? "+" : "";
  return (
    <span className={cls}>
      {sign}
      {v.toFixed(digits)}
    </span>
  );
}

/** @param {{ title: string, children: import("react").ReactNode }} props */
function Section({ title, children }) {
  return (
    <section className="perf-summary-section">
      <h3 className="perf-summary-section-title">
        <span className="perf-gold-sq" aria-hidden />
        {title}
      </h3>
      <div className="perf-summary-section-body">{children}</div>
    </section>
  );
}

/**
 * @param {{
 *   open: boolean;
 *   onClose: () => void;
 *   start: string;
 *   end: string;
 *   data: object | null;
 *   strategyTitle?: string;
 *   strategyNotes?: string;
 * }} props
 */
export default function PerformanceSummaryModal({
  open,
  onClose,
  start,
  end,
  data,
  strategyTitle = "",
  strategyNotes = "",
}) {
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
    setPdfBusy(true);
    try {
      const extras = {};
      if (strategyTitle.trim()) extras.strategyTitle = strategyTitle.trim();
      if (strategyNotes.trim()) extras.strategyNotes = strategyNotes.trim();
      const blob = await api.performanceSummaryReportPdfBlob(start, end, extras);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "cowrie-shell-performance-summary.pdf";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : String(e));
    } finally {
      setPdfBusy(false);
    }
  }, [start, end, strategyTitle, strategyNotes]);

  if (!open || !data) return null;

  const gen = data.generated_at ? String(data.generated_at).replace("T", " ").slice(0, 19) : "";
  const bc = data.benchmark_comparison || {};
  const pa = data.portfolio_activity || {};

  return createPortal(
    <div className="perf-summary-overlay" role="presentation" onClick={onClose}>
      <div
        className="perf-summary-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="perf-summary-heading"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="perf-summary-dialog-head">
          <BrandMark asStatic />
          <div className="perf-summary-head-text">
            <h2 id="perf-summary-heading" className="perf-summary-title">
              Performance summary report
            </h2>
            <p className="perf-summary-meta">
              <span className="font-mono text-[11px] text-muted">{data.date_range_label}</span>
              <span className="text-muted"> · </span>
              <span className="font-mono text-[11px] text-muted">Generated {gen} UTC</span>
            </p>
          </div>
          <button type="button" className="perf-summary-close" onClick={onClose} aria-label="Close report">
            ×
          </button>
        </header>

        <div className="perf-summary-scroll">
          {(data.strategy_context?.strategy_title || data.strategy_context?.strategy_notes) && (
            <Section title="Strategy context (you provided)">
              <div className="space-y-2 text-sm text-ink">
                {data.strategy_context?.strategy_title ? (
                  <p className="m-0">
                    <span className="font-semibold">Approach: </span>
                    {data.strategy_context.strategy_title}
                  </p>
                ) : null}
                {data.strategy_context?.strategy_notes ? (
                  <p className="m-0 whitespace-pre-wrap leading-snug">{data.strategy_context.strategy_notes}</p>
                ) : null}
              </div>
            </Section>
          )}

          <Section title="Executive summary">
            <p className="perf-summary-prose">{data.executive_summary}</p>
          </Section>

          <Section title="Performance metrics">
            <div className="perf-summary-table-wrap">
              <table className="perf-summary-table">
                <thead>
                  <tr>
                    <th>Metric</th>
                    <th>Value</th>
                    <th>Interpretation</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.metrics_table || []).map((row) => (
                    <tr key={row.name}>
                      <td className="font-medium text-ink">{row.name}</td>
                      <td className="font-mono text-sm text-ink">{row.value}</td>
                      <td className="text-[13px] leading-snug text-[#666]">{row.interpretation}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <Section title="Portfolio activity">
            <ul className="perf-summary-list">
              <li>
                Starting value (window):{" "}
                <span className="font-mono text-ink">
                  {pa.starting_value != null ? `${Number(pa.starting_value).toFixed(2)} AUD` : "—"}
                </span>
              </li>
              <li>
                Ending value (window):{" "}
                <span className="font-mono text-ink">
                  {pa.ending_value != null ? `${Number(pa.ending_value).toFixed(2)} AUD` : "—"}
                </span>
              </li>
              <li>
                Cash remaining:{" "}
                <span className="font-mono text-ink">{Number(pa.cash_remaining).toFixed(2)} AUD</span>
              </li>
              <li>
                Buy trades: <span className="font-mono">{pa.buy_trades}</span> · Sell trades:{" "}
                <span className="font-mono">{pa.sell_trades}</span>
              </li>
              <li>
                Most traded:{" "}
                <span className="font-mono text-ink">{pa.most_traded_ticker || "—"}</span>{" "}
                <span className="text-muted">({pa.most_traded_count ?? 0} fills)</span>
              </li>
            </ul>
          </Section>

          <Section title="Top performers">
            <ul className="perf-summary-perf-list">
              {(data.top_performers || []).length === 0 ? (
                <li className="text-muted">No per-ticker P/L for this range.</li>
              ) : (
                (data.top_performers || []).map((r) => (
                  <li key={r.ticker} className="font-mono text-sm">
                    <span className="font-semibold text-ink">{r.ticker}</span> · return{" "}
                    {r.return_pct != null ? (
                      <>
                        <Num n={r.return_pct} />%
                      </>
                    ) : (
                      "—"
                    )}{" "}
                    · P/L <Num n={r.pnl} /> AUD
                  </li>
                ))
              )}
            </ul>
          </Section>

          <Section title="Worst performers">
            <ul className="perf-summary-perf-list">
              {(data.worst_performers || []).length === 0 ? (
                <li className="text-muted">No per-ticker P/L for this range.</li>
              ) : (
                (data.worst_performers || []).map((r) => (
                  <li key={`w-${r.ticker}`} className="font-mono text-sm">
                    <span className="font-semibold text-ink">{r.ticker}</span> · return{" "}
                    {r.return_pct != null ? (
                      <>
                        <Num n={r.return_pct} />%
                      </>
                    ) : (
                      "—"
                    )}{" "}
                    · P/L <Num n={r.pnl} /> AUD
                  </li>
                ))
              )}
            </ul>
          </Section>

          <Section title="Risk assessment">
            <p className="perf-summary-prose">{data.risk_assessment}</p>
          </Section>

          <Section title="Benchmark comparison">
            <ul className="perf-summary-list">
              <li>
                Strategy total return (overlap): <Num n={bc.strategy_period_return_pct} />%
              </li>
              <li>
                {bc.benchmark_label || "Benchmark"} total return (overlap):{" "}
                <Num n={bc.benchmark_period_return_pct} />%
              </li>
              <li>
                Excess vs benchmark: <Num n={bc.excess_return_pct} />%
              </li>
            </ul>
          </Section>

          <Section title="Conclusion">
            <p className="perf-summary-prose">{data.conclusion}</p>
          </Section>

          <p className="perf-summary-disclaimer">
            Paper trading only — not financial advice.
          </p>
        </div>

        <footer className="perf-summary-footer">
          <button
            type="button"
            className="cs-btn-buy px-5 py-2.5 text-sm font-semibold disabled:opacity-50"
            onClick={() => void downloadPdf()}
            disabled={pdfBusy}
          >
            {pdfBusy ? "Preparing PDF…" : "Download as PDF"}
          </button>
          <button type="button" className="perf-summary-btn-secondary px-5 py-2.5 text-sm font-semibold" onClick={onClose}>
            Close
          </button>
        </footer>
      </div>
    </div>,
    document.body
  );
}
