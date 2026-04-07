"""Mark-to-market equity without importing order_service (avoids circular imports)."""

from sqlalchemy.orm import Session

from app.models import Holding, User
from app.services import av_cache_service


def price_map_for_tickers(db: Session, user: User, tickers: list[str]) -> dict[str, float]:
    out: dict[str, float] = {}
    k = (user.alpha_vantage_api_key or "").strip()
    if not k:
        return {t: 0.0 for t in tickers}
    for t in tickers:
        try:
            out[t] = av_cache_service.get_eod_quote_dict(db, user, t)["price"]
        except Exception:
            out[t] = 0.0
    return out


def mark_to_market_equity(db: Session, user: User) -> float:
    db.refresh(user)
    holdings = db.query(Holding).filter(Holding.user_id == user.id).all()
    tickers = [h.ticker for h in holdings]
    prices = price_map_for_tickers(db, user, tickers)
    mv = sum(h.quantity * prices.get(h.ticker, 0.0) for h in holdings)
    return round(user.cash_balance + mv, 2)
