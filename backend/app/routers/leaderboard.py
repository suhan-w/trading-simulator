from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import LeaderboardEntry, User
from app.schemas import (
    CommunityPaperBundleOut,
    HallOfFameOut,
    LeaderboardBestRankOut,
    LeaderboardBundleOut,
    LeaderboardCategoryOut,
    LeaderboardDetailOut,
    LeaderboardEntryMineOut,
    LeaderboardEntryPatchIn,
    LeaderboardRowOut,
    MonthlySeasonBundleOut,
)
from app.services import community_season_service, leaderboard_service

router = APIRouter(prefix="/api/leaderboard", tags=["leaderboard"])

_CAT_KEYS = ["return", "sharpe", "drawdown", "trades"]
_CAT_TITLES = {
    "return": "Highest Total Return",
    "sharpe": "Best Sharpe Ratio",
    "drawdown": "Lowest Max Drawdown",
    "trades": "Most Active",
}


def _fmt_value(cat: str, e: LeaderboardEntry) -> tuple[float, str]:
    if cat == "return":
        v = float(e.total_return_pct)
        return v, f"{v:+.2f}%"
    if cat == "sharpe":
        if e.sharpe_ratio is None:
            return 0.0, "—"
        v = float(e.sharpe_ratio)
        return v, f"{v:.2f}"
    if cat == "drawdown":
        if e.max_drawdown_pct is None:
            return 0.0, "—"
        v = float(e.max_drawdown_pct)
        return v, f"{v:.2f}%"
    if cat == "trades":
        v = float(e.trade_count)
        return v, str(int(e.trade_count))
    if cat == "winrate":
        if e.win_rate_pct is None:
            return 0.0, "—"
        v = float(e.win_rate_pct)
        return v, f"{v:.1f}%"
    return 0.0, ""


def _viewable(e: LeaderboardEntry) -> bool:
    code = (e.strategy_code or "").strip()
    vis = (e.strategy_visual_json or "").strip()
    return bool(code or vis)


@router.get("", response_model=LeaderboardBundleOut)
def leaderboard_bundle(
    start: date = Query(..., description="Filter range start"),
    end: date = Query(..., description="Filter range end"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if start > end:
        raise HTTPException(status_code=400, detail="start must be on or before end")
    total = leaderboard_service.count_public_distinct_strategies(db, start, end)
    show_empty = total < 3
    best_raw = leaderboard_service.my_best_rank_summary(db, user.id, start, end)
    best = LeaderboardBestRankOut(**best_raw) if best_raw else None

    categories: list[LeaderboardCategoryOut] = []
    for key in _CAT_KEYS:
        rows_db = leaderboard_service.top_for_category(db, start, end, key, 10)
        rows: list[LeaderboardRowOut] = []
        for rank, e in enumerate(rows_db, start=1):
            v, label = _fmt_value(key, e)
            rows.append(
                LeaderboardRowOut(
                    id=e.id,
                    anon_id=e.anon_id,
                    strategy_seq=int(e.strategy_seq or 0),
                    strategy_label=f"Strategy #{int(e.strategy_seq or 0):03d}",
                    source=e.source,
                    ticker=e.ticker,
                    period_start=e.period_start,
                    period_end=e.period_end,
                    value=v,
                    value_label=label,
                    total_return_pct=float(e.total_return_pct),
                    sharpe_ratio=float(e.sharpe_ratio) if e.sharpe_ratio is not None else None,
                    max_drawdown_pct=float(e.max_drawdown_pct) if e.max_drawdown_pct is not None else None,
                    is_mine=e.user_id == user.id,
                    viewable=_viewable(e),
                )
            )
        categories.append(LeaderboardCategoryOut(key=key, title=_CAT_TITLES[key], rows=rows))

    return LeaderboardBundleOut(
        start=start,
        end=end,
        total_public_entries=total,
        show_empty_state=show_empty,
        best_rank=best,
        categories=categories,
    )


_ALLOWED_COMMUNITY_WINDOWS = {"all", "90d", "30d"}


@router.get("/community/monthly", response_model=MonthlySeasonBundleOut)
def community_monthly_season(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    raw = community_season_service.monthly_season_bundle(db, user)
    return MonthlySeasonBundleOut(**raw)


@router.get("/community/hall-of-fame", response_model=HallOfFameOut)
def community_hall_of_fame(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _ = user
    raw = community_season_service.hall_of_fame_bundle(db)
    return HallOfFameOut(**raw)


@router.get("/community/alltime", response_model=CommunityPaperBundleOut)
def community_alltime_leaderboard(
    window: str = Query("all", description="Ranking window: all | 90d | 30d"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    w = (window or "all").strip().lower()
    if w not in _ALLOWED_COMMUNITY_WINDOWS:
        raise HTTPException(status_code=400, detail="window must be one of: all, 90d, 30d")
    raw = leaderboard_service.community_paper_bundle(db, user, w)
    return CommunityPaperBundleOut(**raw)


@router.get("/mine", response_model=list[LeaderboardEntryMineOut])
def my_leaderboard_entries(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    rows = (
        db.query(LeaderboardEntry)
        .filter(LeaderboardEntry.user_id == user.id)
        .order_by(LeaderboardEntry.created_at.desc())
        .limit(100)
        .all()
    )
    return [
        LeaderboardEntryMineOut(
            id=r.id,
            anon_id=r.anon_id,
            strategy_seq=int(r.strategy_seq or 0),
            source=r.source,
            period_start=r.period_start,
            period_end=r.period_end,
            share_public=r.share_public,
            total_return_pct=r.total_return_pct,
            trade_count=r.trade_count,
            created_at=r.created_at or r.updated_at or datetime.utcnow(),
        )
        for r in rows
    ]


@router.get("/entries/{entry_id}", response_model=LeaderboardDetailOut)
def get_entry_detail(
    entry_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    e = leaderboard_service.entry_detail_public(db, entry_id)
    if e is None:
        raise HTTPException(status_code=404, detail="Entry not found or not public")
    code = (e.strategy_code or "").strip()
    vis = (e.strategy_visual_json or "").strip()
    return LeaderboardDetailOut(
        id=e.id,
        anon_id=e.anon_id,
        strategy_seq=int(e.strategy_seq or 0),
        strategy_label=f"Strategy #{int(e.strategy_seq or 0):03d}",
        ticker=e.ticker,
        source=e.source,
        period_start=e.period_start,
        period_end=e.period_end,
        total_return_pct=e.total_return_pct,
        sharpe_ratio=e.sharpe_ratio,
        max_drawdown_pct=e.max_drawdown_pct,
        win_rate_pct=e.win_rate_pct,
        trade_count=e.trade_count,
        strategy_code=code or None,
        strategy_visual_json=vis or None,
    )


@router.patch("/entries/{entry_id}", response_model=LeaderboardEntryMineOut)
def patch_my_entry(
    entry_id: int,
    body: LeaderboardEntryPatchIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    e = leaderboard_service.entry_owned(db, entry_id, user.id)
    if e is None:
        raise HTTPException(status_code=404, detail="Entry not found")
    e.share_public = bool(body.share_public)
    db.commit()
    db.refresh(e)
    return LeaderboardEntryMineOut(
        id=e.id,
        anon_id=e.anon_id,
        strategy_seq=int(e.strategy_seq or 0),
        source=e.source,
        period_start=e.period_start,
        period_end=e.period_end,
        share_public=e.share_public,
        total_return_pct=e.total_return_pct,
        trade_count=e.trade_count,
        created_at=e.created_at or e.updated_at or datetime.utcnow(),
    )
