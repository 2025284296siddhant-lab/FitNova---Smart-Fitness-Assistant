# FitNova Specification (condensed from the original two prompts)

## Branding
FitNova — PERSONAL FITNESS INTELLIGENCE. Premium dark fitness dashboard: charcoal/graphite/black
surfaces, white primary + muted grey secondary text, neon cyan/electric-blue accents, subtle glow,
rounded cards, smooth transitions, fully responsive. Subtle flowing topographic contour-line
background (graphite gradients) that never hurts readability of charts/cards/forms.
Navigation: Home, Create Workout, My Workout, Progress, Vitals, About (icons + active states).
Delivered as a mobile app experience (installable PWA, bottom tabs on phones, sidebar on desktop).

## Profile
Name, gender, height, weight (+ optional age band so adult BMI categories are not applied to minors).
Display Body Mass Index.

## Home
Hero: "PERSONALIZED FITNESS PLANNING" / "Train smarter. Build your plan." / button "Create My Workout".
Image collage: 1 large + 2 small. "THE PLATFORM": PERSONALIZED, EXERCISE LIBRARY, TRAINING GOALS,
WORKOUT BUILDER cards.

## Create Workout
Goal (Muscle Gain, Strength, General Fitness, Endurance, Weight Management); Level (Beginner,
Intermediate, Advanced); Equipment (No Equipment, Dumbbells, Barbell, Resistance Bands, Full Gym);
Days 1–7. Validate. Library fields: name, muscle, goal, level, equipment, workout type, sets, reps,
rest, instructions. Generator: equipment = hard constraint; prioritize goal + level; distribute
across days; avoid repetition; compatible fallbacks; explain fallbacks.

## My Workout
List/open plans; per-day exercises with sets/reps/rest/instructions; delete with confirmation;
status upcoming/completed/partial/skipped. Mark Workout Complete per session: Completed (confirm
date, optional duration min, optional note), Partially Completed (which exercises), Skipped
(optional reason). Saved in DB, linked to plan + scheduled session, no duplicates, editable,
generated ≠ completed, progress updates immediately.

## Progress
Totals: completed, partial, skipped, minutes; recent history; weekly + monthly summaries.
Primary chart = interactive scatter plot: X = session date, Y = duration minutes; distinct
markers for completed vs partial; tooltips (date, workout name, status, duration); 7/30/90/all
filters; inspect points; auto-update. Skipped sessions are not plotted (no invented duration).
Missing duration: keep record, don't plot, show in history with "duration not recorded".
Empty state when no sessions. Never fabricate data.

## Vitals
Manual entries: resting HR (bpm), BP sys/dia (mmHg), SpO₂ (%), temperature (°C/°F). Store type,
value, secondary value, unit, recorded_at, note, source. Add/edit/delete, history, filters by type
+ date range, latest values, time-series trend charts (BP shows both lines). Missing ≠ zero.
Never combine units without conversion + labels. Informational only: no diagnosis, no treatment
advice, no medication guidance, no invented readings, no adult ranges for minors, advise
discussing concerning readings with a qualified healthcare professional; all fields optional;
collect minimum data; private to the user. Label as manual entry (no device integration).

## About
What FitNova is, features, how generation works (rule-based, not ML), completion tracking,
progress + vitals tracking, limitations + educational purpose.

## Database (SQLite)
User(user_id, name, created_at …profile fields), Exercise(exercise_id, name, muscle, goal, level,
equipment, workout_type, sets, reps, rest, instructions), WorkoutPlan(plan_id, user_id, goal,
level, equipment, days_per_week, created_at), PlanItem(item_id, plan_id, exercise_id, day_number,
order_number), WorkoutCompletion(completion_id, plan_id, session_date, status, duration_minutes,
notes, created_at), VitalsRecord(vital_id, user_id, measurement_type, value, secondary_value, unit,
recorded_at, notes, source). PK/FK, transactions, validation, versioned migrations (backup first,
preserve data, verify), safe errors, parameterized queries, no duplicate schemas.

## Testing
Workout, progress, vitals, database, interface tests as listed in the original prompt §8; journeys
Home→Create→Generate→Save→My Workout→Complete→Progress and Vitals→Add→Save→History→Trends;
data persists after restart.
