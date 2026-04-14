"""Alpha Vantage EOD OHLCV: DB cache per symbol per UTC day + daily request budget (25/day free tier)."""

from __future__ import annotations

import json
from datetime import date, datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from app.config import settings
from app.models import AvDailyUsage, AvEodCache, User
from app.services import alpha_vantage, market_service, yahoo_prices


def _utc_today() -> date:
    return datetime.now(timezone.utc).date()


def parse_daily_ohlcv(av_payload: dict[str, Any]) -> dict[str, dict[str, float]]:
    """Parse TIME_SERIES_DAILY or TIME_SERIES_DAILY_ADJUSTED (same Time Series key, different row fields)."""
    series = av_payload.get("Time Series (Daily)") or {}
    out: dict[str, dict[str, float]] = {}
    for d, row in series.items():
        if not isinstance(row, dict):
            continue
        try:
            open_ = float(row["1. open"])
            high = float(row["2. high"])
            low = float(row["3. low"])
            close_raw = row.get("5. adjusted close") or row.get("4. close")
            if close_raw is None:
                continue
            close = float(close_raw)
            vol_raw = row.get("5. volume")
            if vol_raw is None:
                vol_raw = row.get("6. volume")
            volume = float(vol_raw or 0)
            out[str(d)] = {
                "open": open_,
                "high": high,
                "low": low,
                "close": close,
                "volume": volume,
            }
        except (KeyError, TypeError, ValueError):
            continue
    return out


def bars_to_close_map(bars: dict[str, dict[str, float]]) -> dict[str, float]:
    return {d: float(v["close"]) for d, v in bars.items()}


def last_close_from_bars(bars: dict[str, dict[str, float]]) -> tuple[float, str]:
    if not bars:
        raise ValueError("No EOD bars")
    latest = max(bars.keys())
    return float(bars[latest]["close"]), latest


def _resolve_av_symbol(ticker: str) -> str:
    t = market_service.normalize_ticker(ticker)
    return market_service.to_alpha_vantage_symbol(t)


def load_cache(db: Session, symbol: str, cache_date: date) -> dict[str, dict[str, float]] | None:
    row = (
        db.query(AvEodCache)
        .filter(AvEodCache.symbol == symbol, AvEodCache.cache_date == cache_date)
        .first()
    )
    if not row:
        return None
    try:
        data = json.loads(row.series_json)
        bars = data.get("bars")
        if not isinstance(bars, dict):
            return None
        out: dict[str, dict[str, float]] = {}
        for k, v in bars.items():
            if not isinstance(v, dict):
                continue
            out[str(k)] = {
                "open": float(v["open"]),
                "high": float(v["high"]),
                "low": float(v["low"]),
                "close": float(v["close"]),
                "volume": float(v.get("volume", 0)),
            }
        return out if len(out) >= 2 else None
    except (json.JSONDecodeError, TypeError, ValueError, KeyError):
        return None


def save_cache(db: Session, symbol: str, cache_date: date, bars: dict[str, dict[str, float]]) -> None:
    payload = json.dumps({"bars": bars})
    row = (
        db.query(AvEodCache)
        .filter(AvEodCache.symbol == symbol, AvEodCache.cache_date == cache_date)
        .first()
    )
    if row:
        row.series_json = payload
    else:
        db.add(AvEodCache(symbol=symbol, cache_date=cache_date, series_json=payload))


def get_usage_today(db: Session, user_id: int) -> int:
    """Return today's AV request count for user, or 0 if none / unreadable row / DB edge case."""
    try:
        d = _utc_today()
        row = (
            db.query(AvDailyUsage)
            .filter(AvDailyUsage.user_id == user_id, AvDailyUsage.usage_date == d)
            .first()
        )
        if not row:
            return 0
        rc = row.request_count
        if rc is None:
            return 0
        return int(rc)
    except Exception:
        return 0


def increment_usage(db: Session, user_id: int) -> int:
    d = _utc_today()
    row = (
        db.query(AvDailyUsage)
        .filter(AvDailyUsage.user_id == user_id, AvDailyUsage.usage_date == d)
        .first()
    )
    if row:
        base = int(row.request_count) if row.request_count is not None else 0
        row.request_count = base + 1
        return int(row.request_count)
    db.add(AvDailyUsage(user_id=user_id, usage_date=d, request_count=1))
    db.flush()
    return 1


def get_cached_ohlcv_today(db: Session, ticker: str) -> dict[str, dict[str, float]] | None:
    """EOD bars if this symbol was already fetched today (no network)."""
    sym = _resolve_av_symbol(ticker)
    return load_cache(db, sym, _utc_today())


def get_bars_latest_cached(db: Session, ticker: str) -> dict[str, dict[str, float]] | None:
    """Most recent cached EOD series for symbol (any fetch day). No API calls."""
    sym = _resolve_av_symbol(ticker)
    row = (
        db.query(AvEodCache)
        .filter(AvEodCache.symbol == sym)
        .order_by(AvEodCache.cache_date.desc())
        .first()
    )
    if not row:
        return None
    try:
        data = json.loads(row.series_json)
        bars = data.get("bars")
        if not isinstance(bars, dict):
            return None
        out: dict[str, dict[str, float]] = {}
        for k, v in bars.items():
            if not isinstance(v, dict):
                continue
            out[str(k)] = {
                "open": float(v["open"]),
                "high": float(v["high"]),
                "low": float(v["low"]),
                "close": float(v["close"]),
                "volume": float(v.get("volume", 0)),
            }
        return out if len(out) >= 2 else None
    except (json.JSONDecodeError, TypeError, ValueError, KeyError):
        return None


def get_or_fetch_ohlcv(
    db: Session,
    user: User,
    ticker: str,
) -> tuple[dict[str, dict[str, float]], bool]:
    """Return (bars_by_date_str, from_cache). Fetches from Alpha Vantage if not cached today (1–2 HTTP calls if plain daily is empty); increments usage per request."""
    api_key = (user.alpha_vantage_api_key or "").strip()
    if not api_key:
        raise ValueError("Add your Alpha Vantage API key in Account settings.")

    sym = _resolve_av_symbol(ticker)
    day = _utc_today()

    cached = load_cache(db, sym, day)
    if cached is not None:
        return cached, True

    limit = settings.alpha_vantage_daily_request_limit
    if get_usage_today(db, user.id) >= limit:
        raise ValueError(
            f"Daily Alpha Vantage limit reached ({limit} requests). "
            "Try again tomorrow, or use symbols already cached today."
        )

    used_before = get_usage_today(db, user.id)

    data = alpha_vantage.query(
        api_key,
        {"function": "TIME_SERIES_DAILY", "symbol": sym, "outputsize": "full"},
    )
    bars = parse_daily_ohlcv(data)
    api_calls = 1

    # Free tier often returns an empty plain daily series for ASX while ADJUSTED still has data
    # (same pattern as global_quote in alpha_vantage.py).
    if len(bars) < 2:
        if used_before + 1 >= limit:
            raise ValueError(
                f"No EOD history returned for {sym} on the first request, and the daily "
                f"Alpha Vantage limit ({limit}) does not allow a second request for adjusted prices. "
                "Try again tomorrow."
            )
        data_adj = alpha_vantage.query(
            api_key,
            {
                "function": "TIME_SERIES_DAILY_ADJUSTED",
                "symbol": sym,
                "outputsize": "full",
            },
        )
        bars = parse_daily_ohlcv(data_adj)
        api_calls = 2

    if len(bars) < 2:
        try:
            bars = yahoo_prices.fetch_daily_ohlcv(sym)
        except Exception:
            raise ValueError(
                f"No EOD history returned for {sym}. "
                "Alpha Vantage returned fewer than two daily bars and Yahoo fallback also failed. "
                "Common causes: invalid/expired API key, API throttling, or symbol data not available."
            )

    save_cache(db, sym, day, bars)
    for _ in range(api_calls):
        increment_usage(db, user.id)
    return bars, False


def get_eod_quote_dict(db: Session, user: User, ticker: str) -> dict[str, Any]:
    """Latest EOD close. Prefer any cached daily series for this symbol (no network, no AV throttle)."""
    sym = _resolve_av_symbol(ticker)
    cached_bars = get_bars_latest_cached(db, ticker)
    if cached_bars and len(cached_bars) >= 2:
        price, as_of = last_close_from_bars(cached_bars)
        return {
            "ticker": sym,
            "price": price,
            "currency": "AUD",
            "name": sym,
            "as_of_date": as_of,
            "delayed_eod": True,
        }
    bars, _from_cache = get_or_fetch_ohlcv(db, user, ticker)
    price, as_of = last_close_from_bars(bars)
    return {
        "ticker": sym,
        "price": price,
        "currency": "AUD",
        "name": sym,
        "as_of_date": as_of,
        "delayed_eod": True,
    }
