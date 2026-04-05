import { useEffect, useMemo, useState } from "react";

function formatCountdown(totalSeconds) {
  if (totalSeconds == null || totalSeconds < 0) return "—";
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}

function formatIndex(n) {
  return new Intl.NumberFormat("en-AU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

/** @param {{ value: number, change_pct: number | null | undefined } | null} asx200 */
export default function MelbourneMarketStatus({ session, fetchedAt, asx200 }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const countdownSeconds = useMemo(() => {
    if (!session || session.open || session.seconds_until_open == null || fetchedAt == null) return null;
    const elapsed = Math.floor((Date.now() - fetchedAt) / 1000);
    return Math.max(0, session.seconds_until_open - elapsed);
  }, [session, fetchedAt, tick]);

  if (!session) {
    return (
      <div className="text-xs text-muted font-mono">
        <span>Melbourne / ASX status…</span>
      </div>
    );
  }

  const holidayName =
    session.closed_reason === "public_holiday" && session.holiday_name ? session.holiday_name : null;

  return (
    <div className="flex flex-col gap-2.5 text-xs">
      <div className="flex flex-col gap-3 min-[900px]:flex-row min-[900px]:items-center min-[900px]:justify-between min-[900px]:gap-4">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 text-[11px] text-muted">
          <span
            className={`inline-flex shrink-0 items-center rounded-full border-2 px-3 py-1 text-xs font-semibold ${
              session.open
                ? "border-profit text-profit bg-transparent"
                : "border-danger text-danger bg-transparent"
            }`}
          >
            {session.open ? "Market Open" : "Market Closed"}
          </span>

          {!session.open && (
            <div className="min-w-0 flex flex-wrap items-center gap-x-2 gap-y-1">
              {holidayName && <span className="font-sans font-semibold text-ink">{holidayName}</span>}
              {countdownSeconds != null && (
                <span>
                  Opens in{" "}
                  <span className="font-mono font-semibold text-gold tabular-nums">
                    {formatCountdown(countdownSeconds)}
                  </span>
                </span>
              )}
              {session.next_open_display && (
                <span>
                  {(holidayName || countdownSeconds != null) && <span>· </span>}
                  {session.next_open_display}
                </span>
              )}
            </div>
          )}
        </div>

        <div className="shrink-0 text-right min-[900px]:text-right">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">ASX 200 (^AXJO)</p>
          {asx200 != null ? (
            <p className="mt-0.5 font-mono text-sm tabular-nums text-ink">
              <span className="font-bold">{formatIndex(asx200.value)}</span>
              {asx200.change_pct != null && (
                <span
                  className={`ml-2 text-xs font-bold ${
                    asx200.change_pct >= 0 ? "text-profit" : "text-danger"
                  }`}
                >
                  {asx200.change_pct >= 0 ? "+" : ""}
                  {Number(asx200.change_pct).toFixed(2)}%
                </span>
              )}
            </p>
          ) : (
            <p className="mt-0.5 font-mono text-xs text-muted">—</p>
          )}
        </div>
      </div>
    </div>
  );
}
