import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { formatAud } from "../formatAud";
import { LineChartPanel } from "../components/LineChartPanel";
import SectionHeading, { TitleMark } from "../components/SectionHeading";
import SparklineCell from "../components/SparklineCell";

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

function roundMoney(n) {
  return Math.round(n * 100) / 100;
}

function GoldNotice({ children }) {
  return <div className="cs-gold-notice">{children}</div>;
}

function QuoteSpinner() {
  return (
    <span
      className="inline-block h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-gold/40 border-t-gold"
      aria-hidden
    />
  );
}

export default function PortfolioPage() {
  const { marketSession } = useOutletContext() ?? {};
  const marketOpen = marketSession?.open === true;
  const { refreshMe, user } = useAuth();

  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [rangeTab, setRangeTab] = useState("1M");
  const [equityDaily, setEquityDaily] = useState([]);
  const [equityErr, setEquityErr] = useState(null);
  const [sparklines, setSparklines] = useState({});

  const [ticker, setTicker] = useState("");
  const [side, setSide] = useState("buy");
  const [quantity, setQuantity] = useState("");
  const [quote, setQuote] = useState(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);
  const [success, setSuccess] = useState(null);

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

  const fetchLivePrice = useCallback(async () => {
    if (!user?.has_alpha_vantage_key) {
      setQuote(null);
      setQuoteError(null);
      return;
    }
    const norm = normalizeTickerInput(ticker);
    if (!norm || norm.length < 3) {
      setQuote(null);
      setQuoteError(null);
      return;
    }
    setQuoteLoading(true);
    setQuoteError(null);
    try {
      const q = await api.quote(norm);
      setQuote(q);
    } catch (e) {
      setQuote(null);
      setQuoteError(e?.message || "Ticker not found or quote unavailable.");
    } finally {
      setQuoteLoading(false);
    }
  }, [ticker, user?.has_alpha_vantage_key]);

  const normalizedTicker = useMemo(() => normalizeTickerInput(ticker), [ticker]);

  const holdingQuantity = useMemo(() => {
    const h = data?.holdings?.find((x) => x.ticker === normalizedTicker);
    return h ? Number(h.quantity) : 0;
  }, [data?.holdings, normalizedTicker]);

  const equityPoints = useMemo(
    () => equityDaily.map((d) => ({ time: d.date, value: d.equity })),
    [equityDaily]
  );

  async function submitTrade(tradeSide) {
    setFormError(null);
    setSuccess(null);
    const norm = normalizeTickerInput(ticker);
    const qty = Number(quantity);
    if (!norm) {
      setFormError("Enter a ticker (e.g. BHP or BHP.AX).");
      return;
    }
    if (!Number.isFinite(qty) || qty <= 0) {
      setFormError("Quantity must be a positive number.");
      return;
    }
    if (!quote?.price) {
      setFormError("Load a live price first (tab out of ticker or press Enter).");
      return;
    }
    if (!marketOpen) {
      setFormError("ASX is closed. No trades outside session hours.");
      return;
    }
    setSubmitting(true);
    try {
      await api.placeOrder({
        ticker: norm,
        side: tradeSide,
        order_type: "market",
        quantity: qty,
      });
      setSuccess(`${tradeSide.toUpperCase()} ${qty} ${norm} filled at market.`);
      setQuantity("");
      setQuote(null);
      setQuoteError(null);
      await refreshMe();
      load();
    } catch (err) {
      setFormError(err?.message || "Order failed");
    } finally {
      setSubmitting(false);
    }
  }

  const qtyNum = Number(quantity);
  const orderValue =
    quote && Number.isFinite(qtyNum) && qtyNum > 0 ? roundMoney(qtyNum * quote.price) : null;

  const remainingCashAfterBuy =
    orderValue != null && data ? data.cash_balance - orderValue : null;

  const showMarketClosed = user?.has_alpha_vantage_key && marketSession && !marketSession.open;
  const showNoKey = !user?.has_alpha_vantage_key;

  const twentyPctThreshold = useMemo(
    () => (data && data.total_equity > 0 ? data.total_equity * 0.2 : null),
    [data]
  );
  const orderExceedsTwentyPct =
    orderValue != null && twentyPctThreshold != null && orderValue > twentyPctThreshold;

  const buyDisabled =
    submitting ||
    !user?.has_alpha_vantage_key ||
    !marketOpen ||
    !quote?.price ||
    quoteLoading ||
    !Number.isFinite(qtyNum) ||
    qtyNum <= 0 ||
    (remainingCashAfterBuy != null && remainingCashAfterBuy < -1e-6);

  const sellDisabled =
    submitting ||
    !user?.has_alpha_vantage_key ||
    !marketOpen ||
    !quote?.price ||
    quoteLoading ||
    !Number.isFinite(qtyNum) ||
    qtyNum <= 0 ||
    holdingQuantity + 1e-9 < qtyNum;

  const tradeForm = (
    <form
      className="cs-card p-5 space-y-1"
      onSubmit={(e) => {
        e.preventDefault();
      }}
    >
      <SectionHeading title="Execute trade" subtitle="ASX · market execution" />

      <div className="space-y-5 pt-2">
        <div>
          <label className="cs-label mb-2">Ticker</label>
          <input
            type="text"
            value={ticker}
            onChange={(e) => {
              setTicker(e.target.value);
              setQuote(null);
              setQuoteError(null);
            }}
            onBlur={() => void fetchLivePrice()}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void fetchLivePrice();
              }
            }}
            placeholder="BHP or BHP.AX"
            className="cs-input-mono"
            autoComplete="off"
          />
          <p className="mt-1 text-[10px] font-mono text-muted">Press Enter or leave field to load price.</p>
          {quoteError && <p className="mt-2 text-xs font-mono font-semibold text-danger">{quoteError}</p>}
        </div>

        <div>
          <label className="cs-label mb-2">Quantity (shares)</label>
          <input
            type="number"
            min="0"
            step="any"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="0"
            className="cs-input-mono"
          />
        </div>

        <div>
          <div className="mb-2 flex items-center gap-2">
            <span className="cs-label !mb-0">Live price</span>
            {quoteLoading && <QuoteSpinner />}
          </div>
          <input
            type="text"
            readOnly
            value={
              quoteLoading ? "" : quote != null ? `${formatAud(quote.price)} AUD` : "—"
            }
            placeholder={quoteLoading ? "Loading…" : "—"}
            className="cs-input-mono cursor-not-allowed bg-black/[0.02] opacity-90"
            aria-busy={quoteLoading}
          />
          {quote?.name && !quoteLoading && (
            <p className="mt-1 text-[10px] text-muted font-sans truncate">{quote.name}</p>
          )}
        </div>

        <div>
          <p className="cs-label mb-1">Order value</p>
          <p className="font-mono text-base font-bold tabular-nums text-ink">
            {orderValue != null ? formatAud(orderValue) : "—"}
          </p>
        </div>

        {orderExceedsTwentyPct && twentyPctThreshold != null && (
          <GoldNotice>
            <p className="font-semibold text-ink font-sans">Large order</p>
            <p className="mt-1 text-muted font-mono text-xs">
              Order value exceeds 20% of portfolio ({formatAud(twentyPctThreshold)}).
            </p>
          </GoldNotice>
        )}

        {showMarketClosed && (
          <GoldNotice>
            <p className="font-semibold text-ink font-sans">Market closed</p>
            <p className="mt-1 text-muted">
              Orders Mon–Fri <span className="font-semibold text-ink">10:00–16:00 Melbourne</span> (AEST/AEDT),
              excluding Vic. public holidays.
            </p>
          </GoldNotice>
        )}

        {showNoKey && (
          <GoldNotice>
            <p className="font-semibold text-ink font-sans">API key required</p>
            <p className="mt-1 text-muted">
              Add your{" "}
              <a
                href="https://www.alphavantage.co/support/#api-key"
                target="_blank"
                rel="noreferrer"
                className="font-semibold text-gold underline-offset-2 hover:underline"
              >
                Alpha Vantage
              </a>{" "}
              key under{" "}
              <Link to="/account" className="font-semibold text-gold underline-offset-2 hover:underline">
                Account
              </Link>
              .
            </p>
          </GoldNotice>
        )}

        {remainingCashAfterBuy != null && remainingCashAfterBuy < -1e-6 && (
          <GoldNotice>
            <p className="font-semibold text-danger font-sans">Insufficient cash</p>
            <p className="mt-1 text-xs text-muted">Not enough cash at this live price for the size entered.</p>
          </GoldNotice>
        )}

        {Number.isFinite(qtyNum) &&
          qtyNum > 0 &&
          quote?.price &&
          holdingQuantity + 1e-9 < qtyNum && (
            <GoldNotice>
              <p className="font-semibold text-danger font-sans">Insufficient shares</p>
              <p className="mt-1 text-xs text-muted font-mono">
                You hold {holdingQuantity} {normalizedTicker || "shares"}.
              </p>
            </GoldNotice>
          )}

        {formError && <p className="text-sm font-mono font-semibold text-danger">{formError}</p>}
        {success && <p className="text-sm font-mono font-semibold text-profit">{success}</p>}

        <div className="flex gap-3">
          <button
            type="button"
            disabled={buyDisabled}
            className="cs-btn-buy flex-1"
            onClick={() => void submitTrade("buy")}
          >
            {submitting ? "Working…" : "Buy"}
          </button>
          <button
            type="button"
            disabled={sellDisabled}
            className="cs-btn-sell flex-1"
            onClick={() => void submitTrade("sell")}
          >
            {submitting ? "Working…" : "Sell"}
          </button>
        </div>

        <div className="border-t border-ink/8 pt-4 mt-1">
          <p className="cs-label mb-1">Available cash</p>
          <p className="font-mono text-lg font-bold tabular-nums text-gold">
            {data != null ? formatAud(data.cash_balance) : "—"}
          </p>
        </div>
      </div>
    </form>
  );

  return (
    <div className="space-y-6 md:space-y-8">
      <SectionHeading
        title="Portfolio"
        subtitle="Holdings, value over time, and market orders when the ASX session is open. Live quotes need your Alpha Vantage key."
      />

      {!user?.has_alpha_vantage_key && (
        <div className="cs-card px-5 py-4 text-sm text-muted">
          Add an API key under{" "}
          <Link to="/account" className="font-semibold text-gold underline-offset-2 hover:underline">
            Account
          </Link>{" "}
          for live prices and sparklines.
        </div>
      )}

      {error && <p className="text-sm font-mono font-semibold text-danger">{error}</p>}

      <div className="portfolio-layout">
        <div className="space-y-6 md:space-y-8">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="cs-metric">
              <div className="cs-label mb-3">Cash</div>
              <div className="font-mono text-2xl font-bold tabular-nums tracking-tight text-ink md:text-3xl">
                {data != null ? formatAud(data.cash_balance) : "—"}
              </div>
            </div>
            <div className="cs-metric-featured">
              <div className="cs-label mb-3 flex items-center gap-2">
                <TitleMark className="mt-0.5" />
                Total value
              </div>
              <div className="font-mono text-2xl font-bold tabular-nums tracking-tight text-gold md:text-3xl">
                {data != null ? formatAud(data.total_equity) : "—"}
              </div>
            </div>
            <div className="cs-metric">
              <div className="cs-label mb-3">Total return</div>
              <div
                className={`font-mono text-2xl font-bold tabular-nums tracking-tight md:text-3xl ${
                  data && data.total_return_pct >= 0 ? "text-profit" : "text-danger"
                }`}
              >
                {data != null
                  ? `${Number(data.total_return_pct) >= 0 ? "+" : ""}${Number(data.total_return_pct).toFixed(2)}%`
                  : "—"}
              </div>
            </div>
            <div className="cs-metric">
              <div className="cs-label mb-3">Unrealised P/L</div>
              <div
                className={`font-mono text-2xl font-bold tabular-nums tracking-tight md:text-3xl ${
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
              <div className="flex items-center gap-2.5">
                <TitleMark />
                <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted">Portfolio value</h2>
              </div>
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

          <div className="cs-card overflow-hidden">
            <div className="cs-card-header pb-2">
              <div className="flex items-center gap-2.5">
                <TitleMark />
                <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted">Holdings</h2>
              </div>
            </div>
            {!data ? (
              <p className="p-5 text-sm font-mono text-muted">Loading…</p>
            ) : data.holdings.length === 0 ? (
              <p className="p-5 text-sm text-muted">No positions yet. Use Execute trade to place a buy.</p>
            ) : (
              <div className="overflow-x-auto px-2 pb-4">
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-[10px] font-semibold uppercase tracking-wider text-muted">
                      <th className="px-3 py-3">Ticker</th>
                      <th className="px-3 py-3 min-w-[6rem]">Trend</th>
                      <th className="px-3 py-3 text-right">Qty</th>
                      <th className="px-3 py-3 text-right">Avg cost</th>
                      <th className="px-3 py-3 text-right">Last</th>
                      <th className="px-3 py-3 text-right">Value</th>
                      <th className="px-3 py-3 text-right">P/L</th>
                      <th className="px-3 py-3 text-right">P/L %</th>
                    </tr>
                  </thead>
                  <tbody className="font-mono text-xs sm:text-sm">
                    {data.holdings.map((h) => (
                      <tr key={h.ticker} className="border-t border-ink/[0.06]">
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
            )}
          </div>
        </div>

        <aside>{tradeForm}</aside>
      </div>
    </div>
  );
}
