from datetime import datetime

from sqlalchemy.orm import Session

from app.models import Holding, Order, OrderSide, OrderStatus, OrderType, Transaction, User
from app.services import equity as equity_svc
from app.services import market_service


def _alpha_vantage_key(user: User) -> str:
    k = (user.alpha_vantage_api_key or "").strip()
    if not k:
        raise ValueError("Add your Alpha Vantage API key in Account settings.")
    return k


def _get_holding(db: Session, user_id: int, ticker: str) -> Holding | None:
    return (
        db.query(Holding)
        .filter(Holding.user_id == user_id, Holding.ticker == ticker)
        .first()
    )


def _apply_buy(db: Session, user: User, ticker: str, qty: float, price: float, order_id: int | None) -> Transaction:
    total = round(qty * price, 2)
    if user.cash_balance < total - 1e-6:
        raise ValueError("Insufficient cash")
    user.cash_balance = round(user.cash_balance - total, 2)
    h = _get_holding(db, user.id, ticker)
    if h is None:
        h = Holding(user_id=user.id, ticker=ticker, quantity=0.0, avg_cost=0.0)
        db.add(h)
        db.flush()
    new_qty = h.quantity + qty
    if h.quantity > 0:
        h.avg_cost = (h.avg_cost * h.quantity + price * qty) / new_qty
    else:
        h.avg_cost = price
    h.quantity = new_qty
    tx = Transaction(
        user_id=user.id,
        ticker=ticker,
        side=OrderSide.BUY.value,
        quantity=qty,
        price=price,
        total=total,
        order_id=order_id,
    )
    db.add(tx)
    db.flush()
    tx.portfolio_equity_after = equity_svc.mark_to_market_equity(db, user)
    return tx


def _apply_sell(db: Session, user: User, ticker: str, qty: float, price: float, order_id: int | None) -> Transaction:
    h = _get_holding(db, user.id, ticker)
    if h is None or h.quantity + 1e-9 < qty:
        raise ValueError("Insufficient shares")
    total = round(qty * price, 2)
    user.cash_balance = round(user.cash_balance + total, 2)
    h.quantity = round(h.quantity - qty, 8)
    if h.quantity < 1e-8:
        db.delete(h)
    tx = Transaction(
        user_id=user.id,
        ticker=ticker,
        side=OrderSide.SELL.value,
        quantity=qty,
        price=price,
        total=total,
        order_id=order_id,
    )
    db.add(tx)
    db.flush()
    tx.portfolio_equity_after = equity_svc.mark_to_market_equity(db, user)
    return tx


def execute_market_order(db: Session, user: User, body) -> Order:
    ticker = market_service.normalize_ticker(body.ticker)
    quote = market_service.get_quote(ticker)
    price = quote["price"]
    total = body.quantity * price
    if body.side == OrderSide.BUY.value:
        if user.cash_balance < total - 1e-6:
            raise ValueError("Insufficient cash")
    else:
        h = _get_holding(db, user.id, ticker)
        if h is None or h.quantity + 1e-9 < body.quantity:
            raise ValueError("Insufficient shares")

    order = Order(
        user_id=user.id,
        ticker=ticker,
        side=body.side,
        order_type=OrderType.MARKET.value,
        quantity=body.quantity,
        limit_price=None,
        status=OrderStatus.FILLED.value,
        filled_price=price,
        filled_at=datetime.utcnow(),
    )
    db.add(order)
    db.flush()
    if body.side == OrderSide.BUY.value:
        _apply_buy(db, user, ticker, body.quantity, price, order.id)
    else:
        _apply_sell(db, user, ticker, body.quantity, price, order.id)
    return order


def create_limit_order(db: Session, user: User, body) -> Order:
    ticker = market_service.normalize_ticker(body.ticker)
    if body.limit_price is None:
        raise ValueError("limit_price required for limit orders")
    if body.side == OrderSide.BUY.value:
        est = body.quantity * body.limit_price
        if user.cash_balance < est - 1e-6:
            raise ValueError("Insufficient cash for limit buy (at limit price)")
    else:
        h = _get_holding(db, user.id, ticker)
        if h is None or h.quantity + 1e-9 < body.quantity:
            raise ValueError("Insufficient shares for limit sell")

    order = Order(
        user_id=user.id,
        ticker=ticker,
        side=body.side,
        order_type=OrderType.LIMIT.value,
        quantity=body.quantity,
        limit_price=body.limit_price,
        status=OrderStatus.PENDING.value,
    )
    db.add(order)
    return order


def process_pending_orders_for_user(db: Session, user: User) -> int:
    pending = (
        db.query(Order)
        .filter(
            Order.user_id == user.id,
            Order.status == OrderStatus.PENDING.value,
        )
        .all()
    )
    filled = 0
    for order in pending:
        try:
            quote = market_service.get_quote(order.ticker, _alpha_vantage_key(user))
            price = quote["price"]
        except Exception:
            continue
        if order.order_type != OrderType.LIMIT.value:
            continue
        lim = order.limit_price
        if lim is None:
            continue
        can_fill = False
        if order.side == OrderSide.BUY.value and price <= lim:
            can_fill = True
        elif order.side == OrderSide.SELL.value and price >= lim:
            can_fill = True
        if not can_fill:
            continue
        order.status = OrderStatus.FILLED.value
        order.filled_price = price
        order.filled_at = datetime.utcnow()
        try:
            if order.side == OrderSide.BUY.value:
                _apply_buy(db, user, order.ticker, order.quantity, price, order.id)
            else:
                _apply_sell(db, user, order.ticker, order.quantity, price, order.id)
            filled += 1
        except ValueError:
            order.status = OrderStatus.PENDING.value
            order.filled_price = None
            order.filled_at = None
    return filled
