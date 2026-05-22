"""Helpers for participant IPI evolution and session-derived assessments."""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any, Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.algorithms.learning_curve import apply_learning_curve_ipi, learning_curve_target
from app.algorithms.ipi import DimensionScores, calculate_ipi
from app.algorithms.predictor import predict_next_ipi
from app.algorithms.risk_engine import calculate_risk_score
from app.algorithms.ipi import DEFAULT_WEIGHTS
from app.models import (
    AttendanceRecord,
    BaselineAssessment,
    MicroGoal,
    PeriodicAssessment,
    Session,
    SessionObservation,
)
from app.schemas.api import SessionObservationInput

# Mapeo mood_indicator (string) → escala 1-5 para el motor de riesgo
_MOOD_TO_FLOAT: dict[str, float] = {
    "very_low":  1.0,
    "low":       2.0,
    "neutral":   3.0,
    "good":      4.0,
    "excellent": 5.0,
}

# Statuses que se consideran asistencia efectiva
_PRESENT_STATUSES = {"present", "late"}

# Dimensiones IPI canónicas que aceptan señal desde goal_progress / verbal_participation / time_on_task.
_IPI_DIMENSIONS = ("academic", "cognitive", "social", "integration")

# Límites para IPI derivado de sesión (microobjectius / proxies), no avaluacions trimestrals.
MIN_DIMENSIONS_FOR_SESSION_IPI = 2
MAX_SESSION_AUTO_IPI_DELTA = 6.0
MAX_SESSION_AUTO_IPI_VS_BASELINE = 38.0
VOLUNTEER_PROGRESS_MULTIPLIER: dict[str, float] = {
    "progressed": 1.2,
    "similar": 1.0,
    "step_back": 0.8,
}


def _clamp_level(value: Optional[float]) -> Optional[int]:
    if value is None:
        return None
    return max(1, min(5, int(round(value))))


def _gas_to_score(mean_progress: float) -> int:
    """Convert mean GAS progress (-2..+2) into a 1-5 dimension score (rounded, clamped)."""
    raw = 3.0 + mean_progress
    return max(1, min(5, int(round(raw))))


def _verbal_to_score(verbal: Optional[int]) -> Optional[int]:
    """Verbal participation 0..3 → 1-5 social score (used only as fallback)."""
    if verbal is None:
        return None
    # 0 → 1, 1 → 2, 2 → 4, 3 → 5  (skipping 3 to keep contrast)
    table = {0: 1, 1: 2, 2: 4, 3: 5}
    return table.get(int(verbal))


def _time_on_task_to_score(pct: Optional[int]) -> Optional[int]:
    """time_on_task 0..100 → 1-5 cognitive score (used only as fallback)."""
    if pct is None:
        return None
    if pct < 20:  return 1
    if pct < 40:  return 2
    if pct < 60:  return 3
    if pct < 80:  return 4
    return 5


def _effective_mood(obs: Any) -> Optional[str]:
    """Pick the best mood signal available: departure > arrival > legacy single mood."""
    return (
        getattr(obs, "departure_mood", None)
        or getattr(obs, "arrival_mood", None)
        or getattr(obs, "mood_indicator", None)
    )


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


def _periodic_row_rank(pa: PeriodicAssessment) -> tuple[int, int, int, str]:
    """Ranking per triar la fila canònica quan n'hi ha diverses el mateix dia.

    Prioritat: avaluació trimestral/seguiment > simulació amb indicadors variats >
    session_auto amb punts plans (souvent incomplets).
    """
    label = (pa.period_label or "").strip().lower()
    if "avaluacio" in label or label == "seguiment" or label.startswith("m"):
        source_priority = 3
    elif label == "session_auto":
        source_priority = 0
    elif label == "simulation":
        source_priority = 2
    elif label and label[0].isdigit():
        source_priority = 2
    else:
        source_priority = 1

    varied = 0
    if pa.reading_level is not None and pa.math_level is not None and pa.reading_level != pa.math_level:
        varied += 1
    if pa.attention_level is not None and pa.memory_level is not None and pa.attention_level != pa.memory_level:
        varied += 1
    if pa.peer_interaction is not None and pa.group_work is not None and pa.peer_interaction != pa.group_work:
        varied += 1

    indicator_fields = (
        pa.reading_level,
        pa.math_level,
        pa.comprehension_level,
        pa.attention_level,
        pa.memory_level,
        pa.autonomy_level,
        pa.peer_interaction,
        pa.group_work,
        pa.emotional_regulation,
        pa.language_fluency,
        pa.cultural_adaptation,
    )
    completeness = sum(1 for f in indicator_fields if f is not None)

    return (source_priority, varied, completeness, pa.id or "")


def pick_best_periodic(candidates: list[PeriodicAssessment]) -> PeriodicAssessment | None:
    if not candidates:
        return None
    return max(candidates, key=_periodic_row_rank)


def resolve_periodic_timeline(periodic: list[PeriodicAssessment]) -> list[PeriodicAssessment]:
    """Una avaluació canònica per data, ordenada cronològicament."""
    by_date: dict[date, list[PeriodicAssessment]] = {}
    for row in periodic:
        by_date.setdefault(row.assessment_date, []).append(row)
    resolved: list[PeriodicAssessment] = []
    for assessment_date in sorted(by_date):
        best = pick_best_periodic(by_date[assessment_date])
        if best is not None:
            resolved.append(best)
    return resolved


def latest_periodic_by_participant(
    periodic: list[PeriodicAssessment],
) -> dict[str, PeriodicAssessment]:
    """Últim IPI canònic per participant (després de deduplicar per data)."""
    by_pid: dict[str, list[PeriodicAssessment]] = {}
    for row in periodic:
        by_pid.setdefault(row.participant_id, []).append(row)
    return {
        pid: resolve_periodic_timeline(rows)[-1]
        for pid, rows in by_pid.items()
        if resolve_periodic_timeline(rows)
    }


def _normalize_volunteer_sense(sense: Optional[str]) -> Optional[str]:
    if not sense:
        return None
    key = sense.strip().lower()
    return key if key in VOLUNTEER_PROGRESS_MULTIPLIER else None


def _apply_volunteer_sense_bonus(
    ipi_score: float,
    sense: Optional[str],
    *,
    prev_ipi: float | None,
    baseline_ipi: float | None,
) -> float:
    """Ajust suau (×0.8–1.2) per la percepció del voluntari; després es mantenen els límits de sessió."""
    normalized = _normalize_volunteer_sense(sense)
    if not normalized:
        return ipi_score
    bumped = ipi_score * VOLUNTEER_PROGRESS_MULTIPLIER[normalized]
    if prev_ipi is not None:
        bumped = max(
            prev_ipi - MAX_SESSION_AUTO_IPI_DELTA,
            min(prev_ipi + MAX_SESSION_AUTO_IPI_DELTA, bumped),
        )
    if baseline_ipi is not None:
        bumped = max(
            baseline_ipi - 15.0,
            min(baseline_ipi + MAX_SESSION_AUTO_IPI_VS_BASELINE, bumped),
        )
    return round(max(0.0, min(100.0, bumped)), 1)


def _cap_session_auto_ipi(
    ipi_score: float,
    *,
    baseline_ipi: float | None,
    previous_ipi: float | None,
) -> float:
    """Evita salts bruscs quan només hi ha senyal parcial (p. ex. 1–2 microobjectius)."""
    capped = ipi_score
    if previous_ipi is not None:
        capped = max(
            previous_ipi - MAX_SESSION_AUTO_IPI_DELTA,
            min(previous_ipi + MAX_SESSION_AUTO_IPI_DELTA, capped),
        )
    if baseline_ipi is not None:
        capped = max(
            baseline_ipi - 15.0,
            min(baseline_ipi + MAX_SESSION_AUTO_IPI_VS_BASELINE, capped),
        )
    return round(max(0.0, min(100.0, capped)), 1)


def _avg_fields(*values: Optional[int]) -> Optional[float]:
    vals = [float(x) for x in values if x is not None]
    return sum(vals) / len(vals) if vals else None


def dimension_levels_from_periodic(pa: PeriodicAssessment) -> dict[str, Optional[float]]:
    """Mitjana 1–5 per dimensió des d'una avaluació periòdica."""
    return {
        "academic": _avg_fields(pa.reading_level, pa.math_level, pa.comprehension_level),
        "cognitive": _avg_fields(pa.attention_level, pa.memory_level, pa.autonomy_level),
        "social": _avg_fields(pa.peer_interaction, pa.group_work, pa.emotional_regulation),
        "integration": _avg_fields(pa.language_fluency, pa.cultural_adaptation),
    }


def normalized_dimensions_from_levels(levels: dict[str, Optional[float]]) -> dict[str, Optional[float]]:
    out: dict[str, Optional[float]] = {}
    for dim, score in levels.items():
        if score is None:
            out[dim] = None
        else:
            out[dim] = round(((score - 1.0) / 4.0) * 100.0, 1)
    return out


def _session_index_for_learning_curve(
    prev_rows: list[PeriodicAssessment],
    session_date: date,
) -> int:
    """Nombre de punts de trajectòria abans d'aquesta sessió (+1)."""
    timeline = resolve_periodic_timeline(
        [r for r in prev_rows if r.assessment_date < session_date]
    )
    return len(timeline) + 1


def apply_progressive_session_ipi(
    raw_ipi: float,
    merged: dict[str, Optional[int]],
    *,
    prev_pa: PeriodicAssessment | None,
    baseline_ipi: float | None,
    has_full_explicit: bool,
    session_index: int = 1,
) -> tuple[float, dict[str, Any]]:
    """Combina IPI observat, pas guiat per dimensions i corva d'aprenentatge."""
    prev_ipi = float(prev_pa.ipi_score) if prev_pa and prev_pa.ipi_score is not None else None

    if prev_ipi is None:
        final = apply_learning_curve_ipi(
            prev_ipi=None,
            observed_ipi=raw_ipi,
            baseline_ipi=baseline_ipi,
            session_index=session_index,
        )
        return final, {"has_previous": False, "session_index": session_index}

    prev_ipi = float(prev_pa.ipi_score)
    prev_levels = dimension_levels_from_periodic(prev_pa)
    dim_delta_display: dict[str, Optional[float]] = {}
    weighted_shift = 0.0
    weight_sum = 0.0

    for dim in _IPI_DIMENSIONS:
        old = prev_levels.get(dim)
        new = float(merged[dim]) if merged.get(dim) is not None else None
        if old is None or new is None:
            continue
        delta = new - old
        dim_delta_display[dim] = round(delta, 2)
        w = DEFAULT_WEIGHTS[dim]
        weighted_shift += delta * w
        weight_sum += w

    if weight_sum > 0:
        weighted_shift /= weight_sum

    # ~4 punts IPI per pas de 0.5 en escala 1–5 (abans de la corva)
    suggested_delta = max(
        -MAX_SESSION_AUTO_IPI_DELTA,
        min(MAX_SESSION_AUTO_IPI_DELTA, weighted_shift * 8.0),
    )
    guided_ipi = prev_ipi + suggested_delta

    if has_full_explicit:
        blended = 0.55 * raw_ipi + 0.45 * guided_ipi
    else:
        blended = 0.40 * raw_ipi + 0.60 * guided_ipi

    blended = max(
        prev_ipi - MAX_SESSION_AUTO_IPI_DELTA,
        min(prev_ipi + MAX_SESSION_AUTO_IPI_DELTA, blended),
    )

    final = apply_learning_curve_ipi(
        prev_ipi=prev_ipi,
        observed_ipi=blended,
        baseline_ipi=baseline_ipi,
        session_index=session_index,
    )

    return final, {
        "has_previous": True,
        "previous_ipi": round(prev_ipi, 1),
        "previous_date": prev_pa.assessment_date.isoformat(),
        "expected_ipi_delta": round(final - prev_ipi, 1),
        "dimension_deltas_1_5": dim_delta_display,
        "session_index": session_index,
        "learning_curve_target": (
            round(learning_curve_target(baseline_ipi or prev_ipi, session_index), 1)
            if baseline_ipi is not None
            else None
        ),
    }


async def get_participant_session_context(
    db: AsyncSession,
    *,
    participant_id: str,
    program_id: str,
    reference_date: date | None = None,
) -> dict[str, Any]:
    """Context per al registre de sessió: IPI i dimensions de la darrera avaluació vàlida."""
    ref = reference_date or date.today()

    bl_q = await db.execute(
        select(BaselineAssessment.ipi_baseline).where(
            BaselineAssessment.participant_id == participant_id,
            BaselineAssessment.program_id == program_id,
        )
    )
    baseline_row = bl_q.scalar_one_or_none()
    baseline_ipi = float(baseline_row) if baseline_row is not None else None

    pa_q = await db.execute(
        select(PeriodicAssessment)
        .where(
            PeriodicAssessment.participant_id == participant_id,
            PeriodicAssessment.program_id == program_id,
            PeriodicAssessment.assessment_date <= ref,
        )
        .order_by(PeriodicAssessment.assessment_date.desc())
    )
    all_rows = list(pa_q.scalars().all())
    timeline = resolve_periodic_timeline(all_rows)
    prev_pa = timeline[-1] if timeline else None

    last_sess_q = await db.execute(
        select(Session.session_date)
        .join(SessionObservation, SessionObservation.session_id == Session.id)
        .where(
            SessionObservation.participant_id == participant_id,
            Session.program_id == program_id,
            Session.session_date < ref,
        )
        .order_by(Session.session_date.desc())
        .limit(1)
    )
    last_session_date = last_sess_q.scalar_one_or_none()

    if not prev_pa:
        return {
            "has_previous": False,
            "baseline_ipi": baseline_ipi,
            "last_session_date": last_session_date.isoformat() if last_session_date else None,
            "max_session_ipi_step": MAX_SESSION_AUTO_IPI_DELTA,
        }

    prev_levels = dimension_levels_from_periodic(prev_pa)
    return {
        "has_previous": True,
        "baseline_ipi": baseline_ipi,
        "previous_ipi": round(float(prev_pa.ipi_score), 1),
        "previous_date": prev_pa.assessment_date.isoformat(),
        "last_session_date": (
            last_session_date.isoformat() if last_session_date else prev_pa.assessment_date.isoformat()
        ),
        "previous_dimensions": normalized_dimensions_from_levels(prev_levels),
        "previous_dimensions_1_5": {k: round(v, 2) if v is not None else None for k, v in prev_levels.items()},
        "max_session_ipi_step": MAX_SESSION_AUTO_IPI_DELTA,
    }


async def _attendance_metrics(
    db: AsyncSession,
    *,
    participant_id: str,
    program_id: str,
    reference_date: date,
) -> dict:
    """Calcula métricas de asistencia reales desde AttendanceRecord.

    Devuelve:
      - attendance_rate_last_30d: tasa de asistencia efectiva en los últimos 30 días
      - attendance_rate_prev_30d: ídem en los 30 días anteriores (días -60 a -31)
      - num_unjustified_absences_last_30d: ausencias injustificadas en los últimos 30 días
      - days_since_last_session: días desde la última asistencia efectiva
      - weeks_in_program: semanas desde el primer registro de asistencia del participante
    """
    cutoff_last  = reference_date - timedelta(days=30)
    cutoff_prev  = reference_date - timedelta(days=60)

    # --- Últimos 30 días ---
    last_30_q = await db.execute(
        select(AttendanceRecord.status).where(
            AttendanceRecord.participant_id == participant_id,
            AttendanceRecord.program_id == program_id,
            AttendanceRecord.date >= cutoff_last,
            AttendanceRecord.date <= reference_date,
        )
    )
    last_30_statuses = [r.status for r in last_30_q.all()]

    if last_30_statuses:
        present_last = sum(1 for s in last_30_statuses if s in _PRESENT_STATUSES)
        attendance_rate_last_30d = present_last / len(last_30_statuses)
        num_unjustified = sum(1 for s in last_30_statuses if s == "absent_unjustified")
    else:
        attendance_rate_last_30d = 1.0  # sin historial → asumir presente
        num_unjustified = 0

    # --- 30 días previos (días -60 a -31) ---
    prev_30_q = await db.execute(
        select(AttendanceRecord.status).where(
            AttendanceRecord.participant_id == participant_id,
            AttendanceRecord.program_id == program_id,
            AttendanceRecord.date >= cutoff_prev,
            AttendanceRecord.date < cutoff_last,
        )
    )
    prev_30_statuses = [r.status for r in prev_30_q.all()]

    if prev_30_statuses:
        present_prev = sum(1 for s in prev_30_statuses if s in _PRESENT_STATUSES)
        attendance_rate_prev_30d = present_prev / len(prev_30_statuses)
    else:
        attendance_rate_prev_30d = attendance_rate_last_30d  # sin historial previo → igualar

    # --- Días desde última asistencia efectiva ---
    last_present_q = await db.execute(
        select(func.max(AttendanceRecord.date)).where(
            AttendanceRecord.participant_id == participant_id,
            AttendanceRecord.program_id == program_id,
            AttendanceRecord.status.in_(list(_PRESENT_STATUSES)),
            AttendanceRecord.date < reference_date,
        )
    )
    last_present_date = last_present_q.scalar_one_or_none()
    days_since_last = (reference_date - last_present_date).days if last_present_date else 0

    # --- Semanas en programa (desde primer registro de asistencia) ---
    first_date_q = await db.execute(
        select(func.min(AttendanceRecord.date)).where(
            AttendanceRecord.participant_id == participant_id,
            AttendanceRecord.program_id == program_id,
        )
    )
    first_date = first_date_q.scalar_one_or_none()
    weeks_in_program = max(1, (reference_date - first_date).days // 7) if first_date else 4

    return {
        "attendance_rate_last_30d": round(attendance_rate_last_30d, 3),
        "attendance_rate_prev_30d": round(attendance_rate_prev_30d, 3),
        "num_unjustified_absences_last_30d": num_unjustified,
        "days_since_last_session": days_since_last,
        "weeks_in_program": weeks_in_program,
    }


async def _goal_progress_by_dimension(
    db: AsyncSession,
    obs: SessionObservationInput,
    program_id: str,
) -> dict[str, float]:
    """For each IPI dimension, return mean GAS progress across that obs's goals.
    Returns only dimensions with at least one observed goal."""
    if not getattr(obs, "goal_progress", None):
        return {}
    goal_ids = [gp.micro_goal_id for gp in obs.goal_progress]
    if not goal_ids:
        return {}

    q = await db.execute(
        select(MicroGoal.id, MicroGoal.dimension).where(
            MicroGoal.id.in_(goal_ids),
            MicroGoal.participant_id == obs.participant_id,
            MicroGoal.program_id == program_id,
        )
    )
    dim_by_goal = {row[0]: row[1] for row in q.all()}

    by_dim: dict[str, list[int]] = {d: [] for d in _IPI_DIMENSIONS}
    for gp in obs.goal_progress:
        dim = dim_by_goal.get(gp.micro_goal_id)
        if dim in by_dim:
            by_dim[dim].append(int(gp.progress))
    return {dim: sum(vals) / len(vals) for dim, vals in by_dim.items() if vals}


async def upsert_periodic_from_observation(
    db: AsyncSession,
    *,
    obs: SessionObservationInput,
    program_id: str,
    session_date: date,
    assessed_by: str,
) -> None:
    """Create or update a periodic assessment from session observation signals.

    Hybrid IPI derivation:
      • Explicit 1-5 dimension scores (legacy) take precedence when present.
      • Otherwise, the function falls back to GAS-style goal_progress aggregated
        by dimension (-2..+2 → 1-5), then to verbal_participation (social) and
        time_on_task_pct (cognitive) as last-resort proxies.
    Risk engine inputs:
      • Real attendance metrics from AttendanceRecord (last 30 days vs prev 30).
      • Best-available mood: departure > arrival > legacy mood_indicator.
      • flag_alert raises the score by a small amount (10 % of the (1-risk) gap).
    Skip rules:
      • Absent observations never produce a periodic row.
      • Observations without ANY usable signal also skip.
    """
    # 1. No evaluar IPI si el participante no asistió
    if (obs.attendance_status or "present") in ("absent_justified", "absent_unjustified"):
        return

    explicit_scores = {
        "academic":    obs.academic_score,
        "cognitive":   obs.cognitive_score,
        "social":      obs.social_score,
        "integration": obs.integration_score,
    }

    # 2. Mezcla con señales bespoke (goal progress + proxies). Cualquier dimensión
    #    sin score explícito se intenta inferir.
    inferred: dict[str, int] = {}
    if not all(v is not None for v in explicit_scores.values()):
        goal_means = await _goal_progress_by_dimension(db, obs, program_id)
        for dim, mean in goal_means.items():
            inferred[dim] = _gas_to_score(mean)

        verbal_score = _verbal_to_score(obs.verbal_participation)
        if verbal_score is not None and "social" not in inferred:
            inferred["social"] = verbal_score

        time_score = _time_on_task_to_score(obs.time_on_task_pct)
        if time_score is not None and "cognitive" not in inferred:
            inferred["cognitive"] = time_score

    merged: dict[str, Optional[int]] = {
        dim: (explicit_scores[dim] if explicit_scores[dim] is not None else inferred.get(dim))
        for dim in _IPI_DIMENSIONS
    }

    volunteer_sense = _normalize_volunteer_sense(getattr(obs, "volunteer_progress_sense", None))
    has_dim_signal = any(v is not None for v in merged.values())

    if not has_dim_signal and not volunteer_sense:
        return

    existing_q = await db.execute(
        select(PeriodicAssessment).where(
            PeriodicAssessment.participant_id == obs.participant_id,
            PeriodicAssessment.program_id == program_id,
            PeriodicAssessment.assessment_date == session_date,
        )
    )
    same_day = list(existing_q.scalars().all())
    existing = pick_best_periodic(same_day)

    bl_q = await db.execute(
        select(BaselineAssessment.ipi_baseline).where(
            BaselineAssessment.participant_id == obs.participant_id,
            BaselineAssessment.program_id == program_id,
        )
    )
    baseline_row = bl_q.scalar_one_or_none()
    baseline_ipi = float(baseline_row) if baseline_row is not None else None

    prev_q = await db.execute(
        select(PeriodicAssessment)
        .where(
            PeriodicAssessment.participant_id == obs.participant_id,
            PeriodicAssessment.program_id == program_id,
            PeriodicAssessment.assessment_date < session_date,
        )
        .order_by(PeriodicAssessment.assessment_date.desc())
    )
    prev_rows = list(prev_q.scalars().all())
    prev_pa = resolve_periodic_timeline(prev_rows)[-1] if prev_rows else None
    prev_ipi = float(prev_pa.ipi_score) if prev_pa and prev_pa.ipi_score is not None else None
    session_index = _session_index_for_learning_curve(prev_rows, session_date)

    n_dims_with_signal = sum(1 for v in merged.values() if v is not None)

    if not has_dim_signal and volunteer_sense and prev_ipi is not None:
        ipi_score = _apply_volunteer_sense_bonus(
            prev_ipi,
            volunteer_sense,
            prev_ipi=prev_ipi,
            baseline_ipi=baseline_ipi,
        )
        ipi_score = apply_learning_curve_ipi(
            prev_ipi=prev_ipi,
            observed_ipi=ipi_score,
            baseline_ipi=baseline_ipi,
            session_index=session_index,
        )
        prev_levels = dimension_levels_from_periodic(prev_pa)
        ac = _clamp_level(prev_levels.get("academic"))
        cog = _clamp_level(prev_levels.get("cognitive"))
        soc = _clamp_level(prev_levels.get("social"))
        integ = _clamp_level(prev_levels.get("integration"))
    else:
        if n_dims_with_signal < MIN_DIMENSIONS_FOR_SESSION_IPI:
            return

        ac, cog, soc, integ = (
            merged["academic"],
            merged["cognitive"],
            merged["social"],
            merged["integration"],
        )
        dim = dimension_scores_from_levels(ac, cog, soc, integ)
        ipi_result = calculate_ipi(dim)
        ipi_score = ipi_result["ipi"]
        if ipi_score is None:
            return

        has_full_explicit = all(explicit_scores[d] is not None for d in _IPI_DIMENSIONS)
        ipi_score, _evolution_meta = apply_progressive_session_ipi(
            float(ipi_score),
            merged,
            prev_pa=prev_pa,
            baseline_ipi=baseline_ipi,
            has_full_explicit=has_full_explicit,
            session_index=session_index,
        )
        ipi_score = _apply_volunteer_sense_bonus(
            ipi_score,
            volunteer_sense,
            prev_ipi=prev_ipi,
            baseline_ipi=baseline_ipi,
        )

    delta = (
        round(ipi_score - baseline_ipi, 2)
        if baseline_ipi is not None
        else None
    )

    # 3. Métricas de asistencia reales
    att = await _attendance_metrics(
        db,
        participant_id=obs.participant_id,
        program_id=program_id,
        reference_date=session_date,
    )

    # 4. Mejor señal de mood disponible (departure > arrival > legacy)
    mood_score: Optional[float] = _MOOD_TO_FLOAT.get(_effective_mood(obs) or "", None)

    risk_result = calculate_risk_score(
        attendance_rate_last_30d=att["attendance_rate_last_30d"],
        attendance_rate_prev_30d=att["attendance_rate_prev_30d"],
        ipi_delta_last_period=delta,
        days_since_last_session=att["days_since_last_session"],
        micro_goals_completion_rate=0.5,
        num_unjustified_absences_last_30d=att["num_unjustified_absences_last_30d"],
        avg_mood_last_5_sessions=mood_score,
        weeks_in_program=att["weeks_in_program"],
    )

    # 5. flag_alert sube ligeramente el risk_score (mantiene la severidad limitada).
    if getattr(obs, "flag_alert", False):
        base_risk = float(risk_result.get("risk_score") or 0.0)
        bumped = base_risk + 0.10 * (1.0 - base_risk)
        risk_result = {**risk_result, "risk_score": round(min(1.0, bumped), 3)}
        # Promote to "high" only if it crosses 0.65 — keeps legacy thresholds intact.
        if risk_result["risk_score"] >= 0.65 and risk_result.get("risk_level") != "high":
            risk_result["risk_level"] = "high"

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
    periodic = resolve_periodic_timeline(periodic)

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
