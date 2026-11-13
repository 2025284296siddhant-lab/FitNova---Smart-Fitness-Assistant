"""Shared helpers for API handlers."""
from __future__ import annotations

import datetime as dt

from ..validation import ValidationError


def row(r):
    return dict(r) if r is not None else None


def rows(rs):
    return [dict(r) for r in rs]


def client_today(req) -> dt.date:
    """The caller's local calendar date (sent as ?today=YYYY-MM-DD), bounded to ±1 day of server UTC."""
    utc_today = dt.datetime.now(dt.timezone.utc).date()
    raw = req.q("today")
    if not raw:
        return dt.date.today()
    try:
        d = dt.date.fromisoformat(raw)
    except ValueError:
        raise ValidationError({"today": "today must be YYYY-MM-DD."})
    if abs((d - utc_today).days) > 1:
        raise ValidationError({"today": "today is not a plausible current date."})
    return d


def latest_allowed_date() -> dt.date:
    """Latest local date anywhere on Earth right now (UTC+14) — used for 'not in the future' checks."""
    return (dt.datetime.now(dt.timezone.utc) + dt.timedelta(hours=14)).date()
