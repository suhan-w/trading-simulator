import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { formatAud } from "../formatAud";
import { LineChartPanel } from "../components/LineChartPanel";
import SectionHeading from "../components/SectionHeading";
import SparklineCell from "../components/SparklineCell";

const RANGE_TAB_DAYS = { "1W": 7, "1M": 31, "3M": 92, "1Y": 365 };

const metricValueClass =
  "min-w-0 max-w-full overflow-x-auto whitespace-nowrap font-mono text-xs font-bold tabular-nums leading-none tracking-tight sm:text-sm md:text-base [scrollbar-width:thin]";

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
          <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="cs-metric min-w-0">
              <div className="cs-label mb-3">Cash</div>
              <div className={`${metricValueClass} text-ink`}>
                {data != null ? formatAud(data.cash_balance) : "—"}
              </div>
            </div>
            <div className="cs-metric-featured min-w-0">
              <div className="cs-label mb-3">Total value</div>
              <div className={`${metricValueClass} text-gold`}>
                {data != null ? formatAud(data.total_equity) : "—"}
              </div>
            </div>
            <div className="cs-metric min-w-0">
              <div className="cs-label mb-3">Total return</div>
              <div
                className={`${metricValueClass} ${
                  data && data.total_return_pct >= 0 ? "text-profit" : "text-danger"
                }`}
              >
                {data != null
                  ? `${Number(data.total_return_pct) >= 0 ? "+" : ""}${Number(data.total_return_pct).toFixed(2)}%`
                  : "—"}
              </div>
            </div>
            <div className="cs-metric min-w-0">
              <div className="cs-label mb-3">Unrealised P/L</div>
              <div
                className={`${metricValueClass} ${
                  data && data.total_unrealized_pnl >= 0 ? "text-profit" : "text-danger"
                }`}
              >
                {data != null
                  ? `${data.total_unrealized_pnl >= 0 ? "+" : ""}${formatAud(data.total_unrealized_pnl)}`
                  : "—"}
              </div>
            </div>
          </div>

          <div className="cs-card overflow-hidden">
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

        <div className="cs-card overflow-hidden">
            <div className="cs-card-header pb-2">
              <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted">Holdings</h2>
              <p className="mt-2 text-xs text-muted">
                Click a row for individual stock performance (EOD close) below the table.
              </p>
            </div>
            {!data ? (
              <p className="p-5 text-sm font-mono text-muted">Loading…</p>
            ) : data.holdings.length === 0 ? (
              <p className="p-5 text-sm text-muted">
                No positions yet. Open the{" "}
                <Link to="/trade" className="font-semibold text-gold underline-offset-2 hover:underline">
                  Trade
                </Link>{" "}
                page to place a buy.
              </p>
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
      </div>
    </div>
  );
}
