/** @param {{ ticker: string, return_pct: number }[]} rows */
export default function PerStockReturnBars({ rows }) {
  if (!rows?.length) {
    return <p className="text-xs font-mono text-muted">No stocks with price history in this range.</p>;
  }

  const extent = Math.max(...rows.map((r) => Math.abs(r.return_pct)), 0.01);

  return (
    <div className="space-y-3">
      {rows.map((r) => {
        const w = (Math.abs(r.return_pct) / extent) * 50;
        const positive = r.return_pct >= 0;
        return (
          <div
            key={r.ticker}
            className="grid grid-cols-[minmax(0,6.5rem)_1fr_4rem] gap-3 items-center sm:grid-cols-[minmax(0,7rem)_1fr_4.5rem]"
          >
            <span className="min-w-0 font-mono text-xs font-bold text-ink truncate tabular-nums">{r.ticker}</span>
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
              {r.return_pct > 0 ? "+" : ""}
              {Number(r.return_pct).toFixed(2)}%
            </span>
          </div>
        );
      })}
    </div>
  );
}
