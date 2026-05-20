"""Helpers for participant IPI evolution and session-derived assessments."""

from __future__ import annotations

from datetime import date
from typing import Any, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.algorithms.ipi import DimensionScores, calculate_ipi
from app.algorithms.predictor import predict_next_ipi
from app.algorithms.risk_engine import calculate_risk_score
from app.models import BaselineAssessment, PeriodicAssessment
from app.schemas.api import SessionObservationInput


def dimension_scores_from_levels(
    academic: Optional[int],
    cognitive: Optional[int],
    social: Optional[int],
    integration: Optional[int],
) -> DimensionScores:
    return DimensionScores(
        reading_level=academic,
        math_level=academic,
        comprehension_level=academic,
        attention_level=cognitive,
        memory_level=cognitive,
        autonomy_level=cognitive,
        peer_interaction=social,
        group_work=social,
        emotional_regulation=social,
        language_fluency=integration,
        cultural_adaptation=integration,
    )


def dimension_scores_from_baseline(row: BaselineAssessment) -> DimensionScores:
    return DimensionScores(
        reading_level=row.reading_level,
        math_level=row.math_level,
        comprehension_level=row.comprehension_level,
        attention_level=row.attention_level,
        memory_level=row.memory_level,
        autonomy_level=row.autonomy_level,
        peer_interaction=row.peer_interaction,
        group_work=row.group_work,
        emotional_regulation=row.emotional_regulation,
        language_fluency=row.language_fluency,
        cultural_adaptation=row.cultural_adaptation,
    )


def dimension_scores_from_periodic(row: PeriodicAssessment) -> DimensionScores:
    return DimensionScores(
        reading_level=row.reading_level,
        math_level=row.math_level,
        comprehension_level=row.comprehension_level,
        attention_level=row.attention_level,
        memory_level=row.memory_level,
        autonomy_level=row.autonomy_level,
        peer_interaction=row.peer_interaction,
        group_work=row.group_work,
        emotional_regulation=row.emotional_regulation,
        language_fluency=row.language_fluency,
        cultural_adaptation=row.cultural_adaptation,
    )


def normalized_dimensions(scores: DimensionScores) -> dict[str, Optional[float]]:
    result = calculate_ipi(scores)
    dims = result.get("dimensions") or {}
    return {
        "academic": dims.get("academic"),
        "cognitive": dims.get("cognitive"),
        "social": dims.get("social"),
        "integration": dims.get("integration"),
    }


def compute_trend(historical_ipis: list[float]) -> str:
    if len(historical_ipis) < 2:
        return "stable"
    prev, last = historical_ipis[-2], historical_ipis[-1]
    if last > prev + 1.0:
        return "improving"
    if last < prev - 1.0:
        return "declining"
    return "stable"


def weeks_since_enrollment(enrollment_date: date, today: date) -> int:
    return max(0, (today - enrollment_date).days // 7)


async def upsert_periodic_from_observation(
    db: AsyncSession,
    *,
    obs: SessionObservationInput,
    program_id: str,
    session_date: date,
    assessed_by: str,
) -> None:
    """Create or update a periodic assessment from session observation scores."""
    scores = [obs.academic_score, obs.cognitive_score, obs.social_score, obs.integration_score]
    if not any(s is not None for s in scores):
        return

    ac, cog, soc, integ = (
        obs.academic_score,
        obs.cognitive_score,
        obs.social_score,
        obs.integration_score,
    )
    dim = dimension_scores_from_levels(ac, cog, soc, integ)
    ipi_result = calculate_ipi(dim)
    ipi_score = ipi_result["ipi"]
    if ipi_score is None:
        return

    existing_q = await db.execute(
        select(PeriodicAssessment).where(
            PeriodicAssessment.participant_id == obs.participant_id,
            PeriodicAssessment.program_id == program_id,
            PeriodicAssessment.assessment_date == session_date,
        )
    )
    existing = existing_q.scalar_one_or_none()

    bl_q = await db.execute(
        select(BaselineAssessment.ipi_baseline).where(
            BaselineAssessment.participant_id == obs.participant_id,
            BaselineAssessment.program_id == program_id,
        )
    )
    baseline_ipi = bl_q.scalar_one_or_none() or 0.0
    delta = round(ipi_score - float(baseline_ipi), 2) if baseline_ipi else None

    risk_result = calculate_risk_score(
        attendance_rate_last_30d=1.0 if (obs.attendance_status or "") == "present" else 0.5,
        attendance_rate_prev_30d=0.8,
        ipi_delta_last_period=delta,
        days_since_last_session=0,
        micro_goals_completion_rate=0.5,
        num_unjustified_absences_last_30d=0,
        avg_mood_last_5_sessions=None,
        weeks_in_program=4,
    )

    fields = dict(
        assessed_by=assessed_by,
        period_label="session_auto",
        reading_level=ac,
        math_level=ac,
        comprehension_level=ac,
        attention_level=cog,
        memory_level=cog,
        autonomy_level=cog,
        peer_interaction=soc,
        group_work=soc,
        emotional_regulation=soc,
        language_fluency=integ,
        cultural_adaptation=integ,
        ipi_score=ipi_score,
        ipi_delta_vs_baseline=delta,
        risk_score=risk_result["risk_score"],
        risk_level=risk_result["risk_level"],
    )

    if existing:
        for key, value in fields.items():
            setattr(existing, key, value)
        return

    db.add(
        PeriodicAssessment(
            participant_id=obs.participant_id,
            program_id=program_id,
            assessment_date=session_date,
            **fields,
        )
    )


def build_evolution_payload(
    *,
    participant_id: str,
    code: str,
    first_name: str,
    school_abbreviation: Optional[str],
    school_name: Optional[str],
    enrollment_date: date,
    program_id: Optional[str],
    baseline: Optional[BaselineAssessment],
    periodic: list[PeriodicAssessment],
) -> dict[str, Any]:
    historical_ipi = [float(p.ipi_score) for p in periodic]
    dates = [p.assessment_date for p in periodic]
    prediction = predict_next_ipi(historical_ipi, dates)

    history = [
        {
            "date": p.assessment_date.isoformat(),
            "period_label": p.period_label,
            "ipi_score": float(p.ipi_score),
            "delta_vs_baseline": p.ipi_delta_vs_baseline,
            "risk_level": p.risk_level,
        }
        for p in periodic
    ]

    current_ipi = float(periodic[-1].ipi_score) if periodic else None
    baseline_ipi = float(baseline.ipi_baseline) if baseline and baseline.ipi_baseline is not None else None

    dimensions_baseline = (
        normalized_dimensions(dimension_scores_from_baseline(baseline))
        if baseline
        else {"academic": None, "cognitive": None, "social": None, "integration": None}
    )
    dimensions_current = (
        normalized_dimensions(dimension_scores_from_periodic(periodic[-1]))
        if periodic
        else dimensions_baseline
    )

    today = date.today()
    return {
        "participant_id": participant_id,
        "program_id": program_id,
        "code": code,
        "first_name": first_name,
        "school_abbreviation": school_abbreviation,
        "school_name": school_name,
        "baseline_ipi": baseline_ipi,
        "current_ipi": current_ipi,
        "history": history,
        "timeline": history,
        "dimensions_baseline": dimensions_baseline,
        "dimensions_current": dimensions_current,
        "weeks_in_program": weeks_since_enrollment(enrollment_date, today),
        "trend": compute_trend(historical_ipi),
        "prediction": prediction,
    }
