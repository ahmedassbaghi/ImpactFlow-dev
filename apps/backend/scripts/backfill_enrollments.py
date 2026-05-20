"""Backfill program_enrollments from baseline/periodic assessments."""
import sqlite3
import uuid
from datetime import date
from pathlib import Path

DB = Path(__file__).resolve().parents[1] / "impactflow.db"


def main() -> None:
    conn = sqlite3.connect(DB)
    c = conn.cursor()
    before = c.execute("SELECT COUNT(*) FROM program_enrollments").fetchone()[0]
    inserted = 0
    for table in ("baseline_assessments", "periodic_assessments"):
        try:
            rows = c.execute(
                f"SELECT DISTINCT participant_id, program_id FROM {table}"
            ).fetchall()
        except sqlite3.OperationalError:
            continue
        for pid, pgid in rows:
            exists = c.execute(
                "SELECT 1 FROM program_enrollments WHERE participant_id=? AND program_id=?",
                (pid, pgid),
            ).fetchone()
            if exists:
                continue
            c.execute(
                "INSERT INTO program_enrollments (id, program_id, participant_id, enrolled_at, active) "
                "VALUES (?, ?, ?, ?, 1)",
                (uuid.uuid4().hex, pgid, pid, date.today().isoformat()),
            )
            inserted += 1
    conn.commit()
    after = c.execute("SELECT COUNT(*) FROM program_enrollments").fetchone()[0]
    print(f"Inserted {inserted} enrollments (total: {before} -> {after})")
    conn.close()


if __name__ == "__main__":
    main()
