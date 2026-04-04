from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import Order, User
from app.schemas import OrderCreate, OrderOut, order_to_out
from app.services import order_service

router = APIRouter(prefix="/api", tags=["orders"])


@router.post("/orders", response_model=OrderOut)
def place_order(
    body: OrderCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if body.order_type == "market":
        try:
            order = order_service.execute_market_order(db, user, body)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
    elif body.order_type == "limit":
        try:
            order = order_service.create_limit_order(db, user, body)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
    else:
        raise HTTPException(status_code=400, detail="Invalid order type")
    db.commit()
    db.refresh(order)
    return order_to_out(order)


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
