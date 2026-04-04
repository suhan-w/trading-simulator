from fastapi import APIRouter, Depends, HTTPException

from app.deps import get_current_user
from app.models import User
from app.schemas import QuoteOut
from app.services import market_service

router = APIRouter(prefix="/api/market", tags=["market"])


@router.get("/quote/{ticker}", response_model=QuoteOut)
def quote(ticker: str, _: User = Depends(get_current_user)):
    try:
        data = market_service.get_quote(ticker)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    return QuoteOut(
        ticker=data["ticker"],
        price=data["price"],
        currency=data["currency"],
        name=data.get("name"),
    )
