"""Workout plan endpoints: generate (preview), save, list, detail, rename, delete."""
from __future__ import annotations

import datetime as dt
import json

from .. import db, generator
from ..app import ApiError, not_found, route
from ..validation import ValidationError, Validator
from .common import row, rows


def _library(conn):
    return rows(conn.execute("SELECT * FROM exercises ORDER BY exercise_id"))


def _validate_inputs(body):
    v = Validator(body)
    v.choice("goal", generator.GOALS, required=True, label="Fitness goal")
    v.choice("level", generator.LEVELS, required=True, label="Experience level")
    v.number("days_per_week", required=True, lo=1, hi=7, integer=True, label="Training days")
    v.number("seed", lo=1, hi=2**31 - 1, integer=True, label="Seed")
    out = v.check()
    eq = body.get("equipment")
    if not isinstance(eq, list) or not eq:
        raise ValidationError({"equipment": "Select at least one equipment option."})
    if any(e not in generator.EQUIPMENT_CHOICES for e in eq) or len(set(eq)) != len(eq):
        raise ValidationError({"equipment": "Equipment selection contains an invalid option."})
    if "none" in eq and len(eq) > 1:
        raise ValidationError({"equipment": "'No Equipment' cannot be combined with other equipment."})
    out["equipment"] = [e for e in generator.EQUIPMENT_CHOICES if e in eq]  # canonical order
    return out


def _run(conn, data):
    if not conn.execute("SELECT 1 FROM exercises LIMIT 1").fetchone():
        raise ApiError(503, "The exercise library is not loaded.", "library_missing")
    try:
        return generator.generate(_library(conn), data["goal"], data["level"], data["equipment"],
                                  data["days_per_week"], data.get("seed"))
    except generator.GeneratorInputError as e:
        raise ValidationError({"form": str(e)})


@route("POST", "/api/plans/generate")
def generate_preview(req):
    return {"preview": _run(req.conn, _validate_inputs(req.body))}


@route("POST", "/api/plans")
def save_plan(req):
    data = _validate_inputs(req.body)
    if data.get("seed") is None:
        raise ValidationError({"seed": "Generate a plan before saving it."})
    v = Validator(req.body)
    v.string("name", max_len=80, label="Plan name")
    v.number("weeks", lo=1, hi=8, integer=True, label="Program length")
    v.date("start_date", required=True, label="Start date")
    extra = v.check()
    start = dt.date.fromisoformat(extra["start_date"])
    if abs((start - dt.date.today()).days) > 366:
        raise ValidationError({"start_date": "Start date must be within a year of today."})
    weeks = extra["weeks"] or 4

    # Regenerate server-side from the same seed: the saved plan is exactly the previewed plan, and the
    # equipment hard constraint is enforced again rather than trusting the client.
    plan = _run(req.conn, data)
    usable = generator.usable_equipment(data["equipment"])
    lib = {e["exercise_id"]: e for e in _library(req.conn)}
    for d in plan["days"]:
        for it in d["items"]:
            if lib[it["exercise_id"]]["equipment"] not in usable:
                raise ApiError(500, "Equipment constraint check failed; plan not saved.", "constraint")
    name = extra["name"] or plan["suggested_name"]
    now = db.utc_now()
    with db.transaction(req.conn):
        cur = req.conn.execute(
            """INSERT INTO workout_plans(user_id, name, goal, level, equipment, days_per_week, weeks, start_date, seed,
                                         generation_notes, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
            (req.user["user_id"], name, plan["goal"], plan["level"], ",".join(plan["equipment"]),
             plan["days_per_week"], weeks, start.isoformat(), plan["seed"], json.dumps(plan["notes"]), now))
        plan_id = cur.lastrowid
        for d in plan["days"]:
            for order, it in enumerate(d["items"], start=1):
                req.conn.execute(
                    """INSERT INTO plan_items(plan_id, exercise_id, day_number, order_number, sets, reps, rest, fallback_note)
                       VALUES (?,?,?,?,?,?,?,?)""",
                    (plan_id, it["exercise_id"], d["day_number"], order, it["sets"], it["reps"], it["rest"],
                     it["fallback_note"]))
        titles = {d["day_number"]: (d["title"], d["focus"]) for d in plan["days"]}
        for week, day, date in generator.schedule(start, plan["days_per_week"], weeks):
            req.conn.execute(
                "INSERT INTO plan_sessions(plan_id, week_number, day_number, title, focus, scheduled_date) VALUES (?,?,?,?,?,?)",
                (plan_id, week, day, titles[day][0], titles[day][1], date.isoformat()))
    return 201, {"plan": plan_detail(req.conn, req.user["user_id"], plan_id)}


def _owned_plan(conn, user_id, plan_id):
    p = conn.execute("SELECT * FROM workout_plans WHERE plan_id = ? AND user_id = ?", (plan_id, user_id)).fetchone()
    if not p:
        raise not_found("Workout plan")
    return p


def _plan_summary(p: dict) -> dict:
    p = dict(p)
    p["equipment"] = p["equipment"].split(",")
    p["generation_notes"] = json.loads(p["generation_notes"])
    return p


def plan_detail(conn, user_id, plan_id):
    p = _plan_summary(_owned_plan(conn, user_id, plan_id))
    items = rows(conn.execute(
        """SELECT pi.item_id, pi.day_number, pi.order_number, pi.sets, pi.reps, pi.rest, pi.fallback_note,
                  e.exercise_id, e.name, e.muscle, e.equipment, e.level, e.workout_type, e.instructions, e.goal
           FROM plan_items pi JOIN exercises e ON e.exercise_id = pi.exercise_id
           WHERE pi.plan_id = ? ORDER BY pi.day_number, pi.order_number""", (plan_id,)))
    sessions = rows(conn.execute(
        """SELECT s.*, c.completion_id, c.status AS completion_status, c.session_date, c.duration_minutes, c.notes,
                  c.skip_reason, c.created_at AS completion_created_at, c.updated_at AS completion_updated_at
           FROM plan_sessions s LEFT JOIN workout_completions c ON c.session_id = s.session_id
           WHERE s.plan_id = ? ORDER BY s.scheduled_date, s.day_number""", (plan_id,)))
    done_items = {}
    for r in conn.execute(
            """SELECT ce.completion_id, ce.item_id FROM completion_exercises ce
               JOIN workout_completions c ON c.completion_id = ce.completion_id WHERE c.plan_id = ?""", (plan_id,)):
        done_items.setdefault(r["completion_id"], []).append(r["item_id"])
    days = {}
    for it in items:
        it["goals"] = it.pop("goal").split(",")
        days.setdefault(it["day_number"], []).append(it)
    titles = {}
    for s in sessions:
        titles.setdefault(s["day_number"], (s["title"], s["focus"]))
        s["status"] = s["completion_status"] or "upcoming"
        s["completion"] = None
        if s["completion_id"]:
            s["completion"] = {
                "completion_id": s["completion_id"], "status": s["completion_status"],
                "session_date": s["session_date"], "duration_minutes": s["duration_minutes"], "notes": s["notes"],
                "skip_reason": s["skip_reason"], "completed_item_ids": done_items.get(s["completion_id"], []),
                "created_at": s["completion_created_at"], "updated_at": s["completion_updated_at"],
            }
        for k in ("completion_id", "completion_status", "session_date", "duration_minutes", "notes", "skip_reason",
                  "completion_created_at", "completion_updated_at"):
            s.pop(k)
    p["days"] = [{"day_number": d, "title": titles.get(d, (f"Day {d}", ""))[0], "focus": titles.get(d, ("", ""))[1],
                  "items": days.get(d, [])} for d in range(1, p["days_per_week"] + 1)]
    p["sessions"] = sessions
    p["counts"] = _counts(sessions)
    return p


def _counts(sessions):
    c = {"total": len(sessions), "completed": 0, "partial": 0, "skipped": 0, "upcoming": 0}
    for s in sessions:
        c[s["status"]] += 1
    return c


@route("GET", "/api/plans")
def list_plans(req):
    plans = []
    for p in req.conn.execute("SELECT * FROM workout_plans WHERE user_id = ? ORDER BY created_at DESC, plan_id DESC",
                              (req.user["user_id"],)):
        d = _plan_summary(p)
        stat = req.conn.execute(
            """SELECT COUNT(*) AS total,
                      SUM(c.status = 'completed') AS completed, SUM(c.status = 'partial') AS partial,
                      SUM(c.status = 'skipped') AS skipped,
                      MIN(CASE WHEN c.completion_id IS NULL THEN s.scheduled_date END) AS next_date
               FROM plan_sessions s LEFT JOIN workout_completions c ON c.session_id = s.session_id
               WHERE s.plan_id = ?""", (p["plan_id"],)).fetchone()
        total = stat["total"] or 0
        logged = sum(stat[k] or 0 for k in ("completed", "partial", "skipped"))
        d["counts"] = {"total": total, "completed": stat["completed"] or 0, "partial": stat["partial"] or 0,
                       "skipped": stat["skipped"] or 0, "upcoming": total - logged}
        nxt = None
        if stat["next_date"]:
            nxt = row(req.conn.execute(
                """SELECT s.session_id, s.title, s.scheduled_date, s.week_number, s.day_number FROM plan_sessions s
                   LEFT JOIN workout_completions c ON c.session_id = s.session_id
                   WHERE s.plan_id = ? AND c.completion_id IS NULL ORDER BY s.scheduled_date, s.day_number LIMIT 1""",
                (p["plan_id"],)).fetchone())
        d["next_session"] = nxt
        plans.append(d)
    return {"plans": plans}


@route("GET", "/api/plans/<plan_id>")
def get_plan(req):
    return {"plan": plan_detail(req.conn, req.user["user_id"], req.params["plan_id"])}


@route("PATCH", "/api/plans/<plan_id>")
def rename_plan(req):
    _owned_plan(req.conn, req.user["user_id"], req.params["plan_id"])
    v = Validator(req.body)
    v.string("name", required=True, max_len=80, label="Plan name")
    data = v.check()
    with db.transaction(req.conn):
        req.conn.execute("UPDATE workout_plans SET name = ? WHERE plan_id = ?", (data["name"], req.params["plan_id"]))
    return {"plan": plan_detail(req.conn, req.user["user_id"], req.params["plan_id"])}


@route("DELETE", "/api/plans/<plan_id>")
def delete_plan(req):
    _owned_plan(req.conn, req.user["user_id"], req.params["plan_id"])
    with db.transaction(req.conn):
        removed = req.conn.execute("SELECT COUNT(*) FROM workout_completions WHERE plan_id = ?",
                                   (req.params["plan_id"],)).fetchone()[0]
        req.conn.execute("DELETE FROM workout_plans WHERE plan_id = ?", (req.params["plan_id"],))
    return {"deleted": True, "completions_removed": removed}
