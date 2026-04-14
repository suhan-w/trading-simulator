from datetime import date

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from fastapi.responses import Response
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
    SummaryBenchmarkComparisonOut,
    SummaryHoldingRowOut,
    SummaryMetricRowOut,
    SummaryPortfolioActivityOut,
    SummaryReportRequestIn,
    SummaryReportResponse,
    SummaryStockRowOut,
    SummaryStrategyContextOut,
    SummaryTradeRowOut,
    TickerReturnRow,
    TradeHighlight,
    WinRateBreakdown,
)
from app.services import leaderboard_service
from app.services.performance_service import build_performance_report
from app.services.summary_report_service import build_executive_summary_bundle, summary_pdf_bytes

router = APIRouter(prefix="/api/performance", tags=["performance"])


def _summary_bundle_to_response(bundle: dict) -> SummaryReportResponse:
    pvb = bundle["portfolio_vs_benchmark"]
    sc = bundle.get("strategy_context")
    return SummaryReportResponse(
        generated_at=bundle["generated_at"],
        date_range_label=bundle["date_range_label"],
        start=bundle["start"],
        end=bundle["end"],
        benchmark_label=bundle["benchmark_label"],
        executive_summary=bundle["executive_summary"],
        metrics_table=[SummaryMetricRowOut(**r) for r in bundle["metrics_table"]],
        portfolio_activity=SummaryPortfolioActivityOut(**bundle["portfolio_activity"]),
        top_performers=[SummaryStockRowOut(**r) for r in bundle["top_performers"]],
        worst_performers=[SummaryStockRowOut(**r) for r in bundle["worst_performers"]],
        risk_assessment=bundle["risk_assessment"],
        benchmark_comparison=SummaryBenchmarkComparisonOut(**bundle["benchmark_comparison"]),
        conclusion=bundle["conclusion"],
        trades=[SummaryTradeRowOut(**r) for r in bundle["trades"]],
        holdings=[SummaryHoldingRowOut(**r) for r in bundle["holdings"]],
        equity_curve=[EquityCurvePoint(**x) for x in bundle["equity_curve"]],
        portfolio_vs_benchmark=BenchmarkSeriesOut(**pvb),
        strategy_context=SummaryStrategyContextOut(**sc) if sc else None,
    )


@router.get("/report", response_model=PerformanceReportOut)
def performance_report(
    background_tasks: BackgroundTasks,
    start: date = Query(..., description="Range start (inclusive)"),
    end: date = Query(..., description="Range end (inclusive)"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        raw, n_filled_limits = build_performance_report(db, user, start, end)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    # Same as portfolio GET: persist any limit fills from process_pending_orders inside build_portfolio.
    db.commit()
    if n_filled_limits > 0:
        background_tasks.add_task(leaderboard_service.refresh_paper_snapshot_in_new_session, user.id)

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
        aligned_portfolio_return_pct=raw.get("aligned_portfolio_return_pct"),
        aligned_benchmark_return_pct=raw.get("aligned_benchmark_return_pct"),
        aligned_alpha_pct=raw.get("aligned_alpha_pct"),
    )


@router.post("/summary-report", response_model=SummaryReportResponse)
def create_summary_report(
    background_tasks: BackgroundTasks,
    body: SummaryReportRequestIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        bundle, n_filled_limits = build_executive_summary_bundle(
            db,
            user,
            body.start,
            body.end,
            strategy_title=body.strategy_title,
            strategy_notes=body.strategy_notes,
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    db.commit()
    if n_filled_limits > 0:
        background_tasks.add_task(leaderboard_service.refresh_paper_snapshot_in_new_session, user.id)
    return _summary_bundle_to_response(bundle)


@router.post("/summary-report.pdf")
def download_summary_report_pdf_post(
    background_tasks: BackgroundTasks,
    body: SummaryReportRequestIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        data, n_filled_limits = summary_pdf_bytes(
            db,
            user,
            body.start,
            body.end,
            strategy_title=body.strategy_title,
            strategy_notes=body.strategy_notes,
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    db.commit()
    if n_filled_limits > 0:
        background_tasks.add_task(leaderboard_service.refresh_paper_snapshot_in_new_session, user.id)
    return Response(
        content=data,
        media_type="application/pdf",
        headers={
            "Content-Disposition": 'attachment; filename="cowrie-shell-performance-summary.pdf"',
        },
    )


@router.get("/summary-report.pdf")
def download_summary_report_pdf(
    background_tasks: BackgroundTasks,
    start: date = Query(..., description="Range start (inclusive)"),
    end: date = Query(..., description="Range end (inclusive)"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """PDF without optional strategy context (backward compatible). Prefer POST /summary-report.pdf."""
    try:
        data, n_filled_limits = summary_pdf_bytes(db, user, start, end)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    db.commit()
    if n_filled_limits > 0:
        background_tasks.add_task(leaderboard_service.refresh_paper_snapshot_in_new_session, user.id)
    return Response(
        content=data,
        media_type="application/pdf",
        headers={
            "Content-Disposition": 'attachment; filename="cowrie-shell-performance-summary.pdf"',
        },
    )
