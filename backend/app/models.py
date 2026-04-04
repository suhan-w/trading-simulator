import enum
from datetime import datetime

from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String
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
