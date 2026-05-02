from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.admin_security_middleware import AdminSecurityMiddleware, all_cors_allow_origins
import app.database as _db
from app.database import Base, ensure_schema_upgrades
from app.dependencies import LastActiveMiddleware
from app.limiter import limiter

import app.models  # noqa: F401 — register all ORM tables on Base before create_all

from app.routers import admin, auth, backtest, leaderboard, market, orders, performance, portfolio


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=_db.engine)
    ensure_schema_upgrades()
    yield


app = FastAPI(title="ASX Paper Trading API (Alpha Vantage)", lifespan=lifespan)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Browser dev servers on localhost / LAN; regex covers any port (Vite, etc.).
# ``/api/admin`` additionally requires Origin in an explicit allowlist (see AdminSecurityMiddleware).
_local_origin_regex = (
    r"^https?://(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3})(:\d+)?$"
)

app.add_middleware(LastActiveMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=all_cors_allow_origins(),
    allow_origin_regex=_local_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_middleware(SlowAPIMiddleware)
app.add_middleware(AdminSecurityMiddleware)

app.include_router(admin.router, prefix="/api/admin", tags=["admin"])
app.include_router(auth.router)
app.include_router(backtest.router)
app.include_router(leaderboard.router)
app.include_router(market.router)
app.include_router(orders.router)
app.include_router(performance.router)
app.include_router(portfolio.router)


@app.get("/health")
def health():
    return {"status": "ok"}
