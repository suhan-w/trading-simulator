from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user, require_alpha_vantage_api_key
from app.models import User
from app.schemas import BacktestIn, BacktestOut, CodeBacktestCodeIn, CodeBacktestCodeOut
from app.services import av_cache_service
from app.services.backtest_service import run_strategy
from app.services.code_backtest_sandbox import run_code_backtest_sandboxed

router = APIRouter(prefix="/api/backtest", tags=["backtest"])


@router.post("/run", response_model=BacktestOut)
def run_backtest(
    body: BacktestIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    require_alpha_vantage_api_key(user)
    try:
        bars, _ = av_cache_service.get_or_fetch_ohlcv(db, user, body.ticker)
        raw = run_strategy(bars, body.start, body.end, body.strategy)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    db.commit()
    return BacktestOut(
        total_return_pct=raw["total_return_pct"],
        win_rate_pct=raw.get("win_rate_pct"),
        max_drawdown_pct=raw["max_drawdown_pct"],
        sharpe_ratio=raw.get("sharpe_ratio"),
        trade_count=raw["trade_count"],
        strategy=raw["strategy"],
    )


@router.post("/run-code", response_model=CodeBacktestCodeOut)
def run_code_backtest(
    body: CodeBacktestCodeIn,
    _user: User = Depends(get_current_user),
):
    try:
        raw = run_code_backtest_sandboxed(body.code, body.ticker.strip().upper(), body.start, body.end)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except TimeoutError as e:
        raise HTTPException(status_code=504, detail=str(e)) from e
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
    return CodeBacktestCodeOut(
        benchmark="^AXJO",
        metrics=raw["metrics"],
        series=raw["series"],
    )
