from typing import Any

import numpy as np
import pandas as pd
import yfinance as yf

from app.services.market_service import normalize_ticker


def run_sma_backtest(
    ticker: str,
    start: str,
    end: str,
    fast_period: int,
    slow_period: int,
    initial_cash: float = 100_000.0,
) -> dict[str, Any]:
    t = normalize_ticker(ticker)
    stock = yf.Ticker(t)
    df = stock.history(start=start, end=end, auto_adjust=True)
    if df is None or df.empty or len(df) < slow_period + 5:
        raise ValueError("Not enough historical data for the selected range")

    close = df["Close"].astype(float)
    fast = close.rolling(fast_period).mean()
    slow_ma = close.rolling(slow_period).mean()
    signal = (fast > slow_ma).astype(int)

    cash = initial_cash
    shares = 0.0
    equity_curve: list[float] = []
    round_returns: list[float] = []
    buy_price: float | None = None
    num_buys = 0
    num_sells = 0

    for i in range(len(df)):
        price = float(close.iloc[i])
        sig = int(signal.iloc[i]) if not pd.isna(signal.iloc[i]) else 0
        prev_sig = int(signal.iloc[i - 1]) if i > 0 and not pd.isna(signal.iloc[i - 1]) else 0

        if i > 0 and prev_sig == 0 and sig == 1 and shares == 0 and cash > 0:
            shares = cash / price
            buy_price = price
            cash = 0.0
            num_buys += 1
        elif i > 0 and prev_sig == 1 and sig == 0 and shares > 0:
            cash = shares * price
            if buy_price is not None:
                round_returns.append((price - buy_price) / buy_price)
            shares = 0.0
            buy_price = None
            num_sells += 1

        eq = cash + shares * price
        equity_curve.append(eq)

    final_equity = cash + shares * float(close.iloc[-1])
    total_return_pct = (final_equity - initial_cash) / initial_cash * 100

    eq_arr = np.array(equity_curve, dtype=float)
    peak = np.maximum.accumulate(eq_arr)
    drawdown = (eq_arr - peak) / np.maximum(peak, 1e-9)
    max_drawdown_pct = float(drawdown.min() * 100) if len(drawdown) else 0.0

    wins = sum(1 for r in round_returns if r > 0)
    win_rate_pct = (wins / len(round_returns) * 100) if round_returns else 0.0

    return {
        "ticker": t,
        "start_date": str(df.index[0])[:10],
        "end_date": str(df.index[-1])[:10],
        "strategy": f"SMA crossover {fast_period}/{slow_period}",
        "total_return_pct": float(total_return_pct),
        "win_rate_pct": float(win_rate_pct),
        "max_drawdown_pct": float(max_drawdown_pct),
        "num_trades": num_sells,
        "final_equity": float(final_equity),
    }
