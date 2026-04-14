from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker, declarative_base

from app.config import settings


def _engine_url(url: str) -> str:
    if url.startswith("postgresql://") and "+psycopg" not in url:
        return url.replace("postgresql://", "postgresql+psycopg://", 1)
    return url


def _create_engine():
    url = _engine_url(settings.database_url)
    kwargs: dict = {"pool_pre_ping": True}
    if url.startswith("sqlite"):
        kwargs["connect_args"] = {"check_same_thread": False}
    else:
        # Default pool (5 + 10) exhausts quickly when any request holds a session
        # for tens of seconds (e.g. sandboxed backtests) under concurrent load.
        kwargs["pool_size"] = 20
        kwargs["max_overflow"] = 30
        kwargs["pool_timeout"] = 60
        kwargs["pool_recycle"] = 300
    return create_engine(url, **kwargs)


engine = _create_engine()
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def ensure_schema_upgrades() -> None:
    """Apply additive DDL for DBs created before new columns existed.

    `Base.metadata.create_all()` never alters existing tables, so older Postgres
    volumes may lack `transactions.portfolio_equity_after` and equity queries 500.
    """
    dialect = engine.dialect.name
    insp = inspect(engine)

    if "transactions" in insp.get_table_names():
        names = {c["name"] for c in insp.get_columns("transactions")}
        stmts: list[str] = []
        if "portfolio_equity_after" not in names:
            if dialect == "postgresql":
                stmts.append(
                    "ALTER TABLE transactions ADD COLUMN portfolio_equity_after DOUBLE PRECISION"
                )
            else:
                stmts.append("ALTER TABLE transactions ADD COLUMN portfolio_equity_after REAL")
        if stmts:
            with engine.begin() as conn:
                for sql in stmts:
                    conn.execute(text(sql))

    insp_u = inspect(engine)
    if "users" in insp_u.get_table_names():
        ucols = {c["name"] for c in insp_u.get_columns("users")}
        ustmts: list[str] = []
        if "alpha_vantage_api_key" not in ucols:
            ustmts.append("ALTER TABLE users ADD COLUMN alpha_vantage_api_key VARCHAR(512)")
        if "anon_user_id" not in ucols:
            ustmts.append("ALTER TABLE users ADD COLUMN anon_user_id VARCHAR(24)")
        if "anon_strategy_seq" not in ucols:
            ustmts.append("ALTER TABLE users ADD COLUMN anon_strategy_seq INTEGER DEFAULT 0")
        if ustmts:
            with engine.begin() as conn:
                for sql in ustmts:
                    conn.execute(text(sql))
            if "anon_user_id" not in ucols:
                with engine.begin() as conn:
                    if dialect == "postgresql":
                        conn.execute(
                            text(
                                "CREATE UNIQUE INDEX IF NOT EXISTS uq_users_anon_user_id "
                                "ON users (anon_user_id)"
                            )
                        )
                    else:
                        conn.execute(
                            text(
                                "CREATE UNIQUE INDEX IF NOT EXISTS uq_users_anon_user_id "
                                "ON users (anon_user_id)"
                            )
                        )

    insp_lb = inspect(engine)
    if "leaderboard_entries" in insp_lb.get_table_names():
        lcols = {c["name"] for c in insp_lb.get_columns("leaderboard_entries")}
        lstmts: list[str] = []
        if "strategy_seq" not in lcols:
            lstmts.append("ALTER TABLE leaderboard_entries ADD COLUMN strategy_seq INTEGER DEFAULT 0")
        if lstmts:
            with engine.begin() as conn:
                for sql in lstmts:
                    conn.execute(text(sql))


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
