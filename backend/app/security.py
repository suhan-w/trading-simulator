from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# bcrypt only accepts the first 72 bytes; passlib raises otherwise
def _bcrypt_plain(plain: str) -> str:
    return plain.encode("utf-8")[:72].decode("utf-8", errors="ignore")


def hash_password(plain: str) -> str:
    return pwd_context.hash(_bcrypt_plain(plain))


def verify_password(plain: str, hashed: str) -> bool:
    if not hashed or not isinstance(hashed, str):
        return False
    try:
        return pwd_context.verify(_bcrypt_plain(plain), hashed)
    except (ValueError, TypeError):
        # Malformed hash, bcrypt/passlib version mismatch, etc.
        return False


def access_token_claims_for_user(user: Any) -> dict[str, Any]:
    """JWT body: subject + admin flag + token_version for invalidation."""
    role = (getattr(user, "role", None) or "user").strip()
    admin = role in ("moderator", "super_admin")
    tv = int(getattr(user, "token_version", 0) or 0)
    return {"sub": str(user.id), "admin": admin, "tv": tv}


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    now = datetime.now(timezone.utc)
    expire = now + (expires_delta or timedelta(minutes=settings.access_token_expire_minutes))
    to_encode.update({"exp": expire, "iat": now})
    return jwt.encode(to_encode, settings.secret_key, algorithm=settings.algorithm)


def decode_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
    except JWTError:
        return None
