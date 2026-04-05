"""Alpha Vantage HTTP client with per-key throttling (free tier: 5 calls/minute)."""

from __future__ import annotations

import hashlib
import threading
import time
from typing import Any

import httpx

from app.config import settings

_BASE_URL = "https://www.alphavantage.co/query"

_lock = threading.Lock()
_last_call_monotonic: dict[str, float] = {}


def _throttle(api_key: str) -> None:
    key_hash = hashlib.sha256(api_key.encode("utf-8")).hexdigest()[:24]
    interval = max(0.0, float(settings.alpha_vantage_min_interval_sec))
    if interval <= 0:
        return
    with _lock:
        now = time.monotonic()
        last = _last_call_monotonic.get(key_hash, 0.0)
        wait = last + interval - now
        if wait > 0:
            time.sleep(wait)
            now = time.monotonic()
        _last_call_monotonic[key_hash] = now


def query(api_key: str, params: dict[str, str]) -> dict[str, Any]:
    """GET query; raises ValueError on API errors, rate hints, or empty payload."""
    _throttle(api_key)
    q = {**params, "apikey": api_key}
    with httpx.Client(timeout=60.0) as client:
        r = client.get(_BASE_URL, params=q)
        r.raise_for_status()
        data = r.json()

    if not isinstance(data, dict):
        raise ValueError("Unexpected Alpha Vantage response")

    if data.get("Error Message"):
        raise ValueError(str(data["Error Message"]))
    if data.get("Note"):
        raise ValueError(
            "Alpha Vantage rate limit or throttling. Wait a minute and try again, "
            "or increase your plan. Details: " + str(data["Note"])[:200]
        )
    if data.get("Information"):
        raise ValueError(str(data["Information"])[:300])

    return data


def _latest_close_daily_compact(api_key: str, symbol: str) -> tuple[float, str]:
    """Latest trading-day close from TIME_SERIES_DAILY (compact). Extra API call."""
    data = query(
        api_key,
        {"function": "TIME_SERIES_DAILY", "symbol": symbol, "outputsize": "compact"},
    )
    series = data.get("Time Series (Daily)") or {}
    if not series:
        raise ValueError(
            f"No daily prices for {symbol}. Check the symbol (ASX: e.g. BHP.AX) and your API key."
        )
    latest_date = max(series.keys())
    row = series[latest_date]
    if not isinstance(row, dict):
        raise ValueError(f"Incomplete daily row for {symbol}")
    raw = row.get("4. close")
    if raw is None:
        raise ValueError(f"Incomplete quote for {symbol}")
    return float(raw), str(latest_date)


def _latest_close_adjusted_compact(api_key: str, symbol: str) -> tuple[float, str]:
    """Latest close from TIME_SERIES_DAILY_ADJUSTED (compact). Sometimes succeeds when plain DAILY is empty."""
    data = query(
        api_key,
        {
            "function": "TIME_SERIES_DAILY_ADJUSTED",
            "symbol": symbol,
            "outputsize": "compact",
        },
    )
    series = data.get("Time Series (Daily)") or {}
    if not series:
        raise ValueError(
            f"No adjusted daily prices for {symbol}. Check the symbol (ASX: e.g. BHP.AX) and your API key."
        )
    latest_date = max(series.keys())
    row = series[latest_date]
    if not isinstance(row, dict):
        raise ValueError(f"Incomplete adjusted daily row for {symbol}")
    raw = row.get("5. adjusted close") or row.get("4. close")
    if raw is None:
        raise ValueError(f"Incomplete adjusted quote for {symbol}")
    return float(raw), str(latest_date)


def _recoverable_empty_series_error(message: str, symbol: str) -> bool:
    """True only for “no data in series” errors — not rate limits, bad keys, or API errors."""
    m = message
    return (
        m.startswith(f"No daily prices for {symbol}")
        or m.startswith(f"No adjusted daily prices for {symbol}")
        or m.startswith(f"Incomplete daily row for {symbol}")
        or m.startswith(f"Incomplete quote for {symbol}")
        or m.startswith(f"Incomplete adjusted daily row for {symbol}")
        or m.startswith(f"Incomplete adjusted quote for {symbol}")
    )


def global_quote(api_key: str, symbol: str) -> dict[str, Any]:
    """Latest tradable price.

    Try TIME_SERIES_DAILY (compact), then DAILY_ADJUSTED (compact), then GLOBAL_QUOTE.
    ASX ``.AX`` symbols often have empty GLOBAL_QUOTE; plain DAILY can also be empty while ADJUSTED works.
    """
    for fetch in (_latest_close_daily_compact, _latest_close_adjusted_compact):
        try:
            price, _latest = fetch(api_key, symbol)
            return {"symbol": symbol, "price": price, "name": symbol}
        except ValueError as e:
            if not _recoverable_empty_series_error(str(e), symbol):
                raise

    data = query(api_key, {"function": "GLOBAL_QUOTE", "symbol": symbol})
    gq = data.get("Global Quote") or {}
    raw_price = gq.get("05. price") if isinstance(gq, dict) else None
    if raw_price is None:
        raise ValueError(
            f"No quote returned for {symbol}. Alpha Vantage free tier is unreliable for some ASX symbols; "
            "confirm your key at alphavantage.co, try BHP.AX, and wait ~1 minute between bursts of requests."
        )
    price = float(raw_price)
    name = gq.get("01. symbol") or symbol
    return {"symbol": symbol, "price": price, "name": name}


def compact_daily_closes(api_key: str, symbol: str) -> list[tuple[str, float]]:
    """TIME_SERIES_DAILY compact: ~100 trading days, oldest-first (date, close)."""
    data = query(
        api_key,
        {"function": "TIME_SERIES_DAILY", "symbol": symbol, "outputsize": "compact"},
    )
    series = data.get("Time Series (Daily)") or {}
    rows: list[tuple[str, float]] = []
    for date_str in sorted(series.keys()):
        row = series[date_str]
        if not isinstance(row, dict):
            continue
        raw = row.get("4. close")
        if raw is None:
            continue
        try:
            rows.append((str(date_str), float(raw)))
        except (TypeError, ValueError):
            continue
    return rows


def daily_adjusted_close_series(api_key: str, symbol: str) -> dict[str, float]:
    """Full daily series: date (YYYY-MM-DD) -> adjusted close."""
    data = query(
        api_key,
        {
            "function": "TIME_SERIES_DAILY_ADJUSTED",
            "symbol": symbol,
            "outputsize": "full",
        },
    )
    series = data.get("Time Series (Daily)") or {}
    if not series:
        raise ValueError(f"No daily time series for {symbol}")
    out: dict[str, float] = {}
    for date_str, row in series.items():
        if not isinstance(row, dict):
            continue
        adj = row.get("5. adjusted close") or row.get("4. close")
        if adj is None:
            continue
        try:
            out[str(date_str)] = float(adj)
        except (TypeError, ValueError):
            continue
    if len(out) < 2:
        raise ValueError(f"Insufficient history for {symbol}")
    return out
