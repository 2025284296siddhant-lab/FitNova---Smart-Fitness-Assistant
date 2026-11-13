import json
import unittest
from pathlib import Path

LIB = Path(__file__).resolve().parent.parent / "server" / "data" / "exercises.json"

MUSCLES = {"chest", "back", "shoulders", "biceps", "triceps", "quads", "hamstrings", "glutes", "calves", "core",
           "full_body"}
GOALS = {"muscle_gain", "strength", "general_fitness", "endurance", "weight_management"}
LEVELS = ("beginner", "intermediate", "advanced")
EQUIP = {"none", "dumbbells", "barbell", "bands", "kettlebell", "machine", "cable", "pullup_bar"}
TYPES = {"compound", "isolation", "cardio", "core", "plyometric", "mobility"}
KEYS = {"name", "muscle", "goals", "level", "equipment", "workout_type", "sets", "reps", "rest_seconds",
        "instructions"}
POOLS = [{"none"}, {"none", "dumbbells"}, {"none", "barbell"}, {"none", "bands"}]
COVERED = ["chest", "back", "shoulders", "biceps", "triceps", "quads", "hamstrings", "glutes", "core", "full_body"]


class LibraryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.lib = json.loads(LIB.read_text(encoding="utf-8"))

    def test_count(self):
        self.assertIsInstance(self.lib, list)
        self.assertTrue(110 <= len(self.lib) <= 140, len(self.lib))

    def test_schema_and_allowed_values(self):
        for ex in self.lib:
            n = ex.get("name")
            self.assertEqual(set(ex), KEYS, n)
            self.assertIsInstance(ex["name"], str)
            self.assertTrue(ex["name"].strip(), n)
            self.assertIn(ex["muscle"], MUSCLES, n)
            self.assertIsInstance(ex["goals"], list, n)
            self.assertTrue(1 <= len(ex["goals"]) <= 5, n)
            self.assertEqual(len(set(ex["goals"])), len(ex["goals"]), n)
            self.assertTrue(set(ex["goals"]) <= GOALS, n)
            self.assertIn(ex["level"], LEVELS, n)
            self.assertIn(ex["equipment"], EQUIP, n)
            self.assertIn(ex["workout_type"], TYPES, n)
            self.assertIs(type(ex["sets"]), int, n)
            self.assertTrue(1 <= ex["sets"] <= 6, n)
            self.assertIsInstance(ex["reps"], str, n)
            self.assertTrue(ex["reps"].strip(), n)
            self.assertIs(type(ex["rest_seconds"]), int, n)
            self.assertTrue(15 <= ex["rest_seconds"] <= 240, n)
            self.assertIsInstance(ex["instructions"], str, n)
            self.assertTrue(ex["instructions"].strip(), n)

    def test_unique_names_case_insensitive(self):
        names = [e["name"].strip().lower() for e in self.lib]
        dupes = {n for n in names if names.count(n) > 1}
        self.assertFalse(dupes, dupes)

    def test_beginner_coverage_per_equipment_pool(self):
        for pool in POOLS:
            for muscle in COVERED:
                ok = [e for e in self.lib if e["muscle"] == muscle and e["level"] == "beginner"
                      and e["equipment"] in pool]
                self.assertTrue(ok, f"no beginner {muscle} exercise for pool {sorted(pool)}")

    def test_each_muscle_has_intermediate_and_advanced(self):
        for muscle in MUSCLES:
            for level in ("intermediate", "advanced"):
                self.assertTrue([e for e in self.lib if e["muscle"] == muscle and e["level"] == level],
                                f"no {level} {muscle} exercise")

    def test_full_body_conditioning_depth(self):
        n = [e for e in self.lib if e["muscle"] == "full_body" and e["workout_type"] in ("cardio", "plyometric")]
        self.assertGreaterEqual(len(n), 12)


if __name__ == "__main__":
    unittest.main()
