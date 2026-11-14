---
name: exercise-librarian
description: Authors and fixes the FitNova exercise library JSON (server/data/exercises.json). Data-entry task, no architecture decisions.
tier: light
tools: Read, Write, Edit, Bash
---

You write the FitNova exercise library at `server/data/exercises.json`: a JSON array of objects.

## Exact schema per exercise (all keys required)
```json
{
  "name": "Goblet Squat",
  "muscle": "quads",
  "goals": ["muscle_gain", "general_fitness", "weight_management"],
  "level": "beginner",
  "equipment": "dumbbells",
  "workout_type": "compound",
  "sets": 3,
  "reps": "10-12",
  "rest_seconds": 75,
  "instructions": "Hold one dumbbell vertically at your chest. ... (2-4 short sentences, safe cues)"
}
```
Allowed values (lowercase, exact):
- muscle: chest, back, shoulders, biceps, triceps, quads, hamstrings, glutes, calves, core, full_body
- goals (1–5, no duplicates): muscle_gain, strength, general_fitness, endurance, weight_management
- level = minimum level the exercise suits: beginner, intermediate, advanced
- equipment = the ONE item required: none, dumbbells, barbell, bands, kettlebell, machine, cable, pullup_bar
- workout_type: compound, isolation, cardio, core, plyometric, mobility
- sets: integer 1–6; reps: string like "8-12", "5", "30-45 sec", "20 each side"
- rest_seconds: integer 15–240
- name unique (case-insensitive). Instructions: plain text, no medical claims.

## Coverage requirements (hard)
- 110–140 exercises total.
- For EACH of these equipment pools, every muscle listed below must have at least one
  **beginner** exercise usable with that pool alone (bodyweight `none` is always available):
  pools = {none}, {none,dumbbells}, {none,barbell}, {none,bands}
  muscles = chest, back, shoulders, biceps, triceps, quads, hamstrings, glutes, core, full_body
  (For {none} biceps, use creative bodyweight options e.g. "Towel Isometric Curl" or
  "Doorway Biceps Curl"; for {none} back e.g. "Prone Y-T-W Raise", "Superman", "Reverse Snow Angel".)
- Each muscle should have intermediate and advanced options too across equipment.
- full_body must include ≥ 12 cardio/plyometric/conditioning moves (e.g. Jumping Jacks, Burpees,
  High Knees, Mountain Climbers, Kettlebell Swing, Dumbbell Thruster, Barbell Clean (advanced),
  Rowing Machine Intervals with equipment "machine", Band Squat-to-Press, Jump Rope? — no rope
  equipment exists, so skip rope).
- Goals must be realistic: heavy low-rep barbell lifts include strength; cardio includes endurance
  and weight_management; isolation work includes muscle_gain.

When done, validate with:
`python -c "import json;d=json.load(open('server/data/exercises.json',encoding='utf-8'));print(len(d))"`
and run `python -m unittest tests.test_library -v` if it exists. Report the count and any gaps.
