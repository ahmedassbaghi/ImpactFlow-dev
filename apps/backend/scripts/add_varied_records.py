"""Add a varied pool of session records and periodic assessments.

Generates realistic, individualized trajectories per participant:
- Stable improvers (60%): smooth upward trend with mild noise
- Plateau cases (15%): flat after initial gain
- Late bloomers (10%): slow start, then breakthrough
- Strugglers (10%): mild regression then partial recovery
- Erratic (5%): high variance

For each participant, generates 4-6 additional sessions and a corresponding
PeriodicAssessment per session date so dashboards show evolution.
"""

import asyncio
import random
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.algorithms.ipi import DimensionScores, calculate_ipi
from app.algorithms.risk_engine import calculate_risk_score
from app.database import SessionLocal
from app.models import (
    AttendanceRecord,
    BaselineAssessment,
    Participant,
    PeriodicAssessment,
    Program,
    ProgramEnrollment,
    Session,
    SessionObservation,
    User,
)


random.seed(2026)

PROFILES = ["stable", "plateau", "late_bloomer", "struggler", "erratic"]
PROFILE_WEIGHTS = [0.60, 0.15, 0.10, 0.10, 0.05]

QUALITATIVE_BANK = {
    "great": [
        "Sessió excel·lent. Ha mostrat iniciativa i ha ajudat els companys.",
        "Salt qualitatiu evident. Ha resolt tasques que abans li costaven molt.",
        "Avui ha brillat: concentració total i bona col·laboració.",
        "Ha completat tots els objectius marcats amb autonomia.",
    ],
    "good": [
        "Bon ritme de treball, amb participació activa.",
        "Ha mantingut l'atenció durant la major part de la sessió.",
        "Cooperació adequada amb el grup.",
        "Avenç notable en l'àrea {dim} respecte la setmana passada.",
    ],
    "neutral": [
        "Sessió correcta, sense incidents destacables.",
        "Treball constant però sense gaire iniciativa pròpia.",
        "Ha completat els exercicis amb suport.",
        "Estat estable, sense canvis significatius.",
    ],
    "bad": [
        "Distret durant gran part de la sessió. Cal reforçar.",
        "S'ha frustrat davant la dificultat i ha desconnectat.",
        "Pocs avenços. Probablement necessita un canvi d'enfocament.",
        "Resistent a participar en l'activitat de grup.",
    ],
    "very_bad": [
        "Conflicte amb un company. Sessió interrompuda.",
        "No ha pogut concentrar-se. Possible problema extern.",
        "Regressió evident respecte sessions anteriors.",
        "Necessita atenció urgent: senyals d'esgotament.",
    ],
}

DIM_NAMES = {
    "academic": ["lectura", "matemàtiques", "comprensió"],
    "cognitive": ["atenció", "memòria"],
    "social": ["treball en grup", "regulació emocional"],
    "integration": ["fluïdesa lingüística", "adaptació cultural"],
}


def trajectory_score(profile: str, week: int, total_weeks: int, base: float) -> float:
    """Generate a realistic 1-5 score for a given profile at a given week."""
    progress = week / max(1, total_weeks)
    noise = random.gauss(0, 0.18)

    if profile == "stable":
        # Smooth growth from base toward 4.2-4.6
        target = 4.4
        v = base + (target - base) * progress + noise
    elif profile == "plateau":
        # Quick gain in first 30%, then flat
        peak = base + 1.2
        if progress < 0.3:
            v = base + (peak - base) * (progress / 0.3) + noise
        else:
            v = peak + noise
    elif profile == "late_bloomer":
        # Slow first half, then breakthrough
        if progress < 0.5:
            v = base + 0.3 * progress + noise * 0.6
        else:
            v = base + 0.3 + (progress - 0.5) * 4.0 + noise
    elif profile == "struggler":
        # Mild dip in middle, partial recovery at end
        if progress < 0.4:
            v = base - 0.4 * (progress / 0.4) + noise
        elif progress < 0.7:
            v = base - 0.4 + 0.2 * ((progress - 0.4) / 0.3) + noise
        else:
            v = base - 0.2 + 0.6 * ((progress - 0.7) / 0.3) + noise
    elif profile == "erratic":
        v = base + random.gauss(0.5 * progress, 0.7)
    else:
        v = base + noise

    return max(1.0, min(5.0, v))


def mood_for_score(score: float) -> str:
    if score >= 4.3:
        return random.choice(["excellent", "good"])
    if score >= 3.7:
        return random.choice(["good", "neutral", "good"])
    if score >= 2.8:
        return random.choice(["neutral", "low", "good"])
    if score >= 2.0:
        return random.choice(["low", "neutral"])
    return random.choice(["very_low", "low"])


def quality_bucket(score: float) -> str:
    if score >= 4.3:
        return "great"
    if score >= 3.5:
        return "good"
    if score >= 2.8:
        return "neutral"
    if score >= 2.0:
        return "bad"
    return "very_bad"


async def main() -> None:
    async with SessionLocal() as db:  # type: AsyncSession
        # Fetch any user as the assessor
        users_q = await db.execute(select(User).limit(1))
        user = users_q.scalars().first()
        if user is None:
            print("No users in DB. Aborting.")
            return

        programs_q = await db.execute(select(Program).where(Program.active == True))
        programs = list(programs_q.scalars().all())
        print(f"Found {len(programs)} active programs")

        sessions_added = 0
        observations_added = 0
        pa_added = 0

        for prog in programs:
            # Get enrolled participants
            enr_q = await db.execute(
                select(Participant)
                .join(ProgramEnrollment, ProgramEnrollment.participant_id == Participant.id)
                .where(
                    ProgramEnrollment.program_id == prog.id,
                    ProgramEnrollment.active == True,
                )
            )
            participants = list(enr_q.scalars().all())
            if not participants:
                continue

            # Assign profiles
            profiles = {p.id: random.choices(PROFILES, weights=PROFILE_WEIGHTS, k=1)[0] for p in participants}

            # 5-7 sessions per participant, scattered over the past ~10 weeks
            n_extra = random.randint(5, 7)
            today = date.today()

            for week_offset in range(n_extra):
                # Session date: spread across past weeks
                session_date = today - timedelta(days=(n_extra - week_offset) * 7 + random.randint(-2, 2))

                # One session per program per "wave"
                session = Session(
                    program_id=prog.id,
                    professional_id=user.id,
                    session_date=session_date,
                    session_type=random.choice(["group", "group", "workshop", "individual"]),
                    duration_minutes=random.choice([45, 60, 60, 90]),
                    notes=None,
                )
                db.add(session)
                await db.flush()
                sessions_added += 1

                for p in participants:
                    profile = profiles[p.id]
                    base_q = await db.execute(
                        select(BaselineAssessment).where(
                            BaselineAssessment.participant_id == p.id,
                            BaselineAssessment.program_id == prog.id,
                        )
                    )
                    base = base_q.scalar_one_or_none()
                    base_lvl = float(base.reading_level or 2) if base else 2.0

                    # Generate scores per dimension with profile-driven trajectory
                    week = week_offset
                    total = n_extra
                    ac = round(trajectory_score(profile, week, total, base_lvl))
                    cog = round(trajectory_score(profile, week, total,
                                                  float(base.attention_level or 2) if base else 2.5))
                    soc = round(trajectory_score(profile, week, total,
                                                  float(base.peer_interaction or 3) if base else 3.0))
                    integ = round(trajectory_score(profile, week, total,
                                                    float(base.language_fluency or 2) if base else 2.5))

                    # Some participants may miss sessions
                    attendance = "present"
                    if random.random() < 0.08:
                        attendance = random.choice(["late", "absent_justified", "absent_unjustified"])
                    if attendance.startswith("absent"):
                        # Skip observation for fully absent
                        if attendance == "absent_unjustified":
                            db.add(AttendanceRecord(
                                participant_id=p.id,
                                program_id=prog.id,
                                session_id=session.id,
                                date=session_date,
                                status=attendance,
                            ))
                            continue

                    avg_score = (ac + cog + soc + integ) / 4
                    bucket = quality_bucket(avg_score)
                    note_template = random.choice(QUALITATIVE_BANK[bucket])
                    if "{dim}" in note_template:
                        note_template = note_template.format(
                            dim=random.choice(["acadèmica", "cognitiva", "social", "d'integració"])
                        )

                    obs = SessionObservation(
                        session_id=session.id,
                        participant_id=p.id,
                        academic_score=ac,
                        cognitive_score=cog,
                        social_score=soc,
                        integration_score=integ,
                        qualitative_note=note_template,
                        mood_indicator=mood_for_score(avg_score),
                    )
                    db.add(obs)
                    observations_added += 1

                    db.add(AttendanceRecord(
                        participant_id=p.id,
                        program_id=prog.id,
                        session_id=session.id,
                        date=session_date,
                        status="present" if attendance == "present" else attendance,
                    ))

                    # Create / update PeriodicAssessment for this date
                    existing_pa_q = await db.execute(
                        select(PeriodicAssessment).where(
                            PeriodicAssessment.participant_id == p.id,
                            PeriodicAssessment.program_id == prog.id,
                            PeriodicAssessment.assessment_date == session_date,
                        )
                    )
                    if existing_pa_q.scalar_one_or_none():
                        continue

                    dim_scores = DimensionScores(
                        reading_level=ac, math_level=ac, comprehension_level=ac,
                        attention_level=cog, memory_level=cog, autonomy_level=cog,
                        peer_interaction=soc, group_work=soc, emotional_regulation=soc,
                        language_fluency=integ, cultural_adaptation=integ,
                    )
                    ipi_result = calculate_ipi(dim_scores)
                    ipi_val = ipi_result["ipi"]
                    if ipi_val is None:
                        continue

                    base_ipi = float(base.ipi_baseline or 0) if base else 0.0
                    delta = round(ipi_val - base_ipi, 2) if base_ipi else None

                    risk = calculate_risk_score(
                        attendance_rate_last_30d=0.95 if attendance == "present" else 0.6,
                        attendance_rate_prev_30d=0.85,
                        ipi_delta_last_period=delta,
                        days_since_last_session=7,
                        micro_goals_completion_rate=0.5,
                        num_unjustified_absences_last_30d=0,
                        avg_mood_last_5_sessions=None,
                        weeks_in_program=4 + week_offset,
                    )

                    db.add(PeriodicAssessment(
                        participant_id=p.id,
                        program_id=prog.id,
                        assessed_by=user.id,
                        assessment_date=session_date,
                        period_label="varied_pool",
                        reading_level=ac, math_level=ac, comprehension_level=ac,
                        attention_level=cog, memory_level=cog, autonomy_level=cog,
                        peer_interaction=soc, group_work=soc, emotional_regulation=soc,
                        language_fluency=integ, cultural_adaptation=integ,
                        ipi_score=ipi_val,
                        ipi_delta_vs_baseline=delta,
                        risk_score=risk["risk_score"],
                        risk_level=risk["risk_level"],
                    ))
                    pa_added += 1

        await db.commit()
        print(f"OK Added {sessions_added} sessions, {observations_added} observations, {pa_added} periodic assessments")


if __name__ == "__main__":
    asyncio.run(main())
