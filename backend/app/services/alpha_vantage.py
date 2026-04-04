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


def global_quote(api_key: str, symbol: str) -> dict[str, Any]:
    data = query(api_key, {"function": "GLOBAL_QUOTE", "symbol": symbol})
    gq = data.get("Global Quote") or {}
    if not gq:
        raise ValueError(f"No quote returned for {symbol}. Check the symbol (ASX: e.g. BHP.AX).")
    raw_price = gq.get("05. price")
    if raw_price is None:
        raise ValueError(f"Incomplete quote for {symbol}")
    price = float(raw_price)
    name = gq.get("01. symbol") or symbol
    return {"symbol": symbol, "price": price, "name": name}


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
