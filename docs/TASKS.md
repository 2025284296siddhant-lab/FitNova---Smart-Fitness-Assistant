# FitNova Work Breakdown

Owner key: **O** = owner (lead developer) · **H** = helper agent (light tier) · **S** = specialist agent (standard tier).
Status: ☐ todo · ◐ in progress · ☑ done (verified by O).

## Phase 0 — Setup
- ☑ O  build.md, docs/SPEC.md, docs/GOAL.md, docs/TASKS.md, `.build/agents/*`

## Phase 1 — Backend foundation
- ☑ O  `server/db.py` connection, transaction ctx, migration runner + backup + verification
- ☑ O  `server/migrations/001_initial.sql` (users, exercises, plans, plan_sessions, plan_items, completions, completion_exercises, vitals)
- ☑ O  `server/migrations/002_profile_body_metrics.sql` (gender, height, weight, age band, units)
- ☑ H  `server/data/exercises.json` library (exercise-librarian brief)
- ☑ O  `server/validation.py`, `server/app.py` router/static/JSON/errors, token auth

## Phase 2 — Domain logic + API
- ☑ O  `server/generator.py` (equipment hard constraint, goal/level scoring, splits, fallbacks + notes)
- ☑ O  API: users/profile+BMI, exercises, plans (generate/save/list/get/delete), completions (create/edit/delete, 409 duplicates), progress (summary, scatter points, weekly/monthly), vitals (CRUD, filters, latest)

## Phase 3 — Frontend
- ☑ O  Design system `web/css/app.css`, topo background, shell (sidebar + bottom tabs), router, api.js, ui.js
- ☑ O  `charts.js` (SVG scatter + time-series, tooltips, keyboard/tap inspect)
- ☑ O  Pages: onboarding/profile, home, create workout, my workout (+ completion sheet), progress
- ☑ S  Pages: vitals, about (page-builder brief)
- ☑ H  PWA icons + manifest + service worker

## Phase 4 — Verification
- ☑ S  Test suites (test-engineer brief)
- ☑ O  Browser journeys at 375 / 768 / 1280 px; restart persistence
- ☑ O  README final summary
