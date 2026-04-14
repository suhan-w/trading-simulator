import enum
from datetime import datetime

from sqlalchemy import Boolean, Column, Date, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import relationship

from app.database import Base


class OrderSide(str, enum.Enum):
    BUY = "buy"
    SELL = "sell"


class OrderType(str, enum.Enum):
    MARKET = "market"
    LIMIT = "limit"


class OrderStatus(str, enum.Enum):
    PENDING = "pending"
    FILLED = "filled"
    CANCELLED = "cancelled"


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    alpha_vantage_api_key = Column(String(512), nullable=True)
    anon_user_id = Column(String(24), unique=True, index=True, nullable=True)
    anon_strategy_seq = Column(Integer, nullable=False, default=0)
    cash_balance = Column(Float, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    holdings = relationship("Holding", back_populates="user", cascade="all, delete-orphan")
    orders = relationship("Order", back_populates="user", cascade="all, delete-orphan")
    transactions = relationship("Transaction", back_populates="user", cascade="all, delete-orphan")


class Holding(Base):
    __tablename__ = "holdings"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    ticker = Column(String(32), nullable=False, index=True)
    quantity = Column(Float, nullable=False)
    avg_cost = Column(Float, nullable=False)

    user = relationship("User", back_populates="holdings")


class Order(Base):
    __tablename__ = "orders"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    ticker = Column(String(32), nullable=False, index=True)
    side = Column(String(16), nullable=False)
    order_type = Column(String(16), nullable=False)
    quantity = Column(Float, nullable=False)
    limit_price = Column(Float, nullable=True)
    status = Column(String(16), default=OrderStatus.PENDING.value)
    filled_price = Column(Float, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    filled_at = Column(DateTime, nullable=True)

    user = relationship("User", back_populates="orders")


class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    ticker = Column(String(32), nullable=False, index=True)
    side = Column(String(16), nullable=False)
    quantity = Column(Float, nullable=False)
    price = Column(Float, nullable=False)
    total = Column(Float, nullable=False)
    order_id = Column(Integer, ForeignKey("orders.id"), nullable=True)
    executed_at = Column(DateTime, default=datetime.utcnow)
    portfolio_equity_after = Column(Float, nullable=True)

    user = relationship("User", back_populates="transactions")


class AvEodCache(Base):
    """Cached TIME_SERIES_DAILY (full) JSON per symbol per UTC calendar day — avoids duplicate AV calls."""

    __tablename__ = "av_eod_cache"
    __table_args__ = (UniqueConstraint("symbol", "cache_date", name="uq_av_eod_symbol_date"),)

    id = Column(Integer, primary_key=True, index=True)
    symbol = Column(String(32), nullable=False, index=True)
    cache_date = Column(Date, nullable=False, index=True)
    series_json = Column(Text, nullable=False)


class AvDailyUsage(Base):
    """Alpha Vantage API calls counted per user per UTC calendar day."""

    __tablename__ = "av_daily_usage"
    __table_args__ = (UniqueConstraint("user_id", "usage_date", name="uq_av_daily_user_date"),)

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    usage_date = Column(Date, nullable=False, index=True)
    request_count = Column(Integer, nullable=False, default=0)


class LeaderboardEntry(Base):
    """Anonymous strategy performance row; usernames never exposed via API."""

    __tablename__ = "leaderboard_entries"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    anon_id = Column(Integer, unique=True, nullable=False, index=True)
    strategy_seq = Column(Integer, nullable=False, default=0)
    source = Column(String(16), nullable=False)
    ticker = Column(String(32), nullable=True)
    period_start = Column(Date, nullable=False)
    period_end = Column(Date, nullable=False)
    total_return_pct = Column(Float, nullable=False)
    sharpe_ratio = Column(Float, nullable=True)
    max_drawdown_pct = Column(Float, nullable=True)
    win_rate_pct = Column(Float, nullable=True)
    trade_count = Column(Integer, nullable=False, default=0)
    share_public = Column(Boolean, nullable=False, default=False)
    strategy_code = Column(Text, nullable=True)
    strategy_visual_json = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
