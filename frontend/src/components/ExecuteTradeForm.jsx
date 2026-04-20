import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, fetchPaperLeaderboardEntryIdWithRetry } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { formatAud } from "../formatAud";
import CardHeaderTitle from "./CardHeaderTitle";

function normalizeTickerInput(raw) {
  const t = raw == null ? "" : String(raw).trim().toUpperCase();
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

/**
 * @param {{ onQuoteSymbol?: (symbol: string | null) => void; onMarketOrderFilled?: (order: unknown) => void }} props
 */
export default function ExecuteTradeForm({ onQuoteSymbol, onMarketOrderFilled }) {
  const onQuoteRef = useRef(onQuoteSymbol);
  onQuoteRef.current = onQuoteSymbol;

  const { refreshMe, user } = useAuth();

  const [portfolioData, setPortfolioData] = useState(null);
  const [ticker, setTicker] = useState("");
  const [quantity, setQuantity] = useState("");
  const [quote, setQuote] = useState(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);
  const [success, setSuccess] = useState(null);

  const loadPortfolio = useCallback(() => {
    api
      .portfolio()
      .then(setPortfolioData)
      .catch(() => setPortfolioData(null));
  }, []);

  useEffect(() => {
    loadPortfolio();
  }, [loadPortfolio]);

  const fetchLastClose = useCallback(async () => {
    if (!user?.has_alpha_vantage_key) {
      setQuote(null);
      setQuoteError(null);
      onQuoteRef.current?.(null);
      return;
    }
    const norm = normalizeTickerInput(ticker);
    if (!norm || norm.length < 3) {
      setQuote(null);
      setQuoteError(null);
      onQuoteRef.current?.(null);
      return;
    }
    setQuoteLoading(true);
    setQuoteError(null);
    try {
      const q = await api.quote(norm);
      setQuote(q);
      onQuoteRef.current?.(norm);
      await refreshMe();
    } catch (e) {
      setQuote(null);
      setQuoteError(e?.message || "Ticker not found or price unavailable.");
      onQuoteRef.current?.(null);
    } finally {
      setQuoteLoading(false);
    }
  }, [ticker, user?.has_alpha_vantage_key, refreshMe]);

  const normalizedTicker = useMemo(() => normalizeTickerInput(ticker), [ticker]);

  const holdingQuantity = useMemo(() => {
    const h = portfolioData?.holdings?.find((x) => x.ticker === normalizedTicker);
    return h ? Number(h.quantity) : 0;
  }, [portfolioData?.holdings, normalizedTicker]);

  const qtyNum = Number(quantity);
  const orderValue =
    quote && Number.isFinite(qtyNum) && qtyNum > 0 ? roundMoney(qtyNum * quote.price) : null;

  const remainingCashAfterBuy =
    orderValue != null && portfolioData ? portfolioData.cash_balance - orderValue : null;

  const showNoKey = !user?.has_alpha_vantage_key;

  const twentyPctThreshold = useMemo(
    () =>
      portfolioData && portfolioData.total_equity > 0 ? portfolioData.total_equity * 0.2 : null,
    [portfolioData]
  );
  const orderExceedsTwentyPct =
    orderValue != null && twentyPctThreshold != null && orderValue > twentyPctThreshold;

  const buyDisabled =
    submitting ||
    !user?.has_alpha_vantage_key ||
    !quote?.price ||
    quoteLoading ||
    !Number.isFinite(qtyNum) ||
    qtyNum <= 0 ||
    (remainingCashAfterBuy != null && remainingCashAfterBuy < -1e-6);

  const sellDisabled =
    submitting ||
    !user?.has_alpha_vantage_key ||
    !quote?.price ||
    quoteLoading ||
    !Number.isFinite(qtyNum) ||
    qtyNum <= 0 ||
    holdingQuantity + 1e-9 < qtyNum;

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
      setFormError("Load last close price first (tab out of ticker or press Enter).");
      return;
    }
    setSubmitting(true);
    try {
      const ord = await api.placeOrder({
        ticker: norm,
        side: tradeSide,
        order_type: "market",
        quantity: qty,
      });
      let paperId = ord?.paper_leaderboard_entry_id ?? null;
      if (paperId == null) {
        paperId = await fetchPaperLeaderboardEntryIdWithRetry();
      }
      onMarketOrderFilled?.({ ...ord, paper_leaderboard_entry_id: paperId });
      setSuccess(`${tradeSide.toUpperCase()} ${qty} ${norm} filled at last close (EOD).`);
      setQuantity("");
      setQuote(null);
      setQuoteError(null);
      onQuoteRef.current?.(null);
      await refreshMe();
      loadPortfolio();
    } catch (err) {
      setFormError(err?.message || "Order failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      className="cs-card p-5 space-y-1 w-full h-full"
      onSubmit={(e) => {
        e.preventDefault();
      }}
    >
      <CardHeaderTitle
        title="Execute trade"
        subtitle="ASX · previous close (EOD)"
        tooltipText="Enter a ticker, quantity and submit to buy or sell at the previous day closing price."
      />

      <div className="space-y-5 pt-2">
        <div>
          <label htmlFor="trade-ticker" className="cs-label mb-2">Ticker</label>
          <input
            id="trade-ticker"
            type="text"
            value={ticker}
            onChange={(e) => {
              setTicker(e.target.value);
              setQuote(null);
              setQuoteError(null);
              onQuoteRef.current?.(null);
            }}
            onBlur={() => void fetchLastClose()}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void fetchLastClose();
              }
            }}
            placeholder="BHP or BHP.AX"
            className="cs-input-mono"
            autoComplete="off"
            aria-describedby="trade-ticker-help"
          />
          <p id="trade-ticker-help" className="mt-1 text-[10px] font-mono text-muted">Press Enter or leave field to load last close.</p>
          {quoteError && <p className="mt-2 text-xs font-mono font-semibold text-danger" role="alert">{quoteError}</p>}
        </div>

        <div>
          <label htmlFor="trade-quantity" className="cs-label mb-2">Quantity (shares)</label>
          <input
            id="trade-quantity"
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
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <label htmlFor="trade-last-close" className="cs-label !mb-0">Last Close Price</label>
            {quoteLoading && <QuoteSpinner />}
          </div>
          <input
            id="trade-last-close"
            type="text"
            readOnly
            value={quoteLoading ? "" : quote != null ? `${formatAud(quote.price)} AUD` : "—"}
            placeholder={quoteLoading ? "Loading…" : "—"}
            className="cs-input-mono cursor-not-allowed bg-black/[0.02] opacity-90"
            aria-busy={quoteLoading}
          />
          {quote?.as_of_date && !quoteLoading && (
            <p className="mt-1 text-[10px] text-muted font-mono">As of {quote.as_of_date} (close)</p>
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
            <p className="font-semibold text-ink">Large order</p>
            <p className="text-muted">Order value exceeds 20% of portfolio ({formatAud(twentyPctThreshold)}).</p>
          </GoldNotice>
        )}

        {showNoKey && (
          <GoldNotice>
            <p className="font-semibold text-ink">API key required</p>
            <p className="text-muted">
              Add your Alpha Vantage key under{" "}
              <Link to="/account" className="font-semibold text-gold underline-offset-2 hover:underline">
                Account
              </Link>
              .
            </p>
          </GoldNotice>
        )}

        {remainingCashAfterBuy != null && remainingCashAfterBuy < -1e-6 && (
          <GoldNotice>
            <p className="font-semibold text-danger">Insufficient cash</p>
            <p className="text-muted">Not enough cash at this price for the size entered.</p>
          </GoldNotice>
        )}

        {Number.isFinite(qtyNum) &&
          qtyNum > 0 &&
          quote?.price &&
          holdingQuantity + 1e-9 < qtyNum && (
            <GoldNotice>
              <p className="font-semibold text-danger">Insufficient shares to sell</p>
              <p className="text-muted">
                You hold {holdingQuantity} {normalizedTicker || "shares"}.
              </p>
            </GoldNotice>
          )}

        {formError && <p className="text-sm font-mono font-semibold text-danger" role="alert">{formError}</p>}
        {success && <p className="text-sm font-mono font-semibold text-profit" role="status">{success}</p>}

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
            {portfolioData != null ? formatAud(portfolioData.cash_balance) : "—"}
          </p>
        </div>
      </div>
    </form>
  );
}
