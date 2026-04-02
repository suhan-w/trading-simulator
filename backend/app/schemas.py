from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator


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
    notes: Optional[str] = None
    portfolio_equity_after: Optional[float] = None

    class Config:
        from_attributes = True


class TransactionNotesUpdate(BaseModel):
    notes: Optional[str] = Field(None, max_length=4000)


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


class MarketSessionOut(BaseModel):
    open: bool
    hours_note: str
    sydney_time: str


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
