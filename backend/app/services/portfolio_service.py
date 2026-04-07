from datetime import date, datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.config import settings
from app.models import Holding, Transaction, User
from app.services import equity as equity_svc
from app.services import melbourne_asx
from app.services.order_service import process_pending_orders_for_user


def build_portfolio(db: Session, user: User) -> dict:
    process_pending_orders_for_user(db, user)
    db.refresh(user)
    holdings_rows = db.query(Holding).filter(Holding.user_id == user.id).all()
    tickers = [h.ticker for h in holdings_rows]
    prices = equity_svc.price_map_for_tickers(db, user, tickers)

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


def equity_history_points(db: Session, user: User) -> list[dict]:
    """Time series: start cash + after each trade + current (for charts and reports)."""
    data = build_portfolio(db, user)
    cur = data["total_equity"]
    db.refresh(user)
    initial = float(settings.initial_cash)
    uc = user.created_at
    if uc is not None:
        t0 = melbourne_asx.utc_naive_to_melbourne_iso(uc)
    else:
        t0 = melbourne_asx.utc_naive_to_melbourne_iso(datetime.now(timezone.utc).replace(tzinfo=None))
    points: list[dict] = [{"time": t0, "equity": initial}]

    txs = (
        db.query(Transaction)
        .filter(Transaction.user_id == user.id, Transaction.portfolio_equity_after.isnot(None))
        .order_by(Transaction.executed_at.asc())
        .all()
    )
    for tx in txs:
        ex = tx.executed_at
        t_str = melbourne_asx.utc_naive_to_melbourne_iso(ex) if ex else ""
        points.append(
            {
                "time": t_str,
                "equity": float(tx.portfolio_equity_after or 0),
            }
        )

    now = melbourne_asx.utc_naive_to_melbourne_iso(datetime.now(timezone.utc).replace(tzinfo=None))
    if not points or abs(points[-1]["equity"] - cur) > 0.005:
        points.append({"time": now, "equity": cur})

    return points


def _equity_ts(iso: str) -> datetime:
    return datetime.fromisoformat(iso.replace("Z", "+00:00"))


def forward_fill_equity_daily(
    equity_points: list[dict],
    start: date,
    end: date,
) -> list[dict[str, float | str]]:
    """One row per calendar day: last known equity on or before that day (same logic as performance report)."""
    if not equity_points:
        return []
    pts = sorted(equity_points, key=lambda x: _equity_ts(x["time"]))
    daily: list[dict[str, float | str]] = []
    idx = 0
    last_eq = float(pts[0]["equity"])
    while idx < len(pts) and _equity_ts(pts[idx]["time"]).date() < start:
        last_eq = float(pts[idx]["equity"])
        idx += 1
    cur = start
    while cur <= end:
        while idx < len(pts) and _equity_ts(pts[idx]["time"]).date() <= cur:
            last_eq = float(pts[idx]["equity"])
            idx += 1
        daily.append({"date": cur.isoformat(), "equity": last_eq})
        cur += timedelta(days=1)
    return daily
