"""Mètriques de programa per SROI — només des de registres reals (sessions, IPI)."""

from __future__ import annotations

from datetime import date
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.algorithms.sroi_engine import _effective_sessions_for_value
from app.models import BaselineAssessment, PeriodicAssessment, Session, SessionObservation

# ── Cost model (pressupost NGO educatiu, Catalunya) ─────────────────────────
# Desglossament transparent per al denominador SROI (només cost en efectiu).
#
# Base fixa / participant / mes (€45): coordinació, lloguer d'espai prorratejat,
# assegurança, materials bàsics compartits, seguiment familiar.
#
# Variable / sessió (€10): cost directe per sessió registrada (materials, espai,
# coordinació prorratejada, logística). Referència per al tauler i SROI.
OPERATING_COST_PER_SESSION_EUR = 10.0
MONTHLY_FIXED_COST_PER_PARTICIPANT_EUR = 45.0
MARGINAL_COST_PER_SESSION_EUR = 10.0
# Valor de referència del voluntariat (informatiu, no va al denominador SROI)
REFERENCE_VOLUNTEER_HOURLY_EUR = 18.0
DEFAULT_SESSION_MINUTES = 90


def _program_operating_cost(
    n_participants: int,
    program_months: int,
    n_sessions: int,
) -> float:
    """Cost en efectiu alineat amb la mateixa «dosi» de sessions que el numerador SROI.

    Fórmula:  base_fixa(participants × mesos) + variable(sessions_efectives × €/sessió)

    Les sessions efectives aplicen la mateixa saturació logarítmica que el valor social:
    evita comptar 20+ sessions/infant com si cadascuna tingués cost i benefici lineals complets.
    """
    n_eff = int(
        round(
            _effective_sessions_for_value(
                n_sessions, max(n_participants, 1), max(program_months, 1)
            )
        )
    )
    fixed = n_participants * program_months * MONTHLY_FIXED_COST_PER_PARTICIPANT_EUR
    variable = n_eff * MARGINAL_COST_PER_SESSION_EUR
    return round(max(fixed + variable, 1.0), 2), n_eff


async def _avg_ipi_gain_from_session_obs(
    db: AsyncSession,
    program_id: str,
    baseline_by_participant: dict[str, float],
    period_start: Optional[date] = None,
    period_end: Optional[date] = None,
) -> list[float]:
    """Deriva el guany IPI per participant des de la seva última observació de sessió.

    Usada com a font principal quan no hi ha PeriodicAssessments suficients
    (cas típic de dades simulades: la simulació crea Sessions + SessionObservations
    però NO PeriodicAssessments).

    Retorna la llista de guanys per participant (float), pot estar buida.
    """
    obs_q = (
        select(
            SessionObservation.participant_id,
            SessionObservation.academic_score,
            SessionObservation.cognitive_score,
            SessionObservation.social_score,
            SessionObservation.integration_score,
            Session.session_date,
        )
        .join(Session, SessionObservation.session_id == Session.id)
        .where(Session.program_id == program_id)
    )
    if period_start is not None:
        obs_q = obs_q.where(Session.session_date >= period_start)
    if period_end is not None:
        obs_q = obs_q.where(Session.session_date <= period_end)
    obs_q = obs_q.order_by(Session.session_date.desc(), Session.created_at.desc())

    result = await db.execute(obs_q)

    seen: set = set()
    gains: list[float] = []
    for row in result.all():
        if row.participant_id in seen:
            continue
        seen.add(row.participant_id)
        bl = baseline_by_participant.get(row.participant_id)
        if bl is None:
            continue

        # Càlcul IPI des de 4 puntuacions compostes (1-5) → 0-100 ponderat
        weights = {"academic": 0.35, "cognitive": 0.25, "social": 0.25, "integration": 0.15}
        raw = {
            "academic":    row.academic_score,
            "cognitive":   row.cognitive_score,
            "social":      row.social_score,
            "integration": row.integration_score,
        }
        valid = {d: ((s - 1) / 4.0) * 100.0 for d, s in raw.items() if s is not None}
        if not valid:
            continue
        total_w = sum(weights[d] for d in valid)
        current_ipi = sum(weights[d] * s for d, s in valid.items()) / total_w
        gains.append(float(current_ipi) - bl)

    return gains


async def _risk_and_integration_metrics(
    db: AsyncSession,
    program_id: str,
    period_start: Optional[date] = None,
    period_end: Optional[date] = None,
) -> dict:
    """Calcula pct_high_risk y pct_integration_gain desde registros reales.

    pct_high_risk:
        Fracción de participantes cuya evaluación periódica más reciente (dentro
        del período si se especifica) tiene risk_level='high'.

    pct_integration_gain:
        Fracción de participantes cuya puntuación de integración en la evaluación
        más reciente supera la media de integración de su baseline. Solo se cuenta
        a participantes que tienen tanto baseline como evaluación periódica.

    Si no hay datos suficientes se devuelven los valores de reserva del SROI:
    pct_high_risk=0.30, pct_integration_gain derivado del ipi_gain/100.
    """
    # Consulta la evaluación periódica más reciente por participante
    base_q = select(
        PeriodicAssessment.participant_id,
        PeriodicAssessment.risk_level,
        PeriodicAssessment.language_fluency,
        PeriodicAssessment.cultural_adaptation,
        PeriodicAssessment.assessment_date,
    ).where(PeriodicAssessment.program_id == program_id)

    if period_start is not None:
        base_q = base_q.where(PeriodicAssessment.assessment_date >= period_start)
    if period_end is not None:
        base_q = base_q.where(PeriodicAssessment.assessment_date <= period_end)

    base_q = base_q.order_by(PeriodicAssessment.assessment_date.desc())
    periodic_q = await db.execute(base_q)

    # Tomar solo el registro más reciente por participante
    seen: set = set()
    latest_by_participant: dict[str, dict] = {}
    for row in periodic_q.all():
        if row.participant_id in seen:
            continue
        seen.add(row.participant_id)
        latest_by_participant[row.participant_id] = {
            "risk_level": row.risk_level,
            "language_fluency": row.language_fluency,
            "cultural_adaptation": row.cultural_adaptation,
        }

    n_assessed = len(latest_by_participant)
    if n_assessed == 0:
        return {"pct_high_risk": 0.30, "pct_integration_gain": None}

    # --- pct_high_risk ---
    n_high_risk = sum(
        1 for v in latest_by_participant.values() if v["risk_level"] == "high"
    )
    pct_high_risk = round(n_high_risk / n_assessed, 3)

    # --- pct_integration_gain: comparar integración reciente vs baseline ---
    baseline_q = await db.execute(
        select(
            BaselineAssessment.participant_id,
            BaselineAssessment.language_fluency,
            BaselineAssessment.cultural_adaptation,
        ).where(BaselineAssessment.program_id == program_id)
    )
    baseline_integration: dict[str, Optional[float]] = {}
    for row in baseline_q.all():
        vals = [v for v in (row.language_fluency, row.cultural_adaptation) if v is not None]
        baseline_integration[row.participant_id] = sum(vals) / len(vals) if vals else None

    gains_positive = 0
    gains_total = 0
    for pid, latest in latest_by_participant.items():
        bl_integ = baseline_integration.get(pid)
        if bl_integ is None:
            continue
        recent_vals = [
            v for v in (latest["language_fluency"], latest["cultural_adaptation"])
            if v is not None
        ]
        if not recent_vals:
            continue
        recent_integ = sum(recent_vals) / len(recent_vals)
        gains_total += 1
        if recent_integ > bl_integ:
            gains_positive += 1

    pct_integration_gain = round(gains_positive / gains_total, 3) if gains_total > 0 else None

    return {
        "pct_high_risk": pct_high_risk,
        "pct_integration_gain": pct_integration_gain,
    }


async def period_operating_cost_eur(
    db: AsyncSession,
    program_id: str,
    period_start: date,
    period_end: date,
) -> tuple[int, float, int]:
    """Cost operatiu del període: sessions registrades × €/sessió."""
    sess_q = await db.execute(
        select(func.count(Session.id)).where(
            Session.program_id == program_id,
            Session.session_date >= period_start,
            Session.session_date <= period_end,
        )
    )
    n_sessions = int(sess_q.scalar_one() or 0)
    cost = round(n_sessions * MARGINAL_COST_PER_SESSION_EUR, 2)
    return n_sessions, cost, n_sessions


async def load_program_period_metrics(
    db: AsyncSession,
    program_id: str,
    period_start: date,
    period_end: date,
) -> dict:
    """Mètriques SROI/CEA limitades al període analitzat."""
    baseline_q = await db.execute(
        select(BaselineAssessment).where(BaselineAssessment.program_id == program_id)
    )
    baselines = baseline_q.scalars().all()
    baseline_by_participant = {
        b.participant_id: float(b.ipi_baseline)
        for b in baselines
        if b.ipi_baseline is not None
    }

    latest_q = await db.execute(
        select(
            PeriodicAssessment.participant_id,
            PeriodicAssessment.assessment_date,
            PeriodicAssessment.ipi_score,
        )
        .where(
            PeriodicAssessment.program_id == program_id,
            PeriodicAssessment.assessment_date >= period_start,
            PeriodicAssessment.assessment_date <= period_end,
        )
        .order_by(PeriodicAssessment.assessment_date.desc())
    )
    seen: set = set()
    per_participant_gains: list[float] = []
    for row in latest_q.all():
        if row.participant_id in seen or row.ipi_score is None:
            continue
        seen.add(row.participant_id)
        bl = baseline_by_participant.get(row.participant_id)
        if bl is None:
            continue
        per_participant_gains.append(float(row.ipi_score) - bl)

    avg_ipi_gain = (
        sum(per_participant_gains) / len(per_participant_gains)
        if per_participant_gains
        else 0.0
    )

    # ── Fallback: si no hi ha prou PeriodicAssessments (cas de dades simulades),
    # derivem el guany IPI des de les observacions de sessió més recents.
    # Usem la font amb millor cobertura.
    n_with_periodic = len(per_participant_gains)
    n_total_participants = max(len(baseline_by_participant), 1)
    if n_with_periodic < n_total_participants * 0.30:
        session_gains = await _avg_ipi_gain_from_session_obs(
            db, program_id, baseline_by_participant,
            period_start=period_start, period_end=period_end,
        )
        if len(session_gains) > n_with_periodic:
            per_participant_gains = session_gains
            avg_ipi_gain = sum(session_gains) / len(session_gains) if session_gains else 0.0

    avg_baseline = (
        sum(baseline_by_participant.values()) / len(baseline_by_participant)
        if baseline_by_participant
        else 0.0
    )

    sess_q = await db.execute(
        select(
            func.count(Session.id),
            func.coalesce(func.sum(Session.duration_minutes), 0),
            func.avg(Session.duration_minutes),
        ).where(
            Session.program_id == program_id,
            Session.session_date >= period_start,
            Session.session_date <= period_end,
        )
    )
    row = sess_q.one()
    n_sessions = int(row[0] or 0)
    total_minutes = int(row[1] or 0)
    avg_minutes_db = row[2]

    # Participants actius al periode = els que realment han rebut sessions
    # (no tots els baselines del programa, que pot incloure cohortes anteriors)
    active_q = await db.execute(
        select(func.count(func.distinct(SessionObservation.participant_id)))
        .join(Session, SessionObservation.session_id == Session.id)
        .where(
            Session.program_id == program_id,
            Session.session_date >= period_start,
            Session.session_date <= period_end,
        )
    )
    n_active_in_period = int(active_q.scalar_one() or 0)

    period_days = max(1, (period_end - period_start).days + 1)
    program_months = max(1, round(period_days / 30.44))
    # Usar participants amb sessions al periode; fallback als que han millorat o 1
    n_participants = max(n_active_in_period, len(per_participant_gains), 1)

    if n_sessions == 0:
        total_minutes = 0
        avg_duration_h = 1.5
    else:
        if total_minutes <= 0:
            total_minutes = n_sessions * DEFAULT_SESSION_MINUTES
        avg_duration_h = round(
            float(avg_minutes_db or (total_minutes / n_sessions)) / 60.0,
            2,
        )

    total_hours = round(total_minutes / 60.0, 1)
    operating_cost_eur, n_sessions_effective = _program_operating_cost(
        n_participants, program_months, n_sessions
    )
    volunteer_reference_eur = round(total_hours * REFERENCE_VOLUNTEER_HOURLY_EUR, 2)
    sessions_per_participant = round(n_sessions / n_participants, 1) if n_participants else 0.0

    risk_integ = await _risk_and_integration_metrics(
        db, program_id, period_start=period_start, period_end=period_end
    )

    return {
        "n_participants": n_participants,
        "n_participants_with_gain": len(per_participant_gains),
        "n_sessions": n_sessions,
        "n_sessions_effective": n_sessions_effective,
        "sessions_per_participant": sessions_per_participant,
        "total_volunteer_hours": total_hours,
        "avg_duration_h": avg_duration_h,
        "program_duration_months": program_months,
        "period_start": period_start.isoformat(),
        "period_end": period_end.isoformat(),
        "avg_ipi_gain": round(max(0.0, avg_ipi_gain), 2),
        "avg_ipi_baseline": round(avg_baseline, 2),
        "avg_ipi_gain_pct": round((avg_ipi_gain / avg_baseline) * 100, 1) if avg_baseline > 0 else 0.0,
        "operating_cost_eur": operating_cost_eur,
        "volunteer_reference_value_eur": volunteer_reference_eur,
        "operating_cost_per_session_eur": MARGINAL_COST_PER_SESSION_EUR,
        "marginal_cost_per_session_eur": MARGINAL_COST_PER_SESSION_EUR,
        "monthly_fixed_cost_per_participant_eur": MONTHLY_FIXED_COST_PER_PARTICIPANT_EUR,
        "reference_volunteer_hourly_eur": REFERENCE_VOLUNTEER_HOURLY_EUR,
        "pct_high_risk": risk_integ["pct_high_risk"],
        "pct_integration_gain": risk_integ["pct_integration_gain"],
    }


async def load_program_sroi_metrics(db: AsyncSession, program_id: str) -> dict:
    """Carrega participants, IPI, sessions i hores des de la base de dades."""
    baseline_q = await db.execute(
        select(BaselineAssessment).where(BaselineAssessment.program_id == program_id)
    )
    baselines = baseline_q.scalars().all()
    baseline_by_participant = {
        b.participant_id: float(b.ipi_baseline)
        for b in baselines
        if b.ipi_baseline is not None
    }
    n_with_baseline = len(baseline_by_participant)

    latest_q = await db.execute(
        select(PeriodicAssessment.participant_id, PeriodicAssessment.ipi_score)
        .where(PeriodicAssessment.program_id == program_id)
        .order_by(PeriodicAssessment.assessment_date.desc())
    )
    seen: set = set()
    per_participant_gains: list[float] = []
    for row in latest_q.all():
        if row.participant_id in seen or row.ipi_score is None:
            continue
        seen.add(row.participant_id)
        bl = baseline_by_participant.get(row.participant_id)
        if bl is None:
            continue
        per_participant_gains.append(float(row.ipi_score) - bl)

    avg_ipi_gain = (
        sum(per_participant_gains) / len(per_participant_gains)
        if per_participant_gains
        else 0.0
    )

    # ── Fallback: si no hi ha prou PeriodicAssessments (cas de dades simulades),
    # derivem el guany IPI des de les observacions de sessió més recents.
    n_with_periodic = len(per_participant_gains)
    if n_with_periodic < n_with_baseline * 0.30:
        session_gains = await _avg_ipi_gain_from_session_obs(
            db, program_id, baseline_by_participant,
        )
        if len(session_gains) > n_with_periodic:
            per_participant_gains = session_gains
            avg_ipi_gain = sum(session_gains) / len(session_gains) if session_gains else 0.0

    avg_baseline = (
        sum(baseline_by_participant.values()) / len(baseline_by_participant)
        if baseline_by_participant
        else 0.0
    )

    sess_q = await db.execute(
        select(
            func.count(Session.id),
            func.coalesce(func.sum(Session.duration_minutes), 0),
            func.min(Session.session_date),
            func.max(Session.session_date),
            func.avg(Session.duration_minutes),
        ).where(Session.program_id == program_id)
    )
    row = sess_q.one()
    n_sessions = int(row[0] or 0)
    total_minutes = int(row[1] or 0)
    date_min: date | None = row[2]
    date_max: date | None = row[3]
    avg_minutes_db = row[4]

    if n_sessions == 0:
        total_minutes = 0
        avg_duration_h = 1.5
        program_months = 1
    else:
        if total_minutes <= 0:
            total_minutes = n_sessions * DEFAULT_SESSION_MINUTES
        avg_duration_h = round(
            float(avg_minutes_db or (total_minutes / n_sessions)) / 60.0,
            2,
        )
        if date_min and date_max:
            program_months = max(1, round((date_max - date_min).days / 30.44))
        else:
            program_months = max(1, round(n_sessions / 4))

    # Usar participants amb sessions (no tots els baselines: pot incloure cohorts anteriors)
    # Mateixa lògica que load_program_period_metrics per evitar sobrevalorar el cost.
    active_all_q = await db.execute(
        select(func.count(func.distinct(SessionObservation.participant_id)))
        .join(Session, SessionObservation.session_id == Session.id)
        .where(Session.program_id == program_id)
    )
    n_active_with_sessions = int(active_all_q.scalar_one() or 0)
    n_participants = max(n_active_with_sessions, len(per_participant_gains), 1)

    total_hours = round(total_minutes / 60.0, 1)
    operating_cost_eur, n_sessions_effective = _program_operating_cost(
        n_participants, program_months, n_sessions
    )
    volunteer_reference_eur = round(total_hours * REFERENCE_VOLUNTEER_HOURLY_EUR, 2)
    sessions_per_participant = round(n_sessions / n_participants, 1) if n_participants else 0.0

    risk_integ = await _risk_and_integration_metrics(db, program_id)

    return {
        "n_participants": n_participants,
        "n_sessions": n_sessions,
        "n_sessions_effective": n_sessions_effective,
        "sessions_per_participant": sessions_per_participant,
        "total_volunteer_hours": total_hours,
        "avg_duration_h": avg_duration_h,
        "program_duration_months": program_months,
        "program_date_from": date_min.isoformat() if date_min else None,
        "program_date_to": date_max.isoformat() if date_max else None,
        "avg_ipi_gain": round(max(0.0, avg_ipi_gain), 2),
        "avg_ipi_baseline": round(avg_baseline, 2),
        "avg_ipi_gain_pct": round((avg_ipi_gain / avg_baseline) * 100, 1) if avg_baseline > 0 else 0.0,
        "operating_cost_eur": operating_cost_eur,
        "volunteer_reference_value_eur": volunteer_reference_eur,
        "operating_cost_per_session_eur": MARGINAL_COST_PER_SESSION_EUR,
        "marginal_cost_per_session_eur": MARGINAL_COST_PER_SESSION_EUR,
        "monthly_fixed_cost_per_participant_eur": MONTHLY_FIXED_COST_PER_PARTICIPANT_EUR,
        "reference_volunteer_hourly_eur": REFERENCE_VOLUNTEER_HOURLY_EUR,
        "pct_high_risk": risk_integ["pct_high_risk"],
        "pct_integration_gain": risk_integ["pct_integration_gain"],
    }
