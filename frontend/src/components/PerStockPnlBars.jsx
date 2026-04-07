import { formatAud } from "../formatAud";

/** @param {{ ticker: string, pnl: number }[]} rows */
export default function PerStockPnlBars({ title, rows }) {
  if (!rows?.length) {
    return (
      <section className="cs-card p-5">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted">{title}</h3>
        <p className="mt-4 text-xs font-mono text-muted">No stock P&amp;L in this range.</p>
      </section>
    );
  }

  const extent = Math.max(...rows.map((r) => Math.abs(r.pnl)), 1);

  return (
    <section className="cs-card p-5">
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted">{title}</h3>
      <p className="mt-2 text-[11px] font-mono text-muted leading-snug">
        Realised P/L on sells in range plus current unrealised per ticker.
      </p>
      <div className="mt-4 space-y-3">
        {rows.map((r) => {
          const w = (Math.abs(r.pnl) / extent) * 50;
          const positive = r.pnl >= 0;
          return (
            <div
              key={r.ticker}
              className="grid grid-cols-[minmax(0,6.5rem)_1fr_minmax(0,5.5rem)] gap-3 items-center sm:grid-cols-[minmax(0,7rem)_1fr_6rem]"
            >
              <span className="min-w-0 font-mono text-xs font-bold text-ink truncate">{r.ticker}</span>
              <div className="h-2.5 rounded-sm bg-black/[0.04] overflow-hidden relative shadow-card-sm">
                <div className="absolute left-1/2 top-0 bottom-0 w-px bg-ink/10 z-[1]" />
                {positive ? (
                  <div
                    className="absolute top-0 bottom-0 rounded-sm bg-profit"
                    style={{ left: "50%", width: `${w}%` }}
                  />
                ) : (
                  <div
                    className="absolute top-0 bottom-0 rounded-sm bg-danger"
                    style={{ right: "50%", width: `${w}%` }}
                  />
                )}
              </div>
              <span
                className={`font-mono text-xs text-right tabular-nums font-bold ${positive ? "text-profit" : "text-danger"}`}
              >
                {r.pnl > 0 ? "+" : ""}
                {formatAud(r.pnl)}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
