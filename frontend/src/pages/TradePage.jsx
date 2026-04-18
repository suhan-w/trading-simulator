import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import ExecuteTradeForm from "../components/ExecuteTradeForm";
import ShareLeaderboardBanner from "../components/ShareLeaderboardBanner";
import HistoricalStockPanel from "../components/HistoricalStockPanel";
import CardHeaderTitle from "../components/CardHeaderTitle";
import SectionHeading from "../components/SectionHeading";
import { formatAud } from "../formatAud";
import { concentrationSliceColor } from "../constants/concentrationPalette";
import { TRADE_STRATEGY_REMINDER_KEY } from "../constants/tradeReminder";

/**
 * @param {{ holdings: Array<{ ticker: string, quantity: number, current_price: number, market_value: number, unrealized_pnl: number }> }} props
 */
function TradeHoldingsTable({ holdings }) {
  const empty = holdings.length === 0;

  const rows = useMemo(() => {
    if (empty) return [];
    return [...holdings].sort((a, b) => (b.market_value ?? 0) - (a.market_value ?? 0));
  }, [holdings, empty]);

  return (
    <div className="px-2 pb-5">
      <div className="overflow-x-auto">
        <table className="w-full text-left font-sans">
          {!empty && <caption className="sr-only">Your current holdings on this account</caption>}
          <thead>
            <tr className="border-b border-ink/[0.08] text-[10px] font-bold uppercase tracking-wider text-muted">
              <th className="px-3 py-3">Stock</th>
              <th className="px-3 py-3 text-right">Shares</th>
              <th className="px-3 py-3 text-right">Price</th>
              <th className="px-3 py-3 text-right">P&amp;L</th>
            </tr>
          </thead>
          <tbody className="font-mono text-sm tabular-nums">
            {empty ? (
              <tr className="border-t border-ink/[0.06]">
                <td className="px-3 py-10" colSpan={4} aria-label="No open positions" />
              </tr>
            ) : (
              rows.map((h, i) => (
                <tr key={h.ticker} className="border-t border-ink/[0.06] text-ink">
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2 w-2 shrink-0 rounded-[1px] shadow-card-sm"
                        style={{ backgroundColor: concentrationSliceColor(i) }}
                        aria-hidden
                      />
                      <span className="font-bold">{h.ticker}</span>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right text-muted">{h.quantity}</td>
                  <td className="px-3 py-3 text-right">{formatAud(h.current_price)}</td>
                  <td
                    className={`px-3 py-3 text-right font-bold ${
                      h.unrealized_pnl >= 0 ? "text-profit" : "text-danger"
                    }`}
                  >
                    {h.unrealized_pnl >= 0 ? "+" : "−"}
                    {formatAud(Math.abs(h.unrealized_pnl))}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {empty ? (
        <p className="mt-3 px-3 text-center text-[11px] text-muted">
          No positions yet. Buy from the form on the right, then review everything on{" "}
          <Link to="/" className="font-semibold text-gold underline-offset-2 hover:underline">
            Portfolio
          </Link>
          .
        </p>
      ) : (
        <p className="mt-3 px-3 text-center text-[11px] text-muted">
          Open{" "}
          <Link to="/" className="font-semibold text-gold underline-offset-2 hover:underline">
            Portfolio
          </Link>{" "}
          for the full holdings table, charts, and row click for performance.
        </p>
      )}
    </div>
  );
}

export default function TradePage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [chartSymbol, setChartSymbol] = useState(null);
  const [portfolioData, setPortfolioData] = useState(null);
  const [portfolioErr, setPortfolioErr] = useState(null);
  const [strategyReminder, setStrategyReminder] = useState("");
  const [paperSharePublic, setPaperSharePublic] = useState(false);
  const [paperShareBusy, setPaperShareBusy] = useState(false);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(TRADE_STRATEGY_REMINDER_KEY);
      if (raw) setStrategyReminder(raw);
    } catch {
      setStrategyReminder("");
    }
  }, [searchParams]);

  const loadPortfolio = useCallback(() => {
    api.portfolio().then(setPortfolioData).catch(() => setPortfolioData(null));
  }, []);

  useEffect(() => {
    if (!user) {
      setPortfolioData(null);
      setPortfolioErr(null);
      return undefined;
    }
    loadPortfolio();
    const id = setInterval(loadPortfolio, 45_000);
    return () => clearInterval(id);
  }, [user, loadPortfolio]);

  useEffect(() => {
    if (!user) {
      setPaperSharePublic(false);
      return undefined;
    }
    let cancelled = false;
    api
      .leaderboardMine()
      .then((rows) => {
        if (cancelled) return;
        const paper = rows.find((r) => r.source === "paper");
        if (paper) setPaperSharePublic(Boolean(paper.share_public));
      })
      .catch(() => {
        /* non-fatal */
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const onPaperShareToggle = useCallback(async (next) => {
    if (paperSharePublic === next) return;
    setPaperShareBusy(true);
    try {
      const out = await api.patchPaperLeaderboardSharing({ share_public: next });
      setPaperSharePublic(Boolean(out.share_public));
    } catch (e) {
      window.alert(e instanceof Error ? e.message : String(e));
    } finally {
      setPaperShareBusy(false);
    }
  }, [paperSharePublic]);

  const onMarketFilled = useCallback(() => {
    void api.leaderboardMine().then((rows) => {
      const paper = rows.find((r) => r.source === "paper");
      if (paper) setPaperSharePublic(Boolean(paper.share_public));
    });
  }, []);

  const dismissStrategyReminder = useCallback(() => {
    try {
      sessionStorage.removeItem(TRADE_STRATEGY_REMINDER_KEY);
    } catch {
      /* ignore */
    }
    setStrategyReminder("");
    if (searchParams.get("from")) {
      const next = new URLSearchParams(searchParams);
      next.delete("from");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  return (
    <div className="space-y-6 md:space-y-8">
      <SectionHeading
        title="Trade"
        subtitle="Place orders at the previous session’s closing price."
        tooltipText="Buy and sell ASX stocks at the previous session’s close; review a compact holdings snapshot below."
      />

      {strategyReminder ? (
        <div className="cs-card overflow-hidden border border-gold/30 shadow-card">
          <div className="cs-card-header border-b border-ink/[0.06] pb-2">
            <CardHeaderTitle
              headingLevel={2}
              title="Strategy signal rules (reminder)"
              tooltipText="Python strategy from the Strategy page. This app does not auto-trade from this code—use it only as a manual reference for paper orders."
              subtitle="From your strategy builder — discretionary guide to entries, exits, and indicators."
              right={
                <button
                  type="button"
                  className="cs-btn-neutral shrink-0 px-3 py-1.5 text-xs font-semibold"
                  onClick={dismissStrategyReminder}
                >
                  Dismiss
                </button>
              }
            />
          </div>
          <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words bg-canvas px-4 py-3 font-mono text-[11px] leading-relaxed text-ink">
            {strategyReminder}
          </pre>
        </div>
      ) : null}

      {!user?.has_alpha_vantage_key && (
        <div className="cs-card px-5 py-4 text-sm text-muted">
          Add an API key under{" "}
          <Link to="/account" className="font-semibold text-gold underline-offset-2 hover:underline">
            Account
          </Link>{" "}
          to load prices and trade.
        </div>
      )}

      <div className="trade-layout">
        <div className="flex min-w-0 flex-col gap-6">
          <HistoricalStockPanel chartSymbol={chartSymbol} />
          {user && (
            <section className="cs-card w-full shrink-0 overflow-hidden">
              <div className="cs-card-header pb-3">
                <CardHeaderTitle
                  title="Portfolio snapshot"
                  tooltipText="Snapshot of open positions: ticker, quantity, last close, and unrealised P/L. Full table and row charts are on Portfolio."
                />
              </div>
              {portfolioErr ? (
                <p className="px-5 pb-5 text-sm font-mono font-semibold text-danger">{portfolioErr}</p>
              ) : portfolioData == null ? (
                <p className="px-5 pb-5 text-sm font-mono text-muted">Loading…</p>
              ) : (
                <TradeHoldingsTable holdings={portfolioData.holdings} />
              )}
            </section>
          )}
        </div>
        <div className="min-w-0 flex w-full flex-col gap-3">
          <ExecuteTradeForm onQuoteSymbol={setChartSymbol} onMarketOrderFilled={onMarketFilled} />
          {user ? (
            <ShareLeaderboardBanner
              sharePublic={paperSharePublic}
              onChangeShare={(v) => void onPaperShareToggle(v)}
              disabled={paperShareBusy}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
