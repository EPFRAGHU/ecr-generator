"""
Visitor registrations and usage counts, stored in SQLite.

Only the registration form (name, mobile, email) and event counts are
stored. Wage data never reaches this module.

Set DATA_DIR to a persistent volume in production (Coolify: Persistent
Storage mounted at /data, DATA_DIR=/data); otherwise the database is lost
on every redeploy.
"""
from __future__ import annotations

import os
import sqlite3
import time
from contextlib import closing

DATA_DIR = os.environ.get("DATA_DIR") or os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "data"
)
DB_PATH = os.path.join(DATA_DIR, "visitors.db")

SCHEMA = """
CREATE TABLE IF NOT EXISTS registrations (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    mobile     TEXT NOT NULL UNIQUE,
    email      TEXT NOT NULL,
    created_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS events (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    ts         REAL NOT NULL,
    visitor_id TEXT NOT NULL,
    reg_id     INTEGER,
    kind       TEXT NOT NULL      -- view | upload | ecr | exit
);
CREATE INDEX IF NOT EXISTS events_reg ON events(reg_id);
"""


def _connect() -> sqlite3.Connection:
    os.makedirs(DATA_DIR, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    with closing(_connect()) as conn:
        conn.execute("PRAGMA journal_mode=WAL")
        conn.executescript(SCHEMA)


def register(name: str, mobile: str, email: str) -> int:
    """Create a registration, or update it if the mobile is already known."""
    with closing(_connect()) as conn, conn:
        row = conn.execute(
            "SELECT id FROM registrations WHERE mobile = ?", (mobile,)
        ).fetchone()
        if row:
            conn.execute(
                "UPDATE registrations SET name = ?, email = ? WHERE id = ?",
                (name, email, row["id"]),
            )
            return row["id"]
        cur = conn.execute(
            "INSERT INTO registrations (name, mobile, email, created_at) "
            "VALUES (?, ?, ?, ?)",
            (name, mobile, email, time.time()),
        )
        return cur.lastrowid


def registration_exists(reg_id) -> bool:
    if not isinstance(reg_id, int):
        return False
    with closing(_connect()) as conn:
        return conn.execute(
            "SELECT 1 FROM registrations WHERE id = ?", (reg_id,)
        ).fetchone() is not None


def log_event(visitor_id: str, reg_id: int | None, kind: str) -> None:
    with closing(_connect()) as conn, conn:
        conn.execute(
            "INSERT INTO events (ts, visitor_id, reg_id, kind) VALUES (?, ?, ?, ?)",
            (time.time(), visitor_id or "unknown", reg_id, kind),
        )


def stats() -> dict:
    with closing(_connect()) as conn:
        row = conn.execute(
            """
            SELECT
              (SELECT COUNT(*) FROM events WHERE kind = 'view')      AS page_views,
              (SELECT COUNT(DISTINCT visitor_id) FROM events)        AS unique_visitors,
              (SELECT COUNT(*) FROM registrations)                   AS registered,
              (SELECT COUNT(*) FROM events WHERE kind = 'ecr')       AS ecr_files,
              (SELECT COUNT(*) FROM events WHERE kind = 'exit')      AS exit_files
            """
        ).fetchone()
        return dict(row)


def list_registrations() -> list[dict]:
    with closing(_connect()) as conn:
        rows = conn.execute(
            """
            SELECT r.id, r.name, r.mobile, r.email, r.created_at,
                   COALESCE(SUM(e.kind = 'view'), 0) AS views,
                   COALESCE(SUM(e.kind = 'ecr'), 0)  AS ecr_files,
                   COALESCE(SUM(e.kind = 'exit'), 0) AS exit_files,
                   MAX(e.ts)                          AS last_seen
            FROM registrations r
            LEFT JOIN events e ON e.reg_id = r.id
            GROUP BY r.id
            ORDER BY r.created_at DESC
            """
        ).fetchall()
        return [dict(r) for r in rows]


def delete_registration(reg_id: int) -> None:
    """Remove a person's details; their past events stay as anonymous counts."""
    with closing(_connect()) as conn, conn:
        conn.execute("UPDATE events SET reg_id = NULL WHERE reg_id = ?", (reg_id,))
        conn.execute("DELETE FROM registrations WHERE id = ?", (reg_id,))
