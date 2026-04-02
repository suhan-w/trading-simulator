from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field, model_validator


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    """API user shape. `is_guest` is derived from email (computed_field breaks ORM→JSON in some cases)."""

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
    order_type: str = Field(..., pattern="^(market|limit)$")
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
    filled_at: Optional[datetime]

    class Config:
        from_attributes = True


class TransactionOut(BaseModel):
    id: int
    ticker: str
    side: str
    quantity: float
    price: float
    total: float
    executed_at: datetime

    class Config:
        from_attributes = True


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


class BacktestRequest(BaseModel):
    ticker: str = Field(..., min_length=1, max_length=32)
    start_date: str = Field(..., description="YYYY-MM-DD")
    end_date: str = Field(..., description="YYYY-MM-DD")
    fast_period: int = Field(10, ge=2, le=200)
    slow_period: int = Field(30, ge=3, le=300)


class BacktestResult(BaseModel):
    ticker: str
    start_date: str
    end_date: str
    strategy: str
    total_return_pct: float
    win_rate_pct: float
    max_drawdown_pct: float
    num_trades: int
    final_equity: float


class LeaderboardEntry(BaseModel):
    rank: int
    user_id: int
    email: str
    total_equity: float
    gain_loss_pct: float


class QuoteOut(BaseModel):
    ticker: str
    price: float
    currency: str
    name: Optional[str] = None


class SearchResult(BaseModel):
    ticker: str
    name: Optional[str] = None


class ChartBar(BaseModel):
    time: str
    open: float
    high: float
    low: float
    close: float
    volume: float
