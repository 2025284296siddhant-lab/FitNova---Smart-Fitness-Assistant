"""Shared test helpers: real server on a free port with a temp DB, and a JSON HTTP caller."""
from __future__ import annotations

import datetime as dt
import json
import shutil
import sys
import tempfile
import unittest
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from server import app as server_app  # noqa: E402


def call(base, method, path, body=None, token=None, headers=None):
    """Call the API. Returns (status, parsed_json_or_None)."""
    hdrs = {"Accept": "application/json"}
    data = None
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        hdrs["Content-Type"] = "application/json"
    if token:
        hdrs["X-User-Token"] = token
    hdrs.update(headers or {})
    req = urllib.request.Request(base + path, data=data, method=method, headers=hdrs)
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            raw = resp.read()
            status = resp.status
    except urllib.error.HTTPError as e:
        raw = e.read()
        status = e.code
    return status, (json.loads(raw.decode("utf-8")) if raw else None)


def today() -> dt.date:
    return dt.date.today()


def iso(d: dt.date) -> str:
    return d.isoformat()


class ServerTestCase(unittest.TestCase):
    """One temp DB + real server per test class."""

    @classmethod
    def setUpClass(cls):
        cls.tmpdir = tempfile.mkdtemp(prefix="fitnova-test-")
        cls.db_path = str(Path(cls.tmpdir) / "test.db")
        cls.srv = server_app.serve_in_thread(cls.db_path, port=0)
        cls.base = f"http://127.0.0.1:{cls.srv.server_address[1]}"

    @classmethod
    def tearDownClass(cls):
        cls.srv.shutdown()
        cls.srv.server_close()
        shutil.rmtree(cls.tmpdir, ignore_errors=True)

    # --- convenience wrappers
    def api(self, method, path, body=None, token=None):
        return call(self.base, method, path, body, token)

    def make_user(self, name="Tester", age_band="adult", **over):
        body = {"name": name, "gender": "female", "height_cm": 170, "weight_kg": 65}
        if age_band:
            body["age_band"] = age_band
        body.update(over)
        st, out = self.api("POST", "/api/users", body)
        self.assertEqual(st, 201, out)
        return out["token"], out["user"]

    def make_plan(self, token, goal="general_fitness", level="beginner", equipment=("none",), days=3,
                  start=None, weeks=2, seed=12345):
        body = {"goal": goal, "level": level, "equipment": list(equipment), "days_per_week": days,
                "seed": seed, "start_date": iso(start or today()), "weeks": weeks}
        st, out = self.api("POST", "/api/plans", body, token)
        self.assertEqual(st, 201, out)
        return out["plan"]
