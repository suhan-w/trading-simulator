import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { formatAud } from "../formatAud";
import { LineChartPanel } from "./LineChartPanel";

const RANGE_TAB_DAYS = { "1W": 7, "1M": 31, "3M": 92, "1Y": 365 };

function calendarRange(daysBack) {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - daysBack);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

function normalizeTickerInput(raw) {
  const t = String(raw).trim().toUpperCase();
  if (!t) return "";
  if (t.startsWith("^")) return t;
  if (t.endsWith(".AX")) return t;
  if (t.includes(".")) return t;
  return `${t}.AX`;
}

/**
 * @param {{ chartSymbol: string | null }} props
 */
export default function HistoricalStockPanel({ chartSymbol }) {
  const { user, refreshMe } = useAuth();
  const [rangeTab, setRangeTab] = useState("1M");
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

  const stats = useMemo(() => {
    if (!rows.length) return null;
    const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
    const last = sorted[sorted.length - 1];
    const highs = sorted.map((r) => r.high);
    const lows = sorted.map((r) => r.low);
    const volSum = sorted.reduce((s, r) => s + (Number(r.volume) || 0), 0);
    return {
      last,
      periodHigh: Math.max(...highs),
      periodLow: Math.min(...lows),
      totalVolume: volSum,
      n: sorted.length,
    };
  }, [rows]);

  return (
    <div className="cs-card p-5 space-y-4 w-full h-full">
      <div className="min-w-0">
        <h2 className="text-lg font-semibold tracking-tight text-ink">Historical Stock Performance</h2>
        <p className="mt-1 text-sm text-muted leading-relaxed">
          Cached Alpha Vantage EOD OHLCV. Uses the ticker from Execute trade.
        </p>
      </div>

      {!user?.has_alpha_vantage_key && (
        <p className="text-sm text-muted">Add an API key under Account to load charts.</p>
      )}

      {user?.has_alpha_vantage_key && (
        <>
          <div className="flex flex-wrap gap-2">
            {["1W", "1M", "3M", "1Y"].map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setRangeTab(key)}
                className={`cs-btn-neutral px-3 py-2 ${rangeTab === key ? "ring-2 ring-gold/40 text-ink" : ""}`}
              >
                {key}
              </button>
            ))}
          </div>

          {loading && <p className="text-xs font-mono text-muted">Loading…</p>}
          {err && <p className="text-xs font-mono text-danger">{err}</p>}

          {stats && stats.last && (
            <div className="rounded-card border border-ink/10 bg-black/[0.02] p-4 space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                Latest session in range ({stats.last.date})
              </p>
              <dl className="grid grid-cols-2 sm:grid-cols-5 gap-3 font-mono text-xs">
                <div>
                  <dt className="text-muted">Open</dt>
                  <dd className="font-semibold text-ink tabular-nums">{formatAud(stats.last.open)}</dd>
                </div>
                <div>
                  <dt className="text-muted">High</dt>
                  <dd className="font-semibold text-ink tabular-nums">{formatAud(stats.last.high)}</dd>
                </div>
                <div>
                  <dt className="text-muted">Low</dt>
                  <dd className="font-semibold text-ink tabular-nums">{formatAud(stats.last.low)}</dd>
                </div>
                <div>
                  <dt className="text-muted">Close</dt>
                  <dd className="font-semibold text-ink tabular-nums">{formatAud(stats.last.close)}</dd>
                </div>
                <div>
                  <dt className="text-muted">Volume</dt>
                  <dd className="font-semibold text-ink tabular-nums">
                    {Number(stats.last.volume).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </dd>
                </div>
              </dl>
              <p className="text-[10px] text-muted font-mono pt-2 border-t border-ink/8">
                Period: high {formatAud(stats.periodHigh)} · low {formatAud(stats.periodLow)} · total volume{" "}
                {stats.totalVolume.toLocaleString(undefined, { maximumFractionDigits: 0 })} · {stats.n} sessions
              </p>
            </div>
          )}

          <div className="px-1">
            <LineChartPanel embedded points={chartPoints} height={320} />
          </div>

          {rows.length > 0 && (
            <div>
              <p className="cs-label mb-2">Daily OHLCV ({rows.length} rows)</p>
              <div className="max-h-52 overflow-y-auto rounded-card border border-ink/10">
                <table className="w-full text-left font-mono text-[10px] sm:text-xs">
                  <thead className="sticky top-0 bg-card border-b border-ink/10">
                    <tr className="text-muted uppercase tracking-wide">
                      <th className="px-2 py-2">Date</th>
                      <th className="px-2 py-2 text-right">Open</th>
                      <th className="px-2 py-2 text-right">High</th>
                      <th className="px-2 py-2 text-right">Low</th>
                      <th className="px-2 py-2 text-right">Close</th>
                      <th className="px-2 py-2 text-right">Vol</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...rows]
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
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
