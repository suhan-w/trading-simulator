"""ASX market data via Alpha Vantage (user-supplied API key, EOD cached)."""

from __future__ import annotations

from datetime import date
from typing import Any

from sqlalchemy.orm import Session

from app.models import User
from app.services import av_cache_service

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


def get_eod_quote(db: Session, user: User, ticker: str) -> dict[str, Any]:
    """Latest daily close from DB cache or Alpha Vantage (counts toward daily limit)."""
    return av_cache_service.get_eod_quote_dict(db, user, ticker)


def close_series_latest_cached(db: Session, ticker: str) -> dict[str, float] | None:
    """Adjusted-close map from latest cache row, or None. No network."""
    bars = av_cache_service.get_bars_latest_cached(db, ticker)
    if not bars:
        return None
    return av_cache_service.bars_to_close_map(bars)


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


def daily_series_for_symbol_cached(db: Session, ticker: str) -> dict[str, float] | None:
    """Full close map from latest DB cache. No API call."""
    sym = normalize_ticker(ticker)
    if sym.startswith("^"):
        sym = BENCHMARK_SYMBOL_AV
    return close_series_latest_cached(db, sym)


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
