"""Profile endpoints. A profile is identified on this device by a random access token."""
from __future__ import annotations

import secrets

from .. import db
from ..app import route
from ..validation import Validator
from .common import row

GENDERS = ("female", "male", "non_binary", "prefer_not_to_say")
AGE_BANDS = ("adult", "under_18", "prefer_not_to_say")
PUBLIC_FIELDS = ("user_id", "name", "gender", "height_cm", "weight_kg", "age_band", "unit_system", "temp_unit",
                 "created_at", "updated_at")


def bmi_info(u: dict) -> dict | None:
    h, w = u.get("height_cm"), u.get("weight_kg")
    if not h or not w:
        return None
    value = round(w / (h / 100) ** 2, 1)
    info = {"value": value, "category": None, "range": None,
            "note": "BMI is a general screening estimate from height and weight only. It does not measure body "
                    "fat, muscle or health, and is not a diagnosis."}
    if u.get("age_band") == "adult":
        for hi, label, rng in ((18.5, "Underweight", "below 18.5"), (25, "Normal range", "18.5 – 24.9"),
                               (30, "Overweight", "25.0 – 29.9"), (float("inf"), "Obesity", "30.0 and above")):
            if value < hi:
                info["category"], info["range"] = label, rng
                break
        info["note"] += " Category shown uses the WHO adult classification."
    elif u.get("age_band") == "under_18":
        info["note"] += (" Adult BMI categories do not apply to people under 18; age- and sex-specific growth "
                         "charts are used instead, ideally with a healthcare professional.")
    else:
        info["note"] += " No category is shown because adult BMI categories only apply to adults (18+)."
    return info


def public(u) -> dict:
    d = {k: u[k] for k in PUBLIC_FIELDS}
    d["bmi"] = bmi_info(d)
    return d


def _validate(body, *, creating: bool):
    v = Validator(body)
    v.string("name", required=creating, max_len=60, label="Name")
    v.choice("gender", GENDERS, required=creating, label="Gender")
    v.number("height_cm", required=creating, lo=50, hi=272, label="Height", unit="cm")
    v.number("weight_kg", required=creating, lo=20, hi=400, label="Weight", unit="kg")
    v.choice("age_band", AGE_BANDS, label="Age group")
    v.choice("unit_system", ("metric", "imperial"), label="Units")
    v.choice("temp_unit", ("C", "F"), label="Temperature unit")
    out = v.check()
    for k in ("height_cm", "weight_kg"):
        if out.get(k) is not None:
            out[k] = round(float(out[k]), 1)
    return out


@route("POST", "/api/users", auth=False)
def create_user(req):
    data = _validate(req.body, creating=True)
    token = secrets.token_urlsafe(32)
    now = db.utc_now()
    with db.transaction(req.conn):
        cur = req.conn.execute(
            """INSERT INTO users(name, access_token, created_at, updated_at, gender, height_cm, weight_kg, age_band,
                                 unit_system, temp_unit) VALUES (?,?,?,?,?,?,?,?,?,?)""",
            (data["name"], token, now, now, data["gender"], data["height_cm"], data["weight_kg"], data["age_band"],
             data["unit_system"] or "metric", data["temp_unit"] or "C"))
    u = req.conn.execute("SELECT * FROM users WHERE user_id = ?", (cur.lastrowid,)).fetchone()
    return 201, {"user": public(u), "token": token}


@route("GET", "/api/me")
def get_me(req):
    return {"user": public(req.user)}


@route("PUT", "/api/me")
def update_me(req):
    data = _validate(req.body, creating=False)
    fields = {k: v for k, v in data.items() if k in req.body}
    # Required profile fields may be changed but not cleared.
    for k in ("name", "gender", "height_cm", "weight_kg"):
        if k in fields and fields[k] is None:
            fields.pop(k)
    if fields:
        cols = ", ".join(f"{k} = ?" for k in fields)
        with db.transaction(req.conn):
            req.conn.execute(f"UPDATE users SET {cols}, updated_at = ? WHERE user_id = ?",
                             (*fields.values(), db.utc_now(), req.user["user_id"]))
    u = req.conn.execute("SELECT * FROM users WHERE user_id = ?", (req.user["user_id"],)).fetchone()
    return {"user": public(u)}


@route("DELETE", "/api/me")
def delete_me(req):
    with db.transaction(req.conn):
        req.conn.execute("DELETE FROM users WHERE user_id = ?", (req.user["user_id"],))
    return {"deleted": True}
