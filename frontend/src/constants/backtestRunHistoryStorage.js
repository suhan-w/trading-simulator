const KEY = "corrie_backtest_run_history_v1";
const MAX = 80;

/**
 * @typedef {{
 *   id: string;
 *   ranAt: string;
 *   strategyName?: string;
 *   ticker: string;
 *   btStart: string;
 *   btEnd: string;
 *   code: string;
 *   metrics: Record<string, unknown> | null;
 * }} BacktestRunRecord
 */

/** @returns {BacktestRunRecord[]} */
export function loadBacktestRunHistory() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (x) =>
        x &&
        typeof x.id === "string" &&
        typeof x.ranAt === "string" &&
        typeof x.ticker === "string" &&
        typeof x.btStart === "string" &&
        typeof x.btEnd === "string" &&
        typeof x.code === "string" &&
        (x.strategyName === undefined || typeof x.strategyName === "string")
    );
  } catch {
    return [];
  }
}

/** @param {BacktestRunRecord[]} items */
function persist(items) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items.slice(0, MAX)));
  } catch {
    /* quota */
  }
}

/**
 * @param {{
 *   ticker: string;
 *   btStart: string;
 *   btEnd: string;
 *   code: string;
 *   metrics: Record<string, unknown> | null;
 *   strategyName?: string;
 * }} run
 */
export function pushBacktestRunHistory(run) {
  const id =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `bt-${Date.now()}`;
  const rec = {
    id,
    ranAt: new Date().toISOString(),
    strategyName: run.strategyName,
    ticker: run.ticker,
    btStart: run.btStart,
    btEnd: run.btEnd,
    code: run.code,
    metrics: run.metrics,
  };
  const prev = loadBacktestRunHistory();
  persist([rec, ...prev]);
}

/**
 * Runs whose ranAt (UTC date) falls within [start, end] inclusive (YYYY-MM-DD).
 * @param {string} start
 * @param {string} end
 */
export function listBacktestRunsInRange(start, end) {
  const all = loadBacktestRunHistory();
  if (!start || !end) return [];
  return all.filter((r) => {
    const d = (r.ranAt || "").slice(0, 10);
    return d >= start && d <= end;
  });
}

/** Normalize strategy code so whitespace-only edits don’t split “duplicates”. */
function normalizedCodeFingerprint(code) {
  return String(code || "")
    .trim()
    .replace(/\r\n/g, "\n")
    .replace(/\s+/g, " ");
}

/**
 * Same logical backtest repeated on different days produces multiple rows with new IDs.
 * Keep one row per unique (ticker, window, strategy name, code): the first in the list,
 * which is the most recent run because history is stored newest-first.
 *
 * @param {BacktestRunRecord[]} runs
 * @returns {BacktestRunRecord[]}
 */
export function dedupeBacktestRuns(runs) {
  if (!runs?.length) return [];
  /** @type {Set<string>} */
  const seen = new Set();
  /** @type {BacktestRunRecord[]} */
  const out = [];
  for (const r of runs) {
    const key = [
      r.ticker,
      r.btStart,
      r.btEnd,
      (r.strategyName || "").trim(),
      normalizedCodeFingerprint(r.code),
    ].join("\x1e");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}
