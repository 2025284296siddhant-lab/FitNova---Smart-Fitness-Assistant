"""Vitals records — manual entries, informational only. Plausibility checks are NOT medical ranges."""
from __future__ import annotations

from .. import db
from ..app import not_found, route
from ..validation import ValidationError, Validator
from .common import row, rows

TYPES = ("heart_rate", "blood_pressure", "spo2", "temperature")
UNITS = {"heart_rate": ("bpm",), "blood_pressure": ("mmHg",), "spo2": ("%",), "temperature": ("C", "F")}
# Input plausibility bounds (to catch typos), deliberately wide. Not health thresholds.
BOUNDS = {
    ("heart_rate", "bpm"): (25, 250), ("blood_pressure", "mmHg"): (60, 260), ("spo2", "%"): (50, 100),
    ("temperature", "C"): (30, 45), ("temperature", "F"): (86, 113),
}
DIASTOLIC_BOUNDS = (30, 160)
LABELS = {"heart_rate": "Resting heart rate", "blood_pressure": "Systolic pressure", "spo2": "SpO₂",
          "temperature": "Temperature"}


def _validate(body):
    v = Validator(body)
    mtype = v.choice("measurement_type", TYPES, required=True, label="Measurement type")
    v.timestamp("recorded_at", required=True, label="Date and time")
    v.string("notes", max_len=280, label="Note")
    data = v.check()
    errors = {}
    unit = body.get("unit")
    if unit not in UNITS[mtype]:
        raise ValidationError({"unit": f"Unit must be {' or '.join(UNITS[mtype])} for this measurement."})
    lo, hi = BOUNDS[(mtype, unit)]
    v2 = Validator(body)
    value = v2.number("value", required=True, lo=lo, hi=hi, label=LABELS[mtype], unit=unit)
    secondary = None
    if mtype == "blood_pressure":
        secondary = v2.number("secondary_value", required=True, lo=DIASTOLIC_BOUNDS[0], hi=DIASTOLIC_BOUNDS[1],
                              label="Diastolic pressure", unit="mmHg")
    elif body.get("secondary_value") not in (None, ""):
        errors["secondary_value"] = "Only blood pressure has a second value."
    errors.update(v2.errors)
    if not errors and secondary is not None and secondary >= value:
        errors["secondary_value"] = "Diastolic must be lower than systolic — please check the reading."
    if errors:
        raise ValidationError(errors)
    if mtype in ("heart_rate", "blood_pressure"):
        value = round(value)
        secondary = round(secondary) if secondary is not None else None
    else:
        value = round(float(value), 1)
    data.update(unit=unit, value=value, secondary_value=secondary)
    return data


def _owned(conn, user_id, vital_id):
    r = conn.execute("SELECT * FROM vitals_records WHERE vital_id = ? AND user_id = ?", (vital_id, user_id)).fetchone()
    if not r:
        raise not_found("Vitals record")
    return r


@route("GET", "/api/vitals")
def list_vitals(req):
    v = Validator({k: req.q(k) for k in ("type", "from", "to")})
    v.choice("type", TYPES, label="Type")
    v.timestamp("from", label="From", not_future=False)
    v.timestamp("to", label="To", not_future=False)
    f = v.check()
    sql, args = "SELECT * FROM vitals_records WHERE user_id = ?", [req.user["user_id"]]
    if f["type"]:
        sql += " AND measurement_type = ?"
        args.append(f["type"])
    if f["from"]:
        sql += " AND recorded_at >= ?"
        args.append(f["from"])
    if f["to"]:
        sql += " AND recorded_at <= ?"
        args.append(f["to"])
    sql += " ORDER BY recorded_at DESC, vital_id DESC LIMIT 2000"
    return {"records": rows(req.conn.execute(sql, args))}


@route("GET", "/api/vitals/latest")
def latest(req):
    out = {}
    for t in TYPES:
        out[t] = row(req.conn.execute(
            "SELECT * FROM vitals_records WHERE user_id = ? AND measurement_type = ? ORDER BY recorded_at DESC, vital_id DESC LIMIT 1",
            (req.user["user_id"], t)).fetchone())
    return {"latest": out}


@route("POST", "/api/vitals")
def create_vital(req):
    d = _validate(req.body)
    now = db.utc_now()
    with db.transaction(req.conn):
        cur = req.conn.execute(
            """INSERT INTO vitals_records(user_id, measurement_type, value, secondary_value, unit, recorded_at, notes,
                                          source, created_at, updated_at) VALUES (?,?,?,?,?,?,?, 'manual', ?, ?)""",
            (req.user["user_id"], d["measurement_type"], d["value"], d["secondary_value"], d["unit"],
             d["recorded_at"], d["notes"], now, now))
    return 201, {"record": row(req.conn.execute("SELECT * FROM vitals_records WHERE vital_id = ?",
                                                (cur.lastrowid,)).fetchone())}


@route("PUT", "/api/vitals/<vital_id>")
def update_vital(req):
    _owned(req.conn, req.user["user_id"], req.params["vital_id"])
    d = _validate(req.body)
    with db.transaction(req.conn):
        req.conn.execute(
            """UPDATE vitals_records SET measurement_type = ?, value = ?, secondary_value = ?, unit = ?, recorded_at = ?,
                      notes = ?, updated_at = ? WHERE vital_id = ? AND user_id = ?""",
            (d["measurement_type"], d["value"], d["secondary_value"], d["unit"], d["recorded_at"], d["notes"],
             db.utc_now(), req.params["vital_id"], req.user["user_id"]))
    return {"record": row(_owned(req.conn, req.user["user_id"], req.params["vital_id"]))}


@route("DELETE", "/api/vitals/<vital_id>")
def delete_vital(req):
    _owned(req.conn, req.user["user_id"], req.params["vital_id"])
    with db.transaction(req.conn):
        req.conn.execute("DELETE FROM vitals_records WHERE vital_id = ? AND user_id = ?",
                         (req.params["vital_id"], req.user["user_id"]))
    return {"deleted": True}
