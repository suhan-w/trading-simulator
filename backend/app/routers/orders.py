from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import Order, Transaction, User
from app.schemas import OrderCreate, OrderOut, TransactionNotesUpdate, TransactionOut
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
    return order


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
    return rows


@router.get("/transactions", response_model=list[TransactionOut])
def list_transactions(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    rows = (
        db.query(Transaction)
        .filter(Transaction.user_id == user.id)
        .order_by(Transaction.executed_at.desc())
        .limit(500)
        .all()
    )
    return rows


@router.patch("/transactions/{transaction_id}/notes", response_model=TransactionOut)
def update_transaction_notes(
    transaction_id: int,
    body: TransactionNotesUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    tx = (
        db.query(Transaction)
        .filter(Transaction.id == transaction_id, Transaction.user_id == user.id)
        .first()
    )
    if tx is None:
        raise HTTPException(status_code=404, detail="Transaction not found")
    tx.notes = body.notes
    db.commit()
    db.refresh(tx)
    return tx
