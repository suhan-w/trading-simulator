"""ASX 200 spot from Yahoo Finance chart API (^AXJO). No API key."""

from __future__ import annotations

from typing import Any

import httpx

_YAHOO_CHART = "https://query1.finance.yahoo.com/v8/finance/chart/%5EAXJO"
_HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; CowrieShell/1.0; +https://github.com/)",
    "Accept": "application/json",
}


def fetch_asx200_yahoo() -> dict[str, Any]:
    """Latest index level and daily % change vs previous close."""
    params = {"interval": "1d", "range": "5d"}
    with httpx.Client(timeout=15.0, headers=_HEADERS) as client:
        r = client.get(_YAHOO_CHART, params=params)
        r.raise_for_status()
        payload = r.json()

    chart = payload.get("chart") or {}
    results = chart.get("result")
    if not results or not isinstance(results, list):
        raise ValueError("Unexpected Yahoo chart response")

    meta = results[0].get("meta") or {}
    price = meta.get("regularMarketPrice")
    prev = meta.get("chartPreviousClose") or meta.get("previousClose")

    if price is None:
        raise ValueError("No ASX 200 price in Yahoo response")

    price_f = float(price)
    change_pct: float | None = None
    if prev is not None and float(prev) > 0:
        change_pct = round((price_f - float(prev)) / float(prev) * 100, 3)

    return {
        "symbol": "^AXJO",
        "value": round(price_f, 2),
        "change_pct": change_pct,
        "source": "yahoo",
    }
