import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import ExecuteTradeForm from "../components/ExecuteTradeForm";
import HistoricalStockPanel from "../components/HistoricalStockPanel";
import SectionHeading from "../components/SectionHeading";

export default function TradePage() {
  const { user } = useAuth();
  const [chartSymbol, setChartSymbol] = useState(null);

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
        <div className="min-w-0 h-full flex">
          <ExecuteTradeForm onQuoteSymbol={setChartSymbol} />
        </div>
        <div className="min-w-0 h-full flex">
          <HistoricalStockPanel chartSymbol={chartSymbol} />
        </div>
      </div>
    </div>
  );
}
