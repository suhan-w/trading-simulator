"""Executive summary report: template narrative + metrics from performance bundle."""

from __future__ import annotations

from collections import Counter
from datetime import date, datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from app.models import Transaction, User
from app.services.performance_service import build_performance_report
from app.services.portfolio_service import build_portfolio


def _pretty_range(start: date, end: date) -> str:
    return f"{start.strftime('%d %b %Y')} to {end.strftime('%d %b %Y')}"


def _to_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _beta_from_daily_pct_series(port: list[dict], bench: list[dict]) -> float | None:
    """Beta from aligned daily return % series (same dates, parallel rows)."""
    if len(port) < 4 or len(port) != len(bench):
        return None
    pr = [float(p["value"]) for p in port]
    br = [float(b["value"]) for b in bench]
    n = len(pr)
    mean_p = sum(pr) / n
    mean_b = sum(br) / n
    var_b = sum((br[i] - mean_b) ** 2 for i in range(n)) / (n - 1) if n > 1 else 0.0
    if var_b < 1e-18:
        return None
    cov = sum((pr[i] - mean_p) * (br[i] - mean_b) for i in range(n)) / (n - 1)
    return round(cov / var_b, 4)


def _fmt_pct(x: float | None, digits: int = 2) -> str:
    if x is None:
        return "N/A"
    if x != x:  # NaN
        return "N/A"
    sign = "+" if x >= 0 else ""
    return f"{sign}{x:.{digits}f}%"


def _interpret_total_return(pct: float | None) -> str:
    if pct is None:
        return "Return could not be computed for this period."
    if pct >= 5:
        return "Strong positive return over the selected window."
    if pct > 0:
        return "Positive return; magnitude depends on your objectives and horizon."
    if pct == 0:
        return "Flat return over the window."
    if pct > -5:
        return "Negative return; review entries, sizing, and market conditions."
    return "Material drawdown in portfolio value; consider risk controls and strategy fit."


def _interpret_alpha(alpha_pp: float | None) -> str:
    if alpha_pp is None:
        return "Alpha vs benchmark could not be computed (missing overlap or data)."
    if alpha_pp >= 3:
        return "Meaningful outperformance versus the benchmark index over the same dates."
    if alpha_pp > 0:
        return "Ahead of the benchmark on total return over the overlapping window."
    if alpha_pp == 0:
        return "Roughly in line with the benchmark over the period."
    if alpha_pp > -3:
        return "Slightly behind the benchmark; small gaps often reflect timing and cash drag."
    return "Underperformed the benchmark by a wide margin; review stock selection and timing."


def _interpret_beta(beta: float | None) -> str:
    if beta is None:
        return "Beta could not be estimated (insufficient overlapping daily moves)."
    if beta < 0.6:
        return "Lower sensitivity than the market index; moves may be damped relative to the ASX 200."
    if beta <= 1.15:
        return "Market-like sensitivity; portfolio tends to move broadly with the index."
    return "Higher sensitivity than the market; expect larger swings versus the index."


def _interpret_sharpe(sh: float | None) -> str:
    if sh is None:
        return "Sharpe could not be computed (too few daily observations or zero volatility)."
    if sh >= 1.5:
        return "Strong risk-adjusted return versus daily volatility."
    if sh >= 1.0:
        return "Reasonable risk-adjusted profile by this simple Sharpe measure."
    if sh >= 0:
        return "Modest or weak risk-adjusted returns; volatility consumed much of the upside."
    return "Negative Sharpe indicates losses with meaningful volatility."


def _interpret_max_dd(dd: float) -> str:
    if dd <= 3:
        return "Very shallow peak-to-trough decline in the window."
    if dd <= 10:
        return "Moderate drawdown versus peak equity in range."
    if dd <= 20:
        return "Elevated drawdown; ensure position sizing matches your risk tolerance."
    return "Severe drawdown; stress-test the strategy and liquidity assumptions."


def _interpret_win_rate(wr: float | None, sells: int) -> str:
    if wr is None or sells == 0:
        return "No closed sells in range, or win rate not applicable."
    if wr >= 60:
        return "Majority of realised sells were profitable."
    if wr >= 50:
        return "Roughly half of sells locked in gains."
    return "Most sells were flat or losses; execution or selection may warrant review."


def _interpret_trade_count(n: int) -> str:
    if n == 0:
        return "No trades executed in this date window."
    if n <= 5:
        return "Light activity; portfolio turnover was low."
    if n <= 30:
        return "Moderate trading activity."
    return "High turnover; watch frictions, slippage, and tax (paper mode ignores tax)."


def _risk_paragraph(beta: float | None, max_dd: float, sharpe: float | None) -> str:
    parts: list[str] = []
    if max_dd <= 5:
        parts.append("Drawdowns stayed contained relative to peak equity.")
    elif max_dd <= 15:
        parts.append("Drawdown risk was moderate over the period.")
    else:
        parts.append("Drawdown risk was elevated; the equity curve experienced material peaks-to-troughs.")

    if sharpe is not None and sharpe >= 1:
        parts.append("The Sharpe ratio above 1 suggests favourable return per unit of daily volatility.")
    elif sharpe is not None and sharpe >= 0:
        parts.append("The Sharpe ratio is below 1, so risk-adjusted returns were limited.")
    else:
        parts.append("Sharpe was weak or negative, signalling poor return per unit of risk.")

    if beta is not None:
        if beta < 0.8:
            parts.append("Beta below 1 implies less market sensitivity than a broad index fund.")
        elif beta <= 1.2:
            parts.append("Beta near 1 implies broad-market-like sensitivity.")
        else:
            parts.append("Beta above 1 implies higher volatility than the broad market.")

    return " ".join(parts)


def _conclusion(
    total_ret: float | None,
    alpha_pp: float | None,
    win_rate: float | None,
    sells: int,
) -> str:
    bits: list[str] = []
    if total_ret is not None:
        bits.append(
            f"Total return came in at {_fmt_pct(total_ret)} for the selected range."
            if total_ret >= 0
            else f"The portfolio finished down {_fmt_pct(abs(total_ret))} over the range."
        )
    if alpha_pp is not None:
        if alpha_pp > 0:
            bits.append(f"You beat the ASX benchmark by about {_fmt_pct(alpha_pp)} on overlapping total return.")
        elif alpha_pp < 0:
            bits.append(f"The strategy lagged the benchmark by about {_fmt_pct(abs(alpha_pp))} on overlapping total return.")
    if sells and win_rate is not None:
        bits.append(f"Across {sells} realised sells, about {win_rate:.0f}% were winners.")
    bits.append(
        "For improvement: tighten entries on losing names, review position sizing after large drawdowns, "
        "and keep paper fills realistic before committing real capital."
    )
    return " ".join(bits)


def build_executive_summary_bundle(db: Session, user: User, start: date, end: date) -> dict[str, Any]:
    if start > end:
        start, end = end, start

    raw = build_performance_report(db, user, start, end)
    portfolio = build_portfolio(db, user)

    start_dt = datetime.combine(start, datetime.min.time(), tzinfo=timezone.utc)
    end_dt = datetime.combine(end, datetime.max.time(), tzinfo=timezone.utc)

    txs = (
        db.query(Transaction)
        .filter(Transaction.user_id == user.id)
        .order_by(Transaction.executed_at.asc())
        .all()
    )
    txs_in_range = [
        t
        for t in txs
        if t.executed_at and start_dt <= _to_utc(t.executed_at) <= end_dt
    ]

    pvb = raw["portfolio_vs_benchmark"]
    port_idx = pvb.get("portfolio") or []
    bench_idx = pvb.get("benchmark") or []
    beta = _beta_from_daily_pct_series(port_idx, bench_idx) if port_idx and bench_idx else None

    cum = raw.get("cumulative_return_daily") or []
    total_return = float(cum[-1]["cumulative_return_pct"]) if cum else None

    alpha_pp = raw.get("aligned_alpha_pct")
    if alpha_pp is not None:
        alpha_pp = round(float(alpha_pp), 4)

    win_rate = raw.get("win_rate_pct")
    sell_count = int(raw.get("sell_count") or 0)
    max_dd = float(raw.get("max_drawdown_pct") or 0.0)
    sharpe = raw.get("sharpe_ratio")
    trade_count = int(raw.get("trade_count") or 0)
    bench_label = pvb.get("benchmark_label") or "ASX 200"

    ec = raw.get("equity_curve") or []
    eq_start = float(ec[0]["equity"]) if ec else None
    eq_end = float(ec[-1]["equity"]) if ec else None

    buys = sum(1 for t in txs_in_range if t.side == "buy")
    sells = sum(1 for t in txs_in_range if t.side == "sell")

    ticker_activity: Counter[str] = Counter()
    for t in txs_in_range:
        ticker_activity[t.ticker] += 1
    most_ticker = ticker_activity.most_common(1)[0][0] if ticker_activity else None
    most_n = ticker_activity.most_common(1)[0][1] if ticker_activity else 0

    ret_by_ticker = {row["ticker"]: float(row["return_pct"]) for row in raw.get("per_stock_performance") or []}
    pnl_rows = raw.get("per_stock_pnl") or []
    merged: list[dict[str, Any]] = []
    for row in pnl_rows:
        tk = row["ticker"]
        merged.append(
            {
                "ticker": tk,
                "pnl": float(row["pnl"]),
                "return_pct": ret_by_ticker.get(tk),
            }
        )
    merged.sort(key=lambda x: x["pnl"], reverse=True)
    top3 = merged[:3]
    worst3 = sorted(merged, key=lambda x: x["pnl"])[:3]

    range_label = _pretty_range(start, end)
    bench_final = raw.get("aligned_benchmark_return_pct")
    if bench_final is not None:
        bench_final = float(bench_final)
    strat_final = raw.get("aligned_portfolio_return_pct")
    if strat_final is not None:
        strat_final = float(strat_final)

    head_ret = strat_final if strat_final is not None else total_return
    exec_summary = (
        f"Over the period {range_label}, the portfolio generated a total return of {_fmt_pct(head_ret)}"
        if head_ret is not None
        else f"Over the period {range_label}, return statistics were limited."
    )
    if bench_final is not None and strat_final is not None and alpha_pp is not None:
        exec_summary += (
            f", versus {_fmt_pct(bench_final)} total return on the {bench_label} over the same overlapping dates. "
            f"That is an outperformance of {_fmt_pct(alpha_pp)}."
            if alpha_pp >= 0
            else f", versus {_fmt_pct(bench_final)} on the {bench_label} over the same overlapping dates. "
            f"The portfolio trailed the benchmark by about {_fmt_pct(abs(alpha_pp))}."
        )
    exec_summary += " Figures are from paper fills and marks only."

    metrics_table = [
        {
            "name": "Total Return",
            "value": _fmt_pct(total_return),
            "interpretation": _interpret_total_return(total_return),
        },
        {
            "name": "Alpha vs benchmark",
            "value": _fmt_pct(alpha_pp),
            "interpretation": _interpret_alpha(alpha_pp),
        },
        {
            "name": "Beta",
            "value": f"{beta:.4f}" if beta is not None else "N/A",
            "interpretation": _interpret_beta(beta),
        },
        {
            "name": "Sharpe Ratio",
            "value": f"{sharpe:.4f}" if sharpe is not None else "N/A",
            "interpretation": _interpret_sharpe(float(sharpe) if sharpe is not None else None),
        },
        {
            "name": "Max Drawdown",
            "value": _fmt_pct(max_dd),
            "interpretation": _interpret_max_dd(max_dd),
        },
        {
            "name": "Win Rate",
            "value": f"{win_rate:.2f}%" if win_rate is not None else "N/A",
            "interpretation": _interpret_win_rate(float(win_rate) if win_rate is not None else None, sell_count),
        },
        {
            "name": "Number of Trades",
            "value": str(trade_count),
            "interpretation": _interpret_trade_count(trade_count),
        },
    ]

    trades_out = [
        {
            "id": t.id,
            "ticker": t.ticker,
            "side": t.side,
            "quantity": float(t.quantity),
            "price": float(t.price),
            "total": float(t.total),
            "executed_at": t.executed_at.isoformat() if t.executed_at else None,
        }
        for t in txs_in_range
    ]

    holdings_out = [
        {
            "ticker": h["ticker"],
            "quantity": float(h["quantity"]),
            "avg_cost": float(h["avg_cost"]),
            "current_price": float(h["current_price"]),
            "market_value": float(h["market_value"]),
            "unrealized_pnl": float(h["unrealized_pnl"]),
            "unrealized_pnl_pct": float(h["unrealized_pnl_pct"]),
        }
        for h in portfolio.get("holdings") or []
    ]

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "date_range_label": range_label,
        "start": raw["start"],
        "end": raw["end"],
        "benchmark_label": bench_label,
        "executive_summary": exec_summary,
        "metrics_table": metrics_table,
        "portfolio_activity": {
            "starting_value": eq_start,
            "ending_value": eq_end,
            "cash_remaining": float(portfolio["cash_balance"]),
            "buy_trades": buys,
            "sell_trades": sells,
            "most_traded_ticker": most_ticker,
            "most_traded_count": most_n,
        },
        "top_performers": [
            {
                "ticker": r["ticker"],
                "return_pct": r["return_pct"],
                "pnl": r["pnl"],
            }
            for r in top3
        ],
        "worst_performers": [
            {
                "ticker": r["ticker"],
                "return_pct": r["return_pct"],
                "pnl": r["pnl"],
            }
            for r in worst3
        ],
        "risk_assessment": _risk_paragraph(beta, max_dd, float(sharpe) if sharpe is not None else None),
        "benchmark_comparison": {
            "strategy_period_return_pct": strat_final,
            "benchmark_period_return_pct": bench_final,
            "excess_return_pct": alpha_pp,
            "benchmark_label": bench_label,
        },
        "conclusion": _conclusion(
            total_return,
            alpha_pp,
            float(win_rate) if win_rate is not None else None,
            sell_count,
        ),
        "trades": trades_out,
        "holdings": holdings_out,
        "equity_curve": raw.get("equity_curve") or [],
        "portfolio_vs_benchmark": pvb,
    }


def render_summary_pdf(payload: dict[str, Any]) -> bytes:
    from fpdf import FPDF

    gold = (200, 150, 62)
    ink = (17, 17, 17)
    muted = (136, 136, 136)
    green = (45, 138, 85)
    red = (192, 57, 43)

    class ReportPDF(FPDF):
        def footer(self) -> None:
            self.set_y(-14)
            self.set_font("Helvetica", "I", 8)
            self.set_text_color(*muted)
            self.cell(0, 8, "Paper trading only - not financial advice.", align="C")

    pdf = ReportPDF()
    pdf.set_auto_page_break(auto=True, margin=16)
    pdf.add_page()
    pdf.set_fill_color(245, 243, 239)
    pdf.rect(0, 0, 210, 297, "F")

    y0 = 14
    pdf.set_xy(18, y0)
    pdf.set_font("Helvetica", "B", 16)
    pdf.set_text_color(*ink)
    pdf.cell(100, 8, "Cowrie Shell", ln=0)
    pdf.set_font("Helvetica", "", 11)
    pdf.set_text_color(*gold)
    pdf.cell(0, 8, "Performance summary", ln=1)

    pdf.set_font("Helvetica", "", 9)
    pdf.set_text_color(*muted)
    pdf.set_x(18)
    pdf.cell(
        0,
        5,
        f"Range: {payload['date_range_label']}   Generated: {payload['generated_at'][:19].replace('T', ' ')} UTC",
        ln=1,
    )

    pdf.set_draw_color(*gold)
    pdf.set_line_width(0.4)
    pdf.line(18, pdf.get_y() + 2, 192, pdf.get_y() + 2)
    pdf.ln(6)

    def section_title(title: str) -> None:
        pdf.ln(4)
        pdf.set_font("Helvetica", "B", 11)
        pdf.set_text_color(*ink)
        pdf.cell(6, 6, "", ln=0)
        pdf.set_fill_color(*gold)
        pdf.rect(pdf.get_x() - 2, pdf.get_y() + 1.5, 2.5, 2.5, "F")
        pdf.cell(0, 6, f"  {title}", ln=1)

    def body_text(text: str) -> None:
        pdf.set_font("Helvetica", "", 10)
        pdf.set_text_color(*ink)
        pdf.set_x(18)
        pdf.multi_cell(174, 5, text)

    section_title("Executive summary")
    body_text(payload["executive_summary"])

    section_title("Performance metrics")
    pdf.set_font("Helvetica", "", 9)
    for row in payload["metrics_table"]:
        pdf.set_x(18)
        pdf.set_font("Helvetica", "B", 9)
        pdf.set_text_color(*ink)
        pdf.cell(52, 5, row["name"], ln=0)
        pdf.set_font("Courier", "", 9)
        pdf.cell(28, 5, row["value"], ln=0)
        pdf.set_font("Helvetica", "", 9)
        pdf.set_text_color(*muted)
        pdf.multi_cell(94, 5, row["interpretation"])

    section_title("Portfolio activity")
    pa = payload["portfolio_activity"]
    lines = [
        f"Starting value (window): {pa['starting_value']:.2f} AUD" if pa.get("starting_value") is not None else "Starting value: N/A",
        f"Ending value (window): {pa['ending_value']:.2f} AUD" if pa.get("ending_value") is not None else "Ending value: N/A",
        f"Cash remaining: {pa['cash_remaining']:.2f} AUD",
        f"Buy trades: {pa['buy_trades']}   Sell trades: {pa['sell_trades']}",
        f"Most traded ticker: {pa['most_traded_ticker'] or 'N/A'} ({pa['most_traded_count']} trades)",
    ]
    body_text("\n".join(lines))

    section_title("Top performers")
    if not payload["top_performers"]:
        body_text("No per-ticker P/L data for this range.")
    for r in payload["top_performers"]:
        rp = r.get("return_pct")
        rp_s = f"{rp:+.2f}%" if rp is not None else "N/A"
        pnl = float(r.get("pnl") or 0)
        if pnl >= 0:
            pdf.set_text_color(*green)
        else:
            pdf.set_text_color(*red)
        pdf.set_font("Courier", "", 9)
        pdf.set_x(18)
        pdf.cell(174, 5, f"{r['ticker']}   return {rp_s}   P/L {pnl:+.2f} AUD", ln=1)

    section_title("Worst performers")
    pdf.set_text_color(*ink)
    if not payload["worst_performers"]:
        body_text("No per-ticker P/L data for this range.")
    for r in payload["worst_performers"]:
        rp = r.get("return_pct")
        rp_s = f"{rp:+.2f}%" if rp is not None else "N/A"
        pnl = float(r.get("pnl") or 0)
        if pnl < 0:
            pdf.set_text_color(*red)
        else:
            pdf.set_text_color(*ink)
        pdf.set_font("Courier", "", 9)
        pdf.set_x(18)
        pdf.cell(174, 5, f"{r['ticker']}   return {rp_s}   P/L {pnl:+.2f} AUD", ln=1)

    section_title("Risk assessment")
    pdf.set_text_color(*ink)
    body_text(payload["risk_assessment"])

    section_title("Benchmark comparison")
    bc = payload["benchmark_comparison"]
    bl = bc.get("benchmark_label") or "Benchmark"
    sr = bc.get("strategy_period_return_pct")
    br = bc.get("benchmark_period_return_pct")
    ex = bc.get("excess_return_pct")
    t1 = f"Strategy total return (overlap): {_fmt_pct(sr)}" if sr is not None else "Strategy: N/A"
    t2 = f"{bl} total return (overlap): {_fmt_pct(br)}" if br is not None else f"{bl}: N/A"
    t3 = f"Excess vs benchmark: {_fmt_pct(ex)}" if ex is not None else "Excess: N/A"
    body_text("\n".join([t1, t2, t3]))

    section_title("Conclusion")
    body_text(payload["conclusion"])

    out = pdf.output()
    return bytes(out) if isinstance(out, (bytearray, bytes)) else str(out).encode("latin-1", errors="replace")


def summary_pdf_bytes(db: Session, user: User, start: date, end: date) -> bytes:
    payload = build_executive_summary_bundle(db, user, start, end)
    return render_summary_pdf(payload)
