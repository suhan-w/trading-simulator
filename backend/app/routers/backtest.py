from fastapi import APIRouter, Depends, HTTPException

from app.deps import get_current_user
from app.models import User
from app.schemas import BacktestRequest, BacktestResult
from app.services import backtest_service

router = APIRouter(prefix="/api/backtest", tags=["backtest"])


@router.post("", response_model=BacktestResult)
def run_backtest(
    body: BacktestRequest,
    _: User = Depends(get_current_user),
):
    try:
        data = backtest_service.run_sma_backtest(
            body.ticker,
            body.start_date,
            body.end_date,
            body.fast_period,
            body.slow_period,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return BacktestResult(**data)
