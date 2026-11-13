import datetime as dt
import itertools
import json
import unittest
from pathlib import Path

from tests import helpers  # noqa: F401  (sets sys.path)
from server import generator
from server.generator import GeneratorInputError, generate

LIB_PATH = Path(__file__).resolve().parent.parent / "server" / "data" / "exercises.json"
RANK = {"beginner": 0, "intermediate": 1, "advanced": 2}

EQUIP_SELECTIONS = [["none"], ["dumbbells"], ["barbell"], ["bands"], ["dumbbells", "bands"],
                    ["dumbbells", "barbell", "bands"], ["full_gym"]]


def db_rows():
    data = json.loads(LIB_PATH.read_text(encoding="utf-8"))
    rows = []
    for i, e in enumerate(data, start=1):
        rows.append({"exercise_id": i, "name": e["name"], "muscle": e["muscle"], "goal": ",".join(e["goals"]),
                     "level": e["level"], "equipment": e["equipment"], "workout_type": e["workout_type"],
                     "sets": e["sets"], "reps": e["reps"], "rest": e["rest_seconds"],
                     "instructions": e["instructions"]})
    return rows


def row(i, muscle, goal="strength", level="beginner", equipment="none", wt="compound"):
    return {"exercise_id": i, "name": f"Ex{i}", "muscle": muscle, "goal": goal, "level": level,
            "equipment": equipment, "workout_type": wt, "sets": 3, "reps": "10", "rest": 60, "instructions": "x"}


class GeneratorTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.rows = db_rows()
        cls.by_id = {r["exercise_id"]: r for r in cls.rows}

    def combos(self):
        return itertools.product(generator.GOALS, generator.LEVELS, EQUIP_SELECTIONS, range(1, 8))

    def test_equipment_hard_constraint_all_combos(self):
        for goal, level, eq, days in self.combos():
            plan = generate(self.rows, goal, level, eq, days, seed=7)
            usable = generator.usable_equipment(eq)
            for d in plan["days"]:
                for it in d["items"]:
                    self.assertIn(self.by_id[it["exercise_id"]]["equipment"], usable, (goal, level, eq, days))
                    self.assertIn(it["equipment"], usable)

    def test_never_above_user_level(self):
        for goal, level, eq, days in self.combos():
            plan = generate(self.rows, goal, level, eq, days, seed=3)
            for d in plan["days"]:
                for it in d["items"]:
                    self.assertLessEqual(RANK[self.by_id[it["exercise_id"]]["level"]], RANK[level],
                                         (goal, level, eq, days, it["name"]))

    def test_days_count_and_no_duplicates_within_day(self):
        for goal, level, eq, days in self.combos():
            plan = generate(self.rows, goal, level, eq, days, seed=11)
            self.assertEqual(len(plan["days"]), days, (goal, level, eq, days))
            self.assertEqual(plan["days_per_week"], days)
            for d in plan["days"]:
                ids = [it["exercise_id"] for it in d["items"]]
                self.assertEqual(len(ids), len(set(ids)), (goal, level, eq, days, d["title"]))

    def test_every_day_has_exercises_when_library_is_full(self):
        for goal, level, eq, days in self.combos():
            plan = generate(self.rows, goal, level, eq, days, seed=5)
            for d in plan["days"]:
                self.assertTrue(d["items"], (goal, level, eq, days, d["title"]))

    def test_determinism_same_seed(self):
        for goal in generator.GOALS:
            a = generate(self.rows, goal, "intermediate", ["dumbbells", "bands"], 4, seed=99)
            b = generate(self.rows, goal, "intermediate", ["dumbbells", "bands"], 4, seed=99)
            self.assertEqual(a, b)

    def test_different_seeds_can_differ(self):
        outs = {json.dumps(generate(self.rows, "muscle_gain", "intermediate", ["full_gym"], 4, seed=s)["days"],
                           sort_keys=True) for s in range(1, 8)}
        self.assertGreater(len(outs), 1)

    def test_seed_returned_when_not_given(self):
        plan = generate(self.rows, "strength", "beginner", ["none"], 3)
        self.assertIsInstance(plan["seed"], int)
        again = generate(self.rows, "strength", "beginner", ["none"], 3, seed=plan["seed"])
        self.assertEqual(plan["days"], again["days"])

    def test_notes_when_goal_tier_fallback_used(self):
        # chest exercise exists but is not tagged for the goal -> "goal" tier fallback with a note
        lib = [row(1, "chest", goal="endurance")]
        plan = generate(lib, "strength", "beginner", ["none"], 1, seed=1)
        items = plan["days"][0]["items"]
        self.assertEqual([i["exercise_id"] for i in items], [1])
        self.assertTrue(items[0]["fallback_note"])
        self.assertTrue(plan["notes"])
        self.assertTrue(any("tagged for" in n for n in plan["notes"]))

    def test_notes_when_related_tier_fallback_used(self):
        lib = [row(1, "shoulders")]  # back slot -> related (shoulders)
        plan = generate(lib, "strength", "beginner", ["none"], 1, seed=1)
        self.assertTrue(any("closest alternative" in n for n in plan["notes"]))
        for it in plan["days"][0]["items"]:
            self.assertTrue(it["fallback_note"])

    def test_notes_when_slot_left_out(self):
        lib = [row(1, "chest")]
        plan = generate(lib, "strength", "beginner", ["none"], 1, seed=1)
        self.assertTrue(any("left out" in n for n in plan["notes"]))
        self.assertEqual(len(plan["days"][0]["items"]), 1)

    def test_fallback_notes_are_reported_in_plan_notes(self):
        for goal, level, eq, days in self.combos():
            plan = generate(self.rows, goal, level, eq, days, seed=21)
            for d in plan["days"]:
                for it in d["items"]:
                    if it["fallback_note"] and it["fallback_note"].startswith("No "):
                        self.assertTrue(any(it["fallback_note"] in n for n in plan["notes"]))

    def test_equipment_excluded_even_when_only_option(self):
        lib = [row(1, "chest", equipment="barbell"), row(2, "back", equipment="none")]
        plan = generate(lib, "strength", "beginner", ["dumbbells"], 1, seed=1)
        ids = [i["exercise_id"] for d in plan["days"] for i in d["items"]]
        self.assertNotIn(1, ids)

    def test_level_hard_cap_synthetic(self):
        lib = [row(1, "chest", level="advanced"), row(2, "back", level="beginner")]
        plan = generate(lib, "strength", "beginner", ["none"], 1, seed=1)
        ids = [i["exercise_id"] for d in plan["days"] for i in d["items"]]
        self.assertNotIn(1, ids)

    def test_invalid_inputs_raise(self):
        bad = [
            ("bogus", "beginner", ["none"], 3),
            ("strength", "expert", ["none"], 3),
            ("strength", "beginner", ["none"], 0),
            ("strength", "beginner", ["none"], 8),
            ("strength", "beginner", ["none"], "3"),
            ("strength", "beginner", ["none"], 3.0),
            ("strength", "beginner", [], 3),
            ("strength", "beginner", ["kettlebell"], 3),
            ("strength", "beginner", ["dumbbells", "nonsense"], 3),
        ]
        for args in bad:
            with self.subTest(args=args):
                with self.assertRaises(GeneratorInputError):
                    generate(self.rows, *args)

    def test_full_gym_usable_set(self):
        self.assertEqual(generator.usable_equipment(["full_gym"]), set(generator.ALL_EQUIPMENT))
        plan = generate(self.rows, "strength", "advanced", ["full_gym"], 3, seed=1)
        self.assertEqual(plan["usable_equipment"], sorted(generator.ALL_EQUIPMENT))

    def test_usable_equipment_always_includes_bodyweight(self):
        self.assertEqual(generator.usable_equipment(["dumbbells"]), {"none", "dumbbells"})
        self.assertEqual(generator.usable_equipment(["none"]), {"none"})

    def test_schedule_dates(self):
        s = generator.schedule(dt.date(2026, 1, 5), 3, 2)
        self.assertEqual(len(s), 6)
        self.assertEqual(s[0][2], dt.date(2026, 1, 5))
        self.assertEqual(s[3][2], dt.date(2026, 1, 12))


if __name__ == "__main__":
    unittest.main()
