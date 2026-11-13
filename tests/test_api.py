import datetime as dt
import unittest
import urllib.parse

from tests.helpers import ServerTestCase, call, iso, today

ZERO_TOTALS = {"completed": 0, "partial": 0, "skipped": 0, "minutes": 0, "sessions_without_duration": 0,
               "logged": 0}


def utc_stamp(delta_days=0, hour=8):
    d = dt.datetime.now(dt.timezone.utc).replace(hour=hour, minute=0, second=0, microsecond=0)
    return (d - dt.timedelta(days=delta_days)).strftime("%Y-%m-%dT%H:%M:%SZ")


class AuthAndProfileTests(ServerTestCase):
    def test_401_without_token(self):
        for method, path in (("GET", "/api/plans"), ("GET", "/api/progress"), ("GET", "/api/vitals"),
                             ("GET", "/api/vitals/latest"), ("POST", "/api/plans/generate"), ("GET", "/api/me")):
            st, out = self.api(method, path, {} if method == "POST" else None)
            self.assertEqual(st, 401, path)
            self.assertIn("error", out)

    def test_401_with_bad_token(self):
        st, _ = self.api("GET", "/api/plans", token="not-a-real-token")
        self.assertEqual(st, 401)

    def test_create_user_validation(self):
        st, out = self.api("POST", "/api/users", {"name": "", "gender": "x", "height_cm": 10, "weight_kg": 5})
        self.assertEqual(st, 400)
        self.assertEqual(out["error"]["code"], "validation")

    def test_bmi_category_only_for_adults(self):
        _, adult = self.make_user("A", age_band="adult")
        _, minor = self.make_user("M", age_band="under_18")
        _, unspec = self.make_user("U", age_band=None)
        _, pns = self.make_user("P", age_band="prefer_not_to_say")
        self.assertAlmostEqual(adult["bmi"]["value"], 22.5, places=1)
        self.assertEqual(adult["bmi"]["category"], "Normal range")
        for u in (minor, unspec, pns):
            self.assertIsNotNone(u["bmi"]["value"])
            self.assertIsNone(u["bmi"]["category"])
            self.assertTrue(u["bmi"]["note"])


class PlanTests(ServerTestCase):
    def setUp(self):
        self.token, _ = self.make_user()

    def test_generate_preview_and_save_matches(self):
        body = {"goal": "strength", "level": "beginner", "equipment": ["dumbbells"], "days_per_week": 3}
        st, out = self.api("POST", "/api/plans/generate", body, self.token)
        self.assertEqual(st, 200, out)
        prev = out["preview"]
        self.assertEqual(len(prev["days"]), 3)
        self.assertIn("seed", prev)
        self.assertIn("notes", prev)
        self.assertEqual(set(prev["usable_equipment"]), {"none", "dumbbells"})
        # Nothing saved by previewing.
        st, out = self.api("GET", "/api/plans", token=self.token)
        self.assertEqual(out["plans"], [])
        save = dict(body, seed=prev["seed"], start_date=iso(today()))
        st, out = self.api("POST", "/api/plans", save, self.token)
        self.assertEqual(st, 201, out)
        plan = out["plan"]
        self.assertEqual([[i["exercise_id"] for i in d["items"]] for d in plan["days"]],
                         [[i["exercise_id"] for i in d["items"]] for d in prev["days"]])

    def test_save_reload_rename_delete(self):
        plan = self.make_plan(self.token, equipment=["bands"], days=4, weeks=3)
        pid = plan["plan_id"]
        self.assertEqual(len(plan["sessions"]), 12)
        self.assertEqual(len(plan["days"]), 4)
        st, out = self.api("GET", f"/api/plans/{pid}", token=self.token)
        self.assertEqual(st, 200)
        self.assertEqual(out["plan"]["plan_id"], pid)
        st, out = self.api("PATCH", f"/api/plans/{pid}", {"name": "My Plan"}, self.token)
        self.assertEqual(st, 200)
        self.assertEqual(out["plan"]["name"], "My Plan")
        st, out = self.api("PATCH", f"/api/plans/{pid}", {"name": ""}, self.token)
        self.assertEqual(st, 400)
        st, out = self.api("GET", "/api/plans", token=self.token)
        self.assertIn(pid, [p["plan_id"] for p in out["plans"]])
        st, out = self.api("DELETE", f"/api/plans/{pid}", token=self.token)
        self.assertEqual(st, 200)
        st, _ = self.api("GET", f"/api/plans/{pid}", token=self.token)
        self.assertEqual(st, 404)

    def test_saved_plan_equipment_constraint(self):
        for eq in (["none"], ["dumbbells"], ["bands"], ["barbell"]):
            plan = self.make_plan(self.token, equipment=eq, days=5, level="advanced", goal="muscle_gain")
            allowed = {"none", *eq}
            for d in plan["days"]:
                for it in d["items"]:
                    self.assertIn(it["equipment"], allowed)

    def test_invalid_generate_inputs(self):
        good = {"goal": "strength", "level": "beginner", "equipment": ["none"], "days_per_week": 3}
        cases = [
            dict(good, goal="nope"), dict(good, level="nope"), dict(good, days_per_week=0),
            dict(good, days_per_week=8), dict(good, days_per_week="abc"), dict(good, equipment=[]),
            dict(good, equipment=["kettlebell"]), dict(good, equipment=["none", "dumbbells"]),
            dict(good, equipment="none"),
        ]
        for c in cases:
            st, out = self.api("POST", "/api/plans/generate", c, self.token)
            self.assertEqual(st, 400, c)
            self.assertEqual(out["error"]["code"], "validation")

    def test_save_requires_seed_and_date(self):
        good = {"goal": "strength", "level": "beginner", "equipment": ["none"], "days_per_week": 3}
        st, _ = self.api("POST", "/api/plans", dict(good, start_date=iso(today())), self.token)
        self.assertEqual(st, 400)
        st, _ = self.api("POST", "/api/plans", dict(good, seed=5), self.token)
        self.assertEqual(st, 400)
        st, _ = self.api("POST", "/api/plans", dict(good, seed=5, start_date="2026-13-45"), self.token)
        self.assertEqual(st, 400)


class CompletionAndProgressTests(ServerTestCase):
    def setUp(self):
        self.token, _ = self.make_user()
        self.plan = self.make_plan(self.token, days=3, weeks=2)
        self.sessions = self.plan["sessions"]

    def progress(self, rng="30", token=None):
        st, out = self.api("GET", f"/api/progress?range={rng}&today={iso(today())}", token=token or self.token)
        self.assertEqual(st, 200, out)
        return out

    def complete(self, session, status="completed", duration=40, **extra):
        body = {"status": status, "session_date": iso(today())}
        if duration is not None:
            body["duration_minutes"] = duration
        body.update(extra)
        return self.api("POST", f"/api/sessions/{session['session_id']}/completion", body, self.token)

    def day_item_ids(self, session):
        day = next(d for d in self.plan["days"] if d["day_number"] == session["day_number"])
        return [i["item_id"] for i in day["items"]]

    def test_saved_plan_has_zero_completions_and_progress_zero(self):
        for s in self.sessions:
            self.assertEqual(s["status"], "upcoming")
            self.assertIsNone(s["completion"])
        self.assertEqual(self.plan["counts"]["completed"], 0)
        for rng in ("7", "30", "90", "all"):
            p = self.progress(rng)
            self.assertEqual(p["totals"], ZERO_TOTALS)
            self.assertEqual(p["all_time"], ZERO_TOTALS)
            self.assertEqual(p["points"], [])
            self.assertEqual(p["recent"], [])

    def test_completed_flow(self):
        s = self.sessions[0]
        st, out = self.complete(s, "completed", 45, notes="felt good")
        self.assertEqual(st, 201, out)
        c = out["completion"]
        self.assertEqual(c["status"], "completed")
        self.assertEqual(c["duration_minutes"], 45)
        st, got = self.api("GET", f"/api/completions/{c['completion_id']}", token=self.token)
        self.assertEqual(st, 200)
        self.assertEqual(got["completion"]["notes"], "felt good")
        p = self.progress()
        self.assertEqual(p["totals"]["completed"], 1)
        self.assertEqual(p["totals"]["minutes"], 45)
        self.assertEqual(len(p["points"]), 1)
        self.assertEqual(p["points"][0]["minutes"], 45)
        self.assertEqual(p["points"][0]["date"], iso(today()))
        # plan detail reflects it; other sessions remain upcoming
        st, out = self.api("GET", f"/api/plans/{self.plan['plan_id']}", token=self.token)
        self.assertEqual(out["plan"]["counts"]["completed"], 1)
        self.assertEqual(out["plan"]["counts"]["upcoming"], len(self.sessions) - 1)

    def test_partial_flow_and_validation(self):
        s = self.sessions[0]
        ids = self.day_item_ids(s)
        self.assertTrue(len(ids) >= 2)
        # required
        st, out = self.complete(s, "partial", 20)
        self.assertEqual(st, 400)
        self.assertIn("completed_item_ids", out["error"]["fields"])
        st, out = self.complete(s, "partial", 20, completed_item_ids=[])
        self.assertEqual(st, 400)
        # items from another session's day are rejected
        other = next(x for x in self.sessions if x["day_number"] != s["day_number"])
        foreign = self.day_item_ids(other)
        st, out = self.complete(s, "partial", 20, completed_item_ids=[foreign[0]])
        self.assertEqual(st, 400)
        st, out = self.complete(s, "partial", 20, completed_item_ids=[999999])
        self.assertEqual(st, 400)
        st, out = self.complete(s, "partial", 20, completed_item_ids=["a"])
        self.assertEqual(st, 400)
        # nothing was recorded by failures
        self.assertEqual(self.progress()["all_time"], ZERO_TOTALS)
        st, out = self.complete(s, "partial", 20, completed_item_ids=ids[:1])
        self.assertEqual(st, 201, out)
        self.assertEqual(out["completion"]["completed_item_ids"], ids[:1])
        p = self.progress()
        self.assertEqual(p["totals"]["partial"], 1)
        self.assertEqual(len(p["points"]), 1)
        self.assertEqual(p["points"][0]["status"], "partial")
        self.assertEqual(p["points"][0]["done_exercises"], 1)
        self.assertEqual(p["points"][0]["planned_exercises"], len(ids))

    def test_skipped_flow(self):
        s = self.sessions[0]
        st, out = self.complete(s, "skipped", None, skip_reason="sick day")
        self.assertEqual(st, 201, out)
        self.assertIsNone(out["completion"]["duration_minutes"])
        self.assertEqual(out["completion"]["skip_reason"], "sick day")
        p = self.progress()
        self.assertEqual(p["totals"]["skipped"], 1)
        self.assertEqual(p["totals"]["minutes"], 0)
        self.assertEqual(p["totals"]["sessions_without_duration"], 0)
        self.assertEqual(p["points"], [])

    def test_skipped_with_duration_is_400(self):
        st, out = self.complete(self.sessions[0], "skipped", 30)
        self.assertEqual(st, 400)
        self.assertIn("duration_minutes", out["error"]["fields"])

    def test_duplicate_is_409(self):
        s = self.sessions[0]
        st, first = self.complete(s)
        self.assertEqual(st, 201)
        st, out = self.complete(s, "skipped", None)
        self.assertEqual(st, 409)
        self.assertEqual(out["error"]["code"], "duplicate")
        self.assertEqual(self.progress()["all_time"]["logged"], 1)

    def test_future_date_is_400(self):
        s = self.sessions[0]
        future = iso(today() + dt.timedelta(days=3))
        st, out = self.api("POST", f"/api/sessions/{s['session_id']}/completion",
                           {"status": "completed", "session_date": future, "duration_minutes": 30}, self.token)
        self.assertEqual(st, 400)
        self.assertIn("session_date", out["error"]["fields"])

    def test_other_invalid_completion_inputs(self):
        s = self.sessions[0]
        base = {"status": "completed", "session_date": iso(today()), "duration_minutes": 30}
        for bad in (dict(base, status="done"), dict(base, duration_minutes=0), dict(base, duration_minutes=601),
                    dict(base, duration_minutes=12.5), dict(base, session_date="14/11/2026"),
                    {k: v for k, v in base.items() if k != "session_date"}):
            st, _ = self.api("POST", f"/api/sessions/{s['session_id']}/completion", bad, self.token)
            self.assertEqual(st, 400, bad)

    def test_missing_duration_counted_but_not_plotted(self):
        st, out = self.complete(self.sessions[0], "completed", None)
        self.assertEqual(st, 201, out)
        self.assertIsNone(out["completion"]["duration_minutes"])
        p = self.progress()
        self.assertEqual(p["totals"]["completed"], 1)
        self.assertEqual(p["totals"]["sessions_without_duration"], 1)
        self.assertEqual(p["totals"]["minutes"], 0)
        self.assertEqual(p["points"], [])

    def test_edit_completion_changes_points(self):
        s = self.sessions[0]
        st, out = self.complete(s, "completed", 30)
        cid = out["completion"]["completion_id"]
        self.assertEqual(self.progress()["points"][0]["minutes"], 30)
        st, out = self.api("PUT", f"/api/completions/{cid}",
                           {"status": "completed", "session_date": iso(today()), "duration_minutes": 55}, self.token)
        self.assertEqual(st, 200, out)
        p = self.progress()
        self.assertEqual(len(p["points"]), 1)
        self.assertEqual(p["points"][0]["minutes"], 55)
        self.assertEqual(p["totals"]["minutes"], 55)
        self.assertEqual(p["all_time"]["logged"], 1)
        # change to skipped removes the point and keeps one record
        st, out = self.api("PUT", f"/api/completions/{cid}",
                           {"status": "skipped", "session_date": iso(today())}, self.token)
        self.assertEqual(st, 200, out)
        p = self.progress()
        self.assertEqual(p["points"], [])
        self.assertEqual(p["totals"]["skipped"], 1)
        self.assertEqual(p["totals"]["completed"], 0)
        self.assertEqual(p["all_time"]["logged"], 1)
        # edit to remove duration -> not plotted
        st, out = self.api("PUT", f"/api/completions/{cid}",
                           {"status": "completed", "session_date": iso(today())}, self.token)
        self.assertEqual(st, 200)
        p = self.progress()
        self.assertEqual(p["points"], [])
        self.assertEqual(p["totals"]["sessions_without_duration"], 1)

    def test_edit_partial_items(self):
        s = self.sessions[0]
        ids = self.day_item_ids(s)
        st, out = self.complete(s, "partial", 20, completed_item_ids=ids[:1])
        cid = out["completion"]["completion_id"]
        st, out = self.api("PUT", f"/api/completions/{cid}",
                           {"status": "partial", "session_date": iso(today()), "duration_minutes": 20,
                            "completed_item_ids": ids[:2]}, self.token)
        self.assertEqual(st, 200, out)
        self.assertEqual(out["completion"]["completed_item_ids"], ids[:2])
        st, out = self.api("PUT", f"/api/completions/{cid}",
                           {"status": "partial", "session_date": iso(today()), "duration_minutes": 20}, self.token)
        self.assertEqual(st, 400)

    def test_delete_completion(self):
        s = self.sessions[0]
        st, out = self.complete(s, "completed", 30)
        cid = out["completion"]["completion_id"]
        st, out = self.api("DELETE", f"/api/completions/{cid}", token=self.token)
        self.assertEqual(st, 200)
        st, _ = self.api("GET", f"/api/completions/{cid}", token=self.token)
        self.assertEqual(st, 404)
        self.assertEqual(self.progress()["all_time"], ZERO_TOTALS)
        # session is upcoming again and can be logged anew
        st, out = self.api("GET", f"/api/plans/{self.plan['plan_id']}", token=self.token)
        self.assertEqual(out["plan"]["counts"]["completed"], 0)
        st, _ = self.complete(s, "completed", 25)
        self.assertEqual(st, 201)

    def test_range_filter_7_vs_all(self):
        old = iso(today() - dt.timedelta(days=60))
        st, out = self.api("POST", f"/api/sessions/{self.sessions[0]['session_id']}/completion",
                           {"status": "completed", "session_date": old, "duration_minutes": 50}, self.token)
        self.assertEqual(st, 201, out)
        self.complete(self.sessions[1], "completed", 20)
        p7, p30, p90, pall = (self.progress(r) for r in ("7", "30", "90", "all"))
        self.assertEqual(p7["totals"]["completed"], 1)
        self.assertEqual([x["minutes"] for x in p7["points"]], [20])
        self.assertEqual(p30["totals"]["completed"], 1)
        self.assertEqual(p90["totals"]["completed"], 2)
        self.assertEqual(pall["totals"]["completed"], 2)
        self.assertEqual(sorted(x["minutes"] for x in pall["points"]), [20, 50])
        self.assertEqual(p7["all_time"]["completed"], 2)

    def test_invalid_range_is_400(self):
        st, _ = self.api("GET", "/api/progress?range=14", token=self.token)
        self.assertEqual(st, 400)

    def test_empty_state_has_no_points(self):
        token, _ = self.make_user("Empty")
        st, out = self.api("GET", f"/api/progress?range=all&today={iso(today())}", token=token)
        self.assertEqual(st, 200)
        self.assertEqual(out["points"], [])
        self.assertEqual(out["totals"], ZERO_TOTALS)
        self.assertIsNone(out["last_active"])
        self.assertEqual(len(out["weekly"]), 8)
        self.assertEqual(len(out["monthly"]), 6)

    def test_delete_plan_cascades_completions(self):
        st, out = self.complete(self.sessions[0], "completed", 30)
        cid = out["completion"]["completion_id"]
        self.complete(self.sessions[1], "skipped", None)
        st, out = self.api("DELETE", f"/api/plans/{self.plan['plan_id']}", token=self.token)
        self.assertEqual(st, 200)
        self.assertEqual(out["completions_removed"], 2)
        st, _ = self.api("GET", f"/api/completions/{cid}", token=self.token)
        self.assertEqual(st, 404)
        p = self.progress("all")
        self.assertEqual(p["totals"], ZERO_TOTALS)
        self.assertEqual(p["points"], [])


class PrivacyTests(ServerTestCase):
    def test_user_b_cannot_touch_user_a_records(self):
        a, _ = self.make_user("A")
        b, _ = self.make_user("B")
        plan = self.make_plan(a)
        sid = plan["sessions"][0]["session_id"]
        st, out = self.api("POST", f"/api/sessions/{sid}/completion",
                           {"status": "completed", "session_date": iso(today()), "duration_minutes": 30}, a)
        cid = out["completion"]["completion_id"]
        st, out = self.api("POST", "/api/vitals", {"measurement_type": "heart_rate", "value": 60, "unit": "bpm",
                                                   "recorded_at": utc_stamp(1)}, a)
        self.assertEqual(st, 201, out)
        vid = out["record"]["vital_id"]

        checks = [
            ("GET", f"/api/plans/{plan['plan_id']}", None),
            ("PATCH", f"/api/plans/{plan['plan_id']}", {"name": "hijack"}),
            ("DELETE", f"/api/plans/{plan['plan_id']}", None),
            ("POST", f"/api/sessions/{sid}/completion",
             {"status": "completed", "session_date": iso(today()), "duration_minutes": 30}),
            ("GET", f"/api/completions/{cid}", None),
            ("PUT", f"/api/completions/{cid}",
             {"status": "completed", "session_date": iso(today()), "duration_minutes": 99}),
            ("DELETE", f"/api/completions/{cid}", None),
            ("PUT", f"/api/vitals/{vid}", {"measurement_type": "heart_rate", "value": 99, "unit": "bpm",
                                           "recorded_at": utc_stamp(1)}),
            ("DELETE", f"/api/vitals/{vid}", None),
        ]
        for method, path, body in checks:
            st, _ = self.api(method, path, body, b)
            self.assertEqual(st, 404, f"{method} {path}")

        st, out = self.api("GET", "/api/vitals", token=b)
        self.assertEqual((st, out["records"]), (200, []))
        st, out = self.api("GET", "/api/vitals/latest", token=b)
        self.assertTrue(all(v is None for v in out["latest"].values()))
        st, out = self.api("GET", "/api/plans", token=b)
        self.assertEqual(out["plans"], [])
        st, out = self.api("GET", f"/api/progress?range=all&today={iso(today())}", token=b)
        self.assertEqual(out["totals"]["logged"], 0)
        self.assertEqual(out["points"], [])

        # A's data is untouched
        st, out = self.api("GET", f"/api/completions/{cid}", token=a)
        self.assertEqual(out["completion"]["duration_minutes"], 30)
        st, out = self.api("GET", f"/api/plans/{plan['plan_id']}", token=a)
        self.assertEqual(out["plan"]["name"], plan["name"])
        st, out = self.api("GET", "/api/vitals", token=a)
        self.assertEqual(out["records"][0]["value"], 60)

    def test_client_sent_user_id_is_ignored(self):
        a, ua = self.make_user("A2")
        b, ub = self.make_user("B2")
        st, out = self.api("POST", "/api/vitals", {"measurement_type": "heart_rate", "value": 61, "unit": "bpm",
                                                   "recorded_at": utc_stamp(1), "user_id": ub["user_id"]}, a)
        self.assertEqual(st, 201)
        self.assertEqual(out["record"]["user_id"], ua["user_id"])
        st, out = self.api("GET", "/api/vitals", token=b)
        self.assertEqual(out["records"], [])


class VitalsTests(ServerTestCase):
    def setUp(self):
        self.token, _ = self.make_user()

    def post(self, **over):
        body = {"measurement_type": "heart_rate", "value": 62, "unit": "bpm", "recorded_at": utc_stamp(1)}
        body.update(over)
        return self.api("POST", "/api/vitals", body, self.token)

    def test_crud_all_types(self):
        samples = [
            dict(measurement_type="heart_rate", value=60, unit="bpm"),
            dict(measurement_type="blood_pressure", value=120, secondary_value=80, unit="mmHg"),
            dict(measurement_type="spo2", value=98, unit="%"),
            dict(measurement_type="temperature", value=36.6, unit="C"),
            dict(measurement_type="temperature", value=98.2, unit="F"),
        ]
        ids = []
        for s in samples:
            st, out = self.post(**s, notes="n")
            self.assertEqual(st, 201, (s, out))
            r = out["record"]
            self.assertEqual(r["source"], "manual")
            self.assertEqual(r["value"], s["value"])
            self.assertEqual(r["unit"], s["unit"])
            self.assertEqual(r["secondary_value"], s.get("secondary_value"))
            ids.append(r["vital_id"])
        st, out = self.api("GET", "/api/vitals", token=self.token)
        self.assertEqual(len(out["records"]), 5)
        # update
        st, out = self.api("PUT", f"/api/vitals/{ids[1]}", {
            "measurement_type": "blood_pressure", "value": 130, "secondary_value": 85, "unit": "mmHg",
            "recorded_at": utc_stamp(1), "notes": "after walk"}, self.token)
        self.assertEqual(st, 200, out)
        self.assertEqual((out["record"]["value"], out["record"]["secondary_value"]), (130, 85))
        self.assertEqual(out["record"]["notes"], "after walk")
        # latest
        st, out = self.api("GET", "/api/vitals/latest", token=self.token)
        self.assertEqual(set(out["latest"]), {"heart_rate", "blood_pressure", "spo2", "temperature"})
        self.assertEqual(out["latest"]["blood_pressure"]["value"], 130)
        # delete
        for vid in ids:
            st, _ = self.api("DELETE", f"/api/vitals/{vid}", token=self.token)
            self.assertEqual(st, 200)
        st, out = self.api("GET", "/api/vitals", token=self.token)
        self.assertEqual(out["records"], [])
        st, _ = self.api("DELETE", f"/api/vitals/{ids[0]}", token=self.token)
        self.assertEqual(st, 404)

    def test_bp_diastolic_must_be_lower(self):
        for sys_, dia in ((120, 120), (110, 120)):
            st, out = self.post(measurement_type="blood_pressure", value=sys_, secondary_value=dia, unit="mmHg")
            self.assertEqual(st, 400)
            self.assertIn("secondary_value", out["error"]["fields"])
        st, out = self.post(measurement_type="blood_pressure", value=120, unit="mmHg")
        self.assertEqual(st, 400)

    def test_secondary_value_on_other_types_is_400(self):
        st, out = self.post(secondary_value=70)
        self.assertEqual(st, 400)
        self.assertIn("secondary_value", out["error"]["fields"])
        st, _ = self.post(measurement_type="spo2", value=97, unit="%", secondary_value=5)
        self.assertEqual(st, 400)

    def test_out_of_range_is_400(self):
        cases = [
            dict(value=10), dict(value=400), dict(measurement_type="spo2", value=101, unit="%"),
            dict(measurement_type="spo2", value=20, unit="%"),
            dict(measurement_type="temperature", value=50, unit="C"),
            dict(measurement_type="temperature", value=20, unit="C"),
            dict(measurement_type="temperature", value=120, unit="F"),
            dict(measurement_type="blood_pressure", value=300, secondary_value=80, unit="mmHg"),
            dict(measurement_type="blood_pressure", value=120, secondary_value=10, unit="mmHg"),
            dict(value="abc"), dict(value=None),
        ]
        for c in cases:
            st, out = self.post(**c)
            self.assertEqual(st, 400, c)

    def test_temperature_units_have_separate_bounds(self):
        self.assertEqual(self.post(measurement_type="temperature", value=37, unit="C")[0], 201)
        self.assertEqual(self.post(measurement_type="temperature", value=98.6, unit="F")[0], 201)
        self.assertEqual(self.post(measurement_type="temperature", value=98.6, unit="C")[0], 400)
        self.assertEqual(self.post(measurement_type="temperature", value=37, unit="F")[0], 400)

    def test_wrong_unit_is_400(self):
        for c in (dict(unit="mmHg"), dict(unit="%"), dict(unit="C"),
                  dict(measurement_type="spo2", value=97, unit="bpm"),
                  dict(measurement_type="temperature", value=37, unit="K"),
                  dict(measurement_type="blood_pressure", value=120, secondary_value=80, unit="bpm")):
            st, out = self.post(**c)
            self.assertEqual(st, 400, c)
            self.assertIn("unit", out["error"]["fields"])

    def test_invalid_type_and_timestamp(self):
        self.assertEqual(self.post(measurement_type="glucose")[0], 400)
        self.assertEqual(self.post(recorded_at="2026-01-01T10:00:00")[0], 400)  # no offset
        self.assertEqual(self.post(recorded_at="garbage")[0], 400)
        future = (dt.datetime.now(dt.timezone.utc) + dt.timedelta(days=2)).strftime("%Y-%m-%dT%H:%M:%SZ")
        self.assertEqual(self.post(recorded_at=future)[0], 400)

    def test_offset_timestamp_normalised_to_utc(self):
        st, out = self.post(recorded_at="2026-01-01T10:00:00+02:00")
        self.assertEqual(st, 201, out)
        self.assertEqual(out["record"]["recorded_at"], "2026-01-01T08:00:00Z")

    def test_filter_by_type_and_dates(self):
        self.post(measurement_type="heart_rate", value=60, unit="bpm", recorded_at="2026-01-01T08:00:00Z")
        self.post(measurement_type="heart_rate", value=65, unit="bpm", recorded_at="2026-02-01T08:00:00Z")
        self.post(measurement_type="spo2", value=98, unit="%", recorded_at="2026-02-02T08:00:00Z")
        q = urllib.parse.quote

        def get(qs):
            st, out = self.api("GET", "/api/vitals?" + qs, token=self.token)
            self.assertEqual(st, 200, out)
            return out["records"]

        self.assertEqual(len(get("")), 3)
        hr = get("type=heart_rate")
        self.assertEqual([r["value"] for r in hr], [65, 60])  # newest first
        self.assertEqual(len(get("type=spo2")), 1)
        rng = get("from=" + q("2026-01-15T00:00:00Z") + "&to=" + q("2026-02-01T23:59:59Z"))
        self.assertEqual([r["value"] for r in rng], [65])
        self.assertEqual(len(get("type=heart_rate&from=" + q("2026-01-01T08:00:00Z"))), 2)
        self.assertEqual(len(get("to=" + q("2025-12-31T00:00:00Z"))), 0)
        st, _ = self.api("GET", "/api/vitals?type=bogus", token=self.token)
        self.assertEqual(st, 400)


if __name__ == "__main__":
    unittest.main()
