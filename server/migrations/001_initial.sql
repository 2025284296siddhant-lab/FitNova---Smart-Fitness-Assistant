-- 001_initial: core FitNova schema.
-- Dates: *_date columns are local calendar dates 'YYYY-MM-DD'; *_at columns are UTC ISO-8601 'YYYY-MM-DDTHH:MM:SSZ'.

CREATE TABLE users (
    user_id      INTEGER PRIMARY KEY AUTOINCREMENT,
    name         TEXT    NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 60),
    access_token TEXT    NOT NULL UNIQUE,
    created_at   TEXT    NOT NULL
);

CREATE TABLE exercises (
    exercise_id  INTEGER PRIMARY KEY AUTOINCREMENT,
    name         TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    muscle       TEXT    NOT NULL CHECK (muscle IN ('chest','back','shoulders','biceps','triceps','quads','hamstrings','glutes','calves','core','full_body')),
    goal         TEXT    NOT NULL,          -- comma-separated canonical goal tags, e.g. 'muscle_gain,strength'
    level        TEXT    NOT NULL CHECK (level IN ('beginner','intermediate','advanced')),
    equipment    TEXT    NOT NULL CHECK (equipment IN ('none','dumbbells','barbell','bands','kettlebell','machine','cable','pullup_bar')),
    workout_type TEXT    NOT NULL CHECK (workout_type IN ('compound','isolation','cardio','core','plyometric','mobility')),
    sets         INTEGER NOT NULL CHECK (sets BETWEEN 1 AND 6),
    reps         TEXT    NOT NULL,
    rest         INTEGER NOT NULL CHECK (rest BETWEEN 15 AND 240),   -- seconds
    instructions TEXT    NOT NULL
);
CREATE INDEX idx_exercises_muscle ON exercises(muscle);
CREATE INDEX idx_exercises_equipment ON exercises(equipment);

CREATE TABLE workout_plans (
    plan_id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id          INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    name             TEXT    NOT NULL,
    goal             TEXT    NOT NULL CHECK (goal IN ('muscle_gain','strength','general_fitness','endurance','weight_management')),
    level            TEXT    NOT NULL CHECK (level IN ('beginner','intermediate','advanced')),
    equipment        TEXT    NOT NULL,      -- comma-separated user selections, e.g. 'dumbbells,bands'
    days_per_week    INTEGER NOT NULL CHECK (days_per_week BETWEEN 1 AND 7),
    weeks            INTEGER NOT NULL DEFAULT 4 CHECK (weeks BETWEEN 1 AND 8),
    start_date       TEXT    NOT NULL,
    seed             INTEGER NOT NULL,
    generation_notes TEXT    NOT NULL DEFAULT '[]',   -- JSON array of fallback explanations
    created_at       TEXT    NOT NULL
);
CREATE INDEX idx_plans_user ON workout_plans(user_id);

-- Template of exercises for each training day of the weekly cycle.
CREATE TABLE plan_items (
    item_id      INTEGER PRIMARY KEY AUTOINCREMENT,
    plan_id      INTEGER NOT NULL REFERENCES workout_plans(plan_id) ON DELETE CASCADE,
    exercise_id  INTEGER NOT NULL REFERENCES exercises(exercise_id) ON DELETE RESTRICT,
    day_number   INTEGER NOT NULL CHECK (day_number BETWEEN 1 AND 7),
    order_number INTEGER NOT NULL CHECK (order_number >= 1),
    sets         INTEGER NOT NULL,
    reps         TEXT    NOT NULL,
    rest         INTEGER NOT NULL,
    fallback_note TEXT,
    UNIQUE (plan_id, day_number, order_number),
    UNIQUE (plan_id, day_number, exercise_id)
);
CREATE INDEX idx_items_plan ON plan_items(plan_id);

-- Concrete scheduled occurrences (week x day) of the plan.
CREATE TABLE plan_sessions (
    session_id     INTEGER PRIMARY KEY AUTOINCREMENT,
    plan_id        INTEGER NOT NULL REFERENCES workout_plans(plan_id) ON DELETE CASCADE,
    week_number    INTEGER NOT NULL CHECK (week_number >= 1),
    day_number     INTEGER NOT NULL CHECK (day_number BETWEEN 1 AND 7),
    title          TEXT    NOT NULL,
    focus          TEXT    NOT NULL,
    scheduled_date TEXT    NOT NULL,
    UNIQUE (plan_id, week_number, day_number)
);
CREATE INDEX idx_sessions_plan ON plan_sessions(plan_id);

-- Actual outcomes. One record per scheduled session (duplicates prevented by UNIQUE(session_id)).
CREATE TABLE workout_completions (
    completion_id    INTEGER PRIMARY KEY AUTOINCREMENT,
    plan_id          INTEGER NOT NULL REFERENCES workout_plans(plan_id) ON DELETE CASCADE,
    session_id       INTEGER NOT NULL UNIQUE REFERENCES plan_sessions(session_id) ON DELETE CASCADE,
    session_date     TEXT    NOT NULL,
    status           TEXT    NOT NULL CHECK (status IN ('completed','partial','skipped')),
    duration_minutes INTEGER CHECK (duration_minutes IS NULL OR duration_minutes BETWEEN 1 AND 600),
    notes            TEXT,
    skip_reason      TEXT,
    created_at       TEXT    NOT NULL,
    updated_at       TEXT    NOT NULL,
    CHECK (status <> 'skipped' OR duration_minutes IS NULL)
);
CREATE INDEX idx_completions_plan ON workout_completions(plan_id);
CREATE INDEX idx_completions_date ON workout_completions(session_date);

-- Exercises actually done in a partially completed session.
CREATE TABLE completion_exercises (
    completion_id INTEGER NOT NULL REFERENCES workout_completions(completion_id) ON DELETE CASCADE,
    item_id       INTEGER NOT NULL REFERENCES plan_items(item_id) ON DELETE CASCADE,
    PRIMARY KEY (completion_id, item_id)
);

CREATE TABLE vitals_records (
    vital_id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id          INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    measurement_type TEXT    NOT NULL CHECK (measurement_type IN ('heart_rate','blood_pressure','spo2','temperature')),
    value            REAL    NOT NULL,
    secondary_value  REAL,
    unit             TEXT    NOT NULL CHECK (unit IN ('bpm','mmHg','%','C','F')),
    recorded_at      TEXT    NOT NULL,
    notes            TEXT,
    source           TEXT    NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','device')),
    created_at       TEXT    NOT NULL,
    updated_at       TEXT    NOT NULL,
    CHECK ((measurement_type = 'blood_pressure') = (secondary_value IS NOT NULL)),
    CHECK (
        (measurement_type = 'heart_rate'     AND unit = 'bpm') OR
        (measurement_type = 'blood_pressure' AND unit = 'mmHg') OR
        (measurement_type = 'spo2'           AND unit = '%') OR
        (measurement_type = 'temperature'    AND unit IN ('C','F'))
    )
);
CREATE INDEX idx_vitals_user_type_time ON vitals_records(user_id, measurement_type, recorded_at);
