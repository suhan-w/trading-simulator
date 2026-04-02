import { useState } from "react";
import { api } from "../api/client";

export default function Backtest() {
  const [ticker, setTicker] = useState("AAPL");
  const [start, setStart] = useState("2020-01-01");
  const [end, setEnd] = useState("2024-01-01");
  const [fast, setFast] = useState(10);
  const [slow, setSlow] = useState(30);
  const [result, setResult] = useState(null);
  const [err, setErr] = useState("");
  const [pending, setPending] = useState(false);

  async function run(e) {
    e.preventDefault();
    setErr("");
    setResult(null);
    setPending(true);
    try {
      const r = await api.backtest({
        ticker,
        start_date: start,
        end_date: end,
        fast_period: Number(fast),
        slow_period: Number(slow),
      });
      setResult(r);
    } catch (x) {
      setErr(x.message);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold mb-1">Strategy backtest</h1>
        <p className="text-slate-400 text-sm">
          Simple moving average crossover: buy when fast SMA crosses above slow SMA, sell when it crosses below.
          Historical data via Yahoo Finance.
        </p>
      </div>

      <form onSubmit={run} className="rounded-xl border border-surface-700 bg-surface-800/50 p-6 space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Ticker</label>
            <input
              value={ticker}
              onChange={(e) => setTicker(e.target.value.toUpperCase())}
              className="w-full font-mono rounded-lg bg-surface-800 border border-surface-700 px-4 py-2.5"
            />
          </div>
          <div className="sm:col-span-2 grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Start</label>
              <input
                type="date"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                className="w-full rounded-lg bg-surface-800 border border-surface-700 px-4 py-2.5"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">End</label>
              <input
                type="date"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                className="w-full rounded-lg bg-surface-800 border border-surface-700 px-4 py-2.5"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Fast SMA</label>
            <input
              type="number"
              min={2}
              value={fast}
              onChange={(e) => setFast(e.target.value)}
              className="w-full rounded-lg bg-surface-800 border border-surface-700 px-4 py-2.5"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Slow SMA</label>
            <input
              type="number"
              min={3}
              value={slow}
              onChange={(e) => setSlow(e.target.value)}
              className="w-full rounded-lg bg-surface-800 border border-surface-700 px-4 py-2.5"
            />
          </div>
        </div>
        {err && <div className="text-danger text-sm">{err}</div>}
        <button
          type="submit"
          disabled={pending}
          className="px-6 py-3 rounded-lg bg-accent text-surface-900 font-semibold disabled:opacity-50"
        >
          {pending ? "Running…" : "Run backtest"}
        </button>
      </form>

      {result && (
        <div className="rounded-xl border border-surface-700 bg-surface-800/80 p-6 space-y-3 font-mono text-sm">
          <h2 className="text-lg font-sans font-semibold mb-4">Results</h2>
          <Row label="Strategy" value={result.strategy} />
          <Row label="Ticker" value={result.ticker} />
          <Row label="Range" value={`${result.start_date} → ${result.end_date}`} />
          <Row label="Total return" value={`${result.total_return_pct.toFixed(2)}%`} highlight />
          <Row label="Win rate" value={`${result.win_rate_pct.toFixed(2)}%`} />
          <Row label="Max drawdown" value={`${result.max_drawdown_pct.toFixed(2)}%`} warn />
          <Row label="Closed trades" value={String(result.num_trades)} />
          <Row label="Final equity" value={`$${result.final_equity.toLocaleString(undefined, { maximumFractionDigits: 2 })}`} />
        </div>
      )}
    </div>
  );
}

function Row({ label, value, highlight, warn }) {
  return (
    <div className="flex justify-between gap-4 border-b border-surface-700/50 pb-2">
      <span className="text-slate-400">{label}</span>
      <span
        className={
          highlight ? "text-accent" : warn ? "text-amber-400" : "text-white text-right"
        }
      >
        {value}
      </span>
    </div>
  );
}
