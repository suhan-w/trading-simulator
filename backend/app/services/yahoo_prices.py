"""Daily OHLCV fallback from Yahoo Finance chart API (no API key)."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import httpx

_HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; CowrieShell/1.0; +https://github.com/)",
    "Accept": "application/json",
}


def fetch_daily_ohlcv(symbol: str) -> dict[str, dict[str, float]]:
    """Return daily bars keyed by YYYY-MM-DD for symbol (e.g. BHP.AX)."""
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}"
    params = {"interval": "1d", "range": "2y", "events": "div,splits"}
    with httpx.Client(timeout=20.0, headers=_HEADERS) as client:
        r = client.get(url, params=params)
        r.raise_for_status()
        payload = r.json()

    chart = payload.get("chart") or {}
    results = chart.get("result")
    if not results or not isinstance(results, list):
        raise ValueError(f"Unexpected Yahoo chart response for {symbol}")

    result = results[0] or {}
    ts = result.get("timestamp") or []
    indicators = result.get("indicators") or {}
    quote_list = indicators.get("quote") or []
    quote = quote_list[0] if quote_list and isinstance(quote_list[0], dict) else {}

    opens = quote.get("open") or []
    highs = quote.get("high") or []
    lows = quote.get("low") or []
    closes = quote.get("close") or []
    volumes = quote.get("volume") or []

    n = min(len(ts), len(opens), len(highs), len(lows), len(closes), len(volumes))
    out: dict[str, dict[str, float]] = {}
    for i in range(n):
        try:
            t = int(ts[i])
            o = float(opens[i])
            h = float(highs[i])
            l = float(lows[i])
            c = float(closes[i])
            v = float(volumes[i] or 0)
        except (TypeError, ValueError):
            continue
        d = datetime.fromtimestamp(t, tz=timezone.utc).date().isoformat()
        out[d] = {"open": o, "high": h, "low": l, "close": c, "volume": v}

    if len(out) < 2:
        raise ValueError(f"No Yahoo EOD history returned for {symbol}")
    return out
