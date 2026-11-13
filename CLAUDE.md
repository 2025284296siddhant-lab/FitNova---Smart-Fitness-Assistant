# FitNova — Smart Fitness Assistant

Tagline: **PERSONAL FITNESS INTELLIGENCE**. A mobile-first, installable (PWA) fitness app:
workout generation, workout completion tracking, progress scatter plot, vitals tracking, BMI profile.

Source requirements live in `docs/SPEC.md` (condensed from the two original prompts). The goal and
Definition of Done live in `docs/GOAL.md`. Work breakdown and status live in `docs/TASKS.md`.

## Stack (zero external dependencies — no Node on this machine)
- **Backend:** Python 3.13 standard library only (`http.server` ThreadingHTTPServer + `sqlite3`).
- **Database:** SQLite at `data/fitnova.db`, versioned SQL migrations in `server/migrations/NNN_name.sql`.
- **Frontend:** vanilla ES modules, no build step, in `web/`. Charts are hand-built SVG (`web/js/charts.js`).
- **PWA:** `web/manifest.webmanifest` + `web/sw.js` (caches shell only, never API data).

Run: `python run.py` → http://localhost:8000 . Tests: `python -m unittest discover -s tests -v`.

## Layout
```
run.py                     entry point (args: --port, --db)
server/app.py              HTTP server, routing, static files, JSON helpers
server/db.py               connection, transactions, migration runner + backup
server/migrations/*.sql    versioned schema (never edit an applied migration; add a new one)
server/validation.py       input validation helpers -> ValidationError
server/generator.py        rule-based workout generator (NOT machine learning)
server/api/*.py            route handlers: users, exercises, plans, completions, progress, vitals
server/data/exercises.json exercise library seed (validated by tests)
web/index.html             app shell; web/css/app.css design system
web/js/app.js              hash router + shell; web/js/api.js fetch wrapper; web/js/ui.js modals/toasts
web/js/pages/*.js          one module per page, each exports render(root, ctx)
tests/                     unittest suites (API, DB/migrations, generator, library)
```

## Hard rules (from the spec — do not violate)
1. **Equipment is a hard constraint.** Never output an exercise requiring equipment the user lacks.
   Enforced in `generator.py` AND re-checked on save.
2. **A saved plan is never a completion.** Progress figures come only from `workout_completions`.
3. **One completion per scheduled session** (`UNIQUE(session_id)`); edits update the same row.
4. **Never fabricate data:** no invented durations, readings or demo activity. Missing duration =
   `NULL`, shown as "duration not recorded", not plotted on the scatter Y axis.
5. **Vitals are informational, not diagnostic.** No diagnoses, no treatment advice, no "healthy /
   unhealthy" labels, no adult reference ranges. Input checks are *plausibility* checks only.
   Every vitals view shows the "discuss concerning readings with a qualified healthcare professional" note.
   Source is always `manual` (no device integration exists — never imply automatic measuring).
6. **BMI categories only for adults** (age band `adult`). Under-18 / unspecified: show value + note.
7. **Privacy:** every user-scoped query filters by the `user_id` resolved from the `X-User-Token`
   header. Never trust a client-sent user_id.
8. **SQL:** parameterized queries only; multi-statement writes inside `with db.transaction(conn):`.
9. **Migrations:** back up the DB before applying pending migrations to a non-empty DB; never drop
   or silently recreate user data.
10. **Dates:** `session_date`/`scheduled_date` = local `YYYY-MM-DD`; timestamps = UTC ISO-8601 `...Z`.
11. No fake buttons: every control must do something real. No ML claims.

## Design system (see `web/css/app.css` tokens)
Dark graphite surfaces (`--bg #0B0D10`, `--surface #14171C`, `--surface-2 #1B1F26`), white text,
muted grey secondary, **electric cyan accent `--accent #2EE6FF`** used sparingly with soft glow.
Status colors: completed = cyan, partial = amber `#FFB547`, skipped = slate/rose `#FF6B81`, upcoming = grey.
Topographic contour-line background (`web/img/topo.svg`) at low opacity behind content, never behind charts.
Mobile: bottom tab bar + top app bar. ≥ 900px: left sidebar with brand + 6 nav items.
Fonts: "Space Grotesk" (display) + "Inter" (body) with system fallbacks.

## Agent workflow
- Opus (main session) owns architecture, schema, generator, API, design system and review.
- Cheaper subagents do bounded tasks using the briefs in `.claude/agents/`:
  - `exercise-librarian` (haiku): authors `server/data/exercises.json` to the schema.
  - `test-engineer` (sonnet): writes/extends `tests/`.
  - `page-builder` (sonnet): builds a page module following existing page patterns.
  - `qa-runner` (haiku): runs tests / smoke checks and reports failures verbatim.
- Every subagent output is reviewed and verified by the main session before marking a task done.
- Update `docs/TASKS.md` status as work lands.
