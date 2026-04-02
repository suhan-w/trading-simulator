import secrets

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.deps import get_current_user
from app.models import User
from app.schemas import Token, UserOut
from app.security import create_access_token, hash_password

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/guest", response_model=Token)
def guest_session(db: Session = Depends(get_db)):
    """Create an anonymous player with A$100k virtual cash (no email)."""
    uid = secrets.token_hex(8)
    email = f"guest_{uid}@guest.local"
    # Short random secret (never used for login); avoids bcrypt 72-byte edge cases
    pw = secrets.token_hex(16)
    user = User(
        email=email,
        hashed_password=hash_password(pw),
        cash_balance=settings.initial_cash,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    token = create_access_token({"sub": str(user.id)})
    return Token(access_token=token)


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user


@router.post("/logout")
def logout():
    return {"ok": True}
