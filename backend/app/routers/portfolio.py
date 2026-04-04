from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import User
from app.schemas import EquityPoint, HoldingOut, PortfolioOut
from app.services.portfolio_service import build_portfolio, equity_history_points

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
