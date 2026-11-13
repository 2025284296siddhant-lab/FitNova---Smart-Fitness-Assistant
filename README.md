# FitNova — Smart Fitness Assistant
**PERSONAL FITNESS INTELLIGENCE**

A mobile-first, installable fitness app (Progressive Web App) with a Python + SQLite backend.
It generates personalised workout plans, tracks the sessions you actually complete, plots your
progress, and keeps a private vitals log with a BMI profile.

---

## 1. Run it locally

Requirements: **Python 3.10+** (built and tested on 3.13). No packages to install. The backend
uses only the standard library, and the frontend has no build step.

```bash
python run.py
```

Then open **http://localhost:8000**. The database is created at `data/fitnova.db` on first run.

Options:

```bash
python run.py --port 8080 --db data/my.db
```

**Use it on your phone.** Start the server on all network interfaces, then open
`http://<your-PC's-IP>:8000` on a phone that is on the same Wi-Fi:

```bash
python run.py --host 0.0.0.0
```

In Chrome on Android you can then choose **Add to Home screen** (or **Install app**) to use
FitNova full-screen like a native app. Full PWA install and offline caching need HTTPS or
`localhost`; over a plain LAN address it runs as a normal mobile web app.

Run the tests:

```bash
python -m unittest discover -s tests -v
```

---

## 2. Features implemented

| Area | What works |
|---|---|
| **Profile and BMI** | Onboarding captures name, gender, height and weight (metric or imperial, converted live) plus an optional age group. BMI is calculated and shown. WHO adult categories appear **only** for adults; under-18s get a note instead. Profile can be edited or deleted (deletion removes all data). |
| **Home** | Hero ("Train smarter. Build your plan."), **Create My Workout** CTA, 1 large + 2 small image collage (falls back to a styled panel if images can't load), THE PLATFORM cards, and a live snapshot (next session, 30-day totals, BMI). |
| **Create Workout** | Validated form: goal, level, equipment (multi-select; "No Equipment" and "Full Gym" are exclusive), days 1–7. Shows a preview you can **regenerate**, with plan name, start date and program length (1–8 weeks), then **Save**. Includes a searchable **exercise library** browser. |
| **Generator** | Rule-based (not machine learning). Equipment is a **hard constraint**, enforced at generation and again on save. It never selects exercises above your level. Picks a split from goal/level/days, scores candidates on goal fit, level fit, movement type and variety, and uses tiered fallbacks (same muscle → related muscle → omit the slot), each **explained** to the user. Sets, reps and rest are adjusted per goal. |
| **My Workout** | Plan list with progress bars and the next session. Plan detail has a dated **Sessions** tab (filter by week) and a **Program** tab (per-day exercises with sets, reps, rest and instructions). Rename, and delete with a confirmation that warns how many logged sessions will be removed. |
| **Completion tracking** | Every session has **Mark Workout Complete**: *Completed* (date, optional minutes, note), *Partially completed* (choose the exercises done), *Skipped* (optional reason). Records can be edited or removed. Duplicates are blocked (DB `UNIQUE` plus HTTP 409). Future dates are rejected. Statuses: Upcoming, Not logged (past, no record), Completed, Partial, Skipped. |
| **Progress** | KPIs (completed, partial, skipped, minutes) for 7/30/90 days or all time. Interactive **scatter plot**, weekly bars (8 weeks), monthly table (6 months) and recent activity. Refreshes immediately after any completion change. |
| **Vitals** | Manual entries for resting heart rate, blood pressure (systolic and diastolic stored separately), SpO₂, and temperature in °C or °F. Add, edit and delete. Latest-reading cards, trend charts, and history filtered by type and date range. Prominent safety notice. Clearly labelled **Manual**. |
| **About** | What FitNova is, features, how generation, completion, progress and vitals work, privacy, limitations and educational purpose. |
| **App shell** | Bottom tab bar on phones, sidebar at ≥ 900px, active states, topographic contour background, toasts, accessible bottom sheets (focus trap, Esc to close), skeletons, and empty and error states. |

---

## 3. Database structure (SQLite, `data/fitnova.db`)

Versioned migrations live in `server/migrations/`:
- `001_initial.sql` is the core schema.
- `002_profile_body_metrics.sql` adds the profile/BMI fields to `users`.

Before applying pending migrations to a database that already holds data, FitNova backs it up to
`data/backups/` using SQLite's backup API. Each migration runs in its own transaction, and the
result is checked with `integrity_check` and `foreign_key_check`.

| Table | Key columns | Relationships and constraints |
|---|---|---|
| `users` | user_id PK, name, access_token (unique), gender, height_cm, weight_kg, age_band, unit_system, temp_unit, created_at, updated_at | CHECKs on all enums and ranges |
| `exercises` | exercise_id PK, name (unique, case-insensitive), muscle, goal, level, equipment, workout_type, sets, reps, rest, instructions | Seeded by upsert from `server/data/exercises.json` (132 exercises), so IDs stay stable |
| `workout_plans` | plan_id PK, user_id FK, name, goal, level, equipment, days_per_week (1–7), weeks, start_date, seed, generation_notes, created_at | Cascades when its user is deleted |
| `plan_items` | item_id PK, plan_id FK, exercise_id FK, day_number, order_number, sets, reps, rest, fallback_note | UNIQUE(plan, day, order) and UNIQUE(plan, day, exercise); deleting an exercise is restricted while plans use it |
| `plan_sessions` | session_id PK, plan_id FK, week_number, day_number, title, focus, scheduled_date | UNIQUE(plan, week, day) |
| `workout_completions` | completion_id PK, plan_id FK, **session_id FK UNIQUE**, session_date, status, duration_minutes (nullable), notes, skip_reason, created_at, updated_at | One record per session; a skipped session can't have a duration |
| `completion_exercises` | (completion_id, item_id) PK | The exercises done in a partial session |
| `vitals_records` | vital_id PK, user_id FK, measurement_type, value, secondary_value, unit, recorded_at, notes, source, created_at, updated_at | CHECK: only blood pressure has a secondary value; unit must match the type |
| `schema_migrations` | version PK, name, applied_at | Migration history |

**Conventions:**
- `*_date` columns are local `YYYY-MM-DD`; `*_at` columns are UTC ISO-8601 `…Z`.
- All queries are parameterized, and multi-row writes run in `BEGIN IMMEDIATE` transactions.
- Every user-scoped query filters by the user resolved from the private `X-User-Token` header, so other profiles' records return 404.

---

## 4. Charts and visualizations

All charts are hand-built SVG (`web/js/charts.js`) with no external chart library, so they work offline.

- **Workout activity scatter plot (Progress):**
  - X axis is the session date, Y axis is the recorded duration in minutes, with axis titles and readable date ticks.
  - Completed sessions are **cyan circles**; partially completed sessions are **amber diamonds**.
  - Hover, focus or tap a point for a tooltip (date, workout, status, duration), plus a detail panel showing plan, week, exercises done and note.
  - Points are keyboard-focusable with aria labels.
  - 7d / 30d / 90d / All filters, responsive resizing, and automatic refresh after a completion is added or edited.
  - Skipped sessions and sessions without a duration are **not plotted**; both are explained and still counted.
  - Shows an empty state when nothing has been logged.
- **Vitals trend charts:**
  - Line-and-point time series per type; blood pressure is drawn as two series (systolic and diastolic).
  - Temperatures are converted to your preferred unit for display, with a label saying so.
  - Gaps are never filled in.
- **Weekly activity bars** (stacked by status) and a **monthly summary table** on Progress.
- **BMI scale** on Profile and Home (adults only).

---

## 5. Tests performed and outcomes

**Automated: `python -m unittest discover -s tests` → 75 tests, all passing.**
- `test_library`: library schema, allowed values, unique names, and beginner coverage for each equipment pool.
- `test_generator`: equipment hard constraint across all goal × level × equipment × days combinations, never above the user's level, correct day count, no duplicates within a day, deterministic seeds, fallback notes, invalid inputs.
- `test_api`:
  - Plans: generate, save and reload; a saved plan has zero completions.
  - Completions: completed, partial and skipped flows; editing and removing a completion; duplicates return 409; future dates and skipped-with-duration are rejected.
  - Progress: missing durations aren't plotted; range filters work; the empty state appears with no data.
  - Vitals: create, read, update and delete for all four types including °C and °F; invalid values and units are rejected; type and date filters work.
  - Privacy and integrity: another user gets 404 for your records; requests without a token get 401; deleting a plan cascades; BMI category shows only for adults.
- `test_db`: FK enforcement, transaction rollback, migrating v1 → v2 preserves rows and creates a backup, re-running migrations is a no-op, CHECK constraints.

**Manual browser verification (in-app browser at 375 / 768 / 1280 px):**
- ✅ Onboarding (validation, live BMI preview) → Home.
- ✅ Create Workout validation → generate → preview → save → My Workout.
- ✅ Mark Workout Complete with duration and note. HTML in the note is escaped.
- ✅ Duplicate completion → 409. Partial, skipped and no-duration sessions logged.
- ✅ Progress scatter: circle vs diamond, tooltip, tap-to-inspect panel, missing-duration notice, 7-day filter.
- ✅ Editing a log to add a duration updated the plot (3 points) and minutes (73 → 113) straight away.
- ✅ Vitals: add blood pressure through the form (diastolic ≥ systolic rejected), latest cards, BP two-line trend, history filters.
- ✅ Plan deletion with confirmation.
- ✅ No horizontal overflow on any page at 375px or 768px; desktop sidebar layout checked.
- ✅ **Restarted the server: profile, plan, completions and vitals all persisted.**
- ✅ No JavaScript errors in the console. The only console entries were HTTP 409/400 responses from deliberate invalid-input tests.

---

## 6. Limitations

- **Single device per profile.** The private profile key lives in the browser's local storage. There are no passwords or accounts, and no sync between devices. Clearing site data on that device loses access to the profile; the data itself stays in the database.
- **No device integration.** Vitals are manual entries only (`source = manual`); FitNova measures nothing automatically.
- **Not medical advice.** Vitals and BMI are informational only. FitNova shows no reference ranges or health labels for readings, and BMI doesn't reflect body composition.
- **The generator is rule-based.** It cannot assess form, injuries or medical conditions, and the library is limited to 132 exercises.
- **Hero photos are loaded from Unsplash** and need an internet connection; a styled fallback panel appears if they can't load. Fonts come from Google Fonts, with system-font fallbacks.
- **No HTTPS in the dev server.** Installing the PWA from another device needs HTTPS (for example behind a reverse proxy); on `localhost` it works directly.

---

## Project layout and agent workflow

See `CLAUDE.md` for architecture and hard rules, `docs/SPEC.md` for the condensed requirements,
`docs/GOAL.md` for the Definition of Done, `docs/TASKS.md` for the work breakdown, and
`.claude/agents/` for the subagent briefs (exercise-librarian, test-engineer, page-builder,
qa-runner) used to build it.
