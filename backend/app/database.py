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
    return create_engine(url, **kwargs)


engine = _create_engine()
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def ensure_schema_upgrades() -> None:
    """Apply additive DDL for DBs created before new columns existed.

    `Base.metadata.create_all()` never alters existing tables, so older Postgres
    volumes may lack `transactions.portfolio_equity_after` and equity queries 500.
    """
    insp = inspect(engine)
    if "transactions" not in insp.get_table_names():
        return
    names = {c["name"] for c in insp.get_columns("transactions")}
    dialect = engine.dialect.name
    stmts: list[str] = []
    if "portfolio_equity_after" not in names:
        if dialect == "postgresql":
            stmts.append(
                "ALTER TABLE transactions ADD COLUMN portfolio_equity_after DOUBLE PRECISION"
            )
        else:
            stmts.append("ALTER TABLE transactions ADD COLUMN portfolio_equity_after REAL")
    if not stmts:
        return
    with engine.begin() as conn:
        for sql in stmts:
            conn.execute(text(sql))


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
