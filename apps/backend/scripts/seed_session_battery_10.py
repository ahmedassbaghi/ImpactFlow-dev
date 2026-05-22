"""Bateria de 10 registres de sessió per participant (dades normalitzades).

- Manté participants i baselines existents.
- Esborra sessions / observacions / avaluacions periòdiques anteriors.
- Crea 10 sessions individuals per alumne amb millora progressiva (setmanes 10→1).
"""
from __future__ import annotations

import asyncio
import random
from datetime import date, timedelta

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.algorithms.ipi import DimensionScores, calculate_ipi
from app.algorithms.risk_engine import calculate_risk_score
from app.database import SessionLocal
from app.models import (
    AttendanceRecord,
    BaselineAssessment,
    Participant,
    PeriodicAssessment,
    ProgramMicroGoalCompletion,
    Session,
    SessionObservation,
    User,
    UserParticipantAssignment,
)
from app.utils.participant_metrics import dimension_scores_from_baseline

random.seed(20260522)

SESSIONS_PER_PARTICIPANT = 10
# De més antiga a més recent (10 setmanes enrere → 1 setmana)
WEEKS_AGO = list(range(10, 0, -1))

SESSION_NOTES = [
    "Sessió de repàs: participació correcta, encara amb suport en lectura.",
    "Treball de comprensió lectora i deures guiats. Actitud estable.",
    "Ha completat la majoria d'exercicis amb ajuda puntual.",
    "Millora lleu en concentració. Bon clima a la sessió.",
    "Resol més exercicis sense ajuda que fa unes setmanes.",
    "Participació activa en dinàmiques de grup reduït.",
    "Autonomia millor en tasques de 20 minuts.",
    "Explica amb més claredat el que ha après. Molt positiu.",
    "Sessió molt productiva; menys suport del voluntari.",
    "Consolidació d'avenços: manté el ritme i demana feedback útil.",
]

QUALITATIVE_NOTES = [
    "Encara necessita suport, però avança de forma constant.",
    "Més segur/a que en sessions anteriors.",
    "Bon progrés en les quatre dimensions.",
    "Actitud molt favorable durant tota la sessió.",
]


def _clamp_score(v: float) -> int:
    return max(1, min(5, round(v)))


def normalized_session_scores(base: DimensionScores, step: int, total_steps: int) -> tuple[int, int, int, int]:
    """Puntuacions 1-5 sempre informades; progressió suau cap a +1.2 punts sobre la base."""
    progress = step / max(1, total_steps - 1)
    target_bump = 1.2 * progress
    jitter = random.uniform(-0.12, 0.12)

    def dim_avg(fields: list[int | None]) -> float:
        vals = [float(f) for f in fields if f is not None]
        return sum(vals) / len(vals) if vals else 2.5

    ac = dim_avg([base.reading_level, base.math_level, base.comprehension_level]) + target_bump + jitter
    cog = dim_avg([base.attention_level, base.memory_level, base.autonomy_level]) + target_bump + jitter
    soc = dim_avg([base.peer_interaction, base.group_work, base.emotional_regulation]) + target_bump + jitter
    ing = dim_avg([base.language_fluency, base.cultural_adaptation]) + target_bump + jitter

    return _clamp_score(ac), _clamp_score(cog), _clamp_score(soc), _clamp_score(ing)


def mood_for_progress(progress: float) -> str:
    if progress < 0.25:
        return random.choice(["neutral", "low", "neutral"])
    if progress < 0.55:
        return random.choice(["neutral", "good", "good"])
    if progress < 0.8:
        return random.choice(["good", "good", "excellent"])
    return random.choice(["good", "excellent", "positive"])


async def clear_session_data(db: AsyncSession) -> None:
    for model in [
        ProgramMicroGoalCompletion,
        SessionObservation,
        AttendanceRecord,
        Session,
        PeriodicAssessment,
    ]:
        await db.execute(delete(model))
    await db.commit()


async def seed_sessions() -> None:
    async with SessionLocal() as db:
        print("Esborrant sessions i avaluacions periòdiques anteriors…")
        await clear_session_data(db)

        participants = list((await db.execute(
            select(Participant).where(Participant.active.is_(True)).order_by(Participant.first_name)
        )).scalars().all())

        if not participants:
            raise RuntimeError("No hi ha participants. Executa seed_participant_battery.py abans.")

        profs = list((await db.execute(
            select(User).where(User.role == "professional", User.is_active.is_(True))
        )).scalars().all())
        if not profs:
            raise RuntimeError("No hi ha professionals actius.")

        assign_rows = (
            await db.execute(select(UserParticipantAssignment))
        ).scalars().all()
        assign_map = {a.participant_id: a.user_id for a in assign_rows}

        today = date.today()
        session_total = 0
        obs_total = 0

        print(f"Creant {SESSIONS_PER_PARTICIPANT} sessions per {len(participants)} participants…")

        for idx, participant in enumerate(participants):
            baseline_q = await db.execute(
                select(BaselineAssessment).where(
                    BaselineAssessment.participant_id == participant.id
                )
            )
            baseline = baseline_q.scalars().first()
            if not baseline:
                continue

            base_dims = dimension_scores_from_baseline(baseline)
            base_ipi = float(baseline.ipi_baseline or 0)
            program_id = baseline.program_id
            prof_id = assign_map.get(participant.id) or profs[idx % len(profs)].id

            prev_ipi: float | None = None

            for step, weeks_ago in enumerate(WEEKS_AGO):
                session_date = today - timedelta(weeks=weeks_ago)
                progress = step / max(1, SESSIONS_PER_PARTICIPANT - 1)

                ac, cog, soc, ing = normalized_session_scores(
                    base_dims, step, SESSIONS_PER_PARTICIPANT
                )
                dim = DimensionScores(
                    reading_level=ac,
                    math_level=ac,
                    comprehension_level=ac,
                    attention_level=cog,
                    memory_level=cog,
                    autonomy_level=cog,
                    peer_interaction=soc,
                    group_work=soc,
                    emotional_regulation=soc,
                    language_fluency=ing,
                    cultural_adaptation=ing,
                )
                ipi_score = float(calculate_ipi(dim)["ipi"] or 0)
                delta_baseline = round(ipi_score - base_ipi, 2)
                delta_prev = round(ipi_score - prev_ipi, 2) if prev_ipi is not None else None
                prev_ipi = ipi_score

                risk = calculate_risk_score(
                    attendance_rate_last_30d=1.0,
                    attendance_rate_prev_30d=0.92,
                    ipi_delta_last_period=delta_prev,
                    days_since_last_session=7,
                    micro_goals_completion_rate=0.35 + progress * 0.45,
                    num_unjustified_absences_last_30d=0,
                    avg_mood_last_5_sessions=2.8 + progress * 1.2,
                    weeks_in_program=max(4, (today - participant.enrollment_date).days // 7),
                )

                sess = Session(
                    program_id=program_id,
                    professional_id=prof_id,
                    session_date=session_date,
                    session_type="individual",
                    duration_minutes=50,
                    notes=SESSION_NOTES[step % len(SESSION_NOTES)],
                    notes_sentiment=round(-0.05 + progress * 0.55, 2),
                )
                db.add(sess)
                await db.flush()
                session_total += 1

                db.add(
                    SessionObservation(
                        session_id=sess.id,
                        participant_id=participant.id,
                        academic_score=ac,
                        cognitive_score=cog,
                        social_score=soc,
                        integration_score=ing,
                        qualitative_note=QUALITATIVE_NOTES[min(step // 3, len(QUALITATIVE_NOTES) - 1)],
                        mood_indicator=mood_for_progress(progress),
                    )
                )
                obs_total += 1

                db.add(
                    AttendanceRecord(
                        participant_id=participant.id,
                        program_id=program_id,
                        session_id=sess.id,
                        date=session_date,
                        status="present",
                    )
                )

                db.add(
                    PeriodicAssessment(
                        participant_id=participant.id,
                        program_id=program_id,
                        assessed_by=prof_id,
                        assessment_date=session_date,
                        period_label=f"Sessió {step + 1}",
                        reading_level=ac,
                        math_level=ac,
                        comprehension_level=ac,
                        attention_level=cog,
                        memory_level=cog,
                        autonomy_level=cog,
                        peer_interaction=soc,
                        group_work=soc,
                        emotional_regulation=soc,
                        language_fluency=ing,
                        cultural_adaptation=ing,
                        ipi_score=ipi_score,
                        ipi_delta_vs_baseline=delta_baseline,
                        ipi_delta_vs_previous=delta_prev,
                        risk_score=risk["risk_score"],
                        risk_level=risk["risk_level"],
                        notes=f"Registre normalitzat — sessió {step + 1}/{SESSIONS_PER_PARTICIPANT}.",
                    )
                )

        await db.commit()

        print("=" * 52)
        print("Bateria de 10 sessions creada")
        print("=" * 52)
        print(f"  Participants:   {len(participants)}")
        print(f"  Sessions:       {session_total}")
        print(f"  Observacions:   {obs_total}")
        print(f"  Per participant: {SESSIONS_PER_PARTICIPANT} (dades normalitzades 1-5)")
        print("=" * 52)


if __name__ == "__main__":
    asyncio.run(seed_sessions())
