"""Admin-facing Pydantic schemas."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class AdminUserSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    username: str | None = None
    role: str
    is_suspended: bool
    email_verified: bool = True
    created_at: datetime
    last_active_at: datetime | None = None
    has_alpha_vantage_key: bool = False
    alpha_vantage_requests_used_today: int = 0
    alpha_vantage_daily_limit: int = 25


class AdminUserDetail(AdminUserSummary):
    model_config = ConfigDict(from_attributes=True)

    cash_balance: float = 0.0
    suspended_at: datetime | None = None
    suspension_reason: str | None = None
    notes: str | None = None
    total_trades: int | None = None
    total_pnl: float | None = None
    portfolio_value: float | None = None


class SuspendRequest(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    reason: str = Field(..., min_length=10)


class BalanceResetRequest(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    new_balance: float = Field(..., gt=0)
    reason: str


class AdminAuditLogEntry(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    admin_id: int
    admin_email: str
    action: str
    target_user_id: int | None = None
    target_email: str | None = None
    payload: Any | None = None
    ip_address: str | None = None
    created_at: datetime


class PlatformConfigItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    key: str
    value: Any
    description: str | None = None
    updated_by: int | None = None
    updated_at: datetime


class PlatformConfigUpdate(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    value: Any
    description: str | None = None


class PlatformStats(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    total_users: int
    active_today: int
    active_this_week: int
    suspended_users: int
    total_trades: int
    trades_today: int
    avg_pnl: float
    total_portfolio_value: float


class UserListResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    users: list[AdminUserSummary]
    total: int
    page: int
    per_page: int
    pages: int


class GrantAdminRequest(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    role: Literal["moderator", "super_admin"]


class AdminTradeRow(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    ticker: str
    side: str
    quantity: float
    price: float
    total: float
    executed_at: datetime | None
    order_id: int | None = None
    portfolio_equity_after: float | None = None


class AdminAuditLogListResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    entries: list[AdminAuditLogEntry]
    total: int
    page: int
    per_page: int
    pages: int
