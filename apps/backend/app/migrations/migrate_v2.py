"""Schema migration: schools, school_id on participants, org settings, user assignments."""
from __future__ import annotations

from sqlalchemy import inspect, text
from sqlalchemy.ext.asyncio import AsyncEngine

from app.models.core import Organization, Participant, School


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
