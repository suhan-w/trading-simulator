from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user, require_alpha_vantage_api_key
from app.models import User
from app.schemas import EquityDailyPoint, EquityPoint, HoldingOut, PortfolioOut, SparklinePoint
from app.services import alpha_vantage, market_service
from app.services.portfolio_service import (
    build_portfolio,
    equity_history_points,
    forward_fill_equity_daily,
)

router = APIRouter(prefix="/api/portfolio", tags=["portfolio"])


@router.get("", response_model=PortfolioOut)
def get_portfolio(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    data = build_portfolio(db, user)
    db.commit()
    return PortfolioOut(
        cash_balance=data["cash_balance"],
        initial_equity=data["initial_equity"],
        total_equity=data["total_equity"],
        total_unrealized_pnl=data["total_unrealized_pnl"],
        total_return_pct=data["total_return_pct"],
        holdings=[HoldingOut(**h) for h in data["holdings"]],
    )


@router.get("/equity-history", response_model=list[EquityPoint])
def get_equity_history(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    pts = equity_history_points(db, user)
    db.commit()
    return [EquityPoint(time=p["time"], equity=p["equity"]) for p in pts]


@router.get("/equity-daily", response_model=list[EquityDailyPoint])
def get_equity_daily(
    start: date = Query(..., description="Range start (inclusive)"),
    end: date = Query(..., description="Range end (inclusive)"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if start > end:
        start, end = end, start
    pts = equity_history_points(db, user)
    db.commit()
    daily = forward_fill_equity_daily(pts, start, end)
    return [EquityDailyPoint(date=d["date"], equity=float(d["equity"])) for d in daily]


@router.get("/holding-sparklines", response_model=dict[str, list[SparklinePoint]])
def get_holding_sparklines(
    days: int = Query(90, ge=7, le=100, description="Trading days to return per ticker"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    api_key = require_alpha_vantage_api_key(user)
    data = build_portfolio(db, user)
    db.commit()
    out: dict[str, list[SparklinePoint]] = {}
    for h in data["holdings"]:
        t = h["ticker"]
        sym = market_service.normalize_ticker(t)
        try:
            rows = alpha_vantage.compact_daily_closes(api_key, sym)
            tail = rows[-days:] if len(rows) > days else rows
            out[t] = [SparklinePoint(date=d, close=c) for d, c in tail]
        except ValueError:
            out[t] = []
    return out
