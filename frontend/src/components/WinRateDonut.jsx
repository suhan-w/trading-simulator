import CardHeaderTitle from "./CardHeaderTitle";

const GOLD = "#c8963e";

/** @param {{ winning_sells: number, losing_sells: number, breakeven_sells: number }} breakdown */
export default function WinRateDonut({
  title = "",
  tooltipText = "",
  breakdown,
  embedded = false,
}) {
  const { winning_sells: w, losing_sells: l, breakeven_sells: b } = breakdown;
  const t = w + l + b;
  const winPct = t > 0 ? Math.round((100 * w) / t) : 0;

  const inner =
    t === 0 ? (
      <p className="py-8 text-center font-mono text-sm text-[#888]">No data available for this range</p>
    ) : embedded ? (
      <div className="perf-donut-wrap">
        <div className="relative h-36 w-36 shrink-0">
          <div
            className="absolute inset-0 rounded-full shadow-card-sm"
            style={{
              background: (() => {
                let a = 0;
                const parts = [];
                if (w > 0) {
                  const deg = (w / t) * 360;
                  parts.push(`#2d8a55 ${a}deg ${a + deg}deg`);
                  a += deg;
                }
                if (l > 0) {
                  const deg = (l / t) * 360;
                  parts.push(`#c0392b ${a}deg ${a + deg}deg`);
                  a += deg;
                }
                if (b > 0) {
                  const deg = (b / t) * 360;
                  parts.push(`${GOLD} ${a}deg ${a + deg}deg`);
                }
                return `conic-gradient(${parts.join(", ")})`;
              })(),
            }}
          />
          <div className="absolute inset-[22%] flex flex-col items-center justify-center rounded-full bg-white shadow-card-sm">
            <span className="font-mono text-xl font-medium tabular-nums text-[#111]">{winPct}%</span>
            <span className="mt-0.5 text-[9px] font-semibold uppercase tracking-wide text-[#aaa]">WINS</span>
          </div>
        </div>
        <div className="perf-legend">
          <div className="perf-legend-row">
            <span className="perf-legend-dot" style={{ backgroundColor: "#2d8a55" }} />
            <span>Profitable</span>
            <span className="ml-auto font-mono font-medium tabular-nums text-[#111]">{w}</span>
          </div>
          <div className="perf-legend-row">
            <span className="perf-legend-dot" style={{ backgroundColor: "#c0392b" }} />
            <span>Losing</span>
            <span className="ml-auto font-mono font-medium tabular-nums text-[#111]">{l}</span>
          </div>
          <div className="perf-legend-row">
            <span className="perf-legend-dot" style={{ backgroundColor: GOLD }} />
            <span>Breakeven</span>
            <span className="ml-auto font-mono font-medium tabular-nums text-[#111]">{b}</span>
          </div>
        </div>
      </div>
    ) : (
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center sm:gap-10">
          <div className="relative h-36 w-36 shrink-0">
            <div
              className="absolute inset-0 rounded-full shadow-card-sm"
              style={{
                background: (() => {
                  let a = 0;
                  const parts = [];
                  if (w > 0) {
                    const deg = (w / t) * 360;
                    parts.push(`#2d8a55 ${a}deg ${a + deg}deg`);
                    a += deg;
                  }
                  if (l > 0) {
                    const deg = (l / t) * 360;
                    parts.push(`#c0392b ${a}deg ${a + deg}deg`);
                    a += deg;
                  }
                  if (b > 0) {
                    const deg = (b / t) * 360;
                  parts.push(`${GOLD} ${a}deg ${a + deg}deg`);
                  }
                  return `conic-gradient(${parts.join(", ")})`;
                })(),
              }}
            />
          <div className="absolute inset-[22%] flex flex-col items-center justify-center rounded-full bg-white shadow-card-sm">
            <span className="font-mono text-xl font-medium tabular-nums text-[#111]">{winPct}%</span>
            <span className="mt-0.5 text-[9px] font-semibold uppercase tracking-wide text-[#aaa]">win rate</span>
          </div>
        </div>
        <ul className="space-y-2 text-xs font-mono text-[#888]">
            <li className="flex items-center gap-2">
            <span className="h-2 w-2 shrink-0 rounded-[1px]" style={{ backgroundColor: "#2d8a55" }} />
            Profitable sells <span className="font-medium tabular-nums text-[#111]">{w}</span>
            </li>
            <li className="flex items-center gap-2">
            <span className="h-2 w-2 shrink-0 rounded-[1px]" style={{ backgroundColor: "#c0392b" }} />
            Losing sells <span className="font-medium tabular-nums text-[#111]">{l}</span>
            </li>
            <li className="flex items-center gap-2">
            <span className="h-2 w-2 shrink-0 rounded-[1px]" style={{ backgroundColor: GOLD }} />
            Breakeven <span className="font-medium tabular-nums text-[#111]">{b}</span>
            </li>
          </ul>
        </div>
    );

  if (embedded) {
    return inner;
  }

  return (
    <section className="cs-card space-y-6 overflow-hidden p-5">
      <CardHeaderTitle title={title} tooltipText={tooltipText} headingLevel={3} />
      {inner}
    </section>
  );
}
