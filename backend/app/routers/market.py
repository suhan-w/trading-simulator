from fastapi import APIRouter, Depends, HTTPException

from app.deps import get_current_user, require_alpha_vantage_api_key
from app.models import User
from app.schemas import MarketSessionOut, QuoteOut
from app.services import market_service
from app.services.melbourne_asx import build_market_session_payload

router = APIRouter(prefix="/api/market", tags=["market"])


@router.get("/session", response_model=MarketSessionOut)
def market_session(_: User = Depends(get_current_user)):
    return MarketSessionOut(**build_market_session_payload())


@router.get("/quote/{ticker}", response_model=QuoteOut)
def quote(ticker: str, user: User = Depends(get_current_user)):
    api_key = require_alpha_vantage_api_key(user)
    try:
        data = market_service.get_quote(ticker, api_key)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    return QuoteOut(
        ticker=data["ticker"],
        price=data["price"],
        currency=data["currency"],
        name=data.get("name"),
    )
