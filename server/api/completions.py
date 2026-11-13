"""Workout completion records: one per scheduled session, editable, never inferred from a saved plan."""
from __future__ import annotations

from .. import db
from ..app import ApiError, not_found, route
from ..validation import ValidationError, Validator
from .common import latest_allowed_date, row

STATUSES = ("completed", "partial", "skipped")


def _owned_session(conn, user_id, session_id):
    s = conn.execute(
        """SELECT s.* FROM plan_sessions s JOIN workout_plans p ON p.plan_id = s.plan_id
           WHERE s.session_id = ? AND p.user_id = ?""", (session_id, user_id)).fetchone()
    if not s:
        raise not_found("Workout session")
    return s


def _owned_completion(conn, user_id, completion_id):
    c = conn.execute(
        """SELECT c.* FROM workout_completions c JOIN workout_plans p ON p.plan_id = c.plan_id
           WHERE c.completion_id = ? AND p.user_id = ?""", (completion_id, user_id)).fetchone()
    if not c:
        raise not_found("Completion record")
    return c


def _validate(conn, body, session):
    v = Validator(body)
    status = v.choice("status", STATUSES, required=True, label="Status")
    v.date("session_date", required=True, label="Workout date", not_future=True, today=latest_allowed_date())
    v.number("duration_minutes", lo=1, hi=600, integer=True, label="Duration", unit="minutes")
    v.string("notes", max_len=280, label="Note")
    v.string("skip_reason", max_len=200, label="Reason")
    data = v.check()
    errors = {}
    if status == "skipped":
        if data["duration_minutes"] is not None:
            errors["duration_minutes"] = "A skipped session has no duration."
        data["duration_minutes"] = None
    else:
        data["skip_reason"] = None
    item_ids: list[int] = []
    if status == "partial":
        raw = body.get("completed_item_ids")
        if not isinstance(raw, list) or not raw or not all(isinstance(i, int) and not isinstance(i, bool) for i in raw):
            errors["completed_item_ids"] = "Select at least one exercise you completed."
        else:
            valid = {r[0] for r in conn.execute(
                "SELECT item_id FROM plan_items WHERE plan_id = ? AND day_number = ?",
                (session["plan_id"], session["day_number"]))}
            item_ids = sorted(set(raw))
            if not set(item_ids) <= valid:
                errors["completed_item_ids"] = "Completed exercises must belong to this session."
    if errors:
        raise ValidationError(errors)
    data["completed_item_ids"] = item_ids
    return data


def _write_items(conn, completion_id, item_ids):
    conn.execute("DELETE FROM completion_exercises WHERE completion_id = ?", (completion_id,))
    for i in item_ids:
        conn.execute("INSERT INTO completion_exercises(completion_id, item_id) VALUES (?, ?)", (completion_id, i))


def _out(conn, completion_id):
    c = row(conn.execute("SELECT * FROM workout_completions WHERE completion_id = ?", (completion_id,)).fetchone())
    c["completed_item_ids"] = [r[0] for r in conn.execute(
        "SELECT item_id FROM completion_exercises WHERE completion_id = ? ORDER BY item_id", (completion_id,))]
    return c


@route("POST", "/api/sessions/<session_id>/completion")
def create_completion(req):
    session = _owned_session(req.conn, req.user["user_id"], req.params["session_id"])
    existing = req.conn.execute("SELECT completion_id FROM workout_completions WHERE session_id = ?",
                                (session["session_id"],)).fetchone()
    if existing:
        raise ApiError(409, "This session already has a completion record. Edit it instead of adding another.",
                       "duplicate", completion_id=existing[0])
    data = _validate(req.conn, req.body, session)
    now = db.utc_now()
    with db.transaction(req.conn):
        cur = req.conn.execute(
            """INSERT INTO workout_completions(plan_id, session_id, session_date, status, duration_minutes, notes,
                                               skip_reason, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)""",
            (session["plan_id"], session["session_id"], data["session_date"], data["status"],
             data["duration_minutes"], data["notes"], data["skip_reason"], now, now))
        _write_items(req.conn, cur.lastrowid, data["completed_item_ids"])
    return 201, {"completion": _out(req.conn, cur.lastrowid)}


@route("GET", "/api/completions/<completion_id>")
def get_completion(req):
    c = _owned_completion(req.conn, req.user["user_id"], req.params["completion_id"])
    return {"completion": _out(req.conn, c["completion_id"])}


@route("PUT", "/api/completions/<completion_id>")
def update_completion(req):
    c = _owned_completion(req.conn, req.user["user_id"], req.params["completion_id"])
    session = req.conn.execute("SELECT * FROM plan_sessions WHERE session_id = ?", (c["session_id"],)).fetchone()
    data = _validate(req.conn, req.body, session)
    with db.transaction(req.conn):
        req.conn.execute(
            """UPDATE workout_completions SET session_date = ?, status = ?, duration_minutes = ?, notes = ?,
                      skip_reason = ?, updated_at = ? WHERE completion_id = ?""",
            (data["session_date"], data["status"], data["duration_minutes"], data["notes"], data["skip_reason"],
             db.utc_now(), c["completion_id"]))
        _write_items(req.conn, c["completion_id"], data["completed_item_ids"])
    return {"completion": _out(req.conn, c["completion_id"])}


@route("DELETE", "/api/completions/<completion_id>")
def delete_completion(req):
    c = _owned_completion(req.conn, req.user["user_id"], req.params["completion_id"])
    with db.transaction(req.conn):
        req.conn.execute("DELETE FROM workout_completions WHERE completion_id = ?", (c["completion_id"],))
    return {"deleted": True}
