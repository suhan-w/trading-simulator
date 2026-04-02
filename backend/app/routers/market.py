from fastapi import APIRouter, Depends, Query

from app.deps import get_current_user
from app.models import User
from app.schemas import ChartBar, QuoteOut, SearchResult
from app.services import market_service

router = APIRouter(prefix="/api/market", tags=["market"])


@router.get("/search", response_model=list[SearchResult])
def search(
    q: str = Query(..., min_length=1),
    _: User = Depends(get_current_user),
):
    rows = market_service.search_symbols(q)
    return [SearchResult(**r) for r in rows]


@router.get("/quote/{ticker}", response_model=QuoteOut)
def quote(ticker: str, _: User = Depends(get_current_user)):
    try:
        data = market_service.get_quote(ticker)
    except ValueError as e:
        from fastapi import HTTPException

        raise HTTPException(status_code=404, detail=str(e))
    return QuoteOut(
        ticker=data["ticker"],
        price=data["price"],
        currency=data["currency"],
        name=data.get("name"),
    )


@router.get("/chart/{ticker}", response_model=list[ChartBar])
def chart(
    ticker: str,
    period: str = Query("3mo", description="1d,5d,1mo,3mo,6mo,1y,2y,5y"),
    _: User = Depends(get_current_user),
):
    allowed = {"1d", "5d", "1mo", "3mo", "6mo", "1y", "2y", "5y"}
    if period not in allowed:
        period = "3mo"
    bars = market_service.get_ohlcv(ticker, period=period)
    return [ChartBar(**b) for b in bars]
