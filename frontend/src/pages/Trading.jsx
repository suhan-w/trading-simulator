import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { formatAud } from "../formatAud";

function normalizeTickerInput(raw) {
  const t = String(raw).trim().toUpperCase();
  if (!t) return "";
  if (t.startsWith("^")) return t;
  if (t.endsWith(".AX")) return t;
  if (t.includes(".")) return t;
  return `${t}.AX`;
}

export default function Trading() {
  const { refreshMe } = useAuth();
  const [ticker, setTicker] = useState("");
  const [side, setSide] = useState("buy");
  const [quantity, setQuantity] = useState("");
  const [quote, setQuote] = useState(null);
  const [quoteError, setQuoteError] = useState(null);
  const [portfolio, setPortfolio] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);
  const [success, setSuccess] = useState(null);

  const loadPortfolio = useCallback(() => {
    api.portfolio().then(setPortfolio).catch(() => setPortfolio(null));
  }, []);

  useEffect(() => {
    loadPortfolio();
  }, [loadPortfolio]);

  useEffect(() => {
    const norm = normalizeTickerInput(ticker);
    if (!norm || norm.length < 3) {
      setQuote(null);
      setQuoteError(null);
      return undefined;
    }
    const id = setTimeout(() => {
      setQuoteError(null);
      api
        .quote(norm)
        .then(setQuote)
        .catch((e) => {
          setQuote(null);
          setQuoteError(e?.message || "Could not load price");
        });
    }, 450);
    return () => clearTimeout(id);
  }, [ticker]);

  async function onSubmit(e) {
    e.preventDefault();
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
    setSubmitting(true);
    try {
      await api.placeOrder({
        ticker: norm,
        side,
        order_type: "market",
        quantity: qty,
      });
      setSuccess(`${side.toUpperCase()} ${qty} ${norm} filled at market.`);
      setQuantity("");
      await refreshMe();
      loadPortfolio();
    } catch (err) {
      setFormError(err?.message || "Order failed");
    } finally {
      setSubmitting(false);
    }
  }

  const qtyNum = Number(quantity);
  const estNotional =
    quote && Number.isFinite(qtyNum) && qtyNum > 0 ? qtyNum * quote.price : null;

  const sizingGuide = useMemo(() => {
    if (!portfolio || !quote?.price || portfolio.total_equity <= 0) return null;
    const te = portfolio.total_equity;
    const cashBal = portfolio.cash_balance;
    const px = quote.price;
    if (!(px > 0)) return null;

    const tenPctAud = te * 0.1;
    const sharesForTenPct = Math.floor(tenPctAud / px);
    const maxSharesCashCanBuy = Math.floor(cashBal / px);
    const twentyPctAud = te * 0.2;

    const tradePctOfPortfolio =
      estNotional != null && te > 0 ? (estNotional / te) * 100 : null;
    const exceedsTwentyPct = estNotional != null && te > 0 && estNotional > twentyPctAud;

    let remainingCashAfter = null;
    if (estNotional != null && Number.isFinite(estNotional)) {
      remainingCashAfter = side === "buy" ? cashBal - estNotional : cashBal + estNotional;
    }

    return {
      tenPctAud,
      sharesForTenPct,
      maxSharesCashCanBuy,
      twentyPctAud,
      tradePctOfPortfolio,
      exceedsTwentyPct,
      remainingCashAfter,
    };
  }, [portfolio, quote, side, estNotional]);

  return (
    <div className="max-w-xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-white tracking-tight">Trading</h1>
        <p className="text-slate-400 text-sm mt-1">
          Enter signals from your strategy and execute manually. Market orders only; prices from Yahoo Finance.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 rounded-xl border border-surface-700 bg-surface-800/50 p-4">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-slate-500">Cash balance</div>
          <div className="font-mono text-lg text-accent font-semibold">
            {portfolio != null ? formatAud(portfolio.cash_balance) : "—"}
          </div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wide text-slate-500">Portfolio value</div>
          <div className="font-mono text-lg text-white font-semibold">
            {portfolio != null ? formatAud(portfolio.total_equity) : "—"}
          </div>
        </div>
      </div>

      <form onSubmit={onSubmit} className="rounded-xl border border-surface-700 bg-surface-800/40 p-6 space-y-5">
        <div>
          <label className="block text-sm text-slate-400 mb-1">Stock ticker (ASX)</label>
          <input
            type="text"
            value={ticker}
            onChange={(e) => setTicker(e.target.value)}
            placeholder="e.g. CBA or CBA.AX"
            className="w-full px-3 py-2 rounded-lg bg-surface-900 border border-surface-600 text-white font-mono placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-accent/40"
            autoComplete="off"
          />
          {quote && (
            <p className="mt-2 text-sm text-slate-300">
              <span className="text-slate-500">Live · </span>
              <span className="font-mono text-accent">{formatAud(quote.price)}</span>
              {quote.name && <span className="text-slate-500"> · {quote.name}</span>}
              <span className="text-slate-500"> · {quote.currency || "AUD"}</span>
            </p>
          )}
          {quoteError && <p className="mt-2 text-sm text-danger">{quoteError}</p>}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-slate-400 mb-1">Side</label>
            <select
              value={side}
              onChange={(e) => setSide(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-surface-900 border border-surface-600 text-white focus:outline-none focus:ring-2 focus:ring-accent/40"
            >
              <option value="buy">Buy</option>
              <option value="sell">Sell</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Quantity (shares)</label>
            <input
              type="number"
              min="0"
              step="any"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="0"
              className="w-full px-3 py-2 rounded-lg bg-surface-900 border border-surface-600 text-white font-mono placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-accent/40"
            />
          </div>
        </div>

        {estNotional != null && (
          <p className="text-sm text-slate-400">
            Estimated notional: <span className="font-mono text-slate-200">{formatAud(estNotional)}</span>
          </p>
        )}

        {sizingGuide && (
          <div className="rounded-lg border border-surface-600 bg-surface-900/60 p-4 space-y-3 text-sm">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Position sizing guide</h3>
            <p className="text-slate-300 leading-relaxed">
              <span className="text-slate-500">10% of portfolio ({formatAud(portfolio.total_equity)}):</span>{" "}
              <span className="font-mono text-slate-200">{formatAud(sizingGuide.tenPctAud)}</span>
              {side === "buy" && (
                <>
                  {" "}
                  → about{" "}
                  <span className="font-mono text-accent">{sizingGuide.sharesForTenPct}</span> shares at this price
                  (rounded down).
                </>
              )}
              {side === "sell" && (
                <span className="text-slate-500">
                  {" "}
                  (~{sizingGuide.sharesForTenPct} shares at this price — reference only; sell only what you own.)
                </span>
              )}
            </p>
            {side === "buy" && sizingGuide.maxSharesCashCanBuy >= 0 && (
              <p className="text-slate-500 text-xs">
                Cash can cover up to{" "}
                <span className="font-mono text-slate-400">{sizingGuide.maxSharesCashCanBuy}</span> shares at this
                price.
              </p>
            )}
            {sizingGuide.exceedsTwentyPct && (
              <p className="rounded-md border border-amber-700/60 bg-amber-950/40 px-3 py-2 text-amber-200/95 text-xs leading-relaxed">
                <span className="font-semibold">Large trade:</span> this order is over 20% of your total portfolio (
                {formatAud(sizingGuide.twentyPctAud)}). Many beginners spread risk across smaller positions.
              </p>
            )}
            {sizingGuide.remainingCashAfter != null && (
              <p className="text-slate-300">
                <span className="text-slate-500">Est. cash after this trade:</span>{" "}
                <span
                  className={`font-mono font-medium ${
                    side === "buy" && sizingGuide.remainingCashAfter < 0 ? "text-danger" : "text-slate-100"
                  }`}
                >
                  {formatAud(sizingGuide.remainingCashAfter)}
                </span>
                {side === "buy" && sizingGuide.remainingCashAfter < 0 && (
                  <span className="block text-danger text-xs mt-1">Not enough cash for this buy at the live quote.</span>
                )}
                {sizingGuide.tradePctOfPortfolio != null && (
                  <span className="block text-slate-500 text-xs mt-1">
                    This order ≈ {sizingGuide.tradePctOfPortfolio.toFixed(1)}% of portfolio value.
                  </span>
                )}
              </p>
            )}
          </div>
        )}

        {formError && <p className="text-sm text-danger">{formError}</p>}
        {success && <p className="text-sm text-accent">{success}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full py-3 rounded-lg bg-accent text-surface-900 font-semibold hover:bg-accent-dim disabled:opacity-50"
        >
          {submitting ? "Submitting…" : "Execute market order"}
        </button>
      </form>
    </div>
  );
}
