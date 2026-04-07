"""Simple EOD backtests on OHLCV bars (no intraday)."""

from __future__ import annotations

import math
from datetime import date
from typing import Any


def _sma(values: list[float], period: int) -> list[float | None]:
    out: list[float | None] = [None] * len(values)
    if period <= 0 or len(values) < period:
        return out
    s = sum(values[:period])
    out[period - 1] = s / period
    for i in range(period, len(values)):
        s = s - values[i - period] + values[i]
        out[i] = s / period
    return out


def _rsi(closes: list[float], period: int = 14) -> list[float | None]:
    n = len(closes)
    out: list[float | None] = [None] * n
    if n < period + 1:
        return out
    for i in range(period, n):
        gains = 0.0
        losses = 0.0
        for j in range(i - period + 1, i + 1):
            ch = closes[j] - closes[j - 1]
            if ch > 0:
                gains += ch
            else:
                losses -= ch
        avg_g = gains / period
        avg_l = losses / period
        if avg_l < 1e-12:
            out[i] = 100.0
        else:
            rs = avg_g / avg_l
            out[i] = 100.0 - (100.0 / (1.0 + rs))
    return out


def _max_dd_from_equity(equity: list[float]) -> float:
    if not equity:
        return 0.0
    peak = equity[0]
    max_dd = 0.0
    for e in equity:
        peak = max(peak, e)
        if peak > 0:
            max_dd = max(max_dd, (peak - e) / peak * 100)
    return round(max_dd, 4)


def _sharpe_from_equity(equity: list[float]) -> float | None:
    if len(equity) < 3:
        return None
    rets: list[float] = []
    for i in range(1, len(equity)):
        a, b = equity[i - 1], equity[i]
        if a > 0:
            rets.append((b - a) / a)
    if len(rets) < 2:
        return None
    mean_r = sum(rets) / len(rets)
    var = sum((r - mean_r) ** 2 for r in rets) / (len(rets) - 1)
    std = math.sqrt(var) if var > 0 else 0.0
    if std < 1e-12:
        return None
    return round((mean_r / std) * math.sqrt(252), 4)


def _filter_bars(
    bars: dict[str, dict[str, float]],
    start: date,
    end: date,
) -> list[dict[str, Any]]:
    start_s = start.isoformat()
    end_s = end.isoformat()
    rows: list[dict[str, Any]] = []
    for d in sorted(bars.keys()):
        if start_s <= d <= end_s:
            b = bars[d]
            rows.append(
                {
                    "date": d,
                    "open": b["open"],
                    "high": b["high"],
                    "low": b["low"],
                    "close": b["close"],
                    "volume": b.get("volume", 0),
                }
            )
    return rows


def run_strategy(
    bars: dict[str, dict[str, float]],
    start: date,
    end: date,
    strategy: str,
) -> dict[str, Any]:
    rows = _filter_bars(bars, start, end)
    if len(rows) < 5:
        raise ValueError("Not enough EOD history in range for this backtest.")

    closes = [float(r["close"]) for r in rows]

    if strategy == "buy_hold":
        c0, c1 = closes[0], closes[-1]
        total_ret = (c1 / c0 - 1.0) * 100 if c0 > 0 else 0.0
        equity = [1.0]
        for i in range(1, len(closes)):
            equity.append(equity[-1] * (closes[i] / closes[i - 1]))
        return {
            "total_return_pct": round(total_ret, 4),
            "win_rate_pct": None,
            "max_drawdown_pct": _max_dd_from_equity(equity),
            "sharpe_ratio": _sharpe_from_equity(equity),
            "trade_count": 1,
            "strategy": strategy,
        }

    if strategy == "ma_crossover":
        fast_p, slow_p = 10, 30
        sma_f = _sma(closes, fast_p)
        sma_s = _sma(closes, slow_p)
        position = 0.0  # shares held
        cash = 1.0
        equity_curve: list[float] = []
        wins = 0
        losses = 0
        buy_px: float | None = None

        for i in range(len(closes)):
            eq = cash + position * closes[i]
            equity_curve.append(eq)
            if i == 0:
                continue
            f_prev, f_cur = sma_f[i - 1], sma_f[i]
            s_prev, s_cur = sma_s[i - 1], sma_s[i]
            if (
                f_prev is not None
                and s_prev is not None
                and f_cur is not None
                and s_cur is not None
            ):
                cross_up = f_prev <= s_prev and f_cur > s_cur
                cross_dn = f_prev >= s_prev and f_cur < s_cur
                if cross_up and position < 1e-9:
                    if cash > 1e-9:
                        buy_px = closes[i]
                        position = cash / closes[i]
                        cash = 0.0
                elif cross_dn and position > 1e-9:
                    proceeds = position * closes[i]
                    if buy_px is not None and buy_px > 0:
                        cost = buy_px * position
                        if proceeds > cost + 1e-9:
                            wins += 1
                        elif proceeds < cost - 1e-9:
                            losses += 1
                    cash = proceeds
                    position = 0.0
                    buy_px = None

        final_eq = equity_curve[-1] if equity_curve else 1.0
        total_ret = (final_eq - 1.0) * 100
        closed = wins + losses
        wr = round(100.0 * wins / closed, 2) if closed else None
        return {
            "total_return_pct": round(total_ret, 4),
            "win_rate_pct": wr,
            "max_drawdown_pct": _max_dd_from_equity(equity_curve),
            "sharpe_ratio": _sharpe_from_equity(equity_curve),
            "trade_count": closed,
            "strategy": strategy,
        }

    if strategy == "rsi_mean_reversion":
        rsi_vals = _rsi(closes, 14)
        position = 0.0
        cash = 1.0
        equity_curve = []
        wins = 0
        losses = 0
        buy_px: float | None = None

        for i in range(len(closes)):
            eq = cash + position * closes[i]
            equity_curve.append(eq)
            r = rsi_vals[i]
            r_prev = rsi_vals[i - 1] if i > 0 else None
            if r is None or r_prev is None:
                continue
            if r_prev < 30 <= r and position < 1e-9 and cash > 1e-9:
                buy_px = closes[i]
                position = cash / closes[i]
                cash = 0.0
            elif r_prev > 70 >= r and position > 1e-9:
                proceeds = position * closes[i]
                if buy_px is not None and buy_px > 0:
                    cost = buy_px * position
                    if proceeds > cost + 1e-9:
                        wins += 1
                    elif proceeds < cost - 1e-9:
                        losses += 1
                cash = proceeds
                position = 0.0
                buy_px = None

        final_eq = equity_curve[-1] if equity_curve else 1.0
        total_ret = (final_eq - 1.0) * 100
        closed = wins + losses
        wr = round(100.0 * wins / closed, 2) if closed else None
        return {
            "total_return_pct": round(total_ret, 4),
            "win_rate_pct": wr,
            "max_drawdown_pct": _max_dd_from_equity(equity_curve),
            "sharpe_ratio": _sharpe_from_equity(equity_curve),
            "trade_count": closed,
            "strategy": strategy,
        }

    raise ValueError("Unknown strategy")
