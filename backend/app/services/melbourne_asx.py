"""ASX regular session in Australia/Melbourne time (AEST/AEDT via zoneinfo).

Session: Monday–Friday 10:00–16:00 local time (16:00 exclusive).
Public holidays: Victoria (Melbourne) — aligns with typical ASX closures.
"""

from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone
from typing import Any
from zoneinfo import ZoneInfo

import holidays

MELBOURNE = ZoneInfo("Australia/Melbourne")
SESSION_OPEN = time(10, 0, 0)
SESSION_END = time(16, 0, 0)  # last trade before 16:00; open while local time < 16:00


def _vic_calendar(*years: int) -> holidays.HolidayBase:
    ys = sorted(set(years)) if years else []
    if not ys:
        y = datetime.now(MELBOURNE).year
        ys = [y - 1, y, y + 2]
    return holidays.country_holidays("AU", subdiv="VIC", years=ys)


def is_public_holiday(d: date) -> bool:
    cal = _vic_calendar(d.year, d.year - 1, d.year + 1, d.year + 2)
    return d in cal


def holiday_name(d: date) -> str | None:
    cal = _vic_calendar(d.year, d.year - 1, d.year + 1, d.year + 2)
    name = cal.get(d)
    return str(name) if name else None


def is_trading_day(d: date) -> bool:
    if d.weekday() >= 5:
        return False
    return not is_public_holiday(d)


def now_melbourne() -> datetime:
    return datetime.now(MELBOURNE)


def is_asx_open_at(instant: datetime | None = None) -> bool:
    m = instant if instant is not None else now_melbourne()
    if m.tzinfo is None:
        m = m.replace(tzinfo=timezone.utc).astimezone(MELBOURNE)
    else:
        m = m.astimezone(MELBOURNE)
    d = m.date()
    if not is_trading_day(d):
        return False
    t = m.time()
    return SESSION_OPEN <= t < SESSION_END


def describe_closed(instant: datetime | None = None) -> tuple[str | None, str | None]:
    """When market is closed: (reason_code, extra e.g. holiday name)."""
    m = instant if instant is not None else now_melbourne()
    if m.tzinfo is None:
        m = m.replace(tzinfo=timezone.utc).astimezone(MELBOURNE)
    else:
        m = m.astimezone(MELBOURNE)
    d = m.date()
    t = m.time()
    if is_public_holiday(d):
        return ("public_holiday", holiday_name(d))
    if d.weekday() >= 5:
        return ("weekend", None)
    if t < SESSION_OPEN:
        return ("before_open", None)
    if t >= SESSION_END:
        return ("after_close", None)
    return (None, None)


def next_session_open(instant: datetime | None = None) -> datetime:
    """Next 10:00 Melbourne on a trading day (strictly after *instant* if already past today's open)."""
    m = instant if instant is not None else now_melbourne()
    if m.tzinfo is None:
        m = m.replace(tzinfo=timezone.utc).astimezone(MELBOURNE)
    else:
        m = m.astimezone(MELBOURNE)

    d = m.date()
    open_today = datetime.combine(d, SESSION_OPEN, tzinfo=MELBOURNE)
    if is_trading_day(d) and m < open_today:
        return open_today

    cur = d + timedelta(days=1)
    for _ in range(400):
        if is_trading_day(cur):
            return datetime.combine(cur, SESSION_OPEN, tzinfo=MELBOURNE)
        cur += timedelta(days=1)
    raise RuntimeError("Could not find next ASX session")


def build_market_session_payload() -> dict[str, Any]:
    m = now_melbourne()
    open_ = is_asx_open_at(m)
    reason, extra = describe_closed(m)
    if open_:
        reason = None
        extra = None

    next_open: datetime | None = None
    seconds_until: int | None = None
    seconds_until_close: int | None = None
    if open_:
        session_close = datetime.combine(m.date(), SESSION_END, tzinfo=MELBOURNE)
        seconds_until_close = max(0, int((session_close - m).total_seconds()))
    else:
        next_open = next_session_open(m)
        seconds_until = max(0, int((next_open - m).total_seconds()))

    tz_abbr = m.tzname() or "Melbourne"
    display = m.strftime("%a %d %b %Y, %I:%M:%S %p").replace(" 0", " ")
    next_display = None
    if next_open is not None:
        next_display = next_open.strftime("%a %d %b %Y, %I:%M %p").replace(" 0", " ")

    return {
        "open": open_,
        "melbourne_time_iso": m.isoformat(),
        "melbourne_time_display": display,
        "timezone_abbr": tz_abbr,
        "session_hours_note": "Monday–Friday 10:00–16:00 Melbourne (AEST/AEDT); excludes Victorian public holidays.",
        "closed_reason": reason,
        "holiday_name": extra,
        "seconds_until_open": seconds_until,
        "seconds_until_close": seconds_until_close,
        "next_open_melbourne_iso": next_open.isoformat() if next_open else None,
        "next_open_display": next_display,
    }


def utc_naive_to_melbourne_iso(utc_naive: datetime) -> str:
    """Interpret naive datetime as UTC; return Melbourne ISO string."""
    if utc_naive.tzinfo is not None:
        u = utc_naive.astimezone(timezone.utc)
    else:
        u = utc_naive.replace(tzinfo=timezone.utc)
    return u.astimezone(MELBOURNE).isoformat()
