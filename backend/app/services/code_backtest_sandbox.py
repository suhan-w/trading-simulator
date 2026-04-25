"""Sandboxed execution of user Python for EOD backtests (yfinance + pandas + numpy + matplotlib only)."""

from __future__ import annotations

import ast
import math
import multiprocessing
import queue
import traceback
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutureTimeout
from datetime import date, timedelta
from typing import Any

import numpy as np
import pandas as pd

ALLOWED_IMPORT_ROOTS = frozenset({"yfinance", "pandas", "numpy", "matplotlib"})
MAX_CODE_CHARS = 100_000
BACKTEST_TIMEOUT_SEC = 55
# yfinance can block indefinitely; run in a thread with a hard cap (main process, before the sandbox).
YFIN_FETCH_TIMEOUT_SEC = 50
BENCHMARK_SYMBOL = "^AXJO"


def _validate_ast_only_imports_allowed(source: str) -> None:
    try:
        tree = ast.parse(source)
    except SyntaxError as e:
        raise ValueError(f"Syntax error: {e}") from e

    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                root = (alias.name or "").split(".")[0]
                if root not in ALLOWED_IMPORT_ROOTS:
                    raise ValueError(
                        f"Import not allowed: {alias.name!r}. "
                        f"Only {', '.join(sorted(ALLOWED_IMPORT_ROOTS))} are permitted."
                    )
        elif isinstance(node, ast.ImportFrom):
            mod = node.module or ""
            if node.level and node.level > 0:
                raise ValueError("Relative imports are not allowed.")
            root = mod.split(".")[0] if mod else ""
            if root and root not in ALLOWED_IMPORT_ROOTS:
                raise ValueError(
                    f"Import not allowed: from {mod!r}. "
                    f"Only {', '.join(sorted(ALLOWED_IMPORT_ROOTS))} are permitted."
                )
        elif isinstance(node, ast.Call):
            if isinstance(node.func, ast.Name) and node.func.id in ("__import__", "eval", "exec", "compile"):
                raise ValueError(f"Call to built-in {node.func.id!r} is not allowed.")
            if isinstance(node.func, ast.Attribute) and node.func.attr in ("import_module",):
                raise ValueError("import_module is not allowed.")


def _safe_builtins() -> dict[str, Any]:
    b: dict[str, Any] = {
        "True": True,
        "False": False,
        "None": None,
        "abs": abs,
        "all": all,
        "any": any,
        "bool": bool,
        "dict": dict,
        "enumerate": enumerate,
        "filter": filter,
        "float": float,
        "format": format,
        "frozenset": frozenset,
        "int": int,
        "isinstance": isinstance,
        "issubclass": issubclass,
        "iter": iter,
        "len": len,
        "list": list,
        "map": map,
        "max": max,
        "min": min,
        "next": next,
        "pow": pow,
        "print": lambda *a, **k: None,
        "range": range,
        "repr": repr,
        "reversed": reversed,
        "round": round,
        "set": set,
        "slice": slice,
        "sorted": sorted,
        "str": str,
        "sum": sum,
        "tuple": tuple,
        "type": type,
        "zip": zip,
        "Exception": Exception,
        "ValueError": ValueError,
        "KeyError": KeyError,
        "TypeError": TypeError,
        "ZeroDivisionError": ZeroDivisionError,
        "ArithmeticError": ArithmeticError,
        "RuntimeError": RuntimeError,
    }
    return {"__builtins__": b}


def _df_to_records(df: pd.DataFrame) -> list[dict[str, Any]]:
    out = df.reset_index()
    date_col = out.columns[0]
    rows: list[dict[str, Any]] = []
    for _, row in out.iterrows():
        d = pd.Timestamp(row[date_col]).strftime("%Y-%m-%d")
        rows.append(
            {
                "Date": d,
                "Open": float(row["Open"]),
                "High": float(row["High"]),
                "Low": float(row["Low"]),
                "Close": float(row["Close"]),
                "Volume": float(row.get("Volume", 0) or 0),
            }
        )
    return rows


def _records_to_df(records: list[dict[str, Any]]) -> pd.DataFrame:
    df = pd.DataFrame(records)
    if df.empty:
        return pd.DataFrame()
    df["Date"] = pd.to_datetime(df["Date"])
    return df.set_index("Date").sort_index()


def _ensure_ohlcv(df: pd.DataFrame) -> pd.DataFrame:
    col = {str(c).lower(): c for c in df.columns}

    def pick(name: str) -> pd.Series:
        if name not in col:
            raise ValueError(f"Missing column {name!r} in price data.")
        return df[col[name]].astype(float)

    try:
        vol = pick("volume")
    except ValueError:
        vol = pd.Series(0.0, index=df.index, dtype=float)
    return pd.DataFrame(
        {
            "Open": pick("open"),
            "High": pick("high"),
            "Low": pick("low"),
            "Close": pick("close"),
            "Volume": vol,
        },
        index=df.index,
    )


def _fetch_yfinance_pair_impl(
    symbol: str,
    start: date,
    end: date,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    import yfinance as yf

    end_ex = end + timedelta(days=1)
    t_sym = yf.Ticker(symbol)
    t_bench = yf.Ticker(BENCHMARK_SYMBOL)
    p = t_sym.history(start=start.isoformat(), end=end_ex.isoformat(), auto_adjust=True)
    b = t_bench.history(start=start.isoformat(), end=end_ex.isoformat(), auto_adjust=True)
    if p is None or p.empty:
        raise ValueError(f"No price history for {symbol!r} in this date range.")
    if b is None or b.empty:
        raise ValueError("Could not load ASX 200 benchmark (^AXJO). Try a different date range.")
    return _ensure_ohlcv(p), _ensure_ohlcv(b)


def fetch_yfinance_pair(
    symbol: str,
    start: date,
    end: date,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    ex: ThreadPoolExecutor = ThreadPoolExecutor(max_workers=1)
    try:
        fut = ex.submit(_fetch_yfinance_pair_impl, symbol, start, end)
        try:
            return fut.result(timeout=YFIN_FETCH_TIMEOUT_SEC)
        except FutureTimeout:
            raise ValueError(
                f"Loading market data timed out after {YFIN_FETCH_TIMEOUT_SEC}s. "
                "Check your network, or try a shorter date range."
            ) from None
    finally:
        ex.shutdown(wait=False, cancel_futures=True)


def _normalize_user_result(
    raw: Any,
    bench_close: pd.Series,
    price_close: pd.Series,
) -> dict[str, Any]:
    if not isinstance(raw, dict):
        raise TypeError("run(data) must return a dict.")

    dates = raw.get("dates")
    equity = raw.get("equity")
    if dates is None or equity is None:
        raise ValueError("Return dict must include 'dates' and 'equity'.")

    if hasattr(dates, "strftime"):
        dlist = [pd.Timestamp(x).strftime("%Y-%m-%d") for x in dates]
    else:
        dlist = [str(pd.Timestamp(x))[:10] for x in list(dates)]

    eq = np.array([float(x) for x in list(equity)], dtype=float)
    n = min(len(dlist), len(eq))
    if n < 5:
        raise ValueError("Need at least 5 aligned dates and equity points.")
    dlist = dlist[:n]
    eq = eq[:n]

    idx = pd.to_datetime(dlist)
    bench_aligned = bench_close.reindex(idx).ffill().bfill()
    price_aligned = price_close.reindex(idx).ffill().bfill()
    if bench_aligned.isna().all() or price_aligned.isna().all():
        raise ValueError("Could not align benchmark or price series to strategy dates.")

    bench_eq = (bench_aligned / float(bench_aligned.iloc[0])).values
    if raw.get("benchmark_equity") is not None:
        be = np.array([float(x) for x in list(raw["benchmark_equity"])], dtype=float)
        if len(be) >= n:
            bench_eq = be[:n]

    daily_ret: np.ndarray
    if raw.get("daily_returns") is not None:
        daily_ret = np.array([float(x) for x in list(raw["daily_returns"])], dtype=float)
        if len(daily_ret) == n:
            daily_ret = daily_ret[1:]
        elif len(daily_ret) != n - 1:
            daily_ret = np.diff(eq) / np.maximum(eq[:-1], 1e-12)
    else:
        daily_ret = np.diff(eq) / np.maximum(eq[:-1], 1e-12)

    bench_rets = np.diff(bench_eq) / np.maximum(bench_eq[:-1], 1e-12)
    m = min(len(daily_ret), len(bench_rets))
    daily_ret = daily_ret[:m]
    bench_rets = bench_rets[:m]
    d_ret_dates = dlist[1 : 1 + m]

    trades_raw = raw.get("trades") or []
    trades: list[dict[str, Any]] = []
    if isinstance(trades_raw, list):
        for t in trades_raw:
            if not isinstance(t, dict):
                continue
            side = str(t.get("side", "")).lower()
            if side not in ("buy", "sell"):
                continue
            trades.append(
                {
                    "date": str(pd.Timestamp(t.get("date")))[:10],
                    "side": side,
                    "price": float(t.get("price", 0) or 0),
                }
            )

    closes = raw.get("close_prices")
    if closes is not None and len(list(closes)) >= n:
        close_arr = np.array([float(x) for x in list(closes)[:n]], dtype=float)
    else:
        close_arr = price_aligned.values.astype(float)[:n]

    return {
        "dates": dlist[:n],
        "equity": eq[:n].tolist(),
        "benchmark_equity": bench_eq[:n].tolist(),
        "daily_returns": daily_ret.tolist(),
        "daily_return_dates": d_ret_dates,
        "bench_rets_for_beta": bench_rets.tolist(),
        "close_prices": close_arr.tolist(),
        "trades": trades,
    }


def _max_drawdown_pct(equity: list[float]) -> float:
    if not equity:
        return 0.0
    peak = float(equity[0])
    worst = 0.0
    for x in equity:
        xf = float(x)
        peak = max(peak, xf)
        if peak > 1e-12:
            dd = (peak - xf) / peak * 100.0
            worst = max(worst, dd)
    return round(worst, 4)


def _sharpe_ratio(daily: list[float]) -> float | None:
    if len(daily) < 3:
        return None
    arr = np.array(daily, dtype=float)
    mu = float(np.mean(arr))
    sd = float(np.std(arr, ddof=1))
    if sd < 1e-12:
        return None
    return round((mu / sd) * math.sqrt(252.0), 4)


def _beta_alpha(daily_s: list[float], daily_b: list[float]) -> tuple[float | None, float | None]:
    if len(daily_s) < 5 or len(daily_b) < 5:
        return None, None
    s = np.array(daily_s, dtype=float)
    b = np.array(daily_b, dtype=float)
    m = min(len(s), len(b))
    s, b = s[:m], b[:m]
    var_b = float(np.var(b, ddof=1))
    if var_b < 1e-16:
        return None, None
    cov = float(np.cov(s, b, ddof=1)[0, 1])
    beta = cov / var_b
    alpha_daily = float(np.mean(s) - beta * np.mean(b))
    alpha_ann_pct = alpha_daily * 252.0 * 100.0
    return round(float(beta), 4), round(alpha_ann_pct, 4)


def _win_rate_from_trades(trades: list[dict[str, Any]]) -> tuple[float | None, int]:
    if not trades:
        return None, 0
    sorted_t = sorted(trades, key=lambda x: (x["date"], 0 if x["side"] == "buy" else 1))
    wins = 0
    losses = 0
    last_buy: float | None = None
    for t in sorted_t:
        if t["side"] == "buy":
            last_buy = t["price"]
        elif t["side"] == "sell" and last_buy is not None and last_buy > 0:
            if t["price"] > last_buy + 1e-9:
                wins += 1
            elif t["price"] < last_buy - 1e-9:
                losses += 1
            last_buy = None
    closed = wins + losses
    if closed == 0:
        return None, len(trades)
    return round(100.0 * wins / closed, 2), len(trades)


def _drawdown_series(equity: list[float], dates: list[str]) -> list[dict[str, Any]]:
    peak = float(equity[0])
    out: list[dict[str, Any]] = []
    for d, x in zip(dates, equity, strict=False):
        xf = float(x)
        peak = max(peak, xf)
        dd = (peak - xf) / peak * 100.0 if peak > 1e-12 else 0.0
        out.append({"date": d, "drawdown_pct": round(dd, 4)})
    return out


def _execute_user_code(
    code: str,
    records_price: list[dict[str, Any]],
    records_bench: list[dict[str, Any]],
    symbol: str,
) -> dict[str, Any]:
    import importlib

    import matplotlib

    matplotlib.use("Agg")
    plt = importlib.import_module("matplotlib.pyplot")
    yf = importlib.import_module("yfinance")

    _validate_ast_only_imports_allowed(code)

    price_df = _records_to_df(records_price)
    bench_df = _records_to_df(records_bench)
    if price_df.empty or bench_df.empty:
        raise ValueError("Empty market data after load.")

    common = price_df.index.intersection(bench_df.index)
    if len(common) < 5:
        raise ValueError("Not enough overlapping sessions between instrument and ^AXJO.")
    price_df = price_df.loc[common]
    bench_df = bench_df.loc[common]

    data = {
        "symbol": symbol,
        "price": price_df,
        "benchmark": bench_df,
    }

    g = _safe_builtins()
    g["pd"] = pd
    g["np"] = np
    g["yf"] = yf
    g["plt"] = plt
    g["data"] = data

    compiled = compile(code, "<strategy>", "exec")
    exec(compiled, g, g)
    run_fn = g.get("run")
    if not callable(run_fn):
        raise ValueError("Define a function run(data) that returns a result dict.")

    raw = run_fn(data)
    norm = _normalize_user_result(raw, bench_df["Close"], price_df["Close"])

    dates = norm["dates"]
    eq = norm["equity"]
    bench_eq = norm["benchmark_equity"]
    daily = norm["daily_returns"]
    d_daily = norm["daily_return_dates"]
    bench_rets = norm["bench_rets_for_beta"]
    trades = norm["trades"]
    closes = norm["close_prices"]

    total_return_pct = round((eq[-1] / max(eq[0], 1e-12) - 1.0) * 100.0, 4)
    bench_return_pct = round((bench_eq[-1] / max(bench_eq[0], 1e-12) - 1.0) * 100.0, 4)
    excess_pct = round(total_return_pct - bench_return_pct, 4)

    beta, alpha_ann = _beta_alpha(daily, bench_rets)
    sharpe = _sharpe_ratio(daily)
    max_dd = _max_drawdown_pct(eq)
    win_rate, trade_count = _win_rate_from_trades(trades)

    comparison = [
        {"date": d, "strategy": round(eq[i] / max(eq[0], 1e-12) * 100.0, 6), "benchmark": round(bench_eq[i] / max(bench_eq[0], 1e-12) * 100.0, 6)}
        for i, d in enumerate(dates)
    ]

    daily_bars = [
        {"date": d, "return": round(float(r) * 100.0, 6)}
        for d, r in zip(d_daily, daily, strict=False)
    ]

    drawdown = _drawdown_series(eq, dates)

    markers = [{"date": t["date"], "side": t["side"], "price": t["price"]} for t in trades]

    payload = {
        "metrics": {
            "total_return_pct": total_return_pct,
            "alpha_pct": excess_pct,
            "jensen_alpha_ann_pct": alpha_ann,
            "beta": beta,
            "benchmark_total_return_pct": bench_return_pct,
            "sharpe_ratio": sharpe,
            "max_drawdown_pct": max_dd,
            "win_rate_pct": win_rate,
            "trade_count": trade_count,
        },
        "series": {
            "comparison": comparison,
            "daily_returns": daily_bars,
            "drawdown": drawdown,
            "signals": {"dates": dates, "close": closes, "markers": markers},
        },
    }
    return _json_safe(payload)


def _json_safe(obj: Any) -> Any:
    if isinstance(obj, dict):
        return {k: _json_safe(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_json_safe(v) for v in obj]
    if isinstance(obj, float):
        if math.isnan(obj) or math.isinf(obj):
            return None
    return obj


def _mp_worker(payload: dict[str, Any], result_q: "multiprocessing.Queue") -> None:
    try:
        out = _execute_user_code(
            payload["code"],
            payload["records_price"],
            payload["records_bench"],
            payload["symbol"],
        )
        result_q.put({"ok": True, "result": out})
    except Exception:
        result_q.put({"ok": False, "error": traceback.format_exc()})


def run_code_backtest_sandboxed(
    code: str,
    symbol: str,
    start: date,
    end: date,
) -> dict[str, Any]:
    if len(code) > MAX_CODE_CHARS:
        raise ValueError(f"Code exceeds maximum length ({MAX_CODE_CHARS} characters).")
    if (end - start).days > 365 * 12:
        raise ValueError("Date range too long (max 12 years).")
    if (end - start).days < 14:
        raise ValueError("Need at least ~2 weeks of history.")

    _validate_ast_only_imports_allowed(code)

    price_df, bench_df = fetch_yfinance_pair(symbol, start, end)
    common = price_df.index.intersection(bench_df.index)
    price_df = price_df.loc[common].sort_index()
    bench_df = bench_df.loc[common].sort_index()
    if len(price_df) < 5:
        raise ValueError("Not enough overlapping bars.")

    records_price = _df_to_records(price_df)
    records_bench = _df_to_records(bench_df)

    ctx = multiprocessing.get_context("spawn")
    result_q: multiprocessing.Queue = ctx.Queue()
    proc = ctx.Process(
        target=_mp_worker,
        args=(
            {
                "code": code,
                "records_price": records_price,
                "records_bench": records_bench,
                "symbol": symbol,
            },
            result_q,
        ),
    )
    proc.start()
    proc.join(BACKTEST_TIMEOUT_SEC)
    if proc.is_alive():
        proc.terminate()
        proc.join(3)
        raise TimeoutError("Backtest timed out — simplify the strategy or shorten the range.")

    try:
        msg = result_q.get_nowait()
    except queue.Empty:
        raise RuntimeError("Backtest produced no result (worker may have crashed).") from None

    if not msg.get("ok"):
        err = msg.get("error") or "Unknown error"
        raise ValueError(err)

    return msg["result"]
