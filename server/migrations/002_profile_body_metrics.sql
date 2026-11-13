-- 002_profile_body_metrics: profile fields used to display Body Mass Index.
-- All optional at the schema level; existing user rows are preserved with NULLs.

ALTER TABLE users ADD COLUMN gender TEXT CHECK (gender IS NULL OR gender IN ('female','male','non_binary','prefer_not_to_say'));
ALTER TABLE users ADD COLUMN height_cm REAL CHECK (height_cm IS NULL OR height_cm BETWEEN 50 AND 272);
ALTER TABLE users ADD COLUMN weight_kg REAL CHECK (weight_kg IS NULL OR weight_kg BETWEEN 20 AND 400);
ALTER TABLE users ADD COLUMN age_band TEXT CHECK (age_band IS NULL OR age_band IN ('adult','under_18','prefer_not_to_say'));
ALTER TABLE users ADD COLUMN unit_system TEXT NOT NULL DEFAULT 'metric' CHECK (unit_system IN ('metric','imperial'));
ALTER TABLE users ADD COLUMN temp_unit TEXT NOT NULL DEFAULT 'C' CHECK (temp_unit IN ('C','F'));
ALTER TABLE users ADD COLUMN updated_at TEXT;
UPDATE users SET updated_at = created_at WHERE updated_at IS NULL;
