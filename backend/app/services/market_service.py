"""ASX market data via Alpha Vantage (user-supplied API key)."""

from __future__ import annotations

from datetime import date
from typing import Any

from app.services import alpha_vantage

# SPDR S&P/ASX 200 Fund — liquid proxy for ASX 200 benchmark on Alpha Vantage (^AXJO not used on AV).
BENCHMARK_SYMBOL_AV = "STW.AX"
BENCHMARK_LABEL = "S&P/ASX 200 proxy (STW ETF)"


def normalize_ticker(ticker: str) -> str:
    """ASX listings use .AX (e.g. BHP.AX). Legacy Yahoo-style ^AXJO maps to STW.AX for benchmarks."""
    t = ticker.strip().upper()
    if not t:
        return t
    if t in ("^AXJO", "AXJO"):
        return BENCHMARK_SYMBOL_AV
    if t.startswith("^"):
        return t
    if t.endswith(".AX"):
        return t
    if "." in t:
        return t
    return f"{t}.AX"


def to_alpha_vantage_symbol(normalized: str) -> str:
    """Resolve symbol for Alpha Vantage GLOBAL_QUOTE / time series."""
    if normalized.startswith("^"):
        raise ValueError(
            f"Index symbol {normalized} is not supported. Use ASX tickers with .AX "
            f"(benchmark in reports uses {BENCHMARK_SYMBOL_AV})."
        )
    return normalized


def get_quote(ticker: str, api_key: str) -> dict[str, Any]:
    t = normalize_ticker(ticker)
    sym = to_alpha_vantage_symbol(t)
    q = alpha_vantage.global_quote(api_key, sym)
    return {
        "ticker": sym,
        "price": q["price"],
        "name": q.get("name"),
        "currency": "AUD",
    }


def _series_in_range(
    series: dict[str, float],
    start: date,
    end: date,
) -> list[tuple[str, float]]:
    """Sorted (date_str, close) where start <= date <= end."""
    start_s = start.isoformat()
    end_s = end.isoformat()
    rows: list[tuple[str, float]] = []
    for d, close in series.items():
        if start_s <= d <= end_s:
            rows.append((d, close))
    rows.sort(key=lambda x: x[0])
    return rows


def daily_series_for_symbol(ticker: str, api_key: str) -> dict[str, float]:
    """Full adjusted-close map (one API call). Ticker normalized to .AX / benchmark proxy."""
    sym = normalize_ticker(ticker)
    if sym.startswith("^"):
        sym = BENCHMARK_SYMBOL_AV
    return alpha_vantage.daily_adjusted_close_series(api_key, sym)


def return_pct_from_series(series: dict[str, float], start: date, end: date) -> float | None:
    rows = _series_in_range(series, start, end)
    if len(rows) < 2:
        return None
    first = rows[0][1]
    last = rows[-1][1]
    if first <= 0:
        return None
    return round((last / first - 1) * 100, 3)


def closes_daily_from_series(series: dict[str, float], start: date, end: date) -> list[dict[str, Any]]:
    return [{"date": d, "close": c} for d, c in _series_in_range(series, start, end)]
