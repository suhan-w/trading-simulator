import secrets

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.deps import get_current_user
from app.models import User
from app.schemas import (
    AlphaVantageApiKeyIn,
    LoginIn,
    RegisterIn,
    Token,
    UserOut,
    user_to_out,
)
from app.security import create_access_token, hash_password, verify_password
from app.services import leaderboard_service
from app.services.reset_service import reset_user_simulation

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register", response_model=Token)
def register(body: RegisterIn, db: Session = Depends(get_db)):
    """Create an account with email, password, and your Alpha Vantage API key."""
    email = body.email.strip().lower()
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered")
    user = User(
        email=email,
        hashed_password=hash_password(body.password),
        alpha_vantage_api_key=body.alpha_vantage_api_key.strip(),
        cash_balance=settings.initial_cash,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    leaderboard_service.ensure_user_anon_id(db, user)
    db.commit()
    token = create_access_token({"sub": str(user.id)})
    return Token(access_token=token)


@router.post("/login", response_model=Token)
def login(body: LoginIn, db: Session = Depends(get_db)):
    email = body.email.strip().lower()
    user = db.query(User).filter(User.email == email).first()
    pw_ok = False
    if user is not None and user.hashed_password:
        pw_ok = verify_password(body.password, user.hashed_password)
    if user is None or not pw_ok:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )
    token = create_access_token({"sub": str(user.id)})
    return Token(access_token=token)


@router.post("/guest", response_model=Token)
def guest_session(db: Session = Depends(get_db)):
    """Anonymous session (no API key). Add a key under Account to fetch live prices."""
    uid = secrets.token_hex(8)
    email = f"guest_{uid}@guest.local"
    pw = secrets.token_hex(16)
    user = User(
        email=email,
        hashed_password=hash_password(pw),
        alpha_vantage_api_key=None,
        cash_balance=settings.initial_cash,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    leaderboard_service.ensure_user_anon_id(db, user)
    db.commit()
    token = create_access_token({"sub": str(user.id)})
    return Token(access_token=token)


@router.get("/me", response_model=UserOut)
def me(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return user_to_out(user, db)


@router.patch("/alpha-vantage-key", response_model=UserOut)
def update_alpha_vantage_key(
    body: AlphaVantageApiKeyIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    user.alpha_vantage_api_key = body.alpha_vantage_api_key.strip()
    db.commit()
    db.refresh(user)
    return user_to_out(user, db)


@router.post("/logout")
def logout():
    return {"ok": True}


@router.post("/reset-session")
def reset_session(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Irreversibly clear this user's trades, holdings, and orders; reset cash to starting balance.
    Does not affect other users or Alpha Vantage API keys.
    """
    reset_user_simulation(db, user)
    return {"ok": True}
