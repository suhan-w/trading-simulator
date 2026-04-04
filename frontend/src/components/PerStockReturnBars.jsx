/** @param {{ ticker: string, return_pct: number }[]} rows */
export default function PerStockReturnBars({ rows }) {
  if (!rows?.length) {
    return <p className="text-slate-500 text-sm">No stocks with price history in this range.</p>;
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
            className="grid grid-cols-[minmax(0,7rem)_1fr_4.5rem] gap-3 items-center"
          >
            <span className="font-mono text-xs text-white truncate" title={r.ticker}>
              {r.ticker}
            </span>
            <div className="h-3 bg-surface-700 rounded-full overflow-hidden relative">
              <div className="absolute left-1/2 top-0 bottom-0 w-px bg-slate-500/40 z-[1]" />
              {positive ? (
                <div
                  className="absolute top-0 bottom-0 rounded-full bg-accent"
                  style={{ left: "50%", width: `${w}%` }}
                />
              ) : (
                <div
                  className="absolute top-0 bottom-0 rounded-full bg-danger"
                  style={{ right: "50%", width: `${w}%` }}
                />
              )}
            </div>
            <span
              className={`font-mono text-xs text-right tabular-nums ${positive ? "text-accent" : "text-danger"}`}
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
