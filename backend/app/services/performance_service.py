"""Performance report: metrics, equity curve, benchmark vs ASX 200 proxy (Alpha Vantage)."""

from __future__ import annotations

import math
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from typing import Any

from sqlalchemy.orm import Session

from app.config import settings
from app.models import Transaction, User
from app.services import market_service
from app.services.portfolio_service import build_portfolio, equity_history_points


def _equity_ts(iso: str) -> datetime:
    return datetime.fromisoformat(iso.replace("Z", "+00:00"))


def _filter_equity_window(points: list[dict], start: date, end: date) -> list[dict]:
    out = []
    end_dt = datetime.combine(end, datetime.max.time(), tzinfo=timezone.utc)
    start_d = start
    for p in points:
        try:
            t = _equity_ts(p["time"])
        except ValueError:
            continue
        if t.date() < start_d or t > end_dt:
            continue
        out.append(dict(p))
    if not out:
        return []
    out.sort(key=lambda x: _equity_ts(x["time"]))
    return out


def _forward_fill_daily(equity_points: list[dict], start: date, end: date) -> list[dict]:
    """One row per calendar day: last known equity on or before that day."""
    if not equity_points:
        return []
    pts = sorted(equity_points, key=lambda x: _equity_ts(x["time"]))
    daily: list[dict] = []
    idx = 0
    last_eq = float(pts[0]["equity"])
    while idx < len(pts) and _equity_ts(pts[idx]["time"]).date() < start:
        last_eq = float(pts[idx]["equity"])
        idx += 1
    cur = start
    while cur <= end:
        while idx < len(pts) and _equity_ts(pts[idx]["time"]).date() <= cur:
            last_eq = float(pts[idx]["equity"])
            idx += 1
        daily.append({"date": cur.isoformat(), "equity": last_eq})
        cur += timedelta(days=1)
    return daily


def _to_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _fifo_sell_pnls(transactions: list[Transaction]) -> list[dict[str, Any]]:
    """Realised P/L per sell (FIFO lots), chronological."""
    lots: dict[str, list[list[float]]] = defaultdict(list)  # ticker -> [qty, price] stacks
    results: list[dict[str, Any]] = []
    for tx in sorted(transactions, key=lambda t: t.executed_at or datetime.min):
        t = tx.ticker
        if tx.side == "buy":
            lots[t].append([float(tx.quantity), float(tx.price)])
        else:
            qty_need = float(tx.quantity)
            cost = 0.0
            while qty_need > 1e-9 and lots[t]:
                lq, lp = lots[t][0]
                take = min(lq, qty_need)
                cost += take * lp
                lq -= take
                qty_need -= take
                if lq < 1e-9:
                    lots[t].pop(0)
                else:
                    lots[t][0][0] = lq
            proceeds = float(tx.total)
            pnl = proceeds - cost
            results.append(
                {
                    "executed_at": tx.executed_at,
                    "ticker": t,
                    "quantity": float(tx.quantity),
                    "price": float(tx.price),
                    "realized_pnl": round(pnl, 2),
                }
            )
    return results


def _max_drawdown_pct(equities: list[float]) -> float:
    if not equities:
        return 0.0
    peak = equities[0]
    max_dd = 0.0
    for e in equities:
        peak = max(peak, e)
        if peak > 0:
            dd = (peak - e) / peak * 100
            max_dd = max(max_dd, dd)
    return round(max_dd, 3)


def _sharpe_ratio(daily_equities: list[float]) -> float | None:
    if len(daily_equities) < 3:
        return None
    rets: list[float] = []
    for i in range(1, len(daily_equities)):
        a, b = daily_equities[i - 1], daily_equities[i]
        if a > 0:
            rets.append((b - a) / a)
    if len(rets) < 2:
        return None
    mean_r = sum(rets) / len(rets)
    var = sum((r - mean_r) ** 2 for r in rets) / (len(rets) - 1)
    std = math.sqrt(var) if var > 0 else 0.0
    if std < 1e-12:
        return None
    # Annualise: ~252 trading days
    return round((mean_r / std) * math.sqrt(252), 4)


def build_performance_report(
    db: Session,
    user: User,
    start: date,
    end: date,
) -> tuple[dict[str, Any], int]:
    """Returns (report dict, limit-order fills from first build_portfolio in this pipeline)."""
    if start > end:
        start, end = end, start

    all_points, filled_from_equity, data = equity_history_points(db, user)
    window_pts = _filter_equity_window(all_points, start, end)

    txs = (
        db.query(Transaction)
        .filter(Transaction.user_id == user.id)
        .order_by(Transaction.executed_at.asc())
        .all()
    )

    start_dt = datetime.combine(start, datetime.min.time(), tzinfo=timezone.utc)
    end_dt = datetime.combine(end, datetime.max.time(), tzinfo=timezone.utc)

    txs_in_range = [
        t for t in txs if t.executed_at and start_dt <= _to_utc(t.executed_at) <= end_dt
    ]

    sell_pnls_all = _fifo_sell_pnls(txs)
    sells_in_range = [
        s for s in sell_pnls_all if s["executed_at"] and start_dt <= _to_utc(s["executed_at"]) <= end_dt
    ]

    win_rate: float | None = None
    best_trade: dict[str, Any] | None = None
    worst_trade: dict[str, Any] | None = None
    if sells_in_range:
        wins = sum(1 for s in sells_in_range if s["realized_pnl"] > 0)
        win_rate = round(100.0 * wins / len(sells_in_range), 2)
        best = max(sells_in_range, key=lambda x: x["realized_pnl"])
        worst = min(sells_in_range, key=lambda x: x["realized_pnl"])
        best_trade = {
            "ticker": best["ticker"],
            "realized_pnl": best["realized_pnl"],
            "quantity": best["quantity"],
            "price": best["price"],
        }
        worst_trade = {
            "ticker": worst["ticker"],
            "realized_pnl": worst["realized_pnl"],
            "quantity": worst["quantity"],
            "price": worst["price"],
        }

    daily_pf = _forward_fill_daily(all_points, start, end)
    daily_eq = [d["equity"] for d in daily_pf]
    max_dd = _max_drawdown_pct(daily_eq) if daily_eq else 0.0
    sharpe = _sharpe_ratio(daily_eq)

    if not window_pts and all_points:
        before = [p for p in all_points if _equity_ts(p["time"]).date() < start]
        start_iso = datetime.combine(start, datetime.min.time(), tzinfo=timezone.utc).isoformat()
        end_iso = datetime.now(timezone.utc).isoformat()
        if before:
            last = max(before, key=lambda x: _equity_ts(x["time"]))
            window_pts = [
                {"time": start_iso, "equity": last["equity"]},
                {"time": end_iso, "equity": float(data["total_equity"])},
            ]
        else:
            window_pts = [
                {"time": start_iso, "equity": float(settings.initial_cash)},
                {"time": end_iso, "equity": float(data["total_equity"])},
            ]

    e0 = window_pts[0]["equity"] if window_pts else float(data["total_equity"])
    equity_curve = [
        {"time": p["time"], "equity": round(float(p["equity"]), 2)} for p in window_pts
    ]
    return_pct_series = [
        {
            "time": p["time"],
            "return_pct": round((float(p["equity"]) / e0 - 1) * 100, 4) if e0 > 0 else 0.0,
        }
        for p in window_pts
    ]

    tickers = set()
    for t in txs_in_range:
        tickers.add(t.ticker)
    for h in data["holdings"]:
        tickers.add(h["ticker"])

    series_cache: dict[str, dict[str, float] | None] = {}

    def get_series_for_ticker(sym: str) -> dict[str, float] | None:
        norm = market_service.normalize_ticker(sym)
        if norm.startswith("^"):
            norm = market_service.BENCHMARK_SYMBOL_AV
        if norm not in series_cache:
            series_cache[norm] = market_service.daily_series_for_symbol_cached(db, norm)
        return series_cache[norm]

    per_stock: list[dict[str, Any]] = []
    end_fetch = end + timedelta(days=1)
    for sym in sorted(tickers):
        s = get_series_for_ticker(sym)
        if s is None:
            continue
        r = market_service.return_pct_from_series(s, start, end_fetch)
        if r is not None:
            per_stock.append({"ticker": sym, "return_pct": r})

    bench_rows: list[dict[str, Any]] = []
    bs = get_series_for_ticker(market_service.BENCHMARK_SYMBOL_AV)
    if bs is not None:
        bench_rows = market_service.closes_daily_from_series(bs, start, end_fetch)
    else:
        bench_rows = []
    # Chart: aligned calendar dates, day-over-day % change for portfolio equity vs benchmark close.
    portfolio_norm: list[dict[str, Any]] = []
    benchmark_norm: list[dict[str, Any]] = []
    aligned_portfolio_return_pct: float | None = None
    aligned_benchmark_return_pct: float | None = None
    aligned_alpha_pct: float | None = None
    if bench_rows and daily_pf:
        bench_by_date = {row["date"]: row["close"] for row in bench_rows}
        pf_by_date = {row["date"]: row["equity"] for row in daily_pf}
        common_dates = sorted(set(bench_by_date) & set(pf_by_date))
        if len(common_dates) >= 2:
            d_first, d_last = common_dates[0], common_dates[-1]
            p_first, p_last = pf_by_date[d_first], pf_by_date[d_last]
            b_first, b_last = bench_by_date[d_first], bench_by_date[d_last]
            if p_first > 0 and b_first > 0:
                aligned_portfolio_return_pct = round((p_last / p_first - 1.0) * 100.0, 4)
                aligned_benchmark_return_pct = round((b_last / b_first - 1.0) * 100.0, 4)
                aligned_alpha_pct = round(
                    float(aligned_portfolio_return_pct) - float(aligned_benchmark_return_pct), 4
                )
            for i in range(1, len(common_dates)):
                d_prev, d = common_dates[i - 1], common_dates[i]
                pp, p = pf_by_date[d_prev], pf_by_date[d]
                bp, b = bench_by_date[d_prev], bench_by_date[d]
                if pp > 0 and bp > 0:
                    portfolio_norm.append(
                        {
                            "date": d,
                            "value": round((p / pp - 1.0) * 100.0, 4),
                        }
                    )
                    benchmark_norm.append(
                        {
                            "date": d,
                            "value": round((b / bp - 1.0) * 100.0, 4),
                        }
                    )

    daily_return_bars: list[dict[str, Any]] = []
    for i in range(1, len(daily_pf)):
        prev_eq = float(daily_pf[i - 1]["equity"])
        cur_eq = float(daily_pf[i]["equity"])
        d_str = daily_pf[i]["date"]
        if prev_eq > 0:
            daily_return_bars.append(
                {"date": d_str, "return_pct": round((cur_eq - prev_eq) / prev_eq * 100, 4)}
            )
        else:
            daily_return_bars.append({"date": d_str, "return_pct": 0.0})

    cumulative_return_daily: list[dict[str, Any]] = []
    if daily_pf:
        e_start = float(daily_pf[0]["equity"])
        for row in daily_pf:
            eq = float(row["equity"])
            cum = round((eq / e_start - 1) * 100, 4) if e_start > 0 else 0.0
            cumulative_return_daily.append({"date": row["date"], "cumulative_return_pct": cum})

    winning_sells = losing_sells = breakeven_sells = 0
    for s in sells_in_range:
        pnl = float(s["realized_pnl"])
        if pnl > 0:
            winning_sells += 1
        elif pnl < 0:
            losing_sells += 1
        else:
            breakeven_sells += 1

    pnl_by_ticker: dict[str, float] = defaultdict(float)
    for s in sells_in_range:
        pnl_by_ticker[s["ticker"]] += float(s["realized_pnl"])
    for h in data["holdings"]:
        pnl_by_ticker[h["ticker"]] += float(h["unrealized_pnl"])
    per_stock_pnl = [
        {"ticker": t, "pnl": round(pnl_by_ticker[t], 2)}
        for t in sorted(pnl_by_ticker.keys())
    ]

    drawdown_series: list[dict[str, Any]] = []
    peak_eq = float(daily_pf[0]["equity"]) if daily_pf else 0.0
    for row in daily_pf:
        eq = float(row["equity"])
        peak_eq = max(peak_eq, eq)
        dd_pct = round((peak_eq - eq) / peak_eq * 100, 4) if peak_eq > 0 else 0.0
        drawdown_series.append({"date": row["date"], "drawdown_pct": dd_pct})

    return (
        {
        "start": start.isoformat(),
        "end": end.isoformat(),
        "equity_curve": equity_curve,
        "return_pct_series": return_pct_series,
        "per_stock_performance": per_stock,
        "win_rate_pct": win_rate,
        "best_trade": best_trade,
        "worst_trade": worst_trade,
        "max_drawdown_pct": max_dd,
        "sharpe_ratio": sharpe,
        "trade_count": len(txs_in_range),
        "sell_count": len(sells_in_range),
        "portfolio_vs_benchmark": {
            "portfolio": portfolio_norm,
            "benchmark": benchmark_norm,
            "benchmark_symbol": market_service.BENCHMARK_SYMBOL_AV,
            "benchmark_label": market_service.BENCHMARK_LABEL,
        },
        "aligned_portfolio_return_pct": aligned_portfolio_return_pct,
        "aligned_benchmark_return_pct": aligned_benchmark_return_pct,
        "aligned_alpha_pct": aligned_alpha_pct,
        "initial_equity": float(settings.initial_cash),
        "daily_return_bars": daily_return_bars,
        "cumulative_return_daily": cumulative_return_daily,
        "win_rate_breakdown": {
            "winning_sells": winning_sells,
            "losing_sells": losing_sells,
            "breakeven_sells": breakeven_sells,
        },
        "per_stock_pnl": per_stock_pnl,
        "drawdown_series": drawdown_series,
        },
        filled_from_equity,
    )
