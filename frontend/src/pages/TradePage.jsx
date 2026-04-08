import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import ExecuteTradeForm from "../components/ExecuteTradeForm";
import HistoricalStockPanel from "../components/HistoricalStockPanel";
import SectionHeading from "../components/SectionHeading";

export default function TradePage() {
  const { user } = useAuth();
  const [chartSymbol, setChartSymbol] = useState(null);
  const [portfolioData, setPortfolioData] = useState(null);

  const loadPortfolio = useCallback(() => {
    api.portfolio().then(setPortfolioData).catch(() => setPortfolioData(null));
  }, []);

  useEffect(() => {
    if (!user) {
      setPortfolioData(null);
      return undefined;
    }
    loadPortfolio();
    const id = setInterval(loadPortfolio, 45_000);
    return () => clearInterval(id);
  }, [user, loadPortfolio]);

  return (
    <div className="space-y-6 md:space-y-8">
      <SectionHeading
        title="Trade"
        subtitle="Execute orders at the previous session’s closing price (Alpha Vantage EOD). Same symbol uses one cached request per day — 25/day free tier."
      />

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
        <div className="flex min-h-0 min-w-0 h-full flex-col gap-6">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <HistoricalStockPanel chartSymbol={chartSymbol} />
          </div>
          {user && (
            <section className="cs-card w-full shrink-0 overflow-hidden">
              <div className="cs-card-header pb-2">
                <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted">Holdings</h2>
                <p className="mt-2 text-xs text-muted">
                  Click a row on the Portfolio holdings table for individual stock performance (EOD close) below the
                  table.
                </p>
              </div>
              {portfolioData == null ? (
                <p className="p-5 text-sm font-mono text-muted">Loading…</p>
              ) : portfolioData.holdings.length === 0 ? (
                <p className="p-5 text-sm text-muted">
                  No positions yet. Use the trade form on the right to place a buy, then review everything on{" "}
                  <Link to="/" className="font-semibold text-gold underline-offset-2 hover:underline">
                    Portfolio
                  </Link>
                  .
                </p>
              ) : (
                <p className="p-5 text-sm text-muted">
                  You have open positions. Open{" "}
                  <Link to="/" className="font-semibold text-gold underline-offset-2 hover:underline">
                    Portfolio
                  </Link>{" "}
                  for the full holdings table and charts.
                </p>
              )}
            </section>
          )}
        </div>
        <div className="min-w-0 h-full flex">
          <ExecuteTradeForm onQuoteSymbol={setChartSymbol} />
        </div>
      </div>
    </div>
  );
}
