from datetime import datetime, time
from typing import Any, Optional
from zoneinfo import ZoneInfo

import yfinance as yf

SYDNEY_TZ = ZoneInfo("Australia/Sydney")
ASX_HOURS_NOTE = (
    "ASX regular session: Monday to Friday, 10:00am–4:00pm Sydney time (Australia/Sydney)."
)


def normalize_ticker(ticker: str) -> str:
    """ASX symbols on Yahoo Finance use a .AX suffix (e.g. BHP.AX, CBA.AX)."""
    t = ticker.strip().upper()
    if not t:
        return t
    if t.endswith(".AX"):
        return t
    if "." in t:
        return t
    return f"{t}.AX"


def asx_regular_session_open(at: datetime | None = None) -> bool:
    """True during ASX cash session weekdays 10:00–16:00 Sydney (half-open end)."""
    now = at or datetime.now(SYDNEY_TZ)
    if now.tzinfo is None:
        now = now.replace(tzinfo=SYDNEY_TZ)
    else:
        now = now.astimezone(SYDNEY_TZ)
    if now.weekday() >= 5:
        return False
    hm = now.time()
    return time(10, 0) <= hm < time(16, 0)


def asx_session_payload() -> dict[str, Any]:
    now = datetime.now(SYDNEY_TZ)
    return {
        "open": asx_regular_session_open(now),
        "hours_note": ASX_HOURS_NOTE,
        "sydney_time": now.isoformat(),
    }


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


def _is_asx_listing(item: dict) -> bool:
    sym = str(item.get("symbol") or "").upper()
    if sym.endswith(".AX"):
        return True
    ex = str(item.get("exchange") or "").upper()
    return ex in ("ASX", "CXA")


def search_symbols(query: str, limit: int = 15) -> list[dict[str, Optional[str]]]:
    q = query.strip()
    if not q:
        return []
    results: list[dict[str, Optional[str]]] = []
    try:
        search = yf.Search(q)
        quotes = getattr(search, "quotes", None) or []
        asx_only: list[dict[str, Optional[str]]] = []
        for item in quotes:
            sym = item.get("symbol")
            if not sym or not _is_asx_listing(item):
                continue
            asx_only.append(
                {
                    "ticker": str(sym).upper(),
                    "name": item.get("shortname") or item.get("longname"),
                }
            )
            if len(asx_only) >= limit:
                break
        results = asx_only
    except Exception:
        pass
    if not results:
        try:
            t = normalize_ticker(q)
            stock = yf.Ticker(t)
            info = stock.info or {}
            if info.get("regularMarketPrice") or info.get("shortName") or info.get("longName"):
                results.append(
                    {
                        "ticker": t,
                        "name": info.get("shortName") or info.get("longName"),
                    }
                )
        except Exception:
            pass
    return results


def get_ohlcv(ticker: str, period: str = "3mo") -> list[dict[str, Any]]:
    t = normalize_ticker(ticker)
    stock = yf.Ticker(t)
    if period == "1d":
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
