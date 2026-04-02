import { useCallback, useEffect, useState } from "react";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import PriceChart from "../components/PriceChart";
import { formatAud } from "../formatAud";

export default function Trade() {
  const { refresh } = useAuth();
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [ticker, setTicker] = useState("CBA.AX");
  const [quote, setQuote] = useState(null);
  const [bars, setBars] = useState([]);
  const [period, setPeriod] = useState("3mo");
  const [side, setSide] = useState("buy");
  const [orderType, setOrderType] = useState("market");
  const [quantity, setQuantity] = useState("1");
  const [limitPrice, setLimitPrice] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const fetchQuote = useCallback(async () => {
    try {
      const q = await api.quote(ticker);
      setQuote(q);
      setErr("");
    } catch (e) {
      setErr(e.message);
      setQuote(null);
    }
  }, [ticker]);

  useEffect(() => {
    fetchQuote();
    const id = setInterval(fetchQuote, 30_000);
    return () => clearInterval(id);
  }, [fetchQuote]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await api.chart(ticker, period);
        if (!cancelled) setBars(data);
      } catch {
        if (!cancelled) setBars([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ticker, period]);

  async function onSearch(e) {
    e.preventDefault();
    if (!query.trim()) return;
    try {
      const rows = await api.search(query.trim());
      setSearchResults(rows);
    } catch {
      setSearchResults([]);
    }
  }

  async function submitOrder(e) {
    e.preventDefault();
    setMsg("");
    setErr("");
    const qty = parseFloat(quantity);
    if (!qty || qty <= 0) {
      setErr("Invalid quantity");
      return;
    }
    const body = {
      ticker,
      side,
      order_type: orderType,
      quantity: qty,
      limit_price: orderType === "limit" ? parseFloat(limitPrice) : null,
    };
    if (orderType === "limit" && (!body.limit_price || body.limit_price <= 0)) {
      setErr("Enter a valid limit price");
      return;
    }
    try {
      await api.placeOrder(body);
      setMsg("Order placed.");
      await refresh();
      fetchQuote();
    } catch (x) {
      setErr(x.message);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold mb-1">Trade</h1>
        <p className="text-slate-400 text-sm">
          ASX stocks use Yahoo symbols with a <span className="font-mono">.AX</span> suffix (e.g.{" "}
          <span className="font-mono">BHP.AX</span>, <span className="font-mono">CBA.AX</span>). Plain codes like{" "}
          <span className="font-mono">CBA</span> are treated as <span className="font-mono">CBA.AX</span>. Prices and
          orders are in <strong className="text-slate-300">AUD</strong>. Quote refreshes every 30s.
        </p>
        <p className="text-slate-500 text-xs mt-2 border-l-2 border-surface-600 pl-3">
          ASX regular session: Monday to Friday, 10:00am–4:00pm Sydney time. See the header for live Open / Closed
          (weekday hours only; public holidays not detected).
        </p>
      </div>

      <form onSubmit={onSearch} className="flex flex-wrap gap-2">
        <input
          placeholder="Search symbol or company…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="flex-1 min-w-[200px] rounded-lg bg-surface-800 border border-surface-700 px-4 py-2.5"
        />
        <button type="submit" className="px-4 py-2.5 rounded-lg bg-surface-700 hover:bg-surface-600">
          Search
        </button>
      </form>

      {searchResults.length > 0 && (
        <div className="rounded-xl border border-surface-700 divide-y divide-surface-700 max-w-xl">
          {searchResults.map((r) => (
            <button
              key={r.ticker}
              type="button"
              onClick={() => {
                setTicker(r.ticker);
                setSearchResults([]);
              }}
              className="w-full text-left px-4 py-3 hover:bg-surface-800 flex justify-between"
            >
              <span className="font-mono font-medium text-accent">{r.ticker}</span>
              <span className="text-slate-400 text-sm truncate ml-4">{r.name}</span>
            </button>
          ))}
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-8">
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Ticker (.AX)</label>
              <input
                value={ticker}
                onChange={(e) => setTicker(e.target.value.toUpperCase())}
                className="font-mono rounded-lg bg-surface-800 border border-surface-700 px-4 py-2.5 w-36"
                placeholder="CBA.AX"
              />
            </div>
            {quote && (
              <div>
                <div className="text-xs text-slate-400">Last price (AUD)</div>
                <div className="text-2xl font-mono font-semibold text-white">{formatAud(quote.price)}</div>
                {quote.name && <div className="text-slate-400 text-sm">{quote.name}</div>}
              </div>
            )}
          </div>

          {err && <div className="text-danger text-sm">{err}</div>}
          {msg && <div className="text-accent text-sm">{msg}</div>}

          <form onSubmit={submitOrder} className="rounded-xl border border-surface-700 bg-surface-800/50 p-6 space-y-4">
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" checked={side === "buy"} onChange={() => setSide("buy")} />
                Buy
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" checked={side === "sell"} onChange={() => setSide("sell")} />
                Sell
              </label>
            </div>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" checked={orderType === "market"} onChange={() => setOrderType("market")} />
                Market
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" checked={orderType === "limit"} onChange={() => setOrderType("limit")} />
                Limit
              </label>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Quantity</label>
              <input
                type="number"
                step="any"
                min="0"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="w-full rounded-lg bg-surface-800 border border-surface-700 px-4 py-2.5 font-mono"
              />
            </div>
            {orderType === "limit" && (
              <div>
                <label className="block text-xs text-slate-400 mb-1">Limit price (AUD)</label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={limitPrice}
                  onChange={(e) => setLimitPrice(e.target.value)}
                  className="w-full rounded-lg bg-surface-800 border border-surface-700 px-4 py-2.5 font-mono"
                />
              </div>
            )}
            <button type="submit" className="w-full py-3 rounded-lg bg-accent text-surface-900 font-semibold hover:bg-accent-dim">
              Submit order
            </button>
          </form>
        </div>

        <div>
          <div className="flex gap-2 mb-4">
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="rounded-lg bg-surface-800 border border-surface-700 px-3 py-2 text-sm"
            >
              {["1d", "5d", "1mo", "3mo", "6mo", "1y", "2y", "5y"].map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          <PriceChart bars={bars} />
        </div>
      </div>
    </div>
  );
}
