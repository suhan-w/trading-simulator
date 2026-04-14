import { formatAud } from "../formatAud";
import CardHeaderTitle from "./CardHeaderTitle";

const BAR_POS = "#2d8a55";
const BAR_NEG = "#c0392b";

/** @param {{ ticker: string, pnl: number, return_pct?: number | null }[]} rows */
export default function PerStockPnlBars({
  title = "",
  tooltipText = "",
  rows,
  embedded = false,
  /** `"left"` = horizontal bars from the left (Performance page); default centres on zero */
  barLayout = "center",
}) {
  if (!rows?.length) {
    const empty = (
      <p className="py-8 text-center font-mono text-sm text-[#888]">No data available for this range</p>
    );
    if (embedded) return empty;
    return (
      <section className="cs-card space-y-5 p-5">
        <CardHeaderTitle title={title} tooltipText={tooltipText} headingLevel={3} />
        {empty}
      </section>
    );
  }

  const extent = Math.max(...rows.map((r) => Math.abs(r.pnl)), 1);

  const inner =
    barLayout === "left" ? (
      <div>
        {rows.map((r) => {
          const positive = r.pnl >= 0;
          const widthPct = (Math.abs(r.pnl) / extent) * 100;
          const rp =
            r.return_pct != null && !Number.isNaN(Number(r.return_pct))
              ? `${Number(r.return_pct) >= 0 ? "+" : ""}${Number(r.return_pct).toFixed(2)}%`
              : null;
          return (
            <div key={r.ticker} className="perf-pl-row">
              <span className="perf-pl-ticker">{r.ticker}</span>
              <div className="perf-pl-bar-wrap">
                <div
                  className="perf-pl-bar"
                  style={{
                    width: `${widthPct}%`,
                    backgroundColor: positive ? BAR_POS : BAR_NEG,
                  }}
                />
              </div>
              <div className="perf-pl-val-block">
                <span className={`perf-pl-val ${positive ? "pos" : "neg"}`}>
                  {r.pnl > 0 ? "+" : ""}
                  {formatAud(r.pnl)}
                </span>
                {rp ? (
                  <span className="perf-pl-pct" style={{ color: positive ? BAR_POS : BAR_NEG }}>
                    {rp}
                  </span>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    ) : (
      <div className="space-y-3">
        {rows.map((r) => {
          const w = (Math.abs(r.pnl) / extent) * 50;
          const positive = r.pnl >= 0;
          const rp =
            r.return_pct != null && !Number.isNaN(Number(r.return_pct))
              ? `${Number(r.return_pct) >= 0 ? "+" : ""}${Number(r.return_pct).toFixed(2)}%`
              : null;
          return (
            <div
              key={r.ticker}
              className="grid grid-cols-[minmax(0,6.5rem)_1fr_minmax(0,5.5rem)] gap-3 items-center sm:grid-cols-[minmax(0,7rem)_1fr_6rem]"
            >
              <span className="min-w-0 truncate font-mono text-xs font-semibold text-[#111]">{r.ticker}</span>
              <div className="relative h-2.5 overflow-hidden rounded-sm bg-black/[0.04] shadow-card-sm">
                <div className="absolute bottom-0 left-1/2 top-0 z-[1] w-px bg-ink/10" />
                {positive ? (
                  <div
                    className="absolute bottom-0 top-0 rounded-sm"
                    style={{ left: "50%", width: `${w}%`, backgroundColor: BAR_POS }}
                  />
                ) : (
                  <div
                    className="absolute bottom-0 top-0 rounded-sm"
                    style={{ right: "50%", width: `${w}%`, backgroundColor: BAR_NEG }}
                  />
                )}
              </div>
              <div className="flex flex-col items-end gap-0.5 text-right">
                <span
                  className="font-mono text-xs font-semibold tabular-nums"
                  style={{ color: positive ? BAR_POS : BAR_NEG }}
                >
                  {r.pnl > 0 ? "+" : ""}
                  {formatAud(r.pnl)}
                </span>
                {rp ? (
                  <span className="font-mono text-[10px] tabular-nums" style={{ color: positive ? BAR_POS : BAR_NEG }}>
                    {rp}
                  </span>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    );

  if (embedded) {
    return inner;
  }

  return (
    <section className="cs-card space-y-5 p-5">
      <CardHeaderTitle
        title={title}
        tooltipText={tooltipText}
        subtitle="Realised P/L on sells in range plus current unrealised per ticker."
        headingLevel={3}
      />
      {inner}
    </section>
  );
}
