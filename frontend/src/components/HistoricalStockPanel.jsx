import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
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

  const heading = effectiveSymbol ? displaySymbol(effectiveSymbol) : "Share price";

  return (
    <div className="cs-card flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-2xl border border-ink/[0.08] bg-card p-6 shadow-card">
      <div className="flex shrink-0 items-start justify-between gap-4">
        <h2 className="text-lg font-bold tracking-tight text-ink">{heading}</h2>
        {user?.has_alpha_vantage_key ? (
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
        ) : null}
      </div>

      <div className="mt-6 min-h-0 flex-1">
        {!user?.has_alpha_vantage_key && (
          <p className="text-sm text-muted">Add an API key under Account to load charts.</p>
        )}

        {user?.has_alpha_vantage_key && !effectiveSymbol && (
          <p className="text-sm text-muted">Enter a ticker in Execute trade to load history.</p>
        )}

        {user?.has_alpha_vantage_key && effectiveSymbol && (
          <>
            {(loading || err) && (
              <p className={`mb-2 text-xs ${err ? "text-danger" : "text-muted"}`}>
                {loading ? "Loading…" : err}
              </p>
            )}
            <LineChartPanel embedded minimal points={chartPoints} height={300} />
          </>
        )}
      </div>
    </div>
  );
}
