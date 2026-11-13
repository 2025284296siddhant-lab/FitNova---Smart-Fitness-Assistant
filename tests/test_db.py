import shutil
import sqlite3
import tempfile
import unittest
from pathlib import Path

from tests import helpers  # noqa: F401  (sets sys.path)
from server import db

NOW = "2026-01-01T00:00:00Z"


class DbTestBase(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="fitnova-db-"))
        self.path = self.tmp / "t.db"
        self.addCleanup(shutil.rmtree, self.tmp, True)


class ConstraintTests(DbTestBase):
    def setUp(self):
        super().setUp()
        db.init_database(self.path)
        self.conn = db.connect(self.path)
        self.addCleanup(self.conn.close)
        self.conn.execute("INSERT INTO users(name, access_token, created_at) VALUES ('u','tok',?)", (NOW,))
        self.uid = self.conn.execute("SELECT user_id FROM users").fetchone()[0]

    def test_foreign_keys_pragma_on(self):
        self.assertEqual(self.conn.execute("PRAGMA foreign_keys").fetchone()[0], 1)

    def test_fk_enforced_plan_item_bad_plan(self):
        ex = self.conn.execute("SELECT exercise_id FROM exercises LIMIT 1").fetchone()[0]
        with self.assertRaises(sqlite3.IntegrityError):
            self.conn.execute(
                "INSERT INTO plan_items(plan_id, exercise_id, day_number, order_number, sets, reps, rest) "
                "VALUES (99999, ?, 1, 1, 3, '10', 60)", (ex,))

    def test_fk_enforced_plan_owner(self):
        with self.assertRaises(sqlite3.IntegrityError):
            self.conn.execute(
                "INSERT INTO workout_plans(user_id,name,goal,level,equipment,days_per_week,start_date,seed,created_at) "
                "VALUES (99999,'p','strength','beginner','none',3,'2026-01-01',1,?)", (NOW,))

    def test_transaction_rollback(self):
        with self.assertRaises(RuntimeError):
            with db.transaction(self.conn):
                self.conn.execute("INSERT INTO users(name, access_token, created_at) VALUES ('x','tok2',?)", (NOW,))
                raise RuntimeError("boom")
        self.assertIsNone(self.conn.execute("SELECT 1 FROM users WHERE access_token='tok2'").fetchone())
        self.assertFalse(self.conn.in_transaction)

    def test_transaction_commit(self):
        with db.transaction(self.conn):
            self.conn.execute("INSERT INTO users(name, access_token, created_at) VALUES ('y','tok3',?)", (NOW,))
        other = db.connect(self.path)
        try:
            self.assertIsNotNone(other.execute("SELECT 1 FROM users WHERE access_token='tok3'").fetchone())
        finally:
            other.close()

    def test_transaction_rollback_on_integrity_error_leaves_no_partial_rows(self):
        with self.assertRaises(sqlite3.IntegrityError):
            with db.transaction(self.conn):
                self.conn.execute("INSERT INTO users(name, access_token, created_at) VALUES ('z','tok4',?)", (NOW,))
                self.conn.execute("INSERT INTO users(name, access_token, created_at) VALUES ('z2','tok4',?)", (NOW,))
        self.assertIsNone(self.conn.execute("SELECT 1 FROM users WHERE access_token='tok4'").fetchone())

    def _vital(self, mtype, unit, value=1, secondary=None):
        return self.conn.execute(
            "INSERT INTO vitals_records(user_id, measurement_type, value, secondary_value, unit, recorded_at, "
            "created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)",
            (self.uid, mtype, value, secondary, unit, NOW, NOW, NOW))

    def test_vitals_unit_mismatch_rejected(self):
        for mtype, unit, sec in (("heart_rate", "mmHg", None), ("heart_rate", "C", None),
                                 ("spo2", "bpm", None), ("temperature", "bpm", None),
                                 ("blood_pressure", "bpm", 80)):
            with self.assertRaises(sqlite3.IntegrityError, msg=(mtype, unit)):
                self._vital(mtype, unit, 100, sec)

    def test_vitals_valid_units_accepted(self):
        self._vital("heart_rate", "bpm", 60)
        self._vital("spo2", "%", 98)
        self._vital("temperature", "C", 36.5)
        self._vital("temperature", "F", 98.0)
        self._vital("blood_pressure", "mmHg", 120, 80)

    def test_vitals_secondary_value_only_for_bp(self):
        with self.assertRaises(sqlite3.IntegrityError):
            self._vital("heart_rate", "bpm", 60, 40)
        with self.assertRaises(sqlite3.IntegrityError):
            self._vital("blood_pressure", "mmHg", 120, None)

    def test_vitals_source_check(self):
        with self.assertRaises(sqlite3.IntegrityError):
            self.conn.execute(
                "INSERT INTO vitals_records(user_id, measurement_type, value, unit, recorded_at, source, created_at, "
                "updated_at) VALUES (?, 'heart_rate', 60, 'bpm', ?, 'alien', ?, ?)", (self.uid, NOW, NOW, NOW))

    def test_skipped_completion_cannot_have_duration(self):
        self.conn.execute(
            "INSERT INTO workout_plans(user_id,name,goal,level,equipment,days_per_week,start_date,seed,created_at) "
            "VALUES (?,'p','strength','beginner','none',3,'2026-01-01',1,?)", (self.uid, NOW))
        pid = self.conn.execute("SELECT plan_id FROM workout_plans").fetchone()[0]
        self.conn.execute("INSERT INTO plan_sessions(plan_id,week_number,day_number,title,focus,scheduled_date) "
                          "VALUES (?,1,1,'t','f','2026-01-01')", (pid,))
        sid = self.conn.execute("SELECT session_id FROM plan_sessions").fetchone()[0]
        with self.assertRaises(sqlite3.IntegrityError):
            self.conn.execute(
                "INSERT INTO workout_completions(plan_id,session_id,session_date,status,duration_minutes,created_at,"
                "updated_at) VALUES (?,?,?,?,?,?,?)", (pid, sid, "2026-01-01", "skipped", 30, NOW, NOW))
        self.conn.execute(
            "INSERT INTO workout_completions(plan_id,session_id,session_date,status,created_at,updated_at) "
            "VALUES (?,?,?,?,?,?)", (pid, sid, "2026-01-01", "completed", NOW, NOW))
        with self.assertRaises(sqlite3.IntegrityError):  # UNIQUE(session_id)
            self.conn.execute(
                "INSERT INTO workout_completions(plan_id,session_id,session_date,status,created_at,updated_at) "
                "VALUES (?,?,?,?,?,?)", (pid, sid, "2026-01-02", "partial", NOW, NOW))


class MigrationTests(DbTestBase):
    def test_migrate_preserves_data_and_backs_up(self):
        r1 = db.migrate(self.path, target=1)
        self.assertEqual(r1["to"], 1)
        self.assertEqual(r1["applied"], ["001_initial"])
        self.assertIsNone(r1["backup"])  # empty DB: nothing to back up
        conn = db.connect(self.path)
        conn.execute("INSERT INTO users(name, access_token, created_at) VALUES ('Old User','old-token',?)", (NOW,))
        cols_v1 = {r["name"] for r in conn.execute("PRAGMA table_info(users)")}
        conn.close()
        self.assertNotIn("height_cm", cols_v1)

        r2 = db.migrate(self.path)
        self.assertEqual(r2["from"], 1)
        self.assertGreaterEqual(r2["to"], 2)
        self.assertEqual(r2["applied"][0], "002_profile_body_metrics")
        self.assertIsNotNone(r2["backup"])

        backups = list((self.path.parent / "backups").glob("*.db"))
        self.assertTrue(backups)
        self.assertTrue(Path(r2["backup"]).exists())
        # backup holds the pre-migration data and schema
        bconn = sqlite3.connect(str(r2["backup"]))
        try:
            self.assertEqual(bconn.execute("SELECT name FROM users").fetchone()[0], "Old User")
            self.assertNotIn("height_cm", {r[1] for r in bconn.execute("PRAGMA table_info(users)")})
        finally:
            bconn.close()

        conn = db.connect(self.path)
        try:
            row = conn.execute("SELECT * FROM users WHERE access_token='old-token'").fetchone()
            self.assertIsNotNone(row)
            self.assertEqual(row["name"], "Old User")
            self.assertEqual(row["created_at"], NOW)
            self.assertEqual(row["updated_at"], NOW)  # backfilled from created_at
            self.assertEqual(row["unit_system"], "metric")
            self.assertEqual(row["temp_unit"], "C")
            self.assertIsNone(row["height_cm"])
            cols = {r["name"] for r in conn.execute("PRAGMA table_info(users)")}
            for c in ("gender", "height_cm", "weight_kg", "age_band", "unit_system", "temp_unit", "updated_at"):
                self.assertIn(c, cols)
            versions = [r[0] for r in conn.execute("SELECT version FROM schema_migrations ORDER BY version")]
            self.assertEqual(versions[:2], [1, 2])
            self.assertEqual(versions, sorted(set(versions)))
        finally:
            conn.close()

    def test_rerun_applies_nothing(self):
        db.migrate(self.path)
        again = db.migrate(self.path)
        self.assertEqual(again["applied"], [])
        self.assertIsNone(again["backup"])
        self.assertEqual(again["from"], again["to"])
        conn = db.connect(self.path)
        try:
            n = conn.execute("SELECT COUNT(*) FROM schema_migrations").fetchone()[0]
        finally:
            conn.close()
        db.migrate(self.path)
        conn = db.connect(self.path)
        try:
            self.assertEqual(conn.execute("SELECT COUNT(*) FROM schema_migrations").fetchone()[0], n)
        finally:
            conn.close()

    def test_fresh_database_has_no_backup(self):
        r = db.migrate(self.path)
        self.assertIsNone(r["backup"])
        self.assertFalse((self.path.parent / "backups").exists())

    def test_migration_002_constraints(self):
        db.migrate(self.path)
        conn = db.connect(self.path)
        try:
            with self.assertRaises(sqlite3.IntegrityError):
                conn.execute("INSERT INTO users(name, access_token, created_at, height_cm) VALUES ('a','t1',?,5)", (NOW,))
            with self.assertRaises(sqlite3.IntegrityError):
                conn.execute("INSERT INTO users(name, access_token, created_at, age_band) VALUES ('a','t2',?,'kid')", (NOW,))
        finally:
            conn.close()

    def test_init_database_seeds_library_idempotently(self):
        info = db.init_database(self.path)
        self.assertGreater(info["exercises"], 0)
        conn = db.connect(self.path)
        try:
            n = conn.execute("SELECT COUNT(*) FROM exercises").fetchone()[0]
        finally:
            conn.close()
        db.init_database(self.path)
        conn = db.connect(self.path)
        try:
            self.assertEqual(conn.execute("SELECT COUNT(*) FROM exercises").fetchone()[0], n)
        finally:
            conn.close()


if __name__ == "__main__":
    unittest.main()
