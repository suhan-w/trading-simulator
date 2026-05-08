from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.database import SessionLocal, get_db
from app.models import User
from app.security import decode_token

security = HTTPBearer(auto_error=False)


def assert_token_version_matches_user(payload: dict, user: User) -> None:
    """Reject JWTs issued before the user's token_version was bumped (force-logout)."""
    token_tv = int(payload.get("tv", 0))
    user_tv = int(getattr(user, "token_version", 0) or 0)
    if token_tv != user_tv:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session invalidated",
            headers={"WWW-Authenticate": "Bearer"},
        )


def get_current_user(
    db: Session = Depends(get_db),
    creds: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> User:
    if creds is None or not creds.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    payload = decode_token(creds.credentials)
    if payload is None or "sub" not in payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
        )
    try:
        user_id = int(payload["sub"])
    except (ValueError, TypeError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    assert_token_version_matches_user(payload, user)
    if bool(getattr(user, "is_suspended", False)):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account suspended",
        )
    return user


def get_bearer_user_id(
    creds: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> int:
    """Resolve authenticated user id without tying up a request-scoped DB session.

    Use for long-running handlers (e.g. sandboxed backtests) so pool connections are
    not held for the full request duration.
    """
    if creds is None or not creds.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    payload = decode_token(creds.credentials)
    if payload is None or "sub" not in payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
        )
    try:
        user_id = int(payload["sub"])
    except (ValueError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
        )
    db = SessionLocal()
    try:
        row = db.query(User.token_version).filter(User.id == user_id).first()
    finally:
        db.close()
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )
    db_tv = int(row[0] or 0)
    if int(payload.get("tv", 0)) != db_tv:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session invalidated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user_id


def require_alpha_vantage_api_key(user: User) -> str:
    key = (user.alpha_vantage_api_key or "").strip()
    if not key:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Add your Alpha Vantage API key: register an account or update it under Account.",
        )
    return key
