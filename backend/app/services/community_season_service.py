"""Monthly community season: baselines, hall of fame, rollover on month change."""

from __future__ import annotations

import calendar
import hashlib
from datetime import date, datetime, timezone
from typing import Any

from sqlalchemy import extract
from sqlalchemy.orm import Session

from app.models import (
    LeaderboardEntry,
    MonthlyHallOfFame,
    MonthlySeasonBaseline,
    MonthlySeasonMeta,
    Transaction,
    User,
)
from app.services.equity import mark_to_market_equity
from app.services.leaderboard_service import SOURCE_PAPER

MIN_MONTHLY_TRADES = 5


def _trader_label(user: User | None) -> str:
    au = (user.anon_user_id or "").strip() if user else ""
    if not au:
        return "Trader #---"
    h = int(hashlib.sha256(au.encode()).hexdigest()[:8], 16)
    return f"Trader #{h % 998 + 1:03d}"


def _member_since_label(user: User | None) -> str:
    if user is None or user.created_at is None:
        return "—"
    uc = user.created_at
    d0 = uc.date() if hasattr(uc, "date") else uc
    return d0.strftime("%b %Y")


def count_trades_in_month(db: Session, user_id: int, y: int, m: int) -> int:
    return int(
        db.query(Transaction)
        .filter(
            Transaction.user_id == user_id,
            extract("year", Transaction.executed_at) == y,
            extract("month", Transaction.executed_at) == m,
        )
        .count()
    )


def _month_after(y: int, m: int) -> tuple[int, int]:
    if m == 12:
        return y + 1, 1
    return y, m + 1


def _season_tuple(meta: MonthlySeasonMeta | None) -> tuple[int, int] | None:
    if meta is None:
        return None
    return (int(meta.active_year), int(meta.active_month))


def ensure_monthly_season_rolled(db: Session) -> None:
    """Archive completed months and snapshot baselines until meta matches the current calendar month."""
    today = date.today()
    cy, cm = today.year, today.month
    cur_key = (cy, cm)

    meta = db.query(MonthlySeasonMeta).filter(MonthlySeasonMeta.id == 1).first()
    if meta is None:
        meta = MonthlySeasonMeta(id=1, active_year=cy, active_month=cm)
        db.add(meta)
        db.flush()

    active = _season_tuple(meta)
    assert active is not None

    users = db.query(User).all()

    if active > cur_key:
        meta.active_year = cy
        meta.active_month = cm
        _backfill_missing_baselines(db, cy, cm)
        db.commit()
        return

    if active == cur_key:
        _backfill_missing_baselines(db, cy, cm)
        db.commit()
        return

    # Advance month-by-month: archive each closed season, then baseline the next month until we reach today.
    while active < cur_key:
        ay, am = active
        _archive_season_winner_if_needed(db, ay, am)
        ny, nm = _month_after(ay, am)
        for u in users:
            _ensure_baseline_row(db, u, ny, nm)
        meta.active_year = ny
        meta.active_month = nm
        active = (ny, nm)

    _backfill_missing_baselines(db, cy, cm)
    db.commit()


def _ensure_baseline_row(db: Session, user: User, y: int, m: int) -> None:
    existing = (
        db.query(MonthlySeasonBaseline)
        .filter(
            MonthlySeasonBaseline.user_id == user.id,
            MonthlySeasonBaseline.season_year == y,
            MonthlySeasonBaseline.season_month == m,
        )
        .first()
    )
    if existing:
        return
    eq = mark_to_market_equity(db, user)
    db.add(
        MonthlySeasonBaseline(
            user_id=user.id,
            season_year=y,
            season_month=m,
            baseline_equity=float(eq),
        )
    )


def _backfill_missing_baselines(db: Session, y: int, m: int) -> None:
    for u in db.query(User).all():
        _ensure_baseline_row(db, u, y, m)


def _archive_season_winner_if_needed(db: Session, y: int, m: int) -> None:
    if db.query(MonthlyHallOfFame).filter(MonthlyHallOfFame.season_year == y, MonthlyHallOfFame.season_month == m).first():
        return

    baselines = (
        db.query(MonthlySeasonBaseline).filter(MonthlySeasonBaseline.season_year == y, MonthlySeasonBaseline.season_month == m).all()
    )
    best_uid: int | None = None
    best_ret = -1e18
    best_trades = 0
    best_sharpe: float | None = None

    for b in baselines:
        u = db.query(User).filter(User.id == b.user_id).first()
        if u is None:
            continue
        paper = (
            db.query(LeaderboardEntry)
            .filter(LeaderboardEntry.user_id == u.id, LeaderboardEntry.source == SOURCE_PAPER)
            .first()
        )
        if paper is None or not paper.share_public:
            continue
        trades_m = count_trades_in_month(db, u.id, y, m)
        if trades_m < MIN_MONTHLY_TRADES:
            continue
        base = float(b.baseline_equity)
        if base <= 1e-9:
            continue
        eq = mark_to_market_equity(db, u)
        ret_pct = (float(eq) - base) / base * 100.0
        if ret_pct > best_ret:
            best_ret = ret_pct
            best_uid = u.id
            best_trades = trades_m
            best_sharpe = float(paper.sharpe_ratio) if paper.sharpe_ratio is not None else None

    if best_uid is None:
        return

    db.add(
        MonthlyHallOfFame(
            season_year=y,
            season_month=m,
            user_id=best_uid,
            return_pct=float(best_ret),
            trade_count=int(best_trades),
            sharpe_ratio=best_sharpe,
        )
    )


def month_closes_at_utc_iso(y: int, m: int) -> str:
    last_day = calendar.monthrange(y, m)[1]
    dt = datetime(y, m, last_day, 23, 59, 59, tzinfo=timezone.utc)
    return dt.isoformat()


def monthly_season_bundle(db: Session, user: User) -> dict[str, Any]:
    ensure_monthly_season_rolled(db)
    db.refresh(user)
    today = date.today()
    cy, cm = today.year, today.month

    month_name = date(cy, cm, 1).strftime("%B")
    season_title = f"{date(cy, cm, 1).strftime('%b')} {cy} Season"
    season_month_label = f"{month_name} {cy}"

    closes_iso = month_closes_at_utc_iso(cy, cm)

    users = db.query(User).all()
    ranked: list[tuple[User, float, int, float | None, float | None]] = []

    for u in users:
        paper = (
            db.query(LeaderboardEntry)
            .filter(LeaderboardEntry.user_id == u.id, LeaderboardEntry.source == SOURCE_PAPER)
            .first()
        )
        if paper is None or not paper.share_public:
            continue
        trades_m = count_trades_in_month(db, u.id, cy, cm)
        if trades_m < MIN_MONTHLY_TRADES:
            continue
        bl = (
            db.query(MonthlySeasonBaseline)
            .filter(
                MonthlySeasonBaseline.user_id == u.id,
                MonthlySeasonBaseline.season_year == cy,
                MonthlySeasonBaseline.season_month == cm,
            )
            .first()
        )
        if bl is None:
            continue
        base = float(bl.baseline_equity)
        if base <= 1e-9:
            continue
        eq = mark_to_market_equity(db, u)
        ret_pct = (float(eq) - base) / base * 100.0
        sharpe = float(paper.sharpe_ratio) if paper.sharpe_ratio is not None else None
        wr = float(paper.win_rate_pct) if paper.win_rate_pct is not None else None
        ranked.append((u, ret_pct, trades_m, sharpe, wr))

    ranked.sort(key=lambda x: (-x[1], x[0].id))

    rows: list[dict[str, Any]] = []
    for i, (u, ret_pct, trades_m, sharpe, wr) in enumerate(ranked[:10], start=1):
        rows.append(
            {
                "rank": i,
                "trader_label": _trader_label(u),
                "trades_this_month": trades_m,
                "monthly_return_pct": float(ret_pct),
                "sharpe_ratio": sharpe,
                "win_rate_pct": wr,
                "is_mine": u.id == user.id,
            }
        )

    paper_mine = (
        db.query(LeaderboardEntry)
        .filter(LeaderboardEntry.user_id == user.id, LeaderboardEntry.source == SOURCE_PAPER)
        .first()
    )
    my_trades = count_trades_in_month(db, user.id, cy, cm)
    banner_kind = "ok"
    rank_out: int | None = None
    ret_out: float | None = None

    if paper_mine is None:
        banner_kind = "no_paper"
    elif not paper_mine.share_public:
        banner_kind = "opt_out"
    elif my_trades < MIN_MONTHLY_TRADES:
        banner_kind = "low_trades"
    else:
        bl_m = (
            db.query(MonthlySeasonBaseline)
            .filter(
                MonthlySeasonBaseline.user_id == user.id,
                MonthlySeasonBaseline.season_year == cy,
                MonthlySeasonBaseline.season_month == cm,
            )
            .first()
        )
        if bl_m is None:
            banner_kind = "no_baseline"
        else:
            base = float(bl_m.baseline_equity)
            eq = mark_to_market_equity(db, user)
            ret_out = (float(eq) - base) / base * 100.0 if base > 1e-9 else 0.0
            better = sum(1 for x in ranked if x[1] > float(ret_out) + 1e-12)
            rank_out = better + 1
            banner_kind = "ok"

    return {
        "season_title": season_title,
        "season_month_label": season_month_label,
        "closes_at": closes_iso,
        "you": {
            "banner_kind": banner_kind,
            "eligible": banner_kind == "ok",
            "rank": rank_out,
            "monthly_return_pct": ret_out,
            "trades_this_month": my_trades,
            "min_trades": MIN_MONTHLY_TRADES,
        },
        "rows": rows,
    }


def hall_of_fame_bundle(db: Session) -> dict[str, Any]:
    ensure_monthly_season_rolled(db)
    row = (
        db.query(MonthlyHallOfFame)
        .order_by(MonthlyHallOfFame.season_year.desc(), MonthlyHallOfFame.season_month.desc())
        .first()
    )
    if row is None:
        return {"has_winner": False}

    u = db.query(User).filter(User.id == row.user_id).first()
    month_label = date(row.season_year, row.season_month, 1).strftime("%B %Y")
    return {
        "has_winner": True,
        "trader_label": _trader_label(u),
        "month_label": month_label,
        "return_pct": float(row.return_pct),
        "trade_count": int(row.trade_count),
        "sharpe_ratio": float(row.sharpe_ratio) if row.sharpe_ratio is not None else None,
    }
