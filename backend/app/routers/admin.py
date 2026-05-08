"""Admin API (per-route auth dependencies)."""

from __future__ import annotations

import csv
import io
import math
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from fpdf import FPDF
from sqlalchemy import and_, case, func, or_, select
from sqlalchemy.orm import Session, aliased
from starlette.responses import StreamingResponse

from app.config import settings
from app.database import get_db
from app.limiter import limiter
from app.dependencies import AdminAction, get_current_admin, log_admin_action, require_super_admin
from app.models import AdminAuditLog, Holding, PlatformConfig, Transaction, User
from app.services import av_cache_service
from app.schemas import (
    AdminAuditLogEntry,
    AdminAuditLogListResponse,
    AdminTradeRow,
    AdminUserDetail,
    AdminUserSummary,
    BalanceResetRequest,
    GrantAdminRequest,
    PlatformConfigItem,
    PlatformConfigUpdate,
    PlatformStats,
    SuspendRequest,
    UserListResponse,
)

router = APIRouter()


def _not_guest_filter():
    return ~User.email.like("%@guest.local")


def _av_usage_pair(db: Session, user_id: int) -> tuple[int, int]:
    try:
        used = av_cache_service.get_usage_today(db, user_id)
    except Exception:
        used = 0
    return int(used), int(settings.alpha_vantage_daily_request_limit)


def _user_summary(db: Session, u: User) -> AdminUserSummary:
    used, limit = _av_usage_pair(db, u.id)
    ev = getattr(u, "email_verified", None)
    email_verified = True if ev is None else bool(ev)
    return AdminUserSummary(
        id=u.id,
        email=u.email,
        username=getattr(u, "username", None),
        role=getattr(u, "role", "user") or "user",
        is_suspended=bool(getattr(u, "is_suspended", False)),
        email_verified=email_verified,
        created_at=u.created_at or datetime.utcfromtimestamp(0),
        last_active_at=getattr(u, "last_active_at", None),
        has_alpha_vantage_key=bool((getattr(u, "alpha_vantage_api_key", None) or "").strip()),
        alpha_vantage_requests_used_today=used,
        alpha_vantage_daily_limit=limit,
    )


def _user_detail(db: Session, u: User) -> AdminUserDetail:
    uid = u.id
    n_tr = db.query(func.count(Transaction.id)).filter(Transaction.user_id == uid).scalar() or 0
    sell_sum = (
        db.query(func.coalesce(func.sum(Transaction.total), 0.0))
        .filter(Transaction.user_id == uid, Transaction.side == "sell")
        .scalar()
        or 0.0
    )
    buy_sum = (
        db.query(func.coalesce(func.sum(Transaction.total), 0.0))
        .filter(Transaction.user_id == uid, Transaction.side == "buy")
        .scalar()
        or 0.0
    )
    total_pnl = float(sell_sum) - float(buy_sum)
    hv = (
        db.query(func.coalesce(func.sum(Holding.quantity * Holding.avg_cost), 0.0))
        .filter(Holding.user_id == uid)
        .scalar()
        or 0.0
    )
    portfolio_value = float(u.cash_balance) + float(hv)
    base = _user_summary(db, u).model_dump()
    return AdminUserDetail(
        **base,
        cash_balance=float(u.cash_balance),
        suspended_at=getattr(u, "suspended_at", None),
        suspension_reason=getattr(u, "suspension_reason", None),
        notes=getattr(u, "notes", None),
        total_trades=int(n_tr),
        total_pnl=total_pnl,
        portfolio_value=portfolio_value,
    )


@router.get("/users", response_model=UserListResponse)
@limiter.limit("60/minute")
def list_users(
    request: Request,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_admin),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=100),
    search: str | None = None,
    role: str | None = None,
    is_suspended: bool | None = None,
    include_guests: bool = Query(
        False,
        description="If false (default), hide @guest.local sessions so the list shows registered accounts only.",
    ),
):
    q = db.query(User).filter(User.is_deleted.is_(False))
    if not include_guests:
        q = q.filter(_not_guest_filter())
    if search and search.strip():
        term = f"%{search.strip()}%"
        q = q.filter(or_(User.email.ilike(term), User.username.ilike(term)))
    if role is not None and role.strip():
        q = q.filter(User.role == role.strip())
    if is_suspended is not None:
        q = q.filter(User.is_suspended == is_suspended)

    total = q.count()
    pages = max(1, math.ceil(total / per_page)) if total else 1
    rows = (
        q.order_by(User.id)
        .offset((page - 1) * per_page)
        .limit(per_page)
        .all()
    )
    return UserListResponse(
        users=[_user_summary(db, u) for u in rows],
        total=total,
        page=page,
        per_page=per_page,
        pages=pages,
    )


@router.get("/users/{user_id}", response_model=AdminUserDetail)
@limiter.limit("60/minute")
def get_user(
    request: Request,
    user_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    u = db.query(User).filter(User.id == user_id).first()
    if u is None:
        raise HTTPException(status_code=404, detail="User not found")
    return _user_detail(db, u)


@router.post("/users/{user_id}/suspend", response_model=AdminUserDetail)
@limiter.limit("20/minute")
async def suspend_user(
    user_id: int,
    body: SuspendRequest,
    request: Request,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    u = db.query(User).filter(User.id == user_id).first()
    if u is None:
        raise HTTPException(status_code=404, detail="User not found")
    u.is_suspended = True
    u.suspended_at = datetime.utcnow()
    u.suspension_reason = body.reason
    db.commit()
    db.refresh(u)
    await log_admin_action(
        db,
        admin.id,
        AdminAction.SUSPEND_USER,
        request,
        target_user_id=user_id,
        payload={"reason": body.reason},
    )
    return _user_detail(db, u)


@router.post("/users/{user_id}/unsuspend", response_model=AdminUserDetail)
@limiter.limit("20/minute")
async def unsuspend_user(
    user_id: int,
    request: Request,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    u = db.query(User).filter(User.id == user_id).first()
    if u is None:
        raise HTTPException(status_code=404, detail="User not found")
    u.is_suspended = False
    u.suspended_at = None
    u.suspension_reason = None
    db.commit()
    db.refresh(u)
    await log_admin_action(db, admin.id, AdminAction.UNSUSPEND_USER, request, target_user_id=user_id)
    return _user_detail(db, u)


@router.post("/users/{user_id}/reset-balance", response_model=AdminUserDetail)
@limiter.limit("20/minute")
async def reset_balance(
    user_id: int,
    body: BalanceResetRequest,
    request: Request,
    db: Session = Depends(get_db),
    admin: User = Depends(require_super_admin),
):
    u = db.query(User).filter(User.id == user_id).first()
    if u is None:
        raise HTTPException(status_code=404, detail="User not found")
    old = float(u.cash_balance)
    u.cash_balance = float(body.new_balance)
    db.commit()
    db.refresh(u)
    await log_admin_action(
        db,
        admin.id,
        AdminAction.RESET_BALANCE,
        request,
        target_user_id=user_id,
        payload={"old_balance": old, "new_balance": body.new_balance, "reason": body.reason},
    )
    return _user_detail(db, u)


@router.delete("/users/{user_id}")
@limiter.limit("20/minute")
async def soft_delete_user(
    user_id: int,
    request: Request,
    db: Session = Depends(get_db),
    admin: User = Depends(require_super_admin),
):
    u = db.query(User).filter(User.id == user_id).first()
    if u is None:
        raise HTTPException(status_code=404, detail="User not found")
    u.is_deleted = True
    u.email = f"deleted_{user_id}@deleted.local"
    db.commit()
    await log_admin_action(db, admin.id, AdminAction.DELETE_USER, request, target_user_id=user_id)
    return {"ok": True}


@router.post("/users/{user_id}/force-logout")
@limiter.limit("20/minute")
async def force_logout(
    user_id: int,
    request: Request,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    u = db.query(User).filter(User.id == user_id).first()
    if u is None:
        raise HTTPException(status_code=404, detail="User not found")
    u.token_version = int(getattr(u, "token_version", 0) or 0) + 1
    db.commit()
    await log_admin_action(db, admin.id, AdminAction.FORCE_LOGOUT, request, target_user_id=user_id)
    return {"ok": True}


@router.post("/users/{user_id}/grant-admin", response_model=AdminUserDetail)
@limiter.limit("20/minute")
async def grant_admin(
    user_id: int,
    body: GrantAdminRequest,
    request: Request,
    db: Session = Depends(get_db),
    admin: User = Depends(require_super_admin),
):
    u = db.query(User).filter(User.id == user_id).first()
    if u is None:
        raise HTTPException(status_code=404, detail="User not found")
    old_role = getattr(u, "role", "user")
    u.role = body.role
    db.commit()
    db.refresh(u)
    await log_admin_action(
        db,
        admin.id,
        AdminAction.GRANT_ADMIN,
        request,
        target_user_id=user_id,
        payload={"role": body.role, "old_role": old_role},
    )
    return _user_detail(db, u)


@router.post("/users/{user_id}/revoke-admin", response_model=AdminUserDetail)
@limiter.limit("20/minute")
async def revoke_admin(
    user_id: int,
    request: Request,
    db: Session = Depends(get_db),
    admin: User = Depends(require_super_admin),
):
    u = db.query(User).filter(User.id == user_id).first()
    if u is None:
        raise HTTPException(status_code=404, detail="User not found")
    old_role = getattr(u, "role", "user")
    u.role = "user"
    db.commit()
    db.refresh(u)
    await log_admin_action(
        db,
        admin.id,
        AdminAction.REVOKE_ADMIN,
        request,
        target_user_id=user_id,
        payload={"role": "user", "old_role": old_role},
    )
    return _user_detail(db, u)


@router.get("/stats", response_model=PlatformStats)
@limiter.limit("60/minute")
def platform_stats(
    request: Request,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    now = datetime.utcnow()
    day_ago = now - timedelta(days=1)
    week_ago = now - timedelta(days=7)
    start_today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)

    base = and_(User.is_deleted.is_(False), _not_guest_filter())

    total_users = db.query(func.count(User.id)).filter(base).scalar() or 0
    suspended_users = (
        db.query(func.count(User.id)).filter(base, User.is_suspended.is_(True)).scalar() or 0
    )
    active_today = (
        db.query(func.count(User.id))
        .filter(base, User.last_active_at.isnot(None), User.last_active_at >= day_ago)
        .scalar()
        or 0
    )
    active_this_week = (
        db.query(func.count(User.id))
        .filter(base, User.last_active_at.isnot(None), User.last_active_at >= week_ago)
        .scalar()
        or 0
    )

    total_trades = db.query(func.count(Transaction.id)).scalar() or 0
    trades_today = (
        db.query(func.count(Transaction.id)).filter(Transaction.executed_at >= start_today).scalar() or 0
    )

    sell_case = case((Transaction.side == "sell", Transaction.total), else_=0.0)
    buy_case = case((Transaction.side == "buy", Transaction.total), else_=0.0)
    per_user_pnl = (
        select(
            Transaction.user_id,
            (func.sum(sell_case) - func.sum(buy_case)).label("pnl"),
        )
        .group_by(Transaction.user_id)
        .subquery()
    )
    avg_pnl_row = db.query(func.avg(per_user_pnl.c.pnl)).scalar()
    avg_pnl = float(avg_pnl_row) if avg_pnl_row is not None else 0.0

    total_cash = db.query(func.coalesce(func.sum(User.cash_balance), 0.0)).scalar() or 0.0
    holdings_book = (
        db.query(func.coalesce(func.sum(Holding.quantity * Holding.avg_cost), 0.0)).scalar() or 0.0
    )
    total_portfolio_value = float(total_cash) + float(holdings_book)

    return PlatformStats(
        total_users=int(total_users),
        active_today=int(active_today),
        active_this_week=int(active_this_week),
        suspended_users=int(suspended_users),
        total_trades=int(total_trades),
        trades_today=int(trades_today),
        avg_pnl=avg_pnl,
        total_portfolio_value=total_portfolio_value,
    )


@router.get("/users/{user_id}/trades", response_model=list[AdminTradeRow])
@limiter.limit("60/minute")
def list_user_trades(
    request: Request,
    user_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_admin),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    q = (
        db.query(Transaction)
        .filter(Transaction.user_id == user_id)
        .order_by(Transaction.executed_at.desc(), Transaction.id.desc())
    )
    rows = q.offset(offset).limit(limit).all()
    return [
        AdminTradeRow(
            id=t.id,
            user_id=t.user_id,
            ticker=t.ticker,
            side=t.side,
            quantity=t.quantity,
            price=t.price,
            total=t.total,
            executed_at=t.executed_at,
            order_id=t.order_id,
            portfolio_equity_after=t.portfolio_equity_after,
        )
        for t in rows
    ]


@router.get("/audit-log", response_model=AdminAuditLogListResponse)
@limiter.limit("60/minute")
def audit_log(
    request: Request,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_admin),
    admin_id: int | None = Query(None),
    action: str | None = Query(None),
    target_user_id: int | None = Query(None),
    from_date: datetime | None = Query(None),
    to_date: datetime | None = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=100),
):
    AdminUser = aliased(User)
    TargetUser = aliased(User)

    q = (
        db.query(AdminAuditLog, AdminUser.email, TargetUser.email)
        .join(AdminUser, AdminAuditLog.admin_id == AdminUser.id)
        .outerjoin(TargetUser, AdminAuditLog.target_user_id == TargetUser.id)
    )
    if admin_id is not None:
        q = q.filter(AdminAuditLog.admin_id == admin_id)
    if action:
        q = q.filter(AdminAuditLog.action == action)
    if target_user_id is not None:
        q = q.filter(AdminAuditLog.target_user_id == target_user_id)
    if from_date is not None:
        q = q.filter(AdminAuditLog.created_at >= from_date)
    if to_date is not None:
        q = q.filter(AdminAuditLog.created_at <= to_date)

    total = q.count()
    pages = max(1, math.ceil(total / per_page)) if total else 1
    rows = (
        q.order_by(AdminAuditLog.created_at.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
        .all()
    )
    entries = [
        AdminAuditLogEntry(
            id=log.id,
            admin_id=log.admin_id,
            admin_email=admin_email or "",
            action=log.action,
            target_user_id=log.target_user_id,
            target_email=target_email,
            payload=log.payload,
            ip_address=log.ip_address,
            created_at=log.created_at,
        )
        for log, admin_email, target_email in rows
    ]
    return AdminAuditLogListResponse(
        entries=entries,
        total=total,
        page=page,
        per_page=per_page,
        pages=pages,
    )


@router.get("/config", response_model=list[PlatformConfigItem])
@limiter.limit("60/minute")
def get_config(
    request: Request,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    rows = db.query(PlatformConfig).order_by(PlatformConfig.key).all()
    return [
        PlatformConfigItem(
            key=r.key,
            value=r.value,
            description=r.description,
            updated_by=r.updated_by,
            updated_at=r.updated_at,
        )
        for r in rows
    ]


@router.patch("/config/{key}", response_model=PlatformConfigItem)
@limiter.limit("20/minute")
async def patch_config(
    key: str,
    body: PlatformConfigUpdate,
    request: Request,
    db: Session = Depends(get_db),
    admin: User = Depends(require_super_admin),
):
    row = db.query(PlatformConfig).filter(PlatformConfig.key == key).first()
    old_val = row.value if row else None
    if row is None:
        row = PlatformConfig(key=key, value=body.value, description=body.description, updated_by=admin.id)
        db.add(row)
    else:
        row.value = body.value
        if body.description is not None:
            row.description = body.description
        row.updated_by = admin.id
    row.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(row)
    await log_admin_action(
        db,
        admin.id,
        AdminAction.UPDATE_CONFIG,
        request,
        payload={"key": key, "old_value": old_val, "new_value": body.value},
    )
    return PlatformConfigItem(
        key=row.key,
        value=row.value,
        description=row.description,
        updated_by=row.updated_by,
        updated_at=row.updated_at,
    )


@router.get("/reports/users/export")
@limiter.limit("60/minute")
async def export_users_csv(
    request: Request,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    await log_admin_action(
        db,
        admin.id,
        AdminAction.EXPORT_REPORT,
        request,
        payload={"report": "users"},
    )

    users = db.query(User).filter(User.is_deleted.is_(False)).order_by(User.id).all()
    out = io.StringIO()
    w = csv.writer(out)
    w.writerow(
        [
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
    )
    for u in users:
        uid = u.id
        n_tr = db.query(func.count(Transaction.id)).filter(Transaction.user_id == uid).scalar() or 0
        sell_sum = (
            db.query(func.coalesce(func.sum(Transaction.total), 0.0))
            .filter(Transaction.user_id == uid, Transaction.side == "sell")
            .scalar()
            or 0.0
        )
        buy_sum = (
            db.query(func.coalesce(func.sum(Transaction.total), 0.0))
            .filter(Transaction.user_id == uid, Transaction.side == "buy")
            .scalar()
            or 0.0
        )
        pnl = float(sell_sum) - float(buy_sum)
        w.writerow(
            [
                uid,
                u.email,
                getattr(u, "username", "") or "",
                getattr(u, "role", "user"),
                bool(getattr(u, "is_suspended", False)),
                (u.created_at or "").isoformat() if u.created_at else "",
                (getattr(u, "last_active_at", None) or "").isoformat()
                if getattr(u, "last_active_at", None)
                else "",
                int(n_tr),
                pnl,
            ]
        )

    fname = datetime.utcnow().strftime("users_%Y%m%d.csv")
    body = out.getvalue().encode("utf-8")

    def _stream():
        yield body

    return StreamingResponse(
        _stream(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )


@router.get("/reports/trades/pdf")
@limiter.limit("60/minute")
async def export_trades_pdf(
    request: Request,
    db: Session = Depends(get_db),
    admin: User = Depends(require_super_admin),
):
    await log_admin_action(
        db,
        admin.id,
        AdminAction.EXPORT_REPORT,
        request,
        payload={"report": "trades_pdf"},
    )

    txs = (
        db.query(Transaction)
        .order_by(Transaction.user_id.asc(), Transaction.executed_at.desc())
        .all()
    )
    pdf = FPDF()
    pdf.set_auto_page_break(auto=True, margin=14)
    pdf.add_page()
    pdf.set_font("Helvetica", "B", 14)
    pdf.cell(0, 10, "All trades (grouped by user)", ln=1)
    pdf.set_font("Helvetica", "", 9)

    current_uid: int | None = None
    for t in txs:
        if t.user_id != current_uid:
            current_uid = t.user_id
            pdf.ln(4)
            pdf.set_font("Helvetica", "B", 11)
            pdf.cell(0, 8, f"User ID {current_uid}", ln=1)
            pdf.set_font("Helvetica", "", 9)
        line = f"{t.ticker} {t.side} qty={t.quantity} @ {t.price} total={t.total}"
        if t.executed_at:
            line += f" at {t.executed_at.isoformat()} UTC"
        pdf.cell(0, 5, line[:120], ln=1)

    raw = pdf.output(dest="S")
    if isinstance(raw, str):
        data = raw.encode("latin-1", errors="replace")
    else:
        data = raw if isinstance(raw, (bytes, bytearray)) else bytes(raw)

    return Response(
        content=data,
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="trades_summary.pdf"'},
    )
