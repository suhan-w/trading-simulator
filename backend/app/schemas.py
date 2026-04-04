from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    cash_balance: float
    created_at: datetime
    is_guest: bool = False

    @model_validator(mode="after")
    def _derive_is_guest(self):
        g = self.email.endswith("@guest.local")
        if self.is_guest != g:
            return self.model_copy(update={"is_guest": g})
        return self


class OrderCreate(BaseModel):
    ticker: str = Field(..., min_length=1, max_length=32)
    side: str = Field(..., pattern="^(buy|sell)$")
    order_type: str = Field(default="market", pattern="^(market|limit)$")
    quantity: float = Field(..., gt=0)
    limit_price: Optional[float] = Field(None, gt=0)


class OrderOut(BaseModel):
    id: int
    ticker: str
    side: str
    order_type: str
    quantity: float
    limit_price: Optional[float]
    status: str
    filled_price: Optional[float]
    created_at: datetime
    filled_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class EquityPoint(BaseModel):
    time: str
    equity: float


class HoldingOut(BaseModel):
    ticker: str
    quantity: float
    avg_cost: float
    current_price: float
    market_value: float
    unrealized_pnl: float
    unrealized_pnl_pct: float


class PortfolioOut(BaseModel):
    cash_balance: float
    initial_equity: float
    total_equity: float
    total_unrealized_pnl: float
    total_return_pct: float
    holdings: list[HoldingOut]


class QuoteOut(BaseModel):
    ticker: str
    price: float
    currency: str
    name: Optional[str] = None


class EquityCurvePoint(BaseModel):
    time: str
    equity: float


class ReturnPctPoint(BaseModel):
    time: str
    return_pct: float


class TickerReturnRow(BaseModel):
    ticker: str
    return_pct: float


class TradeHighlight(BaseModel):
    ticker: str
    realized_pnl: float
    quantity: float
    price: float


class ComparisonPoint(BaseModel):
    date: str
    portfolio: float
    benchmark: float


class BenchmarkSeriesOut(BaseModel):
    portfolio: list[dict]
    benchmark: list[dict]
    benchmark_symbol: str
    benchmark_label: str


class PerformanceReportOut(BaseModel):
    start: str
    end: str
    equity_curve: list[EquityCurvePoint]
    return_pct_series: list[ReturnPctPoint]
    per_stock_performance: list[TickerReturnRow]
    win_rate_pct: Optional[float] = None
    best_trade: Optional[TradeHighlight] = None
    worst_trade: Optional[TradeHighlight] = None
    max_drawdown_pct: float
    sharpe_ratio: Optional[float] = None
    trade_count: int
    sell_count: int
    portfolio_vs_benchmark: BenchmarkSeriesOut
    initial_equity: float
