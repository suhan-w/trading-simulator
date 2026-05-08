"""Admin authentication, audit logging, and last-active middleware."""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from enum import Enum

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy import update
from sqlalchemy.orm import Session
from starlette.middleware.base import BaseHTTPMiddleware

from app.config import settings
from app.database import SessionLocal, get_db
from app.deps import assert_token_version_matches_user
from app.models import AdminAuditLog, User
from app.security import decode_token


class AdminAction(str, Enum):
    """Audit log action names (also importable as constants)."""

    SUSPEND_USER = "SUSPEND_USER"
    UNSUSPEND_USER = "UNSUSPEND_USER"
    RESET_BALANCE = "RESET_BALANCE"
    DELETE_USER = "DELETE_USER"
    GRANT_ADMIN = "GRANT_ADMIN"
    REVOKE_ADMIN = "REVOKE_ADMIN"
    UPDATE_CONFIG = "UPDATE_CONFIG"
    EXPORT_REPORT = "EXPORT_REPORT"
    FORCE_LOGOUT = "FORCE_LOGOUT"


oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=True)


def _decode_jwt_payload(token: str) -> dict:
    """Decode JWT using app secret and algorithm (python-jose)."""
    try:
        return jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
            headers={"WWW-Authenticate": "Bearer"},
        )


def _issued_at_utc(payload: dict) -> datetime | None:
    iat = payload.get("iat")
    if iat is None:
        return None
    if isinstance(iat, datetime):
        if iat.tzinfo is None:
            return iat.replace(tzinfo=timezone.utc)
        return iat.astimezone(timezone.utc)
    try:
        return datetime.fromtimestamp(int(iat), tz=timezone.utc)
    except (ValueError, TypeError, OSError):
        return None


def get_current_admin(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    payload = _decode_jwt_payload(token)
    if payload.get("admin") is not True:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin token required",
        )
    issued = _issued_at_utc(payload)
    max_age = timedelta(minutes=settings.admin_access_token_expire_minutes)
    if issued is None or (datetime.now(timezone.utc) - issued) > max_age:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Admin session expired, please log in again",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if "sub" not in payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    try:
        user_id = int(payload["sub"])
    except (ValueError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
            headers={"WWW-Authenticate": "Bearer"},
        )
    assert_token_version_matches_user(payload, user)
    if getattr(user, "role", "user") not in ("moderator", "super_admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient privileges",
        )
    if bool(getattr(user, "is_suspended", False)):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account suspended",
        )
    return user


def require_super_admin(admin: User = Depends(get_current_admin)) -> User:
    if getattr(admin, "role", None) != "super_admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Super admin required",
        )
    return admin


async def log_admin_action(
    db: Session,
    admin_id: int,
    action: AdminAction | str,
    request: Request,
    target_user_id: int | None = None,
    payload: dict | None = None,
) -> None:
    """Persist an admin audit row and commit."""
    action_str = action.value if isinstance(action, AdminAction) else str(action)
    ip = None
    if request.client and request.client.host:
        ip = request.client.host[:64]
    row = AdminAuditLog(
        id=str(uuid.uuid4()),
        admin_id=admin_id,
        action=action_str,
        target_user_id=target_user_id,
        payload=payload,
        ip_address=ip,
        created_at=datetime.utcnow(),
    )
    db.add(row)
    db.commit()


class LastActiveMiddleware(BaseHTTPMiddleware):
    """After each request, bump ``users.last_active_at`` when Authorization Bearer decodes to a user id."""

    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        auth = request.headers.get("authorization")
        if not auth or not auth.lower().startswith("bearer "):
            return response
        token = auth[7:].strip()
        if not token:
            return response
        payload = decode_token(token)
        if not payload or "sub" not in payload:
            return response
        try:
            uid = int(payload["sub"])
        except (ValueError, TypeError):
            return response
        db = SessionLocal()
        try:
            db.execute(
                update(User).where(User.id == uid).values(last_active_at=datetime.utcnow())
            )
            db.commit()
        except Exception:
            db.rollback()
        finally:
            db.close()
        return response


async def update_last_active(current_user: User, db: Session) -> None:
    """Explicit dependency/helper: set ``last_active_at`` and commit (optional if middleware is enabled)."""
    current_user.last_active_at = datetime.utcnow()
    db.commit()
    db.refresh(current_user)
