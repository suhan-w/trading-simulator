"""Security headers and strict Origin checks for ``/api/admin`` routes."""

from __future__ import annotations

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from app.config import settings


def _normalize_origin(origin: str) -> str:
    return origin.strip().rstrip("/")


def admin_allowed_origins_normalized() -> set[str]:
    """Explicit origins allowed to call admin APIs (no regex / wildcard)."""
    out: set[str] = set()
    if settings.public_app_url:
        out.add(_normalize_origin(settings.public_app_url).lower())
    if settings.admin_origin:
        out.add(_normalize_origin(settings.admin_origin).lower())
    for part in settings.admin_allowed_origins.split(","):
        p = part.strip()
        if p:
            out.add(_normalize_origin(p).lower())
    return out


def all_cors_allow_origins() -> list[str]:
    """
    Origins allowed by CORSMiddleware (explicit list only — no wildcard here).
    Includes dev defaults, ``public_app_url``, admin env origins, and ``CORS_EXTRA_ORIGINS``.
    """
    seen: set[str] = set()
    out: list[str] = []

    def add(raw: str) -> None:
        o = _normalize_origin(raw)
        if not o:
            return
        key = o.lower()
        if key in seen:
            return
        seen.add(key)
        out.append(o)

    for o in (
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://localhost:80",
        "http://localhost",
        "http://localhost:8080",
        "http://127.0.0.1",
        "http://127.0.0.1:80",
        "http://127.0.0.1:8080",
    ):
        add(o)
    if settings.public_app_url:
        add(settings.public_app_url)
    if settings.admin_origin:
        add(settings.admin_origin)
    for part in settings.admin_allowed_origins.split(","):
        add(part)
    for part in settings.cors_extra_origins.split(","):
        add(part)
    return out


class AdminSecurityMiddleware(BaseHTTPMiddleware):
    """
    For paths under ``/api/admin``:
    - Reject browser requests whose ``Origin`` is not in the explicit allowlist.
    - Add standard hardening response headers.
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        path = request.url.path
        if not path.startswith("/api/admin"):
            return await call_next(request)

        allowed = admin_allowed_origins_normalized()
        origin = request.headers.get("origin")
        if origin:
            if not allowed or _normalize_origin(origin).lower() not in allowed:
                return JSONResponse(
                    status_code=403,
                    content={"detail": "Admin API is not allowed for this origin"},
                )

        response = await call_next(request)
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Cache-Control"] = "no-store"
        return response
