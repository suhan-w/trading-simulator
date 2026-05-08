"""Async integration tests for admin routes (SQLite in-memory, dependency overrides)."""

from __future__ import annotations

import os

# Must run before any ``app`` import so ``app.database`` builds a SQLite engine (no Postgres/libpq).
os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")

import csv
import io
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from jose import jwt
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401 — register models on Base
from app.config import settings
from app.database import Base, get_db
from app.main import app
from app.models import AdminAuditLog, PlatformConfig, User
from app.security import access_token_claims_for_user, create_access_token


def _norm_origin() -> str:
    return (settings.public_app_url or "http://localhost:5173").strip().rstrip("/")


@dataclass
class SeedUsers:
    regular: User
    moderator: User
    super_admin: User
    target: User


@pytest.fixture
def sqlite_engine(monkeypatch):
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    monkeypatch.setattr("app.database.engine", engine)
    TestSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    monkeypatch.setattr("app.database.SessionLocal", TestSessionLocal)
    Base.metadata.create_all(bind=engine)

    def _seed_session():
        db = TestSessionLocal()
        try:
            hp = "unused-in-tests"
            regular = User(
                email="regular@t.test",
                hashed_password=hp,
                cash_balance=100_000.0,
                email_verified=True,
                role="user",
            )
            moderator = User(
                email="mod@t.test",
                hashed_password=hp,
                cash_balance=100_000.0,
                email_verified=True,
                role="moderator",
            )
            super_a = User(
                email="super@t.test",
                hashed_password=hp,
                cash_balance=100_000.0,
                email_verified=True,
                role="super_admin",
            )
            target = User(
                email="target@t.test",
                hashed_password=hp,
                cash_balance=50_000.0,
                email_verified=True,
                role="user",
                token_version=0,
            )
            db.add_all([regular, moderator, super_a, target])
            db.commit()
            db.refresh(regular)
            db.refresh(moderator)
            db.refresh(super_a)
            db.refresh(target)
            return SeedUsers(regular=regular, moderator=moderator, super_admin=super_a, target=target)
        finally:
            db.close()

    users = _seed_session()
    yield engine, users
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def override_get_db(sqlite_engine):
    engine, _users = sqlite_engine
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    def _get_db():
        db = SessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = _get_db
    yield
    app.dependency_overrides.pop(get_db, None)


def _auth_headers(token: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {token}",
        "Origin": _norm_origin(),
    }


@pytest.fixture
def seed_users(sqlite_engine):
    _engine, users = sqlite_engine
    return users


@pytest.fixture
def jwt_regular(seed_users: SeedUsers) -> str:
    return create_access_token(access_token_claims_for_user(seed_users.regular))


@pytest.fixture
def jwt_moderator(seed_users: SeedUsers) -> str:
    return create_access_token(
        access_token_claims_for_user(seed_users.moderator),
        expires_delta=timedelta(minutes=settings.admin_access_token_expire_minutes),
    )


@pytest.fixture
def jwt_super(seed_users: SeedUsers) -> str:
    return create_access_token(
        access_token_claims_for_user(seed_users.super_admin),
        expires_delta=timedelta(minutes=settings.admin_access_token_expire_minutes),
    )


@pytest_asyncio.fixture
async def async_client(override_get_db):
    transport = ASGITransport(app=app)
    async with AsyncClient(
        transport=transport,
        base_url="http://test",
        headers={"Origin": _norm_origin()},
    ) as client:
        yield client


def _open_session(engine):
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    return SessionLocal()


@pytest.mark.asyncio
async def test_regular_user_cannot_list_admin_users(
    sqlite_engine,
    override_get_db,
    async_client: AsyncClient,
    jwt_regular: str,
):
    _engine, _ = sqlite_engine
    r = await async_client.get("/api/admin/users", headers=_auth_headers(jwt_regular))
    assert r.status_code == 403
    db = _open_session(_engine)
    try:
        assert db.query(User).count() == 4
    finally:
        db.close()


@pytest.mark.asyncio
async def test_moderator_can_list_users(
    sqlite_engine,
    override_get_db,
    async_client: AsyncClient,
    jwt_moderator: str,
    seed_users: SeedUsers,
):
    _engine, _ = sqlite_engine
    r = await async_client.get("/api/admin/users", headers=_auth_headers(jwt_moderator))
    assert r.status_code == 200
    data = r.json()
    assert "users" in data
    assert isinstance(data["users"], list)
    assert data["total"] >= 1
    emails = {u["email"] for u in data["users"]}
    assert seed_users.target.email in emails
    db = _open_session(_engine)
    try:
        assert db.query(User).filter(User.email == seed_users.target.email).count() == 1
    finally:
        db.close()


@pytest.mark.asyncio
async def test_list_users_hides_guests_by_default(
    sqlite_engine,
    override_get_db,
    async_client: AsyncClient,
    jwt_moderator: str,
    seed_users: SeedUsers,
):
    _engine, _ = sqlite_engine
    db = _open_session(_engine)
    try:
        guest = User(
            email="anon-xyz@guest.local",
            hashed_password="x",
            cash_balance=100_000.0,
            email_verified=True,
            role="user",
        )
        db.add(guest)
        db.commit()
    finally:
        db.close()

    r = await async_client.get("/api/admin/users", headers=_auth_headers(jwt_moderator))
    assert r.status_code == 200
    emails = {u["email"] for u in r.json()["users"]}
    assert "anon-xyz@guest.local" not in emails
    assert seed_users.target.email in emails

    r2 = await async_client.get(
        "/api/admin/users?include_guests=true",
        headers=_auth_headers(jwt_moderator),
    )
    assert r2.status_code == 200
    emails2 = {u["email"] for u in r2.json()["users"]}
    assert "anon-xyz@guest.local" in emails2


@pytest.mark.asyncio
async def test_moderator_cannot_delete_user(
    sqlite_engine,
    override_get_db,
    async_client: AsyncClient,
    jwt_moderator: str,
    seed_users: SeedUsers,
):
    _engine, _ = sqlite_engine
    uid = seed_users.target.id
    r = await async_client.delete(f"/api/admin/users/{uid}", headers=_auth_headers(jwt_moderator))
    assert r.status_code == 403
    db = _open_session(_engine)
    try:
        u = db.query(User).filter(User.id == uid).first()
        assert u is not None and u.is_deleted is False
    finally:
        db.close()


@pytest.mark.asyncio
async def test_super_admin_can_soft_delete_user(
    sqlite_engine,
    override_get_db,
    async_client: AsyncClient,
    jwt_super: str,
    seed_users: SeedUsers,
):
    _engine, _ = sqlite_engine
    uid = seed_users.target.id
    r = await async_client.delete(f"/api/admin/users/{uid}", headers=_auth_headers(jwt_super))
    assert r.status_code == 200
    assert r.json() == {"ok": True}
    db = _open_session(_engine)
    try:
        u = db.query(User).filter(User.id == uid).first()
        assert u is not None
        assert u.is_deleted is True
        assert u.email == f"deleted_{uid}@deleted.local"
    finally:
        db.close()


@pytest.mark.asyncio
async def test_suspend_creates_audit_log(
    sqlite_engine,
    override_get_db,
    async_client: AsyncClient,
    jwt_moderator: str,
    seed_users: SeedUsers,
):
    _engine, _ = sqlite_engine
    uid = seed_users.target.id
    reason = "policy violation suspension minimum ten"
    r = await async_client.post(
        f"/api/admin/users/{uid}/suspend",
        headers=_auth_headers(jwt_moderator),
        json={"reason": reason},
    )
    assert r.status_code == 200
    detail = r.json()
    assert detail["is_suspended"] is True
    db = _open_session(_engine)
    try:
        u = db.query(User).filter(User.id == uid).first()
        assert u is not None
        assert u.is_suspended is True
        assert u.suspension_reason == reason
        row = (
            db.query(AdminAuditLog)
            .filter(AdminAuditLog.action == "SUSPEND_USER", AdminAuditLog.target_user_id == uid)
            .first()
        )
        assert row is not None
        assert row.payload == {"reason": reason}
    finally:
        db.close()


@pytest.mark.asyncio
async def test_suspended_user_blocked_on_me(
    sqlite_engine,
    override_get_db,
    async_client: AsyncClient,
    seed_users: SeedUsers,
):
    _engine, _ = sqlite_engine
    uid = seed_users.target.id
    db = _open_session(_engine)
    try:
        u = db.query(User).filter(User.id == uid).first()
        u.is_suspended = True
        db.commit()
    finally:
        db.close()

    user_token = create_access_token(access_token_claims_for_user(seed_users.target))
    r = await async_client.get("/api/auth/me", headers=_auth_headers(user_token))
    assert r.status_code == 403
    assert r.json()["detail"] == "Account suspended"


@pytest.mark.asyncio
async def test_reset_balance_moderator_forbidden_super_ok(
    sqlite_engine,
    override_get_db,
    async_client: AsyncClient,
    jwt_moderator: str,
    jwt_super: str,
    seed_users: SeedUsers,
):
    _engine, _ = sqlite_engine
    uid = seed_users.target.id
    body = {"new_balance": 12345.67, "reason": "test reset"}
    r_mod = await async_client.post(
        f"/api/admin/users/{uid}/reset-balance",
        headers=_auth_headers(jwt_moderator),
        json=body,
    )
    assert r_mod.status_code == 403

    r_ok = await async_client.post(
        f"/api/admin/users/{uid}/reset-balance",
        headers=_auth_headers(jwt_super),
        json=body,
    )
    assert r_ok.status_code == 200
    db = _open_session(_engine)
    try:
        u = db.query(User).filter(User.id == uid).first()
        assert u is not None
        assert float(u.cash_balance) == 12345.67
    finally:
        db.close()


@pytest.mark.asyncio
async def test_audit_log_order_and_filter(
    sqlite_engine,
    override_get_db,
    async_client: AsyncClient,
    jwt_moderator: str,
    seed_users: SeedUsers,
):
    _engine, _ = sqlite_engine
    db = _open_session(_engine)
    try:
        older = AdminAuditLog(
            id=str(uuid.uuid4()),
            admin_id=seed_users.moderator.id,
            action="EXPORT_REPORT",
            target_user_id=None,
            payload={"report": "x"},
            created_at=datetime(2021, 1, 1, 12, 0, 0),
        )
        newer = AdminAuditLog(
            id=str(uuid.uuid4()),
            admin_id=seed_users.moderator.id,
            action="SUSPEND_USER",
            target_user_id=seed_users.target.id,
            payload={"reason": "test suspend action filter"},
            created_at=datetime(2024, 6, 15, 12, 0, 0),
        )
        db.add_all([older, newer])
        db.commit()
    finally:
        db.close()

    r = await async_client.get("/api/admin/audit-log", headers=_auth_headers(jwt_moderator))
    assert r.status_code == 200
    entries = r.json()["entries"]
    assert entries[0]["created_at"] >= entries[1]["created_at"]
    assert entries[0]["action"] == "SUSPEND_USER"
    assert entries[1]["action"] == "EXPORT_REPORT"

    r_f = await async_client.get(
        "/api/admin/audit-log",
        headers=_auth_headers(jwt_moderator),
        params={"action": "SUSPEND_USER"},
    )
    assert r_f.status_code == 200
    suspend_entries = r_f.json()["entries"]
    assert all(e["action"] == "SUSPEND_USER" for e in suspend_entries)

    db = _open_session(_engine)
    try:
        assert db.query(AdminAuditLog).count() >= 2
    finally:
        db.close()


@pytest.mark.asyncio
async def test_patch_config_upsert_and_audit(
    sqlite_engine,
    override_get_db,
    async_client: AsyncClient,
    jwt_super: str,
    seed_users: SeedUsers,
):
    _engine, _ = sqlite_engine
    key = "simulator.starting_balance"
    r = await async_client.patch(
        f"/api/admin/config/{key}",
        headers=_auth_headers(jwt_super),
        json={"value": 99999.0, "description": "test starting balance"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["key"] == key
    assert float(body["value"]) == 99999.0

    db = _open_session(_engine)
    try:
        row = db.query(PlatformConfig).filter(PlatformConfig.key == key).first()
        assert row is not None
        assert float(row.value) == 99999.0
        log = db.query(AdminAuditLog).filter(AdminAuditLog.action == "UPDATE_CONFIG").order_by(AdminAuditLog.created_at.desc()).first()
        assert log is not None
        assert log.payload.get("key") == key
        assert log.payload.get("new_value") in (99999.0, 99999)
    finally:
        db.close()


@pytest.mark.asyncio
async def test_users_export_csv(
    sqlite_engine,
    override_get_db,
    async_client: AsyncClient,
    jwt_moderator: str,
):
    _engine, _ = sqlite_engine
    r = await async_client.get(
        "/api/admin/reports/users/export",
        headers=_auth_headers(jwt_moderator),
    )
    assert r.status_code == 200
    assert "text/csv" in r.headers.get("content-type", "")
    buf = io.StringIO(r.text)
    rows = list(csv.reader(buf))
    assert rows
    header = rows[0]
    expected = [
        "id",
        "email",
        "username",
        "role",
        "is_suspended",
        "created_at",
        "last_active_at",
        "total_trades",
        "total_pnl",
    ]
    assert header == expected
    db = _open_session(_engine)
    try:
        assert db.query(User).count() >= 1
    finally:
        db.close()


@pytest.mark.asyncio
async def test_expired_admin_token_by_iat(
    sqlite_engine,
    override_get_db,
    async_client: AsyncClient,
    seed_users: SeedUsers,
):
    _engine, _ = sqlite_engine
    now = datetime.now(timezone.utc)
    claims = {
        "sub": str(seed_users.moderator.id),
        "admin": True,
        "tv": int(seed_users.moderator.token_version),
        "iat": int((now - timedelta(minutes=31)).timestamp()),
        "exp": int((now + timedelta(hours=1)).timestamp()),
    }
    bad = jwt.encode(claims, settings.secret_key, algorithm=settings.algorithm)
    r = await async_client.get("/api/admin/users", headers=_auth_headers(bad))
    assert r.status_code == 401
    assert r.json()["detail"] == "Admin session expired, please log in again"
    db = _open_session(_engine)
    try:
        assert db.query(User).filter(User.id == seed_users.moderator.id).count() == 1
    finally:
        db.close()


@pytest.mark.asyncio
async def test_force_logout_increments_token_version(
    sqlite_engine,
    override_get_db,
    async_client: AsyncClient,
    jwt_moderator: str,
    seed_users: SeedUsers,
):
    _engine, _ = sqlite_engine
    uid = seed_users.target.id
    db0 = _open_session(_engine)
    try:
        before = int(db0.query(User.token_version).filter(User.id == uid).scalar() or 0)
    finally:
        db0.close()

    r = await async_client.post(
        f"/api/admin/users/{uid}/force-logout",
        headers=_auth_headers(jwt_moderator),
    )
    assert r.status_code == 200
    assert r.json() == {"ok": True}

    db = _open_session(_engine)
    try:
        after = int(db.query(User.token_version).filter(User.id == uid).scalar() or 0)
        assert after == before + 1
    finally:
        db.close()
