"""SQLite access layer: connections, transactions, versioned migrations with backup, library seeding."""
from __future__ import annotations

import contextlib
import datetime as dt
import json
import re
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parent
MIGRATIONS_DIR = ROOT / "migrations"
EXERCISES_JSON = ROOT / "data" / "exercises.json"
_MIGRATION_RE = re.compile(r"^(\d{3})_([a-z0-9_]+)\.sql$")


class MigrationError(RuntimeError):
    pass


def utc_now() -> str:
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).strftime("%Y-%m-%dT%H:%M:%SZ")


def connect(db_path: str | Path) -> sqlite3.Connection:
    conn = sqlite3.connect(str(db_path), isolation_level=None, timeout=10)  # autocommit; explicit txns
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA busy_timeout = 5000")
    return conn


@contextlib.contextmanager
def transaction(conn: sqlite3.Connection):
    """Atomic unit of work. Rolls back on any exception and re-raises."""
    conn.execute("BEGIN IMMEDIATE")
    try:
        yield conn
    except BaseException:
        conn.execute("ROLLBACK")
        raise
    else:
        conn.execute("COMMIT")


# ---------------------------------------------------------------- migrations

def _split_sql(script: str) -> list[str]:
    statements, buf = [], ""
    for line in script.splitlines(keepends=True):
        if line.strip().startswith("--") and not buf.strip():
            continue
        buf += line
        if sqlite3.complete_statement(buf):
            if buf.strip():
                statements.append(buf.strip())
            buf = ""
    if buf.strip() and not all(l.strip().startswith("--") or not l.strip() for l in buf.splitlines()):
        raise MigrationError("Incomplete SQL statement at end of migration")
    return statements


def available_migrations(migrations_dir: Path = MIGRATIONS_DIR) -> list[tuple[int, str, Path]]:
    found = []
    for p in sorted(migrations_dir.glob("*.sql")):
        m = _MIGRATION_RE.match(p.name)
        if not m:
            raise MigrationError(f"Bad migration filename: {p.name}")
        found.append((int(m.group(1)), m.group(2), p))
    versions = [v for v, _, _ in found]
    if len(versions) != len(set(versions)):
        raise MigrationError("Duplicate migration version numbers")
    return found


def current_version(conn: sqlite3.Connection) -> int:
    conn.execute(
        "CREATE TABLE IF NOT EXISTS schema_migrations ("
        " version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)"
    )
    row = conn.execute("SELECT COALESCE(MAX(version), 0) FROM schema_migrations").fetchone()
    return int(row[0])


def _has_user_data(conn: sqlite3.Connection) -> bool:
    tables = [r[0] for r in conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name <> 'schema_migrations'"
    )]
    for t in tables:
        if conn.execute(f'SELECT 1 FROM "{t}" LIMIT 1').fetchone():
            return True
    return False


def backup_database(conn: sqlite3.Connection, db_path: Path, label: str) -> Path:
    backup_dir = db_path.parent / "backups"
    backup_dir.mkdir(parents=True, exist_ok=True)
    stamp = dt.datetime.now().strftime("%Y%m%d-%H%M%S-%f")
    target = backup_dir / f"{db_path.stem}-{stamp}-{label}.db"
    dest = sqlite3.connect(str(target))
    try:
        conn.backup(dest)
    finally:
        dest.close()
    return target


def verify_schema(conn: sqlite3.Connection) -> None:
    ok = conn.execute("PRAGMA integrity_check").fetchone()[0]
    if ok != "ok":
        raise MigrationError(f"integrity_check failed: {ok}")
    bad = conn.execute("PRAGMA foreign_key_check").fetchall()
    if bad:
        raise MigrationError(f"foreign_key_check found {len(bad)} violation(s)")


def migrate(db_path: str | Path, migrations_dir: Path = MIGRATIONS_DIR, target: int | None = None) -> dict:
    """Apply pending migrations in order, each in its own transaction.

    Backs up a non-empty database before applying anything. Never drops or recreates user data.
    Returns {'from': v0, 'to': v1, 'applied': [...], 'backup': path|None}.
    """
    db_path = Path(db_path)
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = connect(db_path)
    try:
        start = current_version(conn)
        pending = [m for m in available_migrations(migrations_dir)
                   if m[0] > start and (target is None or m[0] <= target)]
        result = {"from": start, "to": start, "applied": [], "backup": None}
        if not pending:
            verify_schema(conn)
            return result
        if start > 0 or _has_user_data(conn):
            result["backup"] = str(backup_database(conn, db_path, f"pre-v{pending[0][0]:03d}"))
        for version, name, path in pending:
            statements = _split_sql(path.read_text(encoding="utf-8"))
            with transaction(conn):
                for stmt in statements:
                    conn.execute(stmt)
                conn.execute("INSERT INTO schema_migrations(version, name, applied_at) VALUES (?, ?, ?)",
                             (version, name, utc_now()))
            result["applied"].append(f"{version:03d}_{name}")
            result["to"] = version
        verify_schema(conn)
        return result
    finally:
        conn.close()


# ---------------------------------------------------------------- exercise library

def seed_exercises(conn: sqlite3.Connection, json_path: Path = EXERCISES_JSON) -> int:
    """Upsert the library by name so exercise_ids (referenced by plan_items) stay stable."""
    if not json_path.exists():
        return 0
    data = json.loads(json_path.read_text(encoding="utf-8"))
    with transaction(conn):
        for ex in data:
            conn.execute(
                """INSERT INTO exercises(name, muscle, goal, level, equipment, workout_type, sets, reps, rest, instructions)
                   VALUES (?,?,?,?,?,?,?,?,?,?)
                   ON CONFLICT(name) DO UPDATE SET muscle=excluded.muscle, goal=excluded.goal, level=excluded.level,
                     equipment=excluded.equipment, workout_type=excluded.workout_type, sets=excluded.sets,
                     reps=excluded.reps, rest=excluded.rest, instructions=excluded.instructions""",
                (ex["name"].strip(), ex["muscle"], ",".join(ex["goals"]), ex["level"], ex["equipment"],
                 ex["workout_type"], int(ex["sets"]), str(ex["reps"]), int(ex["rest_seconds"]),
                 ex["instructions"].strip()),
            )
    return len(data)


def init_database(db_path: str | Path) -> dict:
    info = migrate(db_path)
    conn = connect(db_path)
    try:
        info["exercises"] = seed_exercises(conn)
    finally:
        conn.close()
    return info
