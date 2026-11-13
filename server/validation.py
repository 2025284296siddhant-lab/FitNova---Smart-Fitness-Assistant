"""Input validation. Collects field errors and raises one ValidationError (HTTP 400)."""
from __future__ import annotations

import datetime as dt
import math
import re

_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


class ValidationError(Exception):
    def __init__(self, errors: dict[str, str]):
        super().__init__("; ".join(f"{k}: {v}" for k, v in errors.items()))
        self.errors = errors


class Validator:
    def __init__(self, data):
        if not isinstance(data, dict):
            raise ValidationError({"body": "Expected a JSON object."})
        self.data = data
        self.errors: dict[str, str] = {}
        self.out: dict = {}

    def _missing(self, key):
        v = self.data.get(key)
        return v is None or (isinstance(v, str) and v.strip() == "")

    def _fail(self, key, msg):
        self.errors.setdefault(key, msg)
        return None

    def string(self, key, *, required=False, max_len=500, min_len=1, label=None):
        label = label or key.replace("_", " ").capitalize()
        if self._missing(key):
            if required:
                return self._fail(key, f"{label} is required.")
            self.out[key] = None
            return None
        v = self.data[key]
        if not isinstance(v, str):
            return self._fail(key, f"{label} must be text.")
        v = v.strip()
        if len(v) < min_len or len(v) > max_len:
            return self._fail(key, f"{label} must be {min_len}-{max_len} characters.")
        self.out[key] = v
        return v

    def choice(self, key, options, *, required=False, label=None):
        label = label or key.replace("_", " ").capitalize()
        if self._missing(key):
            if required:
                return self._fail(key, f"{label} is required.")
            self.out[key] = None
            return None
        v = self.data[key]
        if v not in options:
            return self._fail(key, f"{label} must be one of: {', '.join(options)}.")
        self.out[key] = v
        return v

    def number(self, key, *, required=False, lo=None, hi=None, integer=False, label=None, unit=""):
        label = label or key.replace("_", " ").capitalize()
        if self._missing(key):
            if required:
                return self._fail(key, f"{label} is required.")
            self.out[key] = None
            return None
        v = self.data[key]
        if isinstance(v, bool):
            return self._fail(key, f"{label} must be a number.")
        if isinstance(v, str):
            try:
                v = float(v.strip())
            except ValueError:
                return self._fail(key, f"{label} must be a number.")
        if not isinstance(v, (int, float)) or math.isnan(v) or math.isinf(v):
            return self._fail(key, f"{label} must be a number.")
        if integer:
            if float(v) != int(v):
                return self._fail(key, f"{label} must be a whole number.")
            v = int(v)
        sfx = f" {unit}" if unit else ""
        if lo is not None and v < lo or hi is not None and v > hi:
            return self._fail(key, f"{label} must be between {lo} and {hi}{sfx}.")
        self.out[key] = v
        return v

    def date(self, key, *, required=False, label=None, not_future=False, today=None):
        label = label or key.replace("_", " ").capitalize()
        if self._missing(key):
            if required:
                return self._fail(key, f"{label} is required.")
            self.out[key] = None
            return None
        v = self.data[key]
        if not isinstance(v, str) or not _DATE_RE.match(v):
            return self._fail(key, f"{label} must be a date (YYYY-MM-DD).")
        try:
            d = dt.date.fromisoformat(v)
        except ValueError:
            return self._fail(key, f"{label} is not a valid date.")
        if not_future and d > (today or dt.date.today()):
            return self._fail(key, f"{label} cannot be in the future.")
        self.out[key] = v
        return v

    def timestamp(self, key, *, required=False, label=None, not_future=True):
        """Accept ISO-8601 with offset or 'Z'; normalise to UTC '...Z'."""
        label = label or key.replace("_", " ").capitalize()
        if self._missing(key):
            if required:
                return self._fail(key, f"{label} is required.")
            self.out[key] = None
            return None
        v = self.data[key]
        if not isinstance(v, str):
            return self._fail(key, f"{label} must be a date and time.")
        try:
            parsed = dt.datetime.fromisoformat(v.strip().replace("Z", "+00:00"))
        except ValueError:
            return self._fail(key, f"{label} must be a valid date and time.")
        if parsed.tzinfo is None:
            return self._fail(key, f"{label} must include a timezone offset.")
        parsed = parsed.astimezone(dt.timezone.utc).replace(microsecond=0)
        if not_future and parsed > dt.datetime.now(dt.timezone.utc) + dt.timedelta(minutes=5):
            return self._fail(key, f"{label} cannot be in the future.")
        if parsed.year < 1900:
            return self._fail(key, f"{label} is too far in the past.")
        out = parsed.strftime("%Y-%m-%dT%H:%M:%SZ")
        self.out[key] = out
        return out

    def check(self) -> dict:
        if self.errors:
            raise ValidationError(self.errors)
        return self.out
