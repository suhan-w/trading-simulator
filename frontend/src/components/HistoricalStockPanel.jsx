import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { formatAud } from "../formatAud";
import { LineChartPanel } from "./LineChartPanel";
import CardHeaderTitle from "./CardHeaderTitle";

const RANGE_TAB_DAYS = { "1W": 7, "1M": 31, "3M": 92, "1Y": 365 };

function calendarRange(daysBack) {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - daysBack);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

function normalizeTickerInput(raw) {
  const t = raw == null ? "" : String(raw).trim().toUpperCase();
  if (!t) return "";
  if (t.startsWith("^")) return t;
  if (t.endsWith(".AX")) return t;
  if (t.includes(".")) return t;
  return `${t}.AX`;
}

function displaySymbol(symbol) {
  if (!symbol) return "";
  return symbol.replace(/\.AX$/i, "");
}

/**
 * @param {{ chartSymbol: string | null }} props
 */
export default function HistoricalStockPanel({ chartSymbol }) {
  const { user, refreshMe } = useAuth();
  const [rangeTab, setRangeTab] = useState("3M");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  const effectiveSymbol = useMemo(() => {
    const fromTrade = normalizeTickerInput(chartSymbol);
    return fromTrade && fromTrade.length >= 3 ? fromTrade : "";
  }, [chartSymbol]);

  const load = useCallback(async () => {
    if (!user?.has_alpha_vantage_key || !effectiveSymbol) {
      setRows([]);
      setErr(null);
      return;
    }
    const days = RANGE_TAB_DAYS[rangeTab];
    const { start, end } = calendarRange(days);
    setLoading(true);
    setErr(null);
    try {
      const data = await api.ohlcvRange(effectiveSymbol, start, end);
      setRows(Array.isArray(data) ? data : []);
      await refreshMe();
    } catch (e) {
      setRows([]);
      setErr(e?.message || "Could not load OHLCV history.");
    } finally {
      setLoading(false);
    }
  }, [user?.has_alpha_vantage_key, effectiveSymbol, rangeTab, refreshMe]);

  useEffect(() => {
    void load();
  }, [load]);

  const chartPoints = useMemo(
    () => rows.map((r) => ({ time: r.date, value: r.close })),
    [rows]
  );
  const plotSummary = useMemo(() => {
    if (!rows?.length) return null;
    const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    if (!first || !last) return null;
    const changePct = first.close > 0 ? ((last.close - first.close) / first.close) * 100 : null;
    return {
      firstDate: first.date,
      lastDate: last.date,
      firstClose: first.close,
      lastClose: last.close,
      changePct,
      sessions: sorted.length,
      high: Math.max(...sorted.map((r) => Number(r.high) || 0)),
      low: Math.min(...sorted.map((r) => Number(r.low) || 0)),
    };
  }, [rows]);

  const shortSym = effectiveSymbol ? displaySymbol(effectiveSymbol) : "";
  const heading = shortSym && shortSym !== "NULL" ? shortSym : "Share price";

  return (
    <div className="cs-card flex w-full flex-col overflow-hidden rounded-2xl border border-ink/[0.08] bg-card px-6 pt-6 pb-0 shadow-card">
      <div className="shrink-0">
        <CardHeaderTitle
          title={heading}
          tooltipText="Historical OHLCV price chart for any ASX stock."
          right={
            user?.has_alpha_vantage_key ? (
              <div className="flex shrink-0 items-center gap-0.5">
                {["1W", "1M", "3M", "1Y"].map((key) => {
                  const active = rangeTab === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setRangeTab(key)}
                      className={
                        active
                          ? "rounded-full bg-ink px-3 py-1.5 text-xs font-semibold text-white"
                          : "rounded-full px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:text-ink/70"
                      }
                    >
                      {key}
                    </button>
                  );
                })}
              </div>
            ) : null
          }
        />
      </div>

      <div className="mt-6">
        {!user?.has_alpha_vantage_key && (
          <p className="text-sm text-muted">Add an API key under Account to load charts.</p>
        )}

        {user?.has_alpha_vantage_key && (
          <>
            {!effectiveSymbol && (
              <div className="mb-2 flex h-[300px] items-center justify-center rounded-card border-b border-ink/[0.08] px-4 text-center">
                <p className="text-sm text-muted">Enter a ticker in Execute trade to load history.</p>
              </div>
            )}
            {(loading || err) && (
              <p className={`mb-2 text-xs ${err ? "text-danger" : "text-muted"}`}>
                {loading ? "Loading…" : err}
              </p>
            )}
            {plotSummary && !loading && !err && (
              <div className="mb-3 grid grid-cols-2 gap-x-6 gap-y-2 text-[11px] font-mono text-muted sm:grid-cols-4">
                <div>
                  <p>Last close</p>
                  <p className="font-semibold text-ink">{plotSummary.lastClose.toFixed(2)}</p>
                </div>
                <div>
                  <p>Range return</p>
                  <p className={`font-semibold ${plotSummary.changePct >= 0 ? "text-profit" : "text-danger"}`}>
                    {plotSummary.changePct >= 0 ? "+" : ""}
                    {plotSummary.changePct?.toFixed(2)}%
                  </p>
                </div>
                <div>
                  <p>Low / High</p>
                  <p className="font-semibold text-ink">
                    {plotSummary.low.toFixed(2)} / {plotSummary.high.toFixed(2)}
                  </p>
                </div>
                <div>
                  <p>Sessions</p>
                  <p className="font-semibold text-ink">{plotSummary.sessions}</p>
                </div>
              </div>
            )}
            {effectiveSymbol ? <LineChartPanel embedded points={chartPoints} height={300} showEmptyFrame /> : null}
            <details className="pb-4 pt-2">
              <summary className="cursor-pointer list-none select-none pb-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-semibold text-muted">Daily bars ({rows.length})</span>
                  {plotSummary && (
                    <span className="text-[11px] text-muted">
                      {plotSummary.firstDate} to {plotSummary.lastDate}
                    </span>
                  )}
                </div>
              </summary>
              <div className="max-h-56 overflow-y-auto rounded-card border border-ink/[0.08]">
                <table className="w-full text-left font-mono text-[10px] sm:text-xs">
                  <thead className="sticky top-0 border-b border-ink/[0.08] bg-card">
                    <tr className="uppercase tracking-wide text-muted">
                      <th className="px-2 py-2">Date</th>
                      <th className="px-2 py-2 text-right">Open</th>
                      <th className="px-2 py-2 text-right">High</th>
                      <th className="px-2 py-2 text-right">Low</th>
                      <th className="px-2 py-2 text-right">Close</th>
                      <th className="px-2 py-2 text-right">Vol</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.length ? (
                      [...rows]
                        .sort((a, b) => b.date.localeCompare(a.date))
                        .map((r) => (
                          <tr key={r.date} className="border-t border-ink/[0.06]">
                            <td className="px-2 py-1.5 text-ink">{r.date}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums">{formatAud(r.open)}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums">{formatAud(r.high)}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums">{formatAud(r.low)}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums font-semibold">{formatAud(r.close)}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums text-muted">
                              {Number(r.volume).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                            </td>
                          </tr>
                        ))
                    ) : (
                      <tr>
                        <td colSpan={6} className="px-2 py-6 text-center text-xs text-muted">
                          No data loaded yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </details>
          </>
        )}
      </div>
    </div>
  );
}
