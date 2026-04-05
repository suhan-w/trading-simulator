from fastapi import APIRouter, Depends, HTTPException

from app.deps import get_current_user, require_alpha_vantage_api_key
from app.models import User
from app.schemas import Asx200IndexOut, MarketSessionOut, QuoteOut
from app.services import market_service
from app.services.asx200_index import fetch_asx200_yahoo
from app.services.melbourne_asx import build_market_session_payload

router = APIRouter(prefix="/api/market", tags=["market"])


@router.get("/session", response_model=MarketSessionOut)
def market_session(_: User = Depends(get_current_user)):
    return MarketSessionOut(**build_market_session_payload())


@router.get("/asx200-index", response_model=Asx200IndexOut)
def asx200_index(_: User = Depends(get_current_user)):
    try:
        raw = fetch_asx200_yahoo()
    except Exception as e:
        raise HTTPException(
            status_code=503,
            detail="ASX 200 index temporarily unavailable.",
        ) from e
    return Asx200IndexOut(**raw)


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
