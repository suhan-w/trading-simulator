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
    token = create_access_token({"sub": str(user.id)})
    return Token(access_token=token)


@router.post("/login", response_model=Token)
def login(body: LoginIn, db: Session = Depends(get_db)):
    email = body.email.strip().lower()
    user = db.query(User).filter(User.email == email).first()
    if user is None or not verify_password(body.password, user.hashed_password):
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
    token = create_access_token({"sub": str(user.id)})
    return Token(access_token=token)


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user_to_out(user)


@router.patch("/alpha-vantage-key", response_model=UserOut)
def update_alpha_vantage_key(
    body: AlphaVantageApiKeyIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    user.alpha_vantage_api_key = body.alpha_vantage_api_key.strip()
    db.commit()
    db.refresh(user)
    return user_to_out(user)


@router.post("/logout")
def logout():
    return {"ok": True}
