import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { formatAud } from "../formatAud";
import { LineChartPanel } from "../components/LineChartPanel";
import SectionHeading from "../components/SectionHeading";
import SparklineCell from "../components/SparklineCell";

const RANGE_TAB_DAYS = { "1W": 7, "1M": 31, "3M": 92, "1Y": 365 };

/** Top holdings by market value; remainder rolled into “Other”. */
const CONCENTRATION_TOP_N = 5;

const PIE_SLICE_COLORS = ["#c8963e", "#2d8a55", "#5c6f8c", "#b8860b", "#9a8b7a"];
const PIE_OTHER_COLOR = "#9ca3af";
const PIE_EMPTY_COLOR = "#eae8e4";

/** Compact numbers for the horizontal metric strip above the chart */
const metricStripValueClass =
  "min-w-0 max-w-full overflow-x-auto whitespace-nowrap font-mono text-[10px] font-bold tabular-nums leading-none tracking-tight sm:text-xs md:text-sm [scrollbar-width:thin]";

function calendarRange(daysBack) {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - daysBack);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

export default function PortfolioPage() {
  const { user, refreshMe } = useAuth();

  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [rangeTab, setRangeTab] = useState("1M");
  const [equityDaily, setEquityDaily] = useState([]);
  const [equityErr, setEquityErr] = useState(null);
  const [sparklines, setSparklines] = useState({});

  const [selectedTicker, setSelectedTicker] = useState(null);
  const [stockPoints, setStockPoints] = useState([]);
  const [stockErr, setStockErr] = useState(null);
  const [stockLoading, setStockLoading] = useState(false);

  const load = useCallback(() => {
    setError(null);
    api
      .portfolio()
      .then(setData)
      .catch((e) => {
        setData(null);
        setError(e?.message || "Failed to load portfolio");
      });
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 45_000);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    const days = RANGE_TAB_DAYS[rangeTab];
    const { start, end } = calendarRange(days);
    setEquityErr(null);
    api
      .equityDaily(start, end)
      .then(setEquityDaily)
      .catch((e) => {
        setEquityDaily([]);
        setEquityErr(e?.message || "Could not load equity history");
      });
  }, [rangeTab]);

  const tickersKey = useMemo(() => data?.holdings?.map((h) => h.ticker).join(",") ?? "", [data?.holdings]);

  useEffect(() => {
    if (!user?.has_alpha_vantage_key || !data?.holdings?.length) {
      setSparklines({});
      return undefined;
    }
    let cancelled = false;
    api
      .holdingSparklines(90)
      .then((s) => {
        if (!cancelled) setSparklines(s);
      })
      .catch(() => {
        if (!cancelled) setSparklines({});
      });
    return () => {
      cancelled = true;
    };
  }, [user?.has_alpha_vantage_key, tickersKey]);

  const equityPoints = useMemo(
    () => equityDaily.map((d) => ({ time: d.date, value: d.equity })),
    [equityDaily]
  );

  /** Cash vs market value of holdings (same basis as total equity). */
  const allocationPct = useMemo(() => {
    if (!data || data.total_equity <= 0) return { cash: 0, invested: 0 };
    const te = data.total_equity;
    const cash = Math.min(Math.max(0, data.cash_balance), te);
    const invested = Math.max(0, te - cash);
    return {
      cash: (cash / te) * 100,
      invested: (invested / te) * 100,
    };
  }, [data]);

  const concentrationRows = useMemo(() => {
    if (!data?.holdings?.length || data.total_equity <= 0) return [];
    const te = data.total_equity;
    const sorted = [...data.holdings].sort((a, b) => b.market_value - a.market_value);
    const top = sorted.slice(0, CONCENTRATION_TOP_N);
    const rest = sorted.slice(CONCENTRATION_TOP_N);
    const rows = top.map((h) => ({
      key: h.ticker,
      label: h.ticker,
      marketValue: h.market_value,
      pct: (h.market_value / te) * 100,
    }));
    if (rest.length > 0) {
      const otherVal = rest.reduce((s, h) => s + h.market_value, 0);
      rows.push({
        key: "__other__",
        label: `Other (${rest.length})`,
        marketValue: otherVal,
        pct: (otherVal / te) * 100,
      });
    }
    return rows;
  }, [data]);

  /** Donut: slice angles from relative market value; legend uses % of total portfolio. */
  const concentrationPie = useMemo(() => {
    if (!concentrationRows.length) {
      const emptyLegend = Array.from({ length: CONCENTRATION_TOP_N }, (_, i) => ({
        key: `pie-ph-${i}`,
        label: "—",
        pct: 0,
        marketValue: 0,
        color: PIE_EMPTY_COLOR,
        placeholder: true,
      }));
      return {
        gradient: `conic-gradient(from 0deg, ${PIE_EMPTY_COLOR} 0deg 360deg)`,
        centerMain: "—",
        centerSub: "No positions",
        legend: emptyLegend,
      };
    }
    const totalMv = concentrationRows.reduce((s, r) => s + r.marketValue, 0);
    if (totalMv <= 0) {
      const emptyLegend = concentrationRows.map((r, i) => ({
        key: r.key,
        label: r.label,
        pct: r.pct,
        marketValue: r.marketValue,
        color: PIE_SLICE_COLORS[i % PIE_SLICE_COLORS.length],
        placeholder: false,
      }));
      return {
        gradient: `conic-gradient(from 0deg, ${PIE_EMPTY_COLOR} 0deg 360deg)`,
        centerMain: "—",
        centerSub: "No value",
        legend: emptyLegend,
      };
    }
    let angle = 0;
    const parts = [];
    const legend = concentrationRows.map((r, i) => {
      const deg = (r.marketValue / totalMv) * 360;
      const color = r.key === "__other__" ? PIE_OTHER_COLOR : PIE_SLICE_COLORS[i % PIE_SLICE_COLORS.length];
      parts.push(`${color} ${angle}deg ${angle + deg}deg`);
      angle += deg;
      return {
        key: r.key,
        label: r.label,
        pct: r.pct,
        marketValue: r.marketValue,
        color,
        placeholder: false,
      };
    });
    const top = concentrationRows[0];
    const sub =
      top.label.length > 14 ? `${top.label.slice(0, 12)}…` : top.label;
    return {
      gradient: `conic-gradient(from 0deg, ${parts.join(", ")})`,
      centerMain: `${top.pct.toFixed(1)}%`,
      centerSub: sub,
      legend,
    };
  }, [concentrationRows]);

  const avRequestsLeft = useMemo(() => {
    if (!user?.has_alpha_vantage_key) return null;
    const limit = user.alpha_vantage_daily_limit ?? 25;
    const used = user.alpha_vantage_requests_used_today ?? 0;
    return Math.max(0, limit - used);
  }, [
    user?.has_alpha_vantage_key,
    user?.alpha_vantage_daily_limit,
    user?.alpha_vantage_requests_used_today,
  ]);

  const loadStockChart = useCallback(
    async (ticker) => {
      if (!user?.has_alpha_vantage_key || !ticker) {
        setStockPoints([]);
        setStockErr(null);
        return;
      }
      const { start, end } = calendarRange(365);
      setStockLoading(true);
      setStockErr(null);
      try {
        const rows = await api.ohlcvRange(ticker, start, end);
        setStockPoints(rows.map((r) => ({ time: r.date, value: r.close })));
        await refreshMe();
      } catch (e) {
        setStockPoints([]);
        setStockErr(e?.message || "Could not load price history.");
      } finally {
        setStockLoading(false);
      }
    },
    [user?.has_alpha_vantage_key, refreshMe]
  );

  useEffect(() => {
    if (selectedTicker) {
      void loadStockChart(selectedTicker);
    } else {
      setStockPoints([]);
      setStockErr(null);
    }
  }, [selectedTicker, loadStockChart]);

  return (
    <div className="space-y-6 md:space-y-8">
      <SectionHeading
        title="Portfolio"
        subtitle="Metrics, portfolio value over time, and holdings. Place trades on the Trade page."
      />

      {user?.has_alpha_vantage_key &&
        avRequestsLeft != null &&
        avRequestsLeft <= 10 &&
        (avRequestsLeft <= 5 ? (
          <div
            className="rounded-card border-2 border-danger/45 bg-danger/[0.06] p-4 text-sm text-ink"
            role="alert"
          >
            <p className="font-semibold text-danger font-sans">Alpha Vantage daily limit</p>
            <p className="mt-1 font-mono text-xs text-ink">
              Only {avRequestsLeft} daily request{avRequestsLeft === 1 ? "" : "s"} left today.
            </p>
          </div>
        ) : (
          <div className="cs-gold-notice" role="alert">
            <p className="font-semibold text-ink font-sans">Alpha Vantage daily limit</p>
            <p className="mt-1 text-muted font-mono text-xs">
              Only {avRequestsLeft} daily request{avRequestsLeft === 1 ? "" : "s"} left today.
            </p>
          </div>
        ))}

      {!user?.has_alpha_vantage_key && (
        <div className="cs-card px-5 py-4 text-sm text-muted">
          Add an API key under{" "}
          <Link to="/account" className="font-semibold text-gold underline-offset-2 hover:underline">
            Account
          </Link>{" "}
          for EOD prices and sparklines.
        </div>
      )}

      {error && <p className="text-sm font-mono font-semibold text-danger">{error}</p>}

      <div className="space-y-6 md:space-y-8">
        <div className="portfolio-layout">
          <div className="portfolio-chart-cell flex flex-col gap-[var(--portfolio-layout-gap)]">
            <div className="portfolio-metric-strip">
              <div className="min-w-0 rounded-card bg-card p-3 shadow-card sm:p-4">
                <div className="cs-label mb-1.5">Cash</div>
                <div className={`${metricStripValueClass} text-ink`}>
                  {data != null ? formatAud(data.cash_balance) : "—"}
                </div>
              </div>
              <div className="min-w-0 rounded-card border-b-4 border-gold bg-card p-3 shadow-card sm:p-4">
                <div className="cs-label mb-1.5">Total value</div>
                <div className={`${metricStripValueClass} text-gold`}>
                  {data != null ? formatAud(data.total_equity) : "—"}
                </div>
              </div>
              <div className="min-w-0 rounded-card bg-card p-3 shadow-card sm:p-4">
                <div className="cs-label mb-1.5">Total return</div>
                <div
                  className={`${metricStripValueClass} ${
                    data && data.total_return_pct >= 0 ? "text-profit" : "text-danger"
                  }`}
                >
                  {data != null
                    ? `${Number(data.total_return_pct) >= 0 ? "+" : ""}${Number(data.total_return_pct).toFixed(2)}%`
                    : "—"}
                </div>
              </div>
              <div className="min-w-0 rounded-card bg-card p-3 shadow-card sm:p-4">
                <div className="cs-label mb-1.5">Unrealised P/L</div>
                <div
                  className={`${metricStripValueClass} ${
                    data && data.total_unrealized_pnl >= 0 ? "text-profit" : "text-danger"
                  }`}
                >
                  {data != null
                    ? `${data.total_unrealized_pnl >= 0 ? "+" : ""}${formatAud(data.total_unrealized_pnl)}`
                    : "—"}
                </div>
              </div>
            </div>

            <div className="cs-card min-w-0 overflow-hidden">
              <div className="cs-card-header pb-2 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted">Portfolio value</h2>
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
              </div>
              {equityErr && <p className="px-5 pb-2 text-xs font-mono text-danger">{equityErr}</p>}
              <div className="px-3 pb-3 pt-0">
                <LineChartPanel embedded points={equityPoints} height={260} />
              </div>
            </div>
          </div>

          <div className="portfolio-left-column">
            <div className="cs-card flex min-h-0 flex-1 flex-col p-5">
              <div className="cs-label mb-3">Allocation</div>
              <p className="mb-3 text-xs text-muted leading-snug">
                Share of total value held as cash vs in listed holdings (at last close).
              </p>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-black/[0.06]">
                <div className="flex h-full w-full">
                  <div
                    className="h-full bg-gold transition-[width] duration-300"
                    style={{ width: `${allocationPct.cash}%` }}
                    title={`Cash ${allocationPct.cash.toFixed(1)}%`}
                  />
                  <div
                    className="h-full bg-ink/20 transition-[width] duration-300"
                    style={{ width: `${allocationPct.invested}%` }}
                    title={`Holdings ${allocationPct.invested.toFixed(1)}%`}
                  />
                </div>
              </div>
              <dl className="mt-4 space-y-2 font-mono text-xs">
                <div className="flex items-baseline justify-between gap-2 border-t border-ink/[0.06] pt-3">
                  <dt className="text-muted">Cash</dt>
                  <dd className="shrink-0 tabular-nums font-semibold text-ink">
                    {data != null ? `${allocationPct.cash.toFixed(1)}%` : "—"}{" "}
                    <span className="font-normal text-muted">
                      {data != null ? `· ${formatAud(data.cash_balance)}` : ""}
                    </span>
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-2">
                  <dt className="text-muted">Holdings</dt>
                  <dd className="shrink-0 tabular-nums font-semibold text-ink">
                    {data != null ? `${allocationPct.invested.toFixed(1)}%` : "—"}{" "}
                    <span className="font-normal text-muted">
                      {data != null
                        ? `· ${formatAud(Math.max(0, data.total_equity - data.cash_balance))}`
                        : ""}
                    </span>
                  </dd>
                </div>
              </dl>

              <div className="mt-6 border-t border-ink/[0.06] pt-6">
                <div className="cs-label mb-2">Largest holdings</div>
                <p className="mb-3 text-xs text-muted leading-snug">
                  Slice angles reflect weight among these holdings; figures are % of total portfolio (last close). Top{" "}
                  {CONCENTRATION_TOP_N} tickers, remainder as Other.
                </p>
                {data != null && data.holdings.length === 0 ? (
                  <p className="mb-3 text-xs leading-snug text-muted">
                    Shift allocation on the{" "}
                    <Link to="/trade" className="font-semibold text-gold underline-offset-2 hover:underline">
                      Trade
                    </Link>{" "}
                    page.
                  </p>
                ) : null}
                <div className={`mt-1 flex flex-col items-center gap-4 ${data == null ? "opacity-60" : ""}`}>
                  <div className="relative h-[9.5rem] w-[9.5rem] shrink-0">
                    <div
                      className="absolute inset-0 rounded-full shadow-card-sm"
                      style={{ background: concentrationPie.gradient }}
                    />
                    <div className="absolute inset-[22%] flex flex-col items-center justify-center gap-0.5 rounded-full bg-card px-2 text-center shadow-card-sm">
                      <span className="font-mono text-lg font-bold tabular-nums leading-none text-ink">
                        {concentrationPie.centerMain}
                      </span>
                      <span className="max-w-full truncate text-[9px] font-semibold uppercase tracking-wide text-muted">
                        {concentrationPie.centerSub}
                      </span>
                    </div>
                  </div>
                  <ul className="w-full space-y-2 text-xs font-mono">
                    {concentrationPie.legend.map((row) => (
                      <li key={row.key} className="flex items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-sm shadow-card-sm"
                          style={{ backgroundColor: row.color }}
                        />
                        <span className={`min-w-0 flex-1 truncate ${row.placeholder ? "text-muted" : "font-bold text-ink"}`}>
                          {row.label}
                        </span>
                        <span className={`shrink-0 text-right tabular-nums ${row.placeholder ? "text-muted" : "text-ink"}`}>
                          {row.placeholder ? (
                            "0.0% · —"
                          ) : (
                            <>
                              <span className="font-semibold">{row.pct.toFixed(1)}%</span>
                              <span className="text-muted"> · {formatAud(row.marketValue)}</span>
                            </>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {!(data != null && data.holdings.length === 0) && (
                <p className="mt-auto pt-5 text-xs leading-snug text-muted">
                  Shift allocation on the{" "}
                  <Link to="/trade" className="font-semibold text-gold underline-offset-2 hover:underline">
                    Trade
                  </Link>{" "}
                  page.
                </p>
              )}
            </div>
          </div>
        </div>

        {(data == null || data.holdings.length > 0) && (
        <div className="cs-card overflow-hidden">
            <div className="cs-card-header pb-2">
              <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted">Holdings</h2>
              <p className="mt-2 text-xs text-muted">
                Click a row for individual stock performance (EOD close) below the table.
              </p>
            </div>
            {data == null ? (
              <p className="p-5 text-sm font-mono text-muted">Loading…</p>
            ) : (
              <>
              <div className="overflow-x-auto px-2 pb-4">
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-[10px] font-semibold uppercase tracking-wider text-muted">
                      <th className="px-3 py-3">Ticker</th>
                      <th className="px-3 py-3 min-w-[6rem]">Trend</th>
                      <th className="px-3 py-3 text-right">Qty</th>
                      <th className="px-3 py-3 text-right">Avg cost</th>
                      <th className="px-3 py-3 text-right">Last close</th>
                      <th className="px-3 py-3 text-right">Value</th>
                      <th className="px-3 py-3 text-right">P/L</th>
                      <th className="px-3 py-3 text-right">P/L %</th>
                    </tr>
                  </thead>
                  <tbody className="font-mono text-xs sm:text-sm">
                    {data.holdings.map((h) => (
                      <tr
                        key={h.ticker}
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelectedTicker(h.ticker)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setSelectedTicker(h.ticker);
                          }
                        }}
                        className={`border-t border-ink/[0.06] cursor-pointer transition-colors hover:bg-black/[0.02] ${
                          selectedTicker === h.ticker ? "bg-gold/5 ring-1 ring-inset ring-gold/30" : ""
                        }`}
                      >
                        <td className="px-3 py-3 font-bold text-ink align-middle">{h.ticker}</td>
                        <td className="px-3 py-2 align-middle">
                          <SparklineCell points={sparklines[h.ticker] || []} />
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums text-ink align-middle">{h.quantity}</td>
                        <td className="px-3 py-3 text-right tabular-nums text-muted align-middle">
                          {formatAud(h.avg_cost)}
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums text-ink align-middle">
                          {formatAud(h.current_price)}
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums font-bold text-ink align-middle">
                          {formatAud(h.market_value)}
                        </td>
                        <td
                          className={`px-3 py-3 text-right tabular-nums font-bold align-middle ${
                            h.unrealized_pnl >= 0 ? "text-profit" : "text-danger"
                          }`}
                        >
                          {h.unrealized_pnl >= 0 ? "+" : ""}
                          {formatAud(h.unrealized_pnl)}
                        </td>
                        <td
                          className={`px-3 py-3 text-right tabular-nums font-bold align-middle ${
                            h.unrealized_pnl_pct >= 0 ? "text-profit" : "text-danger"
                          }`}
                        >
                          {Number(h.unrealized_pnl_pct) >= 0 ? "+" : ""}
                          {Number(h.unrealized_pnl_pct).toFixed(2)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {selectedTicker && (
                <div className="border-t border-ink/[0.08] bg-black/[0.02] px-2 pb-4 pt-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between px-1 pb-3">
                    <h3 className="min-w-0 text-[11px] font-semibold uppercase tracking-wider text-muted truncate">
                      Individual stock — {selectedTicker} (EOD close, ~1Y)
                    </h3>
                    <button
                      type="button"
                      className="cs-btn-neutral text-xs shrink-0 self-start sm:self-auto"
                      onClick={() => setSelectedTicker(null)}
                    >
                      Clear selection
                    </button>
                  </div>
                  {stockLoading && <p className="px-1 pb-2 text-xs font-mono text-muted">Loading…</p>}
                  {stockErr && <p className="px-1 pb-2 text-xs font-mono text-danger">{stockErr}</p>}
                  <div className="px-1">
                    <LineChartPanel embedded points={stockPoints} height={240} />
                  </div>
                </div>
              )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
