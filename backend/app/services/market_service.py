from typing import Any, Optional

import yfinance as yf


def normalize_ticker(ticker: str) -> str:
    return ticker.strip().upper()


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
    currency = info.get("currency") or "USD"
    return {
        "ticker": t,
        "price": float(price),
        "name": name,
        "currency": currency,
    }


def search_symbols(query: str, limit: int = 15) -> list[dict[str, Optional[str]]]:
    q = query.strip()
    if not q:
        return []
    results: list[dict[str, Optional[str]]] = []
    try:
        search = yf.Search(q)
        quotes = getattr(search, "quotes", None) or []
        for item in quotes[:limit]:
            sym = item.get("symbol")
            if sym:
                results.append(
                    {
                        "ticker": str(sym).upper(),
                        "name": item.get("shortname") or item.get("longname"),
                    }
                )
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
