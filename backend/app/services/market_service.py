"""Yahoo Finance helpers for ASX (.AX) quotes and OHLCV (benchmarks, reports)."""

from datetime import date, datetime
from typing import Any

import yfinance as yf


def normalize_ticker(ticker: str) -> str:
    """ASX symbols on Yahoo Finance use a .AX suffix (e.g. BHP.AX, CBA.AX). Index symbols (e.g. ^AXJO) unchanged."""
    t = ticker.strip().upper()
    if not t:
        return t
    if t.startswith("^"):
        return t
    if t.endswith(".AX"):
        return t
    if "." in t:
        return t
    return f"{t}.AX"


def get_quote(ticker: str) -> dict[str, Any]:
    t = normalize_ticker(ticker)
    stock = yf.Ticker(t)
    info = stock.info or {}
    price = info.get("regularMarketPrice") or info.get("currentPrice") or info.get(
        "previousClose"
    )
    if price is None:
        hist = stock.history(period="5d")
        if hist is not None and not hist.empty:
            price = float(hist["Close"].iloc[-1])
    if price is None:
        raise ValueError(f"Could not fetch price for {t}")
    name = info.get("shortName") or info.get("longName")
    currency = info.get("currency") or "AUD"
    return {
        "ticker": t,
        "price": float(price),
        "name": name,
        "currency": currency,
    }


def get_ohlcv(ticker: str, period: str = "3mo") -> list[dict[str, Any]]:
    t = normalize_ticker(ticker) if not ticker.startswith("^") else ticker
    stock = yf.Ticker(t)
    if period == "1w":
        hist = stock.history(period="5d", interval="1d")
    elif period == "1m":
        hist = stock.history(period="1mo", interval="1d")
    elif period == "3m":
        hist = stock.history(period="3mo", interval="1d")
    elif period == "1y":
        hist = stock.history(period="1y", interval="1d")
    elif period == "1d":
        hist = stock.history(period="1d", interval="5m")
    elif period == "5d":
        hist = stock.history(period="5d", interval="15m")
    else:
        hist = stock.history(period=period, interval="1d")
    if hist is None or hist.empty:
        return []
    out = []
    for idx, row in hist.iterrows():
        ts = idx
        if hasattr(ts, "hour"):
            time_str = ts.strftime("%Y-%m-%dT%H:%M:%S")
        elif hasattr(ts, "strftime"):
            time_str = ts.strftime("%Y-%m-%d")
        else:
            time_str = str(ts)[:10]
        out.append(
            {
                "time": time_str,
                "open": float(row["Open"]),
                "high": float(row["High"]),
                "low": float(row["Low"]),
                "close": float(row["Close"]),
                "volume": float(row["Volume"]),
            }
        )
    return out


def benchmark_closes_daily(symbol: str, start: date, end: date) -> list[dict[str, Any]]:
    """Daily adjusted close for benchmark index (e.g. ^AXJO), sorted by date."""
    stock = yf.Ticker(symbol)
    hist = stock.history(start=start.isoformat(), end=(end.isoformat()), interval="1d", auto_adjust=True)
    if hist is None or hist.empty:
        return []
    rows = []
    for idx, row in hist.iterrows():
        d = idx.strftime("%Y-%m-%d") if hasattr(idx, "strftime") else str(idx)[:10]
        rows.append({"date": d, "close": float(row["Close"])})
    return rows


def ticker_return_over_range(ticker: str, start: date, end: date) -> float | None:
    """Total return % from first to last close in range (calendar)."""
    t = normalize_ticker(ticker)
    stock = yf.Ticker(t)
    hist = stock.history(start=start.isoformat(), end=end.isoformat(), interval="1d", auto_adjust=True)
    if hist is None or hist.empty or len(hist) < 2:
        return None
    first = float(hist["Close"].iloc[0])
    last = float(hist["Close"].iloc[-1])
    if first <= 0:
        return None
    return round((last / first - 1) * 100, 3)
