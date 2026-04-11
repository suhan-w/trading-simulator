/**
 * Shared date inputs (Performance + Backtesting).
 * @param {{
 *   start: string,
 *   end: string,
 *   onStartChange: (v: string) => void,
 *   onEndChange: (v: string) => void,
 *   before?: import("react").ReactNode,
 *   after?: import("react").ReactNode,
 *   variant?: "card" | "inline",
 *   showLabel?: boolean,
 *   labelText?: string,
 * }} props
 */
export default function CowrieDateRangeBar({
  start,
  end,
  onStartChange,
  onEndChange,
  before = null,
  after = null,
  variant = "card",
  showLabel = false,
  labelText = "Date range",
}) {
  const fields = (
    <>
      {before}
      <label className="block min-w-[9rem]">
        <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted">Start</span>
        <input
          type="date"
          value={start}
          onChange={(e) => onStartChange(e.target.value)}
          className="w-full rounded-lg border border-ink/[0.12] bg-white px-3 py-2 font-mono text-sm text-ink shadow-card-sm outline-none focus:ring-2 focus:ring-gold/30"
        />
      </label>
      <label className="block min-w-[9rem]">
        <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted">End</span>
        <input
          type="date"
          value={end}
          onChange={(e) => onEndChange(e.target.value)}
          className="w-full rounded-lg border border-ink/[0.12] bg-white px-3 py-2 font-mono text-sm text-ink shadow-card-sm outline-none focus:ring-2 focus:ring-gold/30"
        />
      </label>
      {after}
    </>
  );

  if (variant === "inline") {
    return <div className="flex flex-wrap items-end gap-3">{fields}</div>;
  }

  return (
    <div className="cs-card w-full overflow-hidden">
      <div className="border-b border-ink/[0.06] px-4 py-3 sm:px-5 sm:py-4">
        {showLabel ? (
          <div className="mb-3 flex items-center gap-2">
            <span className="h-2 w-2 shrink-0 rounded-[1px] bg-gold shadow-card-sm" aria-hidden />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">{labelText}</span>
          </div>
        ) : null}
        <div className="flex flex-wrap items-end gap-3">{fields}</div>
      </div>
    </div>
  );
}
