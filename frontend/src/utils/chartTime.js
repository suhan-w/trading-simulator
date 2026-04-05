/** @param {string|number} t */
export function isoOrDateToTime(t) {
  if (typeof t === "number" && !Number.isNaN(t)) return t;
  const s = String(t);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split("-").map(Number);
    return Math.floor(Date.UTC(y, m - 1, d) / 1000);
  }
  const ms = new Date(s).getTime();
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : 0;
}
