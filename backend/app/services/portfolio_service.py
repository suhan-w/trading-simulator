from sqlalchemy.orm import Session

from app.config import settings
from app.models import Holding, User
from app.services import market_service
from app.services.order_service import process_pending_orders_for_user


def _price_map(tickers: list[str]) -> dict[str, float]:
    out: dict[str, float] = {}
    for t in tickers:
        try:
            out[t] = market_service.get_quote(t)["price"]
        except Exception:
            out[t] = 0.0
    return out


def build_portfolio(db: Session, user: User) -> dict:
    process_pending_orders_for_user(db, user)
    db.refresh(user)
    holdings_rows = db.query(Holding).filter(Holding.user_id == user.id).all()
    tickers = [h.ticker for h in holdings_rows]
    prices = _price_map(tickers)

    holdings_out = []
    total_unrealized = 0.0
    market_value_sum = 0.0

    for h in holdings_rows:
        px = prices.get(h.ticker, 0.0)
        mv = h.quantity * px
        cost_basis = h.quantity * h.avg_cost
        unrealized = mv - cost_basis
        unrealized_pct = (unrealized / cost_basis * 100) if cost_basis > 0 else 0.0
        market_value_sum += mv
        total_unrealized += unrealized
        holdings_out.append(
            {
                "ticker": h.ticker,
                "quantity": h.quantity,
                "avg_cost": h.avg_cost,
                "current_price": px,
                "market_value": mv,
                "unrealized_pnl": unrealized,
                "unrealized_pnl_pct": unrealized_pct,
            }
        )

    initial = settings.initial_cash
    total_equity = user.cash_balance + market_value_sum
    total_return_pct = ((total_equity - initial) / initial) * 100 if initial else 0.0

    return {
        "cash_balance": user.cash_balance,
        "initial_equity": initial,
        "total_equity": total_equity,
        "total_unrealized_pnl": total_unrealized,
        "total_return_pct": total_return_pct,
        "holdings": holdings_out,
    }


def total_equity_for_user(db: Session, user: User) -> float:
    data = build_portfolio(db, user)
    db.commit()
    return data["total_equity"]
