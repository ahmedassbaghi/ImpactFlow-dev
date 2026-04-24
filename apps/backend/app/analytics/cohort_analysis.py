"""
Módulo D — Anàlisi de Cohortes Avançat.

Respon preguntes com:
  - Els infants de 2024-25 progressen més ràpid que els de 2023-24?
  - Quina dimensió millora més ràpidament i en quina fase?
  - Quin percentatge de la cohorte segueix actiu als 3, 6, 9 mesos?
"""
from __future__ import annotations

from datetime import date, timedelta
from typing import Optional

from sqlalchemy import func, select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    BaselineAssessment,
    Participant,
    PeriodicAssessment,
)


# ---------------------------------------------------------------------------
# Helpers for resolving program participants via BaselineAssessment
# ---------------------------------------------------------------------------

async def _get_program_enrollments(program_id: str, db: AsyncSession) -> dict[str, date]:
    """Returns {participant_id: enrollment_date} for a program."""
    q = await db.execute(
        select(Participant.id, Participant.enrollment_date)
        .join(BaselineAssessment, BaselineAssessment.participant_id == Participant.id)
        .where(BaselineAssessment.program_id == program_id)
    )
    return {pid: (ed if isinstance(ed, date) else date.fromisoformat(str(ed)))
            for pid, ed in q.all()}


# ---------------------------------------------------------------------------
# Trajectòries de cohortes (IPI mig per mes d'alta)
# ---------------------------------------------------------------------------

async def compute_cohort_trajectories(
    program_id: str,
    db: AsyncSession,
    months: int = 12,
) -> dict:
    """
    Per a cada cohorte (agrupats per trimestre d'enrollament),
    calcula la corba IPI mig en els mesos 0, 3, 6, 9, 12.
    """
    enrollments = await _get_program_enrollments(program_id, db)

    if not enrollments:
        return {"cohorts": [], "checkpoints": [0, 3, 6, 9, 12]}

    # Baselines
    baseline_q = await db.execute(
        select(BaselineAssessment.participant_id, BaselineAssessment.ipi_baseline)
        .where(BaselineAssessment.program_id == program_id)
    )
    baselines = {pid: float(ipi) for pid, ipi in baseline_q.all() if ipi is not None}

    # Periodic assessments
    assess_q = await db.execute(
        select(
            PeriodicAssessment.participant_id,
            PeriodicAssessment.assessment_date,
            PeriodicAssessment.ipi_score,
        )
        .where(PeriodicAssessment.program_id == program_id)
        .order_by(PeriodicAssessment.participant_id, PeriodicAssessment.assessment_date)
    )
    assessments: dict[str, list[tuple[date, float]]] = {}
    for pid, adate, ipi in assess_q.all():
        if isinstance(adate, str):
            adate = date.fromisoformat(adate)
        assessments.setdefault(pid, []).append((adate, float(ipi)))

    # Group by cohort quarter
    cohort_members: dict[str, list[str]] = {}
    for pid, enrolled_at in enrollments.items():
        q = (enrolled_at.month - 1) // 3 + 1
        label = f"{enrolled_at.year}-Q{q}"
        cohort_members.setdefault(label, []).append(pid)

    checkpoints = [0, 3, 6, 9, 12]
    result_cohorts = []

    for cohort_label in sorted(cohort_members):
        members = cohort_members[cohort_label]
        trajectory = []
        for month in checkpoints:
            ipis_at_month = []
            for pid in members:
                enrolled_at = enrollments[pid]
                target_date = enrolled_at + timedelta(days=month * 30)

                if month == 0:
                    if pid in baselines:
                        ipis_at_month.append(baselines[pid])
                else:
                    best: Optional[float] = None
                    best_dist = timedelta(days=46)
                    for adate, ipi in assessments.get(pid, []):
                        dist = abs(adate - target_date)
                        if dist < best_dist:
                            best_dist = dist
                            best = ipi
                    if best is not None:
                        ipis_at_month.append(best)

            if ipis_at_month:
                trajectory.append({
                    "month": month,
                    "avg_ipi": round(sum(ipis_at_month) / len(ipis_at_month), 1),
                    "n": len(ipis_at_month),
                })

        if trajectory:
            result_cohorts.append({
                "label": cohort_label,
                "n": len(members),
                "trajectory": trajectory,
            })

    return {"cohorts": result_cohorts, "checkpoints": checkpoints}


# ---------------------------------------------------------------------------
# Retención per cohorte (estil Kaplan-Meier simplificat)
# ---------------------------------------------------------------------------

async def compute_retention_by_cohort(
    program_id: str,
    db: AsyncSession,
) -> dict:
    """
    Percentatge de participants actius als 1, 3, 6, 9, 12 mesos per cohorte.
    Uses participant.active as the retention indicator.
    """
    q = await db.execute(
        select(Participant.id, Participant.enrollment_date, Participant.active)
        .join(BaselineAssessment, BaselineAssessment.participant_id == Participant.id)
        .where(BaselineAssessment.program_id == program_id)
    )
    rows = q.all()

    cohort_data: dict[str, list[dict]] = {}
    for pid, enrolled_at, active in rows:
        if isinstance(enrolled_at, str):
            enrolled_at = date.fromisoformat(enrolled_at)
        label = f"{enrolled_at.year}-Q{(enrolled_at.month - 1) // 3 + 1}"
        cohort_data.setdefault(label, []).append({
            "pid": pid,
            "enrolled_at": enrolled_at,
            "active": active,
        })

    checkpoints = [1, 3, 6, 9, 12]
    result_cohorts = []

    for label in sorted(cohort_data):
        members = cohort_data[label]
        n = len(members)
        retention = []
        for month in checkpoints:
            threshold = members[0]["enrolled_at"] + timedelta(days=month * 30)
            if threshold > date.today():
                continue
            active_count = sum(1 for m in members if m["active"])
            retention.append({
                "month": month,
                "active": active_count,
                "pct": round(active_count / n * 100, 1) if n else 0.0,
            })

        result_cohorts.append({
            "label": label,
            "n_enrolled": n,
            "retention": retention,
        })

    return {"cohorts": result_cohorts}


# ---------------------------------------------------------------------------
# Velocitat de millora per dimensió i fase del programa
# ---------------------------------------------------------------------------

async def dimension_velocity_analysis(
    program_id: str,
    db: AsyncSession,
) -> dict:
    """
    Calcula la velocitat de millora (punts IPI/setmana) per dimensió
    i per fase del programa (0-3m, 3-6m, 6-12m).
    """
    enrollments = await _get_program_enrollments(program_id, db)

    if not enrollments:
        return {"phases": [], "fastest_dimension": None, "slowest_dimension": None}

    assess_q = await db.execute(
        select(
            PeriodicAssessment.participant_id,
            PeriodicAssessment.assessment_date,
            PeriodicAssessment.ipi_score,
            PeriodicAssessment.reading_level,
            PeriodicAssessment.math_level,
            PeriodicAssessment.comprehension_level,
            PeriodicAssessment.attention_level,
            PeriodicAssessment.memory_level,
            PeriodicAssessment.autonomy_level,
            PeriodicAssessment.peer_interaction,
            PeriodicAssessment.group_work,
            PeriodicAssessment.emotional_regulation,
            PeriodicAssessment.language_fluency,
            PeriodicAssessment.cultural_adaptation,
        )
        .where(PeriodicAssessment.program_id == program_id)
        .order_by(PeriodicAssessment.participant_id, PeriodicAssessment.assessment_date)
    )

    by_participant: dict[str, list[dict]] = {}
    for row in assess_q.all():
        pid = row[0]
        adate = row[1]
        if isinstance(adate, str):
            adate = date.fromisoformat(adate)
        ipi = float(row[2]) if row[2] is not None else None
        acad = _avg_non_null([row[3], row[4], row[5]])
        cogn = _avg_non_null([row[6], row[7], row[8]])
        soc  = _avg_non_null([row[9], row[10], row[11]])
        intg = _avg_non_null([row[12], row[13]])
        by_participant.setdefault(pid, []).append({
            "date": adate,
            "ipi": ipi,
            "academic": _norm(acad),
            "cognitive": _norm(cogn),
            "social": _norm(soc),
            "integration": _norm(intg),
        })

    phases_def = [
        ("Fase 1 (0-3m)",  0,   90,  12),
        ("Fase 2 (3-6m)",  90,  180, 13),
        ("Fase 3 (6-12m)", 180, 365, 26),
    ]
    dims = ["academic", "cognitive", "social", "integration", "ipi"]
    phase_results = []

    for phase_label, day_start, day_end, weeks in phases_def:
        velocities: dict[str, list[float]] = {d: [] for d in dims}

        for pid, assessments_list in by_participant.items():
            enrolled_at = enrollments.get(pid)
            if enrolled_at is None:
                continue

            before     = [a for a in assessments_list if (a["date"] - enrolled_at).days < day_start]
            in_phase   = [a for a in assessments_list if day_start <= (a["date"] - enrolled_at).days < day_end]

            if not in_phase and not (before):
                continue

            phase_assessments = (before[-1:] if before else []) + in_phase
            if len(phase_assessments) < 2:
                continue

            first = phase_assessments[0]
            last  = phase_assessments[-1]
            week_diff = max((last["date"] - first["date"]).days / 7, 1)

            for d in dims:
                fv = first.get(d)
                lv = last.get(d)
                if fv is not None and lv is not None:
                    velocities[d].append((lv - fv) / week_diff)

        avg_velocities = {
            d: round(sum(v) / len(v), 3) if v else None
            for d, v in velocities.items()
        }
        phase_results.append({"label": phase_label, "weeks": weeks, "velocities": avg_velocities})

    dim_totals: dict[str, list[float]] = {d: [] for d in ["academic", "cognitive", "social", "integration"]}
    for phase in phase_results:
        for d in dim_totals:
            v = phase["velocities"].get(d)
            if v is not None:
                dim_totals[d].append(v)

    dim_means = {d: sum(v) / len(v) for d, v in dim_totals.items() if v}
    fastest = max(dim_means, key=lambda d: dim_means[d]) if dim_means else None
    slowest = min(dim_means, key=lambda d: dim_means[d]) if dim_means else None

    return {
        "phases": phase_results,
        "fastest_dimension": fastest,
        "slowest_dimension": slowest,
        "dimension_means": {d: round(v, 3) for d, v in dim_means.items()},
    }


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _avg_non_null(values: list) -> Optional[float]:
    valid = [float(v) for v in values if v is not None]
    return sum(valid) / len(valid) if valid else None


def _norm(value: Optional[float]) -> Optional[float]:
    if value is None:
        return None
    return round((value - 1) / 4 * 100, 1)
