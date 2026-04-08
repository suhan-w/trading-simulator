import { useEffect, useMemo, useState } from "react";
import { secondsUntilMelbourneSessionClose } from "../utils/melbourneSession";

function formatCountdown(totalSeconds) {
  if (totalSeconds == null || totalSeconds < 0) return "—";
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}

/** Compact "5h 18m" style for time until session close */
function formatCloseCountdown(totalSeconds) {
  if (totalSeconds == null || totalSeconds < 0) return "—";
  if (totalSeconds < 60) return "<1m";
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

function formatMelbourneClock(nowDate) {
  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Melbourne",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZoneName: "short",
  }).formatToParts(nowDate);
  const get = (t) => parts.find((p) => p.type === t)?.value ?? "";
  const hour = get("hour");
  const minute = get("minute");
  const dayPeriod = (get("dayPeriod") || "").toLowerCase();
  const tz = get("timeZoneName");
  return `Melbourne ${hour}:${minute}${dayPeriod}${tz ? ` ${tz}` : ""}`;
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

  const closeCountdownSeconds = useMemo(() => {
    if (!session?.open) return null;
    if (session.seconds_until_close != null && session.seconds_until_close >= 0) {
      let sec = session.seconds_until_close;
      if (fetchedAt != null) {
        sec = Math.max(0, sec - Math.floor((Date.now() - fetchedAt) / 1000));
      }
      return sec;
    }
    const fallback = secondsUntilMelbourneSessionClose();
    return fallback == null ? null : fallback;
  }, [session, fetchedAt, tick]);

  const melbourneClock = useMemo(() => formatMelbourneClock(new Date()), [tick]);

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
    <div className="flex w-full flex-row flex-wrap items-center justify-between gap-x-6 gap-y-2 text-xs">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
        <span
          className={
            session.open
              ? "inline-flex shrink-0 items-center rounded-full bg-profit/12 px-2.5 py-0.5 text-xs font-semibold text-profit"
              : "inline-flex shrink-0 items-center rounded-full bg-danger/10 px-2.5 py-0.5 text-xs font-semibold text-danger"
          }
        >
          {session.open ? "Market Open" : "Market Closed"}
        </span>

        {session.open && (
          <span className="min-w-0 text-[11px] text-muted">
            {melbourneClock}
            {closeCountdownSeconds != null && (
              <>
                {" "}
                <span className="text-ink/35">·</span>{" "}
                <span className="text-ink/70">Closes in </span>
                <span className="font-semibold tabular-nums text-ink">
                  {formatCloseCountdown(closeCountdownSeconds)}
                </span>
              </>
            )}
          </span>
        )}

        {!session.open && (
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted">
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

      <div className="flex shrink-0 items-baseline gap-2 sm:gap-3 font-sans">
        <span className="whitespace-nowrap text-[11px] font-semibold text-ink">ASX 200</span>
        {asx200 != null ? (
          <span className="font-mono text-sm tabular-nums text-ink">
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
          </span>
        ) : (
          <span className="font-mono text-xs text-muted">—</span>
        )}
      </div>
    </div>
  );
}
