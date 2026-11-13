"""Rule-based workout generator (deterministic given a seed). This is NOT machine learning.

Pipeline:
 1. Expand the user's equipment selection into the set of usable equipment (HARD constraint).
 2. Pick a weekly split from goal + level + days (e.g. Push/Pull/Legs).
 3. Fill each day's muscle slots by scoring compatible exercises on goal fit, level fit,
    workout type and variety, using a tiered fallback when no exact match exists.
 4. Prescribe sets/reps/rest from the library, adjusted for the training goal.
"""
from __future__ import annotations

import datetime as dt
import random

GOALS = ("muscle_gain", "strength", "general_fitness", "endurance", "weight_management")
LEVELS = ("beginner", "intermediate", "advanced")
EQUIPMENT_CHOICES = ("none", "dumbbells", "barbell", "bands", "full_gym")
ALL_EQUIPMENT = ("none", "dumbbells", "barbell", "bands", "kettlebell", "machine", "cable", "pullup_bar")

LABELS = {
    "muscle_gain": "Muscle Gain", "strength": "Strength", "general_fitness": "General Fitness",
    "endurance": "Endurance", "weight_management": "Weight Management",
    "beginner": "Beginner", "intermediate": "Intermediate", "advanced": "Advanced",
    "none": "No Equipment", "dumbbells": "Dumbbells", "barbell": "Barbell", "bands": "Resistance Bands",
    "full_gym": "Full Gym", "kettlebell": "Kettlebell", "machine": "Machine", "cable": "Cable",
    "pullup_bar": "Pull-up Bar",
    "chest": "Chest", "back": "Back", "shoulders": "Shoulders", "biceps": "Biceps", "triceps": "Triceps",
    "quads": "Quads", "hamstrings": "Hamstrings", "glutes": "Glutes", "calves": "Calves", "core": "Core",
    "full_body": "Full-Body Conditioning",
}

FOCUS = {
    "full_body":    ("Full Body",     ["quads", "chest", "back", "hamstrings", "shoulders", "core", "glutes", "triceps"]),
    "upper":        ("Upper Body",    ["chest", "back", "shoulders", "back", "biceps", "triceps", "chest", "core"]),
    "lower":        ("Lower Body",    ["quads", "hamstrings", "glutes", "quads", "calves", "core", "hamstrings", "glutes"]),
    "push":         ("Push",          ["chest", "shoulders", "chest", "triceps", "shoulders", "core", "triceps", "chest"]),
    "pull":         ("Pull",          ["back", "back", "biceps", "shoulders", "biceps", "core", "back", "hamstrings"]),
    "legs":         ("Legs",          ["quads", "hamstrings", "glutes", "quads", "calves", "core", "hamstrings", "glutes"]),
    "conditioning": ("Conditioning",  ["full_body", "full_body", "core", "full_body", "quads", "core", "full_body", "glutes"]),
}

RELATED = {
    "biceps": ["back"], "triceps": ["chest", "shoulders"], "hamstrings": ["glutes"],
    "glutes": ["hamstrings", "quads"], "calves": ["quads", "full_body"], "quads": ["glutes"],
    "shoulders": ["chest", "back"], "chest": ["shoulders", "triceps"], "back": ["biceps", "shoulders"],
    "core": ["full_body"], "full_body": ["core", "quads"],
}

_STRENGTH_SPLITS = {
    1: ["full_body"], 2: ["upper", "lower"], 3: ["push", "pull", "legs"], 4: ["upper", "lower", "upper", "lower"],
    5: ["push", "pull", "legs", "upper", "lower"], 6: ["push", "pull", "legs", "push", "pull", "legs"],
    7: ["push", "pull", "legs", "push", "pull", "legs", "conditioning"],
}
_CONDITIONING_SPLITS = {
    1: ["full_body"], 2: ["full_body", "conditioning"], 3: ["full_body", "conditioning", "full_body"],
    4: ["upper", "lower", "conditioning", "full_body"], 5: ["upper", "lower", "conditioning", "full_body", "conditioning"],
    6: ["upper", "lower", "conditioning", "upper", "lower", "conditioning"],
    7: ["upper", "lower", "conditioning", "upper", "lower", "conditioning", "full_body"],
}
_GENERAL_SPLITS = {
    1: ["full_body"], 2: ["full_body", "full_body"], 3: ["full_body", "conditioning", "full_body"],
    4: ["upper", "lower", "conditioning", "full_body"], 5: ["upper", "lower", "conditioning", "upper", "lower"],
    6: ["upper", "lower", "conditioning", "upper", "lower", "full_body"],
    7: ["upper", "lower", "conditioning", "upper", "lower", "full_body", "conditioning"],
}

# Day offsets within a week, so rest days are spread sensibly.
DAY_OFFSETS = {1: [0], 2: [0, 3], 3: [0, 2, 4], 4: [0, 1, 3, 4], 5: [0, 1, 2, 4, 5], 6: [0, 1, 2, 3, 4, 5],
               7: [0, 1, 2, 3, 4, 5, 6]}

SLOTS_PER_LEVEL = {"beginner": 5, "intermediate": 6, "advanced": 7}
_LEVEL_RANK = {lv: i for i, lv in enumerate(LEVELS)}


class GeneratorInputError(ValueError):
    pass


def usable_equipment(selection: list[str]) -> set[str]:
    sel = set(selection)
    if not sel or not sel <= set(EQUIPMENT_CHOICES):
        raise GeneratorInputError("Select at least one valid equipment option.")
    if "full_gym" in sel:
        return set(ALL_EQUIPMENT)
    return {"none"} | (sel - {"full_gym"})


def choose_split(goal: str, level: str, days: int) -> list[str]:
    if goal in ("strength", "muscle_gain"):
        split = list(_STRENGTH_SPLITS[days])
        if level == "beginner" and days == 3:
            split = ["full_body", "full_body", "full_body"]
        return split
    if goal in ("endurance", "weight_management"):
        return list(_CONDITIONING_SPLITS[days])
    return list(_GENERAL_SPLITS[days])


def _prescription(ex: dict, goal: str, level: str) -> tuple[int, str, int]:
    sets, reps, rest = int(ex["sets"]), str(ex["reps"]), int(ex["rest"])
    timed = any(w in reps.lower() for w in ("sec", "min", "each", "side", "/"))
    wt = ex["workout_type"]
    if wt in ("compound", "isolation") and not timed:
        table = {
            "strength":          {"compound": (4, "4-6", 150), "isolation": (3, "8-10", 90)},
            "muscle_gain":       {"compound": (4, "6-10", 105), "isolation": (3, "10-12", 60)},
            "endurance":         {"compound": (3, "15-20", 45), "isolation": (2, "15-20", 30)},
            "weight_management": {"compound": (3, "12-15", 45), "isolation": (3, "12-15", 45)},
        }
        if goal in table:
            sets, reps, rest = table[goal][wt]
    if level == "beginner":
        sets = min(sets, 3)
    elif level == "advanced" and wt in ("compound", "isolation") and goal in ("strength", "muscle_gain"):
        sets = min(sets + 1, 6)
    return sets, reps, rest


def _score(ex: dict, goal: str, level: str, focus: str, use_count: dict, rng: random.Random) -> float:
    s = 0.0
    if goal in ex["goals"]:
        s += 3
    gap = _LEVEL_RANK[level] - _LEVEL_RANK[ex["level"]]
    s += {0: 2, 1: 1, 2: 0}[gap]
    wt = ex["workout_type"]
    if goal == "strength" and wt == "compound":
        s += 2
    elif goal == "muscle_gain" and wt in ("compound", "isolation"):
        s += 1
    elif goal in ("endurance", "weight_management") and wt in ("cardio", "plyometric", "compound"):
        s += 1
    if focus == "conditioning" and wt in ("cardio", "plyometric"):
        s += 1.5
    if wt == "mobility":
        s -= 3  # warm-up style drills only when nothing better exists
    s -= 2.5 * use_count.get(ex["exercise_id"], 0)
    s += rng.uniform(0, 1.5)
    return s


def generate(exercises: list[dict], goal: str, level: str, equipment: list[str], days: int,
             seed: int | None = None) -> dict:
    """exercises: rows with keys exercise_id,name,muscle,goal(csv),level,equipment,workout_type,sets,reps,rest,instructions."""
    if goal not in GOALS:
        raise GeneratorInputError("Choose a valid fitness goal.")
    if level not in LEVELS:
        raise GeneratorInputError("Choose a valid experience level.")
    if not isinstance(days, int) or not 1 <= days <= 7:
        raise GeneratorInputError("Training days must be between 1 and 7.")
    usable = usable_equipment(equipment)
    seed = seed if seed is not None else random.randint(1, 2**31 - 1)
    rng = random.Random(seed)

    lib = []
    for row in exercises:
        ex = dict(row)
        ex["goals"] = [g for g in str(ex["goal"]).split(",") if g]
        lib.append(ex)
    # HARD constraints: equipment must be available; never above the user's experience level.
    pool = [e for e in lib if e["equipment"] in usable and _LEVEL_RANK[e["level"]] <= _LEVEL_RANK[level]]

    split = choose_split(goal, level, days)
    n_slots = SLOTS_PER_LEVEL[level]
    seen_titles: dict[str, int] = {}
    use_count: dict[int, int] = {}
    notes: list[str] = []
    equip_label = " + ".join(LABELS[e] for e in equipment)
    day_out = []

    for day_idx, focus in enumerate(split, start=1):
        title_base, slots = FOCUS[focus]
        repeats = split.count(focus)
        seen_titles[focus] = seen_titles.get(focus, 0) + 1
        title = f"{title_base} {'ABC'[seen_titles[focus] - 1]}" if repeats > 1 else title_base
        slot_list = list(slots[:n_slots])
        if goal in ("endurance", "weight_management") and focus != "conditioning":
            slot_list[-1] = "full_body"  # conditioning finisher
        used_today: set[int] = set()
        items = []
        for muscle in slot_list:
            choice, note = None, None
            tiers = [
                ("exact", lambda e, m=muscle: e["muscle"] == m and goal in e["goals"]),
                ("goal", lambda e, m=muscle: e["muscle"] == m),
                ("related", lambda e, m=muscle: e["muscle"] in RELATED.get(m, [])),
            ]
            for tier, pred in tiers:
                cands = [e for e in pool if e["exercise_id"] not in used_today and pred(e)]
                if not cands:
                    continue
                choice = max(cands, key=lambda e: _score(e, goal, level, focus, use_count, rng))
                if tier == "goal":
                    note = (f"No {LABELS[muscle].lower()} exercise tagged for {LABELS[goal]} fits your equipment "
                            f"({equip_label}) at {LABELS[level]} level, so {choice['name']} was used — it trains the same muscle.")
                elif tier == "related":
                    note = (f"No compatible {LABELS[muscle].lower()} exercise is available with {equip_label} at "
                            f"{LABELS[level]} level, so {choice['name']} ({LABELS[choice['muscle']].lower()}) was "
                            f"used as the closest alternative.")
                break
            if choice is None:
                notes.append(f"{title}: no compatible exercise exists for the {LABELS[muscle].lower()} slot with "
                             f"{equip_label}; the slot was left out rather than suggest equipment you don't have.")
                continue
            if _LEVEL_RANK[choice["level"]] < _LEVEL_RANK[level] and note is None:
                note = f"Listed as {LABELS[choice['level']]} — progress it with extra load, tempo or range as needed."
                level_only = True
            else:
                level_only = False
            if note and not level_only:
                notes.append(f"{title}: {note}")
            used_today.add(choice["exercise_id"])
            use_count[choice["exercise_id"]] = use_count.get(choice["exercise_id"], 0) + 1
            sets, reps, rest = _prescription(choice, goal, level)
            items.append({
                "exercise_id": choice["exercise_id"], "name": choice["name"], "muscle": choice["muscle"],
                "equipment": choice["equipment"], "level": choice["level"], "workout_type": choice["workout_type"],
                "goals": choice["goals"], "instructions": choice["instructions"],
                "sets": sets, "reps": reps, "rest": rest, "fallback_note": note,
            })
        day_out.append({"day_number": day_idx, "title": title, "focus": focus, "items": items})

    # Defensive re-check of the hard constraint before returning anything.
    for d in day_out:
        for it in d["items"]:
            assert it["equipment"] in usable, "equipment constraint violated"

    split_name = "/".join(dict.fromkeys(FOCUS[f][0] for f in split))
    return {
        "goal": goal, "level": level, "equipment": list(equipment), "usable_equipment": sorted(usable),
        "days_per_week": days, "seed": seed, "split": split_name,
        "suggested_name": f"{LABELS[goal]} · {days}-Day {split_name}",
        "days": day_out, "notes": list(dict.fromkeys(notes)),
    }


def schedule(start_date: dt.date, days: int, weeks: int) -> list[tuple[int, int, dt.date]]:
    out = []
    for w in range(1, weeks + 1):
        for d, off in enumerate(DAY_OFFSETS[days], start=1):
            out.append((w, d, start_date + dt.timedelta(days=7 * (w - 1) + off)))
    return out
