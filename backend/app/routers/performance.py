from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import User
from app.schemas import (
    BenchmarkSeriesOut,
    CumulativeReturnPoint,
    DailyReturnBar,
    DrawdownPoint,
    EquityCurvePoint,
    PerformanceReportOut,
    ReturnPctPoint,
    StockPnlBar,
    TickerReturnRow,
    TradeHighlight,
    WinRateBreakdown,
)
from app.services.performance_service import build_performance_report

router = APIRouter(prefix="/api/performance", tags=["performance"])


@router.get("/report", response_model=PerformanceReportOut)
def performance_report(
    start: date = Query(..., description="Range start (inclusive)"),
    end: date = Query(..., description="Range end (inclusive)"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        raw = build_performance_report(db, user, start, end)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    # Same as portfolio GET: persist any limit fills from process_pending_orders inside build_portfolio.
    db.commit()

    pvb = raw["portfolio_vs_benchmark"]
    bench = BenchmarkSeriesOut(
        portfolio=pvb["portfolio"],
        benchmark=pvb["benchmark"],
        benchmark_symbol=pvb["benchmark_symbol"],
        benchmark_label=pvb["benchmark_label"],
    )

    return PerformanceReportOut(
        start=raw["start"],
        end=raw["end"],
        equity_curve=[EquityCurvePoint(**x) for x in raw["equity_curve"]],
        return_pct_series=[ReturnPctPoint(**x) for x in raw["return_pct_series"]],
        per_stock_performance=[TickerReturnRow(**x) for x in raw["per_stock_performance"]],
        win_rate_pct=raw["win_rate_pct"],
        best_trade=TradeHighlight(**raw["best_trade"]) if raw.get("best_trade") else None,
        worst_trade=TradeHighlight(**raw["worst_trade"]) if raw.get("worst_trade") else None,
        max_drawdown_pct=raw["max_drawdown_pct"],
        sharpe_ratio=raw["sharpe_ratio"],
        trade_count=raw["trade_count"],
        sell_count=raw["sell_count"],
        portfolio_vs_benchmark=bench,
        initial_equity=raw["initial_equity"],
        daily_return_bars=[DailyReturnBar(**x) for x in raw["daily_return_bars"]],
        cumulative_return_daily=[CumulativeReturnPoint(**x) for x in raw["cumulative_return_daily"]],
        win_rate_breakdown=WinRateBreakdown(**raw["win_rate_breakdown"]),
        per_stock_pnl=[StockPnlBar(**x) for x in raw["per_stock_pnl"]],
        drawdown_series=[DrawdownPoint(**x) for x in raw["drawdown_series"]],
    )
