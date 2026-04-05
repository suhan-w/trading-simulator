import { TitleMark } from "./SectionHeading";

/** @param {{ winning_sells: number, losing_sells: number, breakeven_sells: number }} breakdown */
export default function WinRateDonut({ title, breakdown }) {
  const { winning_sells: w, losing_sells: l, breakeven_sells: b } = breakdown;
  const t = w + l + b;

  return (
    <section className="cs-card overflow-hidden p-5">
      <div className="flex items-center gap-2.5">
        <TitleMark />
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted">{title}</h3>
      </div>
      {t === 0 ? (
        <p className="mt-6 text-center text-xs font-mono text-muted">No sells in this range.</p>
      ) : (
        <div className="mt-6 flex flex-col items-center gap-4 sm:flex-row sm:justify-center sm:gap-10">
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
                    parts.push(`#aaaaaa ${a}deg ${a + deg}deg`);
                  }
                  return `conic-gradient(${parts.join(", ")})`;
                })(),
              }}
            />
            <div className="absolute inset-[22%] flex flex-col items-center justify-center rounded-full bg-card shadow-card-sm">
              <span className="text-lg font-bold tabular-nums text-ink">{Math.round((100 * w) / t)}%</span>
              <span className="text-[9px] font-semibold uppercase tracking-wide text-muted">wins</span>
            </div>
          </div>
          <ul className="space-y-2 text-xs font-mono text-muted">
            <li className="flex items-center gap-2">
              <span className="h-2 w-2 shrink-0 bg-profit" />
              Profitable sells <span className="font-bold text-ink tabular-nums">{w}</span>
            </li>
            <li className="flex items-center gap-2">
              <span className="h-2 w-2 shrink-0 bg-danger" />
              Losing sells <span className="font-bold text-ink tabular-nums">{l}</span>
            </li>
            <li className="flex items-center gap-2">
              <span className="h-2 w-2 shrink-0 bg-muted" />
              Breakeven <span className="font-bold text-ink tabular-nums">{b}</span>
            </li>
          </ul>
        </div>
      )}
    </section>
  );
}
