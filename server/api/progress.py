"""Progress analytics — derived ONLY from workout_completions (never from saved/generated plans)."""
from __future__ import annotations

import datetime as dt

from ..app import route
from ..validation import ValidationError
from .common import client_today, rows

RANGES = {"7": 7, "30": 30, "90": 90, "all": None}


@route("GET", "/api/progress")
def progress(req):
    rng = req.q("range", "30")
    if rng not in RANGES:
        raise ValidationError({"range": "range must be 7, 30, 90 or all."})
    today = client_today(req)
    days = RANGES[rng]
    since = (today - dt.timedelta(days=days - 1)).isoformat() if days else "0000-01-01"

    records = rows(req.conn.execute(
        """SELECT c.completion_id, c.session_id, c.plan_id, c.session_date, c.status, c.duration_minutes, c.notes,
                  c.skip_reason, c.updated_at, s.title AS session_title, s.week_number, s.day_number,
                  s.scheduled_date, p.name AS plan_name,
                  (SELECT COUNT(*) FROM plan_items pi WHERE pi.plan_id = c.plan_id AND pi.day_number = s.day_number) AS planned_exercises,
                  (SELECT COUNT(*) FROM completion_exercises ce WHERE ce.completion_id = c.completion_id) AS done_exercises
           FROM workout_completions c
           JOIN workout_plans p ON p.plan_id = c.plan_id
           JOIN plan_sessions s ON s.session_id = c.session_id
           WHERE p.user_id = ? ORDER BY c.session_date DESC, c.completion_id DESC""", (req.user["user_id"],)))

    in_range = [r for r in records if since <= r["session_date"] <= today.isoformat()]

    def totals(rs):
        return {
            "completed": sum(r["status"] == "completed" for r in rs),
            "partial": sum(r["status"] == "partial" for r in rs),
            "skipped": sum(r["status"] == "skipped" for r in rs),
            "minutes": sum(r["duration_minutes"] or 0 for r in rs if r["status"] != "skipped"),
            "sessions_without_duration": sum(r["duration_minutes"] is None for r in rs if r["status"] != "skipped"),
            "logged": len(rs),
        }

    points = [
        {"completion_id": r["completion_id"], "date": r["session_date"], "minutes": r["duration_minutes"],
         "status": r["status"], "workout": r["session_title"], "plan": r["plan_name"], "plan_id": r["plan_id"],
         "week": r["week_number"], "notes": r["notes"], "planned_exercises": r["planned_exercises"],
         "done_exercises": r["done_exercises"]}
        for r in in_range if r["status"] in ("completed", "partial") and r["duration_minutes"] is not None
    ]

    # Weekly (Monday-start) for the last 8 weeks and monthly for the last 6 months, all-time records.
    monday = today - dt.timedelta(days=today.weekday())
    weekly = []
    for i in range(7, -1, -1):
        start = monday - dt.timedelta(weeks=i)
        end = start + dt.timedelta(days=6)
        rs = [r for r in records if start.isoformat() <= r["session_date"] <= end.isoformat()]
        weekly.append({"start": start.isoformat(), "end": end.isoformat(), **totals(rs)})
    monthly = []
    y, m = today.year, today.month
    for _ in range(6):
        key = f"{y:04d}-{m:02d}"
        rs = [r for r in records if r["session_date"].startswith(key)]
        monthly.append({"month": key, **totals(rs)})
        y, m = (y - 1, 12) if m == 1 else (y, m - 1)
    monthly.reverse()

    streak_days = sorted({r["session_date"] for r in records if r["status"] in ("completed", "partial")}, reverse=True)
    return {
        "range": rng, "since": since if days else None, "today": today.isoformat(),
        "totals": totals(in_range), "all_time": totals(records),
        "points": points, "recent": records[:12], "weekly": weekly, "monthly": monthly,
        "last_active": streak_days[0] if streak_days else None,
    }
