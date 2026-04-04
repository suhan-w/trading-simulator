from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import Base, engine, ensure_schema_upgrades
from app.routers import auth, market, orders, performance, portfolio


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    ensure_schema_upgrades()
    yield


app = FastAPI(title="ASX Paper Trading API", lifespan=lifespan)

# Browser dev servers on localhost / LAN; regex covers any port (Vite, etc.)
_local_origin_regex = (
    r"^https?://(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3})(:\d+)?$"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://localhost:80",
        "http://localhost",
        "http://127.0.0.1",
        "http://127.0.0.1:80",
    ],
    allow_origin_regex=_local_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(market.router)
app.include_router(orders.router)
app.include_router(performance.router)
app.include_router(portfolio.router)


@app.get("/health")
def health():
    return {"status": "ok"}
