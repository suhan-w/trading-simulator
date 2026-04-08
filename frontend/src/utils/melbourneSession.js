/** @param {number} ms */
function melbourneYmd(ms) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Melbourne",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(ms));
}

/** Seconds since midnight in Australia/Melbourne for this instant. */
function melbourneSecondsFromMidnight(ms) {
  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Melbourne",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hour12: false,
  }).formatToParts(new Date(ms));
  const num = (t) => parseInt(parts.find((p) => p.type === t)?.value ?? "0", 10);
  return num("hour") * 3600 + num("minute") * 60 + num("second");
}

const SESSION_END_SEC = 16 * 3600;

/** True if Melbourne time on *ms* is still strictly before 16:00 on calendar day *dayYmd* (YYYY-MM-DD). */
function beforeSessionEndOnDay(ms, dayYmd) {
  const ymd = melbourneYmd(ms);
  if (ymd < dayYmd) return true;
  if (ymd > dayYmd) return false;
  return melbourneSecondsFromMidnight(ms) < SESSION_END_SEC;
}

/**
 * Seconds until 16:00 Melbourne on the same calendar day as *nowMs*.
 * Used when the API omits `seconds_until_close`. Only meaningful while the session is open.
 */
export function secondsUntilMelbourneSessionClose(nowMs = Date.now()) {
  const dayYmd = melbourneYmd(nowMs);
  if (!beforeSessionEndOnDay(nowMs, dayYmd)) return 0;

  let lo = nowMs;
  let hi = nowMs + 12 * 3600000;
  if (beforeSessionEndOnDay(hi, dayYmd)) {
    return null;
  }

  while (hi - lo > 1000) {
    const mid = Math.floor((lo + hi) / 2);
    if (beforeSessionEndOnDay(mid, dayYmd)) lo = mid;
    else hi = mid;
  }
  return Math.max(0, Math.floor((hi - nowMs) / 1000));
}
