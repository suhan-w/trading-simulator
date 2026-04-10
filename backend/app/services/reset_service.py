"""Reset a user's paper-trading simulation to initial cash with no positions or history."""

from sqlalchemy.orm import Session

from app.config import settings
from app.models import Holding, Order, Transaction, User


def reset_user_simulation(db: Session, user: User) -> None:
    """
    Delete all trades, orders, and holdings for this user; set cash to initial amount.
    Portfolio value / performance history are derived from transactions — clearing them
    removes equity history. Scoped strictly to ``user.id``.
    """
    uid = user.id
    db.query(Transaction).filter(Transaction.user_id == uid).delete(synchronize_session=False)
    db.query(Order).filter(Order.user_id == uid).delete(synchronize_session=False)
    db.query(Holding).filter(Holding.user_id == uid).delete(synchronize_session=False)
    user.cash_balance = float(settings.initial_cash)
    db.commit()
    db.refresh(user)
