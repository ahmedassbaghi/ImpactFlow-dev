"""v3 migration: academic years, grade history, teaching assignments, import logs."""
from __future__ import annotations

import uuid
from datetime import date, datetime

from sqlalchemy import inspect, text
from sqlalchemy.ext.asyncio import AsyncEngine

from app.models.core import (
    AcademicYear,
    ImportLog,
    ParticipantGradeHistory,
    TeachingAssignment,
)
from app.services.academic_year_context import suggest_academic_year


def _is_postgres(sync_conn) -> bool:
    return sync_conn.dialect.name == "postgresql"


def _add_column_if_missing(sync_conn, table: str, col: str, col_type: str) -> None:
    insp = inspect(sync_conn)
    if table not in insp.get_table_names():
        return
    cols = {c["name"] for c in insp.get_columns(table)}
    if col not in cols:
        sync_conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} {col_type}"))


def _create_index_if_missing(sync_conn, name: str, table: str, column: str) -> None:
    insp = inspect(sync_conn)
    if table not in insp.get_table_names():
        return
    existing = {idx["name"] for idx in insp.get_indexes(table)}
    if name in existing:
        return
    sync_conn.execute(text(f"CREATE INDEX IF NOT EXISTS {name} ON {table}({column})"))


async def run_migrations_v3(engine: AsyncEngine) -> None:
    async with engine.begin() as conn:

        def _migrate(sync_conn):
            insp = inspect(sync_conn)
            tables = set(insp.get_table_names())

            for model in (
                AcademicYear,
                ParticipantGradeHistory,
                TeachingAssignment,
                ImportLog,
            ):
                if model.__tablename__ not in tables:
                    model.__table__.create(sync_conn, checkfirst=True)
                    tables.add(model.__tablename__)

            for table, col in (
                ("participants", "current_grade_key"),
                ("participants", "current_grade_label"),
                ("program_enrollments", "academic_year_id"),
                ("baseline_assessments", "academic_year_id"),
                ("periodic_assessments", "academic_year_id"),
                ("sessions", "academic_year_id"),
                ("attendance_records", "academic_year_id"),
                ("reports", "academic_year_id"),
            ):
                _add_column_if_missing(sync_conn, table, col, "TEXT")

            for idx_name, tbl, col in (
                ("idx_sessions_academic_year", "sessions", "academic_year_id"),
                ("idx_periodic_assessments_academic_year", "periodic_assessments", "academic_year_id"),
                ("idx_program_enrollments_academic_year", "program_enrollments", "academic_year_id"),
                ("idx_participant_grade_history_year", "participant_grade_history", "academic_year_id"),
                ("idx_teaching_assignments_year", "teaching_assignments", "academic_year_id"),
                ("idx_teaching_assignments_user", "teaching_assignments", "user_id"),
            ):
                _create_index_if_missing(sync_conn, idx_name, tbl, col)

            org_rows = sync_conn.execute(text("SELECT id FROM organizations")).fetchall()
            suggested = suggest_academic_year()
            for (org_id,) in org_rows:
                existing = sync_conn.execute(
                    text(
                        "SELECT id FROM academic_years WHERE organization_id = :oid LIMIT 1"
                    ),
                    {"oid": org_id},
                ).fetchone()
                if existing:
                    year_id = existing[0]
                else:
                    year_id = uuid.uuid4().hex
                    now = datetime.utcnow().isoformat(sep=" ", timespec="seconds")
                    sync_conn.execute(
                        text(
                            "INSERT INTO academic_years "
                            "(id, organization_id, title, start_date, end_date, is_current, active, created_at) "
                            "VALUES (:id, :oid, :title, :start, :end, 1, 1, :created)"
                        ),
                        {
                            "id": year_id,
                            "oid": org_id,
                            "title": suggested["title"],
                            "start": suggested["start_date"].isoformat(),
                            "end": suggested["end_date"].isoformat(),
                            "created": now,
                        },
                    )

                for tbl in (
                    "sessions",
                    "baseline_assessments",
                    "periodic_assessments",
                    "program_enrollments",
                    "attendance_records",
                    "reports",
                ):
                    if tbl not in insp.get_table_names():
                        continue
                    cols = {c["name"] for c in inspect(sync_conn).get_columns(tbl)}
                    if "academic_year_id" not in cols:
                        continue
                    sync_conn.execute(
                        text(
                            f"UPDATE {tbl} SET academic_year_id = :yid "
                            f"WHERE academic_year_id IS NULL"
                        ),
                        {"yid": year_id},
                    )

        await conn.run_sync(_migrate)
