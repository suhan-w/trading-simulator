"""Anonymous leaderboard entries from backtests and paper trading snapshots."""

from __future__ import annotations

from datetime import date, datetime, timedelta
import hashlib
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


def _normalize_strategy_text(raw: str | None) -> str:
    return (raw or "").replace("\r\n", "\n").strip()


def _strategy_dedupe_key(entry: LeaderboardEntry) -> tuple[str, str] | None:
    code = _normalize_strategy_text(entry.strategy_code)
    if code:
        return ("code", code)
    visual = _normalize_strategy_text(entry.strategy_visual_json)
    if visual:
        return ("visual", visual)
    return None


def _is_saved_strategy_entry(entry: LeaderboardEntry) -> bool:
    """Strategy Lab only shows runs linked to a saved visual strategy."""
    if entry.source != SOURCE_BACKTEST:
        return False
    return bool(_normalize_strategy_text(entry.strategy_visual_json))


def public_distinct_in_range(db: Session, range_start: date, range_end: date) -> list[LeaderboardEntry]:
    rows = public_in_range(db, range_start, range_end).order_by(LeaderboardEntry.id.desc()).all()
    out: list[LeaderboardEntry] = []
    seen: set[tuple[str, str]] = set()
    for e in rows:
        if not _is_saved_strategy_entry(e):
            continue
        k = _strategy_dedupe_key(e)
        if k is None:
            out.append(e)
            continue
        if k in seen:
            continue
        seen.add(k)
        out.append(e)
    return out


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
    visual_saved = bool(_normalize_strategy_text(visual_json))
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
        # Strategy Lab only includes runs tied to a saved visual strategy.
        share_public=visual_saved,
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


def ensure_paper_leaderboard_row(db: Session, user: User) -> LeaderboardEntry:
    """Create a paper leaderboard row if missing (e.g. zero trades) so privacy can be set from Account."""
    row = (
        db.query(LeaderboardEntry)
        .filter(LeaderboardEntry.user_id == user.id, LeaderboardEntry.source == SOURCE_PAPER)
        .first()
    )
    if row is not None:
        return row
    uc = user.created_at
    start = uc.date() if isinstance(uc, datetime) else date.today()
    end = date.today()
    if start > end:
        start = end
    seq = next_user_strategy_seq(db, user)
    row = LeaderboardEntry(
        user_id=user.id,
        anon_id=next_anon_id(db),
        strategy_seq=seq,
        source=SOURCE_PAPER,
        ticker=None,
        period_start=start,
        period_end=end,
        total_return_pct=0.0,
        sharpe_ratio=None,
        max_drawdown_pct=None,
        win_rate_pct=None,
        trade_count=0,
        share_public=False,
        strategy_code=None,
        strategy_visual_json=None,
    )
    db.add(row)
    db.flush()
    return row


def count_public_distinct_strategies(db: Session, range_start: date, range_end: date) -> int:
    return len(public_distinct_in_range(db, range_start, range_end))


def _rank_return(entry: LeaderboardEntry, db: Session, range_start: date, range_end: date) -> int:
    rows = public_distinct_in_range(db, range_start, range_end)
    better = sum(1 for r in rows if float(r.total_return_pct) > float(entry.total_return_pct) + 1e-12)
    return better + 1


def _rank_sharpe(entry: LeaderboardEntry, db: Session, range_start: date, range_end: date) -> int:
    rows = public_distinct_in_range(db, range_start, range_end)
    if entry.sharpe_ratio is None:
        better = sum(1 for r in rows if r.sharpe_ratio is not None)
    else:
        es = float(entry.sharpe_ratio)
        better = sum(1 for r in rows if r.sharpe_ratio is not None and float(r.sharpe_ratio) > es + 1e-12)
        better += sum(1 for r in rows if r.sharpe_ratio is None)
    return better + 1


def _rank_drawdown(entry: LeaderboardEntry, db: Session, range_start: date, range_end: date) -> int:
    rows = public_distinct_in_range(db, range_start, range_end)
    if entry.max_drawdown_pct is None:
        better = sum(1 for r in rows if r.max_drawdown_pct is not None)
    else:
        ed = float(entry.max_drawdown_pct)
        better = sum(1 for r in rows if r.max_drawdown_pct is not None and float(r.max_drawdown_pct) < ed - 1e-12)
        better += sum(1 for r in rows if r.max_drawdown_pct is None)
    return better + 1


def _rank_trades(entry: LeaderboardEntry, db: Session, range_start: date, range_end: date) -> int:
    rows = public_distinct_in_range(db, range_start, range_end)
    better = sum(1 for r in rows if int(r.trade_count) > int(entry.trade_count))
    return better + 1


def _rank_winrate(entry: LeaderboardEntry, db: Session, range_start: date, range_end: date) -> int:
    rows = public_distinct_in_range(db, range_start, range_end)
    if entry.win_rate_pct is None:
        better = sum(1 for r in rows if r.win_rate_pct is not None)
    else:
        ew = float(entry.win_rate_pct)
        better = sum(1 for r in rows if r.win_rate_pct is not None and float(r.win_rate_pct) > ew + 1e-12)
        better += sum(1 for r in rows if r.win_rate_pct is None)
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
    entries = [e for e in public_distinct_in_range(db, range_start, range_end) if e.user_id == user_id]
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
    rows = public_distinct_in_range(db, range_start, range_end)
    if category == "return":
        rows = sorted(rows, key=lambda e: (-float(e.total_return_pct), int(e.id)))
    elif category == "sharpe":
        rows = sorted(
            rows,
            key=lambda e: (
                -float(e.sharpe_ratio) if e.sharpe_ratio is not None else 1e9,
                int(e.id),
            ),
        )
    elif category == "drawdown":
        rows = sorted(
            rows,
            key=lambda e: (
                float(e.max_drawdown_pct) if e.max_drawdown_pct is not None else 1e9,
                int(e.id),
            ),
        )
    elif category == "trades":
        rows = sorted(rows, key=lambda e: (-int(e.trade_count), int(e.id)))
    elif category == "winrate":
        rows = sorted(
            rows,
            key=lambda e: (
                -float(e.win_rate_pct) if e.win_rate_pct is not None else 1e9,
                int(e.id),
            ),
        )
    else:
        return []
    return rows[:limit]


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


MIN_COMMUNITY_TRADES = 10


def _range_overlap(a0: date, a1: date, b0: date, b1: date) -> bool:
    return a1 >= b0 and a0 <= b1


def _community_window_range(window: str) -> tuple[date, date, str]:
    """Returns (range_start, range_end, since_label_for_banner)."""
    today = date.today()
    w = (window or "all").strip().lower()
    if w in ("30d", "30", "30days"):
        start = today - timedelta(days=30)
        return start, today, "the last 30 days"
    if w in ("90d", "90", "90days"):
        start = today - timedelta(days=90)
        return start, today, "the last 90 days"
    start = date(2025, 1, 1)
    return start, today, "Jan 2025"


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
    if isinstance(uc, datetime):
        d0 = uc.date()
    else:
        d0 = uc
    return d0.strftime("%b %Y")


def public_paper_qualified_in_range(db: Session, range_start: date, range_end: date):
    """Public paper snapshots with enough trades, overlapping the filter window."""
    return _overlap(
        db.query(LeaderboardEntry).filter(
            LeaderboardEntry.source == SOURCE_PAPER,
            LeaderboardEntry.share_public.is_(True),
            LeaderboardEntry.trade_count >= MIN_COMMUNITY_TRADES,
        ),
        range_start,
        range_end,
    )


def community_paper_bundle(db: Session, user: User, window: str) -> dict[str, Any]:
    range_start, range_end, since_label = _community_window_range(window)
    qual = public_paper_qualified_in_range(db, range_start, range_end)
    all_rows: list[LeaderboardEntry] = qual.order_by(
        LeaderboardEntry.total_return_pct.desc(), LeaderboardEntry.id.asc()
    ).all()
    n = len(all_rows)
    rets = [float(e.total_return_pct) for e in all_rows]
    avg = sum(rets) / n if n else None
    top = max(rets) if rets else None

    top10 = all_rows[:10]
    user_ids = {e.user_id for e in top10}
    users = {u.id: u for u in db.query(User).filter(User.id.in_(user_ids)).all()} if user_ids else {}

    rows: list[dict[str, Any]] = []
    for i, e in enumerate(top10, start=1):
        u = users.get(e.user_id)
        rows.append(
            {
                "rank": i,
                "trader_label": _trader_label(u),
                "member_since": _member_since_label(u),
                "total_trades": int(e.trade_count),
                "total_return_pct": float(e.total_return_pct),
                "sharpe_ratio": float(e.sharpe_ratio) if e.sharpe_ratio is not None else None,
                "win_rate_pct": float(e.win_rate_pct) if e.win_rate_pct is not None else None,
                "avg_hold_time_label": "—",
                "is_mine": e.user_id == user.id,
            }
        )

    mine = (
        db.query(LeaderboardEntry)
        .filter(LeaderboardEntry.user_id == user.id, LeaderboardEntry.source == SOURCE_PAPER)
        .first()
    )

    banner_kind = "no_paper"
    rank_out: int | None = None
    ret_out: float | None = None
    eligible = False

    if mine is None:
        banner_kind = "no_paper"
    elif not mine.share_public:
        banner_kind = "opt_out"
    elif int(mine.trade_count or 0) < MIN_COMMUNITY_TRADES:
        banner_kind = "insufficient_trades"
    elif not _range_overlap(mine.period_start, mine.period_end, range_start, range_end):
        banner_kind = "no_overlap"
    else:
        banner_kind = "ok"
        eligible = True
        better = (
            public_paper_qualified_in_range(db, range_start, range_end)
            .filter(LeaderboardEntry.total_return_pct > float(mine.total_return_pct) + 1e-12)
            .count()
        )
        rank_out = int(better) + 1
        ret_out = float(mine.total_return_pct)

    return {
        "window": (window or "all").strip().lower(),
        "range_start": range_start,
        "range_end": range_end,
        "since_label": since_label,
        "stats": {
            "participant_count": n,
            "average_return_pct": avg,
            "top_return_pct": top,
        },
        "you": {
            "eligible": eligible,
            "banner_kind": banner_kind,
            "rank": rank_out,
            "total_return_pct": ret_out,
        },
        "rows": rows,
    }
