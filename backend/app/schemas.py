from datetime import date, datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from sqlalchemy.orm import Session

from app.config import settings
from app.models import Order, User
from app.services import melbourne_asx


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
    has_alpha_vantage_key: bool = False
    alpha_vantage_requests_used_today: int = 0
    alpha_vantage_daily_limit: int = 25
    initial_cash: float


def user_to_out(user: User, db: Session | None = None) -> UserOut:
    used = 0
    limit = settings.alpha_vantage_daily_request_limit
    if db is not None:
        try:
            from app.services import av_cache_service

            used = av_cache_service.get_usage_today(db, user.id)
        except Exception:
            used = 0
    created_at = user.created_at
    if created_at is None:
        created_at = datetime.utcfromtimestamp(0)
    return UserOut(
        id=user.id,
        email=user.email,
        cash_balance=user.cash_balance,
        created_at=created_at,
        is_guest=user.email.endswith("@guest.local"),
        has_alpha_vantage_key=bool((user.alpha_vantage_api_key or "").strip()),
        alpha_vantage_requests_used_today=used,
        alpha_vantage_daily_limit=limit,
        initial_cash=float(settings.initial_cash),
    )


class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=72)
    alpha_vantage_api_key: str = Field(..., min_length=8, max_length=512)


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=1, max_length=72)


class AlphaVantageApiKeyIn(BaseModel):
    alpha_vantage_api_key: str = Field(..., min_length=8, max_length=512)


class OrderCreate(BaseModel):
    ticker: str = Field(..., min_length=1, max_length=32)
    side: str = Field(..., pattern="^(buy|sell)$")
    order_type: str = Field(default="market", pattern="^(market|limit)$")
    quantity: float = Field(..., gt=0)
    limit_price: Optional[float] = Field(None, gt=0)


class Asx200IndexOut(BaseModel):
    symbol: str
    value: float
    change_pct: Optional[float] = None
    source: str = "yahoo"


class MarketSessionOut(BaseModel):
    open: bool
    melbourne_time_iso: str
    melbourne_time_display: str
    timezone_abbr: str
    session_hours_note: str
    closed_reason: Optional[str] = None
    holiday_name: Optional[str] = None
    seconds_until_open: Optional[int] = None
    seconds_until_close: Optional[int] = None
    next_open_melbourne_iso: Optional[str] = None
    next_open_display: Optional[str] = None


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
    created_at_melbourne: str
    filled_at_melbourne: Optional[str] = None
    paper_leaderboard_entry_id: Optional[int] = None

    class Config:
        from_attributes = True


def order_to_out(o: Order, *, paper_leaderboard_entry_id: Optional[int] = None) -> OrderOut:
    return OrderOut(
        id=o.id,
        ticker=o.ticker,
        side=o.side,
        order_type=o.order_type,
        quantity=o.quantity,
        limit_price=o.limit_price,
        status=o.status,
        filled_price=o.filled_price,
        created_at=o.created_at,
        filled_at=o.filled_at,
        created_at_melbourne=melbourne_asx.utc_naive_to_melbourne_iso(o.created_at) if o.created_at else "",
        filled_at_melbourne=melbourne_asx.utc_naive_to_melbourne_iso(o.filled_at) if o.filled_at else None,
        paper_leaderboard_entry_id=paper_leaderboard_entry_id,
    )


class EquityPoint(BaseModel):
    time: str
    equity: float


class EquityDailyPoint(BaseModel):
    date: str
    equity: float


class SparklinePoint(BaseModel):
    date: str
    close: float


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
    as_of_date: str
    delayed_eod: bool = True


class BacktestIn(BaseModel):
    ticker: str = Field(..., min_length=1, max_length=32)
    start: date
    end: date
    strategy: str = Field(..., pattern="^(ma_crossover|rsi_mean_reversion|buy_hold)$")


class BacktestOut(BaseModel):
    total_return_pct: float
    win_rate_pct: Optional[float] = None
    max_drawdown_pct: float
    sharpe_ratio: Optional[float] = None
    trade_count: int
    strategy: str


class CodeBacktestCodeIn(BaseModel):
    """User strategy: define run(data) returning dates, equity, optional trades, etc."""

    code: str = Field(..., min_length=1, max_length=100_000)
    ticker: str = Field(..., min_length=1, max_length=32)
    start: date
    end: date
    visual_json: Optional[str] = Field(None, max_length=500_000)


class CodeBacktestCodeOut(BaseModel):
    benchmark: str = "^AXJO"
    metrics: dict[str, Any]
    series: dict[str, Any]
    leaderboard_entry_id: Optional[int] = None


class OhlcvBarOut(BaseModel):
    date: str
    open: float
    high: float
    low: float
    close: float
    volume: float


class EquityCurvePoint(BaseModel):
    time: str
    equity: float


class ReturnPctPoint(BaseModel):
    time: str
    return_pct: float


class TickerReturnRow(BaseModel):
    ticker: str
    return_pct: float


class DailyReturnBar(BaseModel):
    date: str
    return_pct: float


class CumulativeReturnPoint(BaseModel):
    date: str
    cumulative_return_pct: float


class WinRateBreakdown(BaseModel):
    winning_sells: int
    losing_sells: int
    breakeven_sells: int


class StockPnlBar(BaseModel):
    ticker: str
    pnl: float


class DrawdownPoint(BaseModel):
    date: str
    drawdown_pct: float


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
    # Total return first-to-last common day (same overlap as the vs-benchmark chart).
    aligned_portfolio_return_pct: Optional[float] = None
    aligned_benchmark_return_pct: Optional[float] = None
    aligned_alpha_pct: Optional[float] = None
    initial_equity: float
    daily_return_bars: list[DailyReturnBar]
    cumulative_return_daily: list[CumulativeReturnPoint]
    win_rate_breakdown: WinRateBreakdown
    per_stock_pnl: list[StockPnlBar]
    drawdown_series: list[DrawdownPoint]


class SummaryMetricRowOut(BaseModel):
    name: str
    value: str
    interpretation: str


class SummaryStockRowOut(BaseModel):
    ticker: str
    return_pct: Optional[float] = None
    pnl: float


class SummaryPortfolioActivityOut(BaseModel):
    starting_value: Optional[float] = None
    ending_value: Optional[float] = None
    cash_remaining: float
    buy_trades: int
    sell_trades: int
    most_traded_ticker: Optional[str] = None
    most_traded_count: int = 0


class SummaryBenchmarkComparisonOut(BaseModel):
    strategy_period_return_pct: Optional[float] = None
    benchmark_period_return_pct: Optional[float] = None
    excess_return_pct: Optional[float] = None
    benchmark_label: str


class SummaryStrategyContextOut(BaseModel):
    """User-supplied label / notes (e.g. thesis from a backtest) included with this summary only."""

    strategy_title: Optional[str] = None
    strategy_notes: Optional[str] = None


class SummaryReportRequestIn(BaseModel):
    start: date
    end: date
    strategy_title: Optional[str] = Field(None, max_length=200)
    strategy_notes: Optional[str] = Field(None, max_length=4000)


class SummaryTradeRowOut(BaseModel):
    id: int
    ticker: str
    side: str
    quantity: float
    price: float
    total: float
    executed_at: Optional[str] = None


class SummaryHoldingRowOut(BaseModel):
    ticker: str
    quantity: float
    avg_cost: float
    current_price: float
    market_value: float
    unrealized_pnl: float
    unrealized_pnl_pct: float


class SummaryReportResponse(BaseModel):
    generated_at: str
    date_range_label: str
    start: str
    end: str
    benchmark_label: str
    executive_summary: str
    metrics_table: list[SummaryMetricRowOut]
    portfolio_activity: SummaryPortfolioActivityOut
    top_performers: list[SummaryStockRowOut]
    worst_performers: list[SummaryStockRowOut]
    risk_assessment: str
    benchmark_comparison: SummaryBenchmarkComparisonOut
    conclusion: str
    trades: list[SummaryTradeRowOut]
    holdings: list[SummaryHoldingRowOut]
    equity_curve: list[EquityCurvePoint]
    portfolio_vs_benchmark: BenchmarkSeriesOut
    strategy_context: Optional[SummaryStrategyContextOut] = None


class LeaderboardRowOut(BaseModel):
    id: int
    anon_id: int
    strategy_seq: int
    strategy_label: str
    source: str
    ticker: Optional[str] = None
    period_start: date
    period_end: date
    value: float
    value_label: str
    total_return_pct: float
    sharpe_ratio: Optional[float] = None
    max_drawdown_pct: Optional[float] = None
    is_mine: bool
    viewable: bool


class LeaderboardCategoryOut(BaseModel):
    key: str
    title: str
    rows: list[LeaderboardRowOut]


class LeaderboardBestRankOut(BaseModel):
    best_rank: int
    category_label: str
    strategy_label: str


class LeaderboardBundleOut(BaseModel):
    start: date
    end: date
    total_public_entries: int
    show_empty_state: bool
    best_rank: Optional[LeaderboardBestRankOut] = None
    categories: list[LeaderboardCategoryOut]


class LeaderboardEntryPatchIn(BaseModel):
    share_public: bool


class LeaderboardEntryMineOut(BaseModel):
    id: int
    anon_id: int
    strategy_seq: int
    source: str
    period_start: date
    period_end: date
    share_public: bool
    total_return_pct: float
    trade_count: int
    created_at: datetime


class LeaderboardDetailOut(BaseModel):
    id: int
    anon_id: int
    strategy_seq: int
    strategy_label: str
    ticker: Optional[str] = None
    source: str
    period_start: date
    period_end: date
    total_return_pct: float
    sharpe_ratio: Optional[float] = None
    max_drawdown_pct: Optional[float] = None
    win_rate_pct: Optional[float] = None
    trade_count: int
    strategy_code: Optional[str] = None
    strategy_visual_json: Optional[str] = None
