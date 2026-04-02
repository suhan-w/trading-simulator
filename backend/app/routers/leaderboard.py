from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.deps import get_current_user
from app.models import User
from app.schemas import LeaderboardEntry
from app.services.portfolio_service import total_equity_for_user

router = APIRouter(prefix="/api/leaderboard", tags=["leaderboard"])


@router.get("", response_model=list[LeaderboardEntry])
def leaderboard(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    users = db.query(User).all()
    rows: list[tuple[User, float, float]] = []
    for u in users:
        eq = total_equity_for_user(db, u)
        initial = settings.initial_cash
        pct = ((eq - initial) / initial) * 100 if initial else 0.0
        rows.append((u, eq, pct))

    rows.sort(key=lambda x: x[2], reverse=True)
    out: list[LeaderboardEntry] = []
    for rank, (u, eq, pct) in enumerate(rows, start=1):
        out.append(
            LeaderboardEntry(
                rank=rank,
                user_id=u.id,
                email=u.email,
                total_equity=eq,
                gain_loss_pct=pct,
            )
        )
    return out
