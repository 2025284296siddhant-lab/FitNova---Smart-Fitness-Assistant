"""Exercise library (read-only)."""
from __future__ import annotations

from ..app import route
from .common import rows


@route("GET", "/api/exercises", auth=False)
def list_exercises(req):
    sql, args = "SELECT * FROM exercises WHERE 1=1", []
    for key in ("muscle", "equipment", "level", "workout_type"):
        val = req.q(key)
        if val:
            sql += f" AND {key} = ?"
            args.append(val)
    goal = req.q("goal")
    if goal:
        sql += " AND (',' || goal || ',') LIKE ?"
        args.append(f"%,{goal},%")
    text = (req.q("q") or "").strip()[:60]
    if text:
        sql += " AND name LIKE ?"
        args.append(f"%{text}%")
    sql += " ORDER BY muscle, name"
    items = rows(req.conn.execute(sql, args))
    for it in items:
        it["goals"] = it.pop("goal").split(",")
    return {"exercises": items, "count": len(items)}
