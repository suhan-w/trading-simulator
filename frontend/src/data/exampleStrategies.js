/** Pre-built strategies for the code backtester (must define run(data)). */

export const EXAMPLE_MA_CROSSOVER = `def run(data):
    df = data["price"].copy()
    c = df["Close"].astype(float)
    sma20 = c.rolling(20).mean()
    sma50 = c.rolling(50).mean()
    cash = 1.0
    shares = 0.0
    equity = []
    trades = []
    for i in range(len(c)):
        pr = float(c.iloc[i])
        equity.append(cash + shares * pr)
        if i == 0:
            continue
        if (
            sma20.iloc[i] > sma50.iloc[i]
            and sma20.iloc[i - 1] <= sma50.iloc[i - 1]
            and shares == 0
            and cash > 0
        ):
            shares = cash / pr
            cash = 0.0
            trades.append({"date": str(df.index[i])[:10], "side": "buy", "price": pr})
        elif sma20.iloc[i] < sma50.iloc[i] and sma20.iloc[i - 1] >= sma50.iloc[i - 1] and shares > 0:
            cash = shares * pr
            trades.append({"date": str(df.index[i])[:10], "side": "sell", "price": pr})
            shares = 0.0
    dates = [str(x)[:10] for x in df.index]
    e0 = equity[0] if abs(equity[0]) > 1e-12 else 1.0
    return {
        "dates": dates,
        "equity": [e / e0 for e in equity],
        "trades": trades,
        "close_prices": c.tolist(),
    }
`;

export const EXAMPLE_RSI = `def run(data):
    df = data["price"].copy()
    c = df["Close"].astype(float)
    period = 14
    delta = c.diff()
    gain = delta.clip(lower=0.0)
    loss = (-delta).clip(lower=0.0)
    avg_g = gain.rolling(period).mean()
    avg_l = loss.rolling(period).mean()
    rs = avg_g / avg_l.replace(0.0, 1e-12)
    rsi = 100.0 - (100.0 / (1.0 + rs))
    cash = 1.0
    shares = 0.0
    equity = []
    trades = []
    for i in range(len(c)):
        pr = float(c.iloc[i])
        equity.append(cash + shares * pr)
        if i == 0:
            continue
        r = rsi.iloc[i]
        rp = rsi.iloc[i - 1]
        if r is not None and rp is not None and rp < 30 <= r and shares == 0 and cash > 0:
            shares = cash / pr
            cash = 0.0
            trades.append({"date": str(df.index[i])[:10], "side": "buy", "price": pr})
        elif r is not None and rp is not None and rp > 70 >= r and shares > 0:
            cash = shares * pr
            trades.append({"date": str(df.index[i])[:10], "side": "sell", "price": pr})
            shares = 0.0
    dates = [str(x)[:10] for x in df.index]
    e0 = equity[0] if abs(equity[0]) > 1e-12 else 1.0
    return {
        "dates": dates,
        "equity": [e / e0 for e in equity],
        "trades": trades,
        "close_prices": c.tolist(),
    }
`;

export const EXAMPLE_BUY_HOLD = `def run(data):
    c = data["price"]["Close"].astype(float)
    eq = (c / float(c.iloc[0])).tolist()
    dates = [str(d)[:10] for d in c.index]
    return {
        "dates": dates,
        "equity": eq,
        "trades": [{"date": dates[0], "side": "buy", "price": float(c.iloc[0])}],
        "close_prices": c.tolist(),
    }
`;

export const EXAMPLES = [
  { id: "ma", title: "Moving average crossover (SMA20 vs SMA50)", code: EXAMPLE_MA_CROSSOVER },
  { id: "rsi", title: "RSI overbought / oversold (14)", code: EXAMPLE_RSI },
  { id: "bh", title: "Buy and hold (full sample)", code: EXAMPLE_BUY_HOLD },
];
