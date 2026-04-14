"""Anonymous leaderboard entries from backtests and paper trading snapshots."""

from __future__ import annotations

from datetime import date, datetime
import secrets
from typing import Any

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import LeaderboardEntry, Transaction, User
from app.services.performance_service import build_performance_report


def refresh_paper_snapshot_in_new_session(user_id: int) -> None:
    """Run paper leaderboard snapshot after the request transaction has committed.

    Uses a fresh DB session so we never nest refresh inside process_pending/build_portfolio.
    """
    from app.database import SessionLocal

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if user is None:
            return
        refresh_paper_snapshot(db, user)
        db.commit()
    except Exception:
        db.rollback()
    finally:
        db.close()

SOURCE_BACKTEST = "backtest"
SOURCE_PAPER = "paper"


def next_anon_id(db: Session) -> int:
    m = db.query(func.coalesce(func.max(LeaderboardEntry.anon_id), 0)).scalar()
    return int(m or 0) + 1


def ensure_user_anon_id(db: Session, user: User) -> str:
    cur = (user.anon_user_id or "").strip()
    if cur:
        return cur
    while True:
        candidate = f"A{secrets.token_hex(3).upper()}"
        exists = db.query(User.id).filter(User.anon_user_id == candidate).first()
        if exists is None:
            user.anon_user_id = candidate
            db.flush()
            return candidate


def next_user_strategy_seq(db: Session, user: User) -> int:
    ensure_user_anon_id(db, user)
    cur = int(user.anon_strategy_seq or 0)
    nxt = cur + 1
    user.anon_strategy_seq = nxt
    db.flush()
    return nxt


def _overlap(q, range_start: date, range_end: date):
    return q.filter(
        LeaderboardEntry.period_end >= range_start,
        LeaderboardEntry.period_start <= range_end,
    )


def public_in_range(db: Session, range_start: date, range_end: date):
    return _overlap(
        db.query(LeaderboardEntry).filter(LeaderboardEntry.share_public.is_(True)),
        range_start,
        range_end,
    )


def create_backtest_entry(
    db: Session,
    user_id: int,
    ticker: str,
    period_start: date,
    period_end: date,
    metrics: dict[str, Any],
    code: str,
    visual_json: str | None,
) -> LeaderboardEntry:
    m = metrics or {}
    tr = m.get("total_return_pct")
    user = db.query(User).filter(User.id == user_id).first()
    strategy_seq = 0
    if user is not None:
        strategy_seq = next_user_strategy_seq(db, user)
    entry = LeaderboardEntry(
        user_id=user_id,
        anon_id=next_anon_id(db),
        strategy_seq=strategy_seq,
        source=SOURCE_BACKTEST,
        ticker=(ticker or "")[:32] or None,
        period_start=period_start,
        period_end=period_end,
        total_return_pct=float(tr) if tr is not None else 0.0,
        sharpe_ratio=float(m["sharpe_ratio"]) if m.get("sharpe_ratio") is not None else None,
        max_drawdown_pct=float(m["max_drawdown_pct"]) if m.get("max_drawdown_pct") is not None else None,
        win_rate_pct=float(m["win_rate_pct"]) if m.get("win_rate_pct") is not None else None,
        trade_count=int(m.get("trade_count") or 0),
        # Backtests are included on leaderboard automatically (no opt-in).
        share_public=True,
        strategy_code=(code or "")[:100_000] or None,
        strategy_visual_json=(visual_json or "")[:500_000] if visual_json else None,
    )
    db.add(entry)
    db.flush()
    return entry


def refresh_paper_snapshot(db: Session, user: User) -> LeaderboardEntry | None:
    n_tx = db.query(Transaction).filter(Transaction.user_id == user.id).count()
    if n_tx == 0:
        return None
    uc = user.created_at
    start = uc.date() if isinstance(uc, datetime) else date.today()
    end = date.today()
    if start > end:
        start = end
    try:
        raw, _ = build_performance_report(db, user, start, end)
    except Exception:
        return None
    cum = raw.get("cumulative_return_daily") or []
    total_ret = float(cum[-1]["cumulative_return_pct"]) if cum else 0.0
    sharpe = raw.get("sharpe_ratio")
    max_dd = raw.get("max_drawdown_pct")
    win_rate = raw.get("win_rate_pct")
    trade_count = int(raw.get("trade_count") or 0)

    row = (
        db.query(LeaderboardEntry)
        .filter(LeaderboardEntry.user_id == user.id, LeaderboardEntry.source == SOURCE_PAPER)
        .first()
    )
    if row is None:
        seq = next_user_strategy_seq(db, user)
        row = LeaderboardEntry(
            user_id=user.id,
            anon_id=next_anon_id(db),
            strategy_seq=seq,
            source=SOURCE_PAPER,
            ticker=None,
            period_start=start,
            period_end=end,
            total_return_pct=total_ret,
            sharpe_ratio=float(sharpe) if sharpe is not None else None,
            max_drawdown_pct=float(max_dd) if max_dd is not None else None,
            win_rate_pct=float(win_rate) if win_rate is not None else None,
            trade_count=trade_count,
            share_public=False,
            strategy_code=None,
            strategy_visual_json=None,
        )
        db.add(row)
    else:
        row.period_start = start
        row.period_end = end
        row.total_return_pct = total_ret
        row.sharpe_ratio = float(sharpe) if sharpe is not None else None
        row.max_drawdown_pct = float(max_dd) if max_dd is not None else None
        row.win_rate_pct = float(win_rate) if win_rate is not None else None
        row.trade_count = trade_count
    db.flush()
    return row


def count_public_distinct_strategies(db: Session, range_start: date, range_end: date) -> int:
    q = public_in_range(db, range_start, range_end)
    return int(q.with_entities(func.count(LeaderboardEntry.id)).scalar() or 0)


def _rank_return(entry: LeaderboardEntry, db: Session, range_start: date, range_end: date) -> int:
    q = public_in_range(db, range_start, range_end)
    better = q.filter(LeaderboardEntry.total_return_pct > entry.total_return_pct + 1e-12).count()
    return better + 1


def _rank_sharpe(entry: LeaderboardEntry, db: Session, range_start: date, range_end: date) -> int:
    q = public_in_range(db, range_start, range_end)
    if entry.sharpe_ratio is None:
        better = q.filter(LeaderboardEntry.sharpe_ratio.isnot(None)).count()
    else:
        es = float(entry.sharpe_ratio)
        better = q.filter(
            LeaderboardEntry.sharpe_ratio.isnot(None),
            LeaderboardEntry.sharpe_ratio > es + 1e-12,
        ).count()
        better += q.filter(LeaderboardEntry.sharpe_ratio.is_(None)).count()
    return better + 1


def _rank_drawdown(entry: LeaderboardEntry, db: Session, range_start: date, range_end: date) -> int:
    q = public_in_range(db, range_start, range_end)
    if entry.max_drawdown_pct is None:
        better = q.filter(LeaderboardEntry.max_drawdown_pct.isnot(None)).count()
    else:
        ed = float(entry.max_drawdown_pct)
        better = q.filter(
            LeaderboardEntry.max_drawdown_pct.isnot(None),
            LeaderboardEntry.max_drawdown_pct < ed - 1e-12,
        ).count()
        better += q.filter(LeaderboardEntry.max_drawdown_pct.is_(None)).count()
    return better + 1


def _rank_trades(entry: LeaderboardEntry, db: Session, range_start: date, range_end: date) -> int:
    q = public_in_range(db, range_start, range_end)
    better = q.filter(LeaderboardEntry.trade_count > entry.trade_count).count()
    return better + 1


def _rank_winrate(entry: LeaderboardEntry, db: Session, range_start: date, range_end: date) -> int:
    q = public_in_range(db, range_start, range_end)
    if entry.win_rate_pct is None:
        better = q.filter(LeaderboardEntry.win_rate_pct.isnot(None)).count()
    else:
        ew = float(entry.win_rate_pct)
        better = q.filter(
            LeaderboardEntry.win_rate_pct.isnot(None),
            LeaderboardEntry.win_rate_pct > ew + 1e-12,
        ).count()
        better += q.filter(LeaderboardEntry.win_rate_pct.is_(None)).count()
    return better + 1


_RANKERS = {
    "return": _rank_return,
    "sharpe": _rank_sharpe,
    "drawdown": _rank_drawdown,
    "trades": _rank_trades,
    "winrate": _rank_winrate,
}

_CAT_LABELS = {
    "return": "Highest Total Return",
    "sharpe": "Best Sharpe Ratio",
    "drawdown": "Lowest Max Drawdown",
    "trades": "Most Active",
    "winrate": "Best Win Rate",
}


def my_best_rank_summary(
    db: Session, user_id: int, range_start: date, range_end: date
) -> dict[str, Any] | None:
    entries = (
        _overlap(
            db.query(LeaderboardEntry).filter(
                LeaderboardEntry.user_id == user_id,
                LeaderboardEntry.share_public.is_(True),
            ),
            range_start,
            range_end,
        )
        .all()
    )
    if not entries:
        return None
    best_rank: int | None = None
    best_label: str | None = None
    best_entry: LeaderboardEntry | None = None
    for e in entries:
        for key, ranker in _RANKERS.items():
            r = ranker(e, db, range_start, range_end)
            if best_rank is None or r < best_rank:
                best_rank = r
                best_label = _CAT_LABELS[key]
                best_entry = e
    if best_rank is None:
        return None
    seq = int(best_entry.strategy_seq or 0) if best_entry is not None else 0
    return {
        "best_rank": best_rank,
        "category_label": best_label,
        "strategy_label": f"Strategy #{seq:03d}" if seq > 0 else "Strategy #000",
    }


def top_for_category(
    db: Session, range_start: date, range_end: date, category: str, limit: int = 10
) -> list[LeaderboardEntry]:
    q = public_in_range(db, range_start, range_end)
    if category == "return":
        q = q.order_by(LeaderboardEntry.total_return_pct.desc(), LeaderboardEntry.id.asc())
    elif category == "sharpe":
        q = q.order_by(
            func.coalesce(LeaderboardEntry.sharpe_ratio, -1e9).desc(),
            LeaderboardEntry.id.asc(),
        )
    elif category == "drawdown":
        q = q.order_by(
            func.coalesce(LeaderboardEntry.max_drawdown_pct, 1e9).asc(),
            LeaderboardEntry.id.asc(),
        )
    elif category == "trades":
        q = q.order_by(LeaderboardEntry.trade_count.desc(), LeaderboardEntry.id.asc())
    elif category == "winrate":
        q = q.order_by(
            func.coalesce(LeaderboardEntry.win_rate_pct, -1.0).desc(),
            LeaderboardEntry.id.asc(),
        )
    else:
        return []
    return q.limit(limit).all()


def entry_detail_public(db: Session, entry_id: int) -> LeaderboardEntry | None:
    return (
        db.query(LeaderboardEntry)
        .filter(LeaderboardEntry.id == entry_id, LeaderboardEntry.share_public.is_(True))
        .first()
    )


def entry_owned(db: Session, entry_id: int, user_id: int) -> LeaderboardEntry | None:
    return (
        db.query(LeaderboardEntry)
        .filter(LeaderboardEntry.id == entry_id, LeaderboardEntry.user_id == user_id)
        .first()
    )
