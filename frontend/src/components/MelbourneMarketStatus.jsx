import { useEffect, useMemo, useState } from "react";

const REASON_LABELS = {
  weekend: "Weekend",
  public_holiday: "Public holiday (Vic.)",
  before_open: "Before open (10:00)",
  after_close: "After close (16:00)",
};

function formatCountdown(totalSeconds) {
  if (totalSeconds == null || totalSeconds < 0) return "—";
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}

export default function MelbourneMarketStatus({ session, fetchedAt }) {
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
      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <span>Melbourne time / ASX status…</span>
      </div>
    );
  }

  const reasonKey = session.closed_reason;
  const reasonText =
    reasonKey === "public_holiday" && session.holiday_name
      ? `${REASON_LABELS.public_holiday}: ${session.holiday_name}`
      : reasonKey
        ? REASON_LABELS[reasonKey] || reasonKey
        : null;

  return (
    <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2 sm:gap-3 text-xs">
      <div className="flex items-center gap-2">
        <span
          className={`px-2 py-1 rounded-md font-semibold font-mono ${
            session.open ? "bg-emerald-950/80 text-emerald-300 border border-emerald-800" : "bg-amber-950/70 text-amber-200 border border-amber-800/80"
          }`}
        >
          ASX {session.open ? "Open" : "Closed"}
        </span>
        <span className="text-slate-400 hidden sm:inline">{session.session_hours_note}</span>
      </div>
      <div className="text-slate-300 font-mono tabular-nums">
        <span className="text-slate-500">{session.timezone_abbr}</span> {session.melbourne_time_display}
      </div>
      {!session.open && (
        <div className="text-slate-400 flex flex-wrap items-center gap-x-2 gap-y-1">
          {reasonText && <span>{reasonText}.</span>}
          {countdownSeconds != null && (
            <span>
              Opens in <span className="text-accent font-mono font-semibold">{formatCountdown(countdownSeconds)}</span>
              {session.next_open_display && (
                <span className="text-slate-500"> ({session.next_open_display})</span>
              )}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
