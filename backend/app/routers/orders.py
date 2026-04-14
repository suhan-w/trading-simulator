from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import LeaderboardEntry, Order, User
from app.schemas import OrderCreate, OrderOut, order_to_out
from app.services import leaderboard_service, order_service

router = APIRouter(prefix="/api", tags=["orders"])


@router.post("/orders", response_model=OrderOut)
def place_order(
    body: OrderCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    paper_entry_id = None
    if body.order_type == "market":
        try:
            order = order_service.execute_market_order(db, user, body)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        db.commit()
        db.refresh(order)
        # Same pattern as portfolio routes: full paper snapshot is expensive (performance
        # pipeline + quotes). Run after the response so we do not hold the request session
        # or block /api/auth/me and other pages under load.
        background_tasks.add_task(
            leaderboard_service.refresh_paper_snapshot_in_new_session, user.id
        )
        row = (
            db.query(LeaderboardEntry)
            .filter(
                LeaderboardEntry.user_id == user.id,
                LeaderboardEntry.source == leaderboard_service.SOURCE_PAPER,
            )
            .first()
        )
        paper_entry_id = row.id if row is not None else None
    elif body.order_type == "limit":
        try:
            order = order_service.create_limit_order(db, user, body)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        db.commit()
        db.refresh(order)
    else:
        raise HTTPException(status_code=400, detail="Invalid order type")
    return order_to_out(order, paper_leaderboard_entry_id=paper_entry_id)


@router.get("/orders", response_model=list[OrderOut])
def list_orders(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    rows = (
        db.query(Order)
        .filter(Order.user_id == user.id)
        .order_by(Order.created_at.desc())
        .limit(200)
        .all()
    )
    return [order_to_out(o) for o in rows]
