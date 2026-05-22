"""Schema migration: schools, school_id on participants, org settings, user assignments,
plus the bespoke session-registration model (activity tags + GAS-style goal progress)."""
from __future__ import annotations

from sqlalchemy import inspect, text
from sqlalchemy.ext.asyncio import AsyncEngine

from app.models.core import (
    Organization,
    Participant,
    School,
    SessionActivityTag,
    SessionActivityTagLink,
    SessionGoalProgress,
)


# Seed catalog of activity tags inserted once per organization on first migration run.
# Each entry primarily touches a subset of the four IPI dimensions.
_DEFAULT_ACTIVITY_TAGS: list[tuple[str, str, str, str]] = [
    # (slug, label, color, dimensions)
    ("academic_support",      "Reforç acadèmic",        "#2563EB", "academic,cognitive"),
    ("reading_comprehension", "Lectura comprensiva",    "#1D4ED8", "academic"),
    ("group_dynamics",        "Dinàmica de grup",       "#7C3AED", "social"),
    ("assembly",              "Assemblea / debat",      "#9333EA", "social,cognitive"),
    ("emotional_regulation",  "Regulació emocional",    "#DB2777", "social,integration"),
    ("conflict_resolution",   "Resolució de conflictes", "#E11D48", "social,integration"),
    ("cultural_outing",       "Sortida cultural",       "#EA580C", "integration"),
    ("creative_workshop",     "Taller creatiu",         "#F59E0B", "cognitive,integration"),
    ("physical_activity",     "Activitat física",       "#10B981", "social"),
    ("one_on_one_mentoring",  "Mentoria individual",    "#0EA5E9", "academic,social"),
]


async def run_migrations(engine: AsyncEngine) -> None:
    async with engine.begin() as conn:
        def _migrate(sync_conn):
            insp = inspect(sync_conn)
            tables = insp.get_table_names()

            if "schools" not in tables:
                School.__table__.create(sync_conn, checkfirst=True)

            if "organizations" in tables:
                cols = {c["name"] for c in insp.get_columns("organizations")}
                if "participant_code_pattern" not in cols:
                    sync_conn.execute(
                        text(
                            "ALTER TABLE organizations ADD COLUMN participant_code_pattern TEXT "
                            "DEFAULT '{abbr}-{year}-{seq:03}'"
                        )
                    )
                if "landing_content" not in cols:
                    sync_conn.execute(
                        text("ALTER TABLE organizations ADD COLUMN landing_content TEXT")
                    )

            if "participants" in tables:
                cols = {c["name"] for c in insp.get_columns("participants")}
                if "school_id" not in cols:
                    sync_conn.execute(
                        text("ALTER TABLE participants ADD COLUMN school_id TEXT")
                    )

            if "users" in tables:
                cols = {c["name"] for c in insp.get_columns("users")}
                if "username" not in cols:
                    sync_conn.execute(text("ALTER TABLE users ADD COLUMN username TEXT"))
                    sync_conn.execute(
                        text(
                            "UPDATE users SET username = LOWER(REPLACE(SUBSTR(email, 1, "
                            "INSTR(email, '@') - 1), '.', '_')) WHERE username IS NULL"
                        )
                    )

            if "user_participant_assignments" not in tables:
                from app.models.core import UserParticipantAssignment

                UserParticipantAssignment.__table__.create(sync_conn, checkfirst=True)

            # Backfill default school per org for participants without school_id
            org_rows = sync_conn.execute(text("SELECT id FROM organizations")).fetchall()
            for (org_id,) in org_rows:
                school_row = sync_conn.execute(
                    text(
                        "SELECT id FROM schools WHERE organization_id = :oid AND abbreviation = 'DEF' LIMIT 1"
                    ),
                    {"oid": org_id},
                ).fetchone()
                if school_row:
                    sid = school_row[0]
                else:
                    import uuid
                    from datetime import datetime

                    fallback = sync_conn.execute(
                        text(
                            "SELECT id FROM schools WHERE organization_id = :oid LIMIT 1"
                        ),
                        {"oid": org_id},
                    ).fetchone()
                    if fallback:
                        sid = fallback[0]
                    else:
                        sid = uuid.uuid4().hex
                        now = datetime.utcnow().isoformat(sep=" ", timespec="seconds")
                        sync_conn.execute(
                            text(
                                "INSERT INTO schools "
                                "(id, organization_id, name, abbreviation, active, created_at) "
                                "VALUES (:id, :oid, 'Centre per defecte', 'DEF', 1, :created)"
                            ),
                            {"id": sid, "oid": org_id, "created": now},
                        )

                sync_conn.execute(
                    text(
                        "UPDATE participants SET school_id = :sid "
                        "WHERE organization_id = :oid AND (school_id IS NULL OR school_id = '')"
                    ),
                    {"sid": sid, "oid": org_id},
                )

            # ── Bespoke session-registration model ───────────────────────────
            # 1) New tables (idempotent — checkfirst=True).
            if "session_activity_tags" not in tables:
                SessionActivityTag.__table__.create(sync_conn, checkfirst=True)
            if "session_activity_tag_links" not in tables:
                SessionActivityTagLink.__table__.create(sync_conn, checkfirst=True)
            if "session_goal_progress" not in tables:
                SessionGoalProgress.__table__.create(sync_conn, checkfirst=True)

            # Refresh table list before column inspection (SessionObservation
            # may now exist if this is a first boot).
            insp = inspect(sync_conn)
            tables = insp.get_table_names()

            # 2) New optional columns on session_observations.
            if "session_observations" in tables:
                cols = {c["name"] for c in insp.get_columns("session_observations")}
                _ADDITIONS = (
                    ("arrival_mood",         "TEXT"),
                    ("departure_mood",       "TEXT"),
                    ("verbal_participation", "INTEGER"),
                    ("time_on_task_pct",     "INTEGER"),
                    ("flag_alert",           "INTEGER DEFAULT 0"),
                    ("self_eval_emoji",      "TEXT"),
                )
                for col_name, col_type in _ADDITIONS:
                    if col_name not in cols:
                        sync_conn.execute(
                            text(f"ALTER TABLE session_observations ADD COLUMN {col_name} {col_type}")
                        )
                if "volunteer_progress_sense" not in cols:
                    sync_conn.execute(
                        text(
                            "ALTER TABLE session_observations "
                            "ADD COLUMN volunteer_progress_sense TEXT"
                        )
                    )

            if "sessions" in tables:
                sess_cols = {c["name"] for c in insp.get_columns("sessions")}
                if "session_time" not in sess_cols:
                    sync_conn.execute(
                        text("ALTER TABLE sessions ADD COLUMN session_time TEXT")
                    )

            # 3) Seed default activity tags once per organization (idempotent).
            if "session_activity_tags" in inspect(sync_conn).get_table_names():
                import uuid as _uuid_mod
                from datetime import datetime as _dt

                org_rows = sync_conn.execute(text("SELECT id FROM organizations")).fetchall()
                for (org_id,) in org_rows:
                    existing = sync_conn.execute(
                        text(
                            "SELECT COUNT(1) FROM session_activity_tags WHERE organization_id = :oid"
                        ),
                        {"oid": org_id},
                    ).scalar_one()
                    if existing and int(existing) > 0:
                        continue
                    now = _dt.utcnow().isoformat(sep=" ", timespec="seconds")
                    for slug, label, color, dims in _DEFAULT_ACTIVITY_TAGS:
                        sync_conn.execute(
                            text(
                                "INSERT INTO session_activity_tags "
                                "(id, organization_id, slug, label, color, dimensions, active, created_at) "
                                "VALUES (:id, :oid, :slug, :label, :color, :dims, 1, :created)"
                            ),
                            {
                                "id": _uuid_mod.uuid4().hex,
                                "oid": org_id,
                                "slug": slug,
                                "label": label,
                                "color": color,
                                "dims": dims,
                                "created": now,
                            },
                        )

            # Backfill program enrollments from baseline / periodic assessments (demo data fix)
            if "program_enrollments" in tables:
                import uuid
                from datetime import date

                for source_table in ("baseline_assessments", "periodic_assessments"):
                    if source_table not in tables:
                        continue
                    rows = sync_conn.execute(
                        text(
                            f"SELECT DISTINCT participant_id, program_id FROM {source_table}"
                        )
                    ).fetchall()
                    for participant_id, program_id in rows:
                        exists = sync_conn.execute(
                            text(
                                "SELECT 1 FROM program_enrollments "
                                "WHERE participant_id = :pid AND program_id = :pgid LIMIT 1"
                            ),
                            {"pid": participant_id, "pgid": program_id},
                        ).fetchone()
                        if exists:
                            continue
                        sync_conn.execute(
                            text(
                                "INSERT INTO program_enrollments "
                                "(id, program_id, participant_id, enrolled_at, active) "
                                "VALUES (:id, :pgid, :pid, :enrolled, 1)"
                            ),
                            {
                                "id": uuid.uuid4().hex,
                                "pgid": program_id,
                                "pid": participant_id,
                                "enrolled": date.today().isoformat(),
                            },
                        )

        await conn.run_sync(_migrate)
