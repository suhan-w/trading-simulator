import logging
import secrets
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.deps import get_current_user
from app.models import User
from app.schemas import (
    AlphaVantageApiKeyIn,
    LoginIn,
    RegisterIn,
    RegisterOut,
    ResendVerificationIn,
    Token,
    UserOut,
    VerifyEmailIn,
    user_to_out,
)
from app.limiter import limiter
from app.security import access_token_claims_for_user, create_access_token, hash_password, verify_password
from app.services import leaderboard_service
from app.services.email_verification_service import send_verification_code_email
from app.services.reset_service import reset_user_simulation

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auth", tags=["auth"])

_RESEND_VERIFICATION_MSG = "If an account exists for this email, we sent a verification code."


def _new_verification_code() -> str:
    """Six-digit numeric code (100000–999999)."""
    return str(secrets.randbelow(900_000) + 100_000)


def _is_production_env() -> bool:
    return (settings.environment or "").strip().lower() in ("production", "deployment", "prod")


def _resend_configured() -> bool:
    return bool(settings.resend_api_key and str(settings.resend_api_key).strip())


def _development_discloses_codes() -> bool:
    """Plain verification codes may appear in JSON only outside production."""
    return not _is_production_env()


@router.post("/register", response_model=RegisterOut)
def register(body: RegisterIn, db: Session = Depends(get_db)):
    """Create an account. A verification code is required before a session is issued (never returns access_token here)."""
    email = body.email.strip().lower()
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered")

    if _is_production_env() and not _resend_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Email verification is not configured (RESEND_API_KEY). Try again later.",
        )

    code_plain = _new_verification_code()
    code_hash = hash_password(code_plain)
    verify_expires = datetime.utcnow() + timedelta(hours=48)

    user = User(
        email=email,
        hashed_password=hash_password(body.password),
        alpha_vantage_api_key=body.alpha_vantage_api_key.strip(),
        cash_balance=settings.initial_cash,
        email_verified=False,
        email_verification_token=code_hash,
        email_verification_expires_at=verify_expires,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    leaderboard_service.ensure_user_anon_id(db, user)
    db.commit()
    db.refresh(user)

    if _resend_configured():
        try:
            send_verification_code_email(user.email, code_plain)
        except Exception as e:
            logger.exception("Failed to send verification email to %s", user.email)
            detail = str(e).strip()
            if len(detail) > 240:
                detail = detail[:237] + "…"
            return RegisterOut(
                access_token=None,
                email_verified=False,
                dev_verification_code=(code_plain if _development_discloses_codes() else None),
                message=(
                    "Account created, but the verification email could not be delivered. "
                    + (f"{detail} — " if detail else "")
                    + (
                        "Use the code shown below (development only). "
                        if _development_discloses_codes()
                        else "Check spam/Promotions. With Resend, verify RESEND_FROM_EMAIL / domain and RESEND_API_KEY on the server."
                    ),
                ),
            )
        return RegisterOut(
            access_token=None,
            email_verified=False,
            message="Check your inbox for a 6-digit code. Enter it below (or on the verify page) to finish signing in.",
        )

    logger.warning(
        "Verification code for %s: %s (RESEND_API_KEY not set — not emailed; local development only)",
        user.email,
        code_plain,
    )
    return RegisterOut(
        access_token=None,
        email_verified=False,
        dev_verification_code=(code_plain if _development_discloses_codes() else None),
        message=(
            "Enter the 6-digit code below (shown only in development when email is not configured)."
            if _development_discloses_codes()
            else "Enter the 6-digit code below."
        ),
    )


@router.post("/login", response_model=Token)
@limiter.limit("5/15minutes")
def login(request: Request, body: LoginIn, db: Session = Depends(get_db)):
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
    if not user.email.endswith("@guest.local") and not bool(getattr(user, "email_verified", True)):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Please verify your email first. Check your inbox for the code, or use “Send a new code” on the verification step.",
        )
    claims = access_token_claims_for_user(user)
    role = (getattr(user, "role", None) or "user").strip()
    if role in ("moderator", "super_admin"):
        token = create_access_token(
            claims,
            expires_delta=timedelta(minutes=settings.admin_access_token_expire_minutes),
        )
    else:
        token = create_access_token(claims)
    return Token(access_token=token)


@router.post("/verify-email", response_model=Token)
def verify_email(body: VerifyEmailIn, db: Session = Depends(get_db)):
    email = body.email.strip().lower()
    user = db.query(User).filter(User.email == email).first()
    if (
        user is None
        or user.email.endswith("@guest.local")
        or bool(getattr(user, "email_verified", True))
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid email or verification code.",
        )
    stored = user.email_verification_token
    if not stored or not verify_password(body.code, stored):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid email or verification code.",
        )
    exp = user.email_verification_expires_at
    if exp is not None and datetime.utcnow() > exp:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This verification code has expired. Request a new one from the sign-in page.",
        )
    user.email_verified = True
    user.email_verification_token = None
    user.email_verification_expires_at = None
    db.commit()
    db.refresh(user)
    token = create_access_token({"sub": str(user.id)})
    return Token(access_token=token)


@router.post("/resend-verification")
def resend_verification(body: ResendVerificationIn, db: Session = Depends(get_db)):
    """Always returns the same message to avoid email enumeration."""
    email = body.email.strip().lower()
    user = db.query(User).filter(User.email == email).first()
    if user is None or user.email.endswith("@guest.local") or bool(getattr(user, "email_verified", True)):
        return {"ok": True, "detail": _RESEND_VERIFICATION_MSG}

    code_plain = _new_verification_code()
    user.email_verification_token = hash_password(code_plain)
    user.email_verification_expires_at = datetime.utcnow() + timedelta(hours=48)
    db.commit()

    if _resend_configured():
        try:
            send_verification_code_email(user.email, code_plain)
        except Exception:
            logger.exception("Resend verification failed for %s", email)
            out = {"ok": True, "detail": _RESEND_VERIFICATION_MSG}
            if _development_discloses_codes():
                out["dev_verification_code"] = code_plain
                out["detail"] = (
                    "Could not send email. Use the development code below, or fix Resend/domain settings on the server."
                )
            return out
        return {"ok": True, "detail": _RESEND_VERIFICATION_MSG}

    if _is_production_env():
        return {"ok": True, "detail": _RESEND_VERIFICATION_MSG}

    logger.warning(
        "Verification code for %s: %s (RESEND_API_KEY not set — not emailed; local development only)",
        email,
        code_plain,
    )
    out = {"ok": True, "detail": _RESEND_VERIFICATION_MSG}
    if _development_discloses_codes():
        out["dev_verification_code"] = code_plain
        out["detail"] = "Development mode: email not configured — use the code below."
    return out


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
        email_verified=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    leaderboard_service.ensure_user_anon_id(db, user)
    db.commit()
    db.refresh(user)
    token = create_access_token(access_token_claims_for_user(user))
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
