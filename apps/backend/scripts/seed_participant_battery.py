"""Nova bateria de participants — substitueix l'actual.

- Esborra participants i dades vinculades (sessions, avaluacions, assignacions).
- Manté organització, usuaris, programes i escoles.
- Crea participants amb noms reals (ficticius).
- Baseline inicial + 3 sessions individuals per alumne amb millora progressiva.
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
    Organization,
    Participant,
    PeriodicAssessment,
    Program,
    ProgramEnrollment,
    ProgramMicroGoalCompletion,
    School,
    Session,
    SessionObservation,
    User,
    UserParticipantAssignment,
)
from app.utils.participant_code import next_participant_code

random.seed(20260521)

# Noms habituals a Catalunya (ficticius, realistes)
STUDENTS: list[dict] = [
    {"first_name": "Marc", "gender": "M", "nationality": "Catalunya", "birth_year": 2014},
    {"first_name": "Laia", "gender": "F", "nationality": "Catalunya", "birth_year": 2015},
    {"first_name": "Arnau", "gender": "M", "nationality": "Catalunya", "birth_year": 2013},
    {"first_name": "Núria", "gender": "F", "nationality": "Catalunya", "birth_year": 2014},
    {"first_name": "Pau", "gender": "M", "nationality": "Catalunya", "birth_year": 2016},
    {"first_name": "Martina", "gender": "F", "nationality": "Catalunya", "birth_year": 2015},
    {"first_name": "Gerard", "gender": "M", "nationality": "Catalunya", "birth_year": 2014},
    {"first_name": "Aina", "gender": "F", "nationality": "Catalunya", "birth_year": 2013},
    {"first_name": "Pol", "gender": "M", "nationality": "Catalunya", "birth_year": 2015},
    {"first_name": "Júlia", "gender": "F", "nationality": "Catalunya", "birth_year": 2016},
    {"first_name": "Jan", "gender": "M", "nationality": "Catalunya", "birth_year": 2014},
    {"first_name": "Carla", "gender": "F", "nationality": "Catalunya", "birth_year": 2015},
    {"first_name": "Omar", "gender": "M", "nationality": "Marroc", "birth_year": 2014},
    {"first_name": "Salma", "gender": "F", "nationality": "Marroc", "birth_year": 2015},
    {"first_name": "Mohamed", "gender": "M", "nationality": "Síria", "birth_year": 2013},
    {"first_name": "Amina", "gender": "F", "nationality": "Síria", "birth_year": 2014},
    {"first_name": "Iker", "gender": "M", "nationality": "País Basc", "birth_year": 2015},
    {"first_name": "Leire", "gender": "F", "nationality": "País Basc", "birth_year": 2016},
    {"first_name": "Lucas", "gender": "M", "nationality": "Hondures", "birth_year": 2014},
    {"first_name": "Sofia", "gender": "F", "nationality": "Hondures", "birth_year": 2015},
    {"first_name": "Roger", "gender": "M", "nationality": "Catalunya", "birth_year": 2013},
    {"first_name": "Nerea", "gender": "F", "nationality": "Catalunya", "birth_year": 2014},
    {"first_name": "Eric", "gender": "M", "nationality": "Romania", "birth_year": 2015},
    {"first_name": "Claudia", "gender": "F", "nationality": "Romania", "birth_year": 2016},
]

SESSION_OFFSETS_WEEKS = [6, 3, 1]  # 3 registres: fa 6 setmanes, 3, 1

NOTES_SESSION = [
    [
        "Primera sessió de seguiment. Participació correcta; encara necessita suport en lectura.",
        "Ha completat les activitats amb ajuda. Bon to general, però dispers en moments puntuals.",
        "Sessió de repàs: comprensió acceptable, matemàtiques amb dificultat moderada.",
    ],
    [
        "Segona sessió: més concentració que la setmana passada. Ha demanat ajuda quan s'ha bloquejat.",
        "Millora lleu en treball en grup. Continua reforçant la lectura a casa.",
        "Ha resolt part dels exercicis sense ajuda. Actitud positiva durant tota la sessió.",
    ],
    [
        "Tercera sessió: progressió clara. Autonomia millor en tasques curtes.",
        "Excel·lent actitud. Ha explicat en veu alta el que havia après; molt millor que al inici.",
        "Sessió molt productiva: menys suport del voluntari i més iniciativa pròpia.",
    ],
]

QUALITATIVE_BY_STEP = [
    "Encara costa mantenir l'atenció tota l'estona, però avança.",
    "Ha mostrat més seguretat que la sessió anterior.",
    "Bon pas endavant; es nota la constància de les últimes setmanes.",
]


def _clamp_score(v: float) -> int:
    return max(1, min(5, round(v)))


def baseline_levels(profile_base: float) -> DimensionScores:
    """Nivell base baix-mitjà (1-3) amb variació per dimensió."""
    def lvl(center: float) -> int:
        return _clamp_score(center + random.uniform(-0.4, 0.4))

    return DimensionScores(
        reading_level=lvl(profile_base),
        math_level=lvl(profile_base - 0.2),
        comprehension_level=lvl(profile_base),
        attention_level=lvl(profile_base - 0.3),
        memory_level=lvl(profile_base),
        autonomy_level=lvl(profile_base - 0.2),
        peer_interaction=lvl(profile_base + 0.2),
        group_work=lvl(profile_base + 0.1),
        emotional_regulation=lvl(profile_base),
        language_fluency=lvl(profile_base - 0.1),
        cultural_adaptation=lvl(profile_base),
    )


def session_dimension_scores(base: DimensionScores, step: int) -> tuple[int, int, int, int]:
    """step 0 ≈ baseline, 1 i 2 amb millora progressiva (+0.35, +0.75 aprox)."""
    bump = {0: 0.0, 1: 0.35, 2: 0.75}[step]
    noise = random.uniform(-0.15, 0.15)

    def dim_avg(fields: list[int | None]) -> float:
        vals = [f for f in fields if f is not None]
        return sum(vals) / len(vals) if vals else 2.5

    ac = dim_avg([base.reading_level, base.math_level, base.comprehension_level]) + bump + noise
    cog = dim_avg([base.attention_level, base.memory_level, base.autonomy_level]) + bump + noise
    soc = dim_avg([base.peer_interaction, base.group_work, base.emotional_regulation]) + bump + noise
    ing = dim_avg([base.language_fluency, base.cultural_adaptation]) + bump + noise

    return (
        _clamp_score(ac),
        _clamp_score(cog),
        _clamp_score(soc),
        _clamp_score(ing),
    )


def mood_for_step(step: int) -> str:
    options = [
        ["neutral", "low", "neutral"],
        ["neutral", "good", "good"],
        ["good", "good", "excellent"],
    ]
    return random.choice(options[step])


async def delete_participant_data(db: AsyncSession) -> None:
    for model in [
        UserParticipantAssignment,
        ProgramEnrollment,
        ProgramMicroGoalCompletion,
        SessionObservation,
        AttendanceRecord,
        Session,
        PeriodicAssessment,
        BaselineAssessment,
        Participant,
    ]:
        await db.execute(delete(model))
    await db.commit()


async def seed_battery() -> None:
    async with SessionLocal() as db:
        org_q = await db.execute(select(Organization).where(Organization.slug == "narinan"))
        org = org_q.scalar_one_or_none()
        if not org:
            raise RuntimeError("Organització 'narinan' no trobada. Executa seed_demo.py abans.")
        org_id = org.id

        print("Esborrant participants i dades vinculades…")
        await delete_participant_data(db)

        programs_q = await db.execute(
            select(Program).where(Program.organization_id == org_id, Program.active.is_(True))
        )
        programs = list(programs_q.scalars().all())
        if not programs:
            raise RuntimeError("Cap programa actiu. Executa seed_demo.py abans.")

        schools_q = await db.execute(select(School).where(School.organization_id == org_id))
        schools = list(schools_q.scalars().all())
        if not schools:
            raise RuntimeError("Cap escola. Executa seed_demo.py abans.")

        profs_q = await db.execute(
            select(User).where(User.organization_id == org_id, User.role == "professional")
        )
        professionals = list(profs_q.scalars().all())
        if not professionals:
            raise RuntimeError("Cap professional. Executa seed_demo.py abans.")

        primary_program = next(
            (p for p in programs if p.program_type == "academic_support"),
            programs[0],
        )
        primary_program_name = primary_program.name
        primary_program_id = primary_program.id
        secondary_program = next(
            (p for p in programs if p.id != primary_program_id),
            primary_program,
        )
        secondary_program_id = secondary_program.id
        prof1, prof2 = professionals[0], professionals[1] if len(professionals) > 1 else professionals[0]
        today = date.today()
        baseline_date = today - timedelta(days=56)

        participants: list[Participant] = []
        baselines: list[tuple[Participant, BaselineAssessment, DimensionScores, float]] = []

        print(f"Creant {len(STUDENTS)} participants…")
        for i, spec in enumerate(STUDENTS):
            school = schools[i % len(schools)]
            code = await next_participant_code(db, org_id, school.id)
            enrollment = baseline_date - timedelta(days=random.randint(3, 14))

            p = Participant(
                organization_id=org_id,
                school_id=school.id,
                code=code,
                first_name=spec["first_name"],
                birth_year=spec["birth_year"],
                gender=spec["gender"],
                nationality=spec["nationality"],
                enrollment_date=enrollment,
                consent_given=True,
                is_control_group=False,
                active=True,
            )
            db.add(p)
            await db.flush()

            program_id = primary_program_id if i < 18 else secondary_program_id

            db.add(
                ProgramEnrollment(
                    program_id=program_id,
                    participant_id=p.id,
                    enrolled_at=enrollment,
                    active=True,
                )
            )
            prof = prof1 if i % 2 == 0 else prof2
            db.add(UserParticipantAssignment(user_id=prof.id, participant_id=p.id))

            profile_base = random.uniform(1.8, 2.8)
            base_dims = baseline_levels(profile_base)
            base_ipi = calculate_ipi(base_dims)["ipi"] or 0.0

            baseline = BaselineAssessment(
                participant_id=p.id,
                program_id=program_id,
                assessed_by=prof.id,
                assessment_date=baseline_date,
                reading_level=base_dims.reading_level,
                math_level=base_dims.math_level,
                comprehension_level=base_dims.comprehension_level,
                attention_level=base_dims.attention_level,
                memory_level=base_dims.memory_level,
                autonomy_level=base_dims.autonomy_level,
                peer_interaction=base_dims.peer_interaction,
                group_work=base_dims.group_work,
                emotional_regulation=base_dims.emotional_regulation,
                language_fluency=base_dims.language_fluency,
                cultural_adaptation=base_dims.cultural_adaptation,
                ipi_baseline=base_ipi,
                notes=(
                    f"Avaluació inicial ({baseline_date.isoformat()}). "
                    f"Nivell de partida coherent amb el perfil observat a l'escola."
                ),
            )
            db.add(baseline)
            participants.append(p)
            baselines.append((p, baseline, base_dims, base_ipi))

        await db.flush()

        session_count = 0
        obs_count = 0

        print("Creant 3 sessions per participant amb millora progressiva…")
        for idx, (p, baseline_row, base_dims, base_ipi) in enumerate(baselines):
            prog_id = baseline_row.program_id
            prof = prof1 if idx % 2 == 0 else prof2
            enrollment_date = p.enrollment_date
            prev_ipi: float | None = None

            for step, weeks_ago in enumerate(SESSION_OFFSETS_WEEKS):
                session_date = today - timedelta(weeks=weeks_ago)
                ac, cog, soc, ing = session_dimension_scores(base_dims, step)
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
                ipi_result = calculate_ipi(dim)
                ipi_score = float(ipi_result["ipi"] or 0)
                delta_baseline = round(ipi_score - base_ipi, 2) if base_ipi else None
                delta_prev = (
                    round(ipi_score - prev_ipi, 2) if prev_ipi is not None else None
                )
                prev_ipi = ipi_score

                risk = calculate_risk_score(
                    attendance_rate_last_30d=1.0,
                    attendance_rate_prev_30d=0.9 if step > 0 else 0.85,
                    ipi_delta_last_period=delta_prev,
                    days_since_last_session=7 * weeks_ago,
                    micro_goals_completion_rate=0.4 + step * 0.15,
                    num_unjustified_absences_last_30d=0,
                    avg_mood_last_5_sessions=3.0 + step * 0.4,
                    weeks_in_program=max(4, (today - enrollment_date).days // 7),
                )

                sess = Session(
                    program_id=prog_id,
                    professional_id=prof.id,
                    session_date=session_date,
                    session_type="individual",
                    duration_minutes=random.choice([45, 50, 60]),
                    notes=NOTES_SESSION[step][idx % len(NOTES_SESSION[step])],
                    notes_sentiment=round(0.15 + step * 0.25 + random.uniform(-0.05, 0.1), 2),
                )
                db.add(sess)
                await db.flush()
                session_count += 1

                mood = mood_for_step(step)
                obs = SessionObservation(
                    session_id=sess.id,
                    participant_id=p.id,
                    academic_score=ac,
                    cognitive_score=cog,
                    social_score=soc,
                    integration_score=ing,
                    qualitative_note=QUALITATIVE_BY_STEP[step],
                    mood_indicator=mood,
                )
                db.add(obs)
                obs_count += 1

                db.add(
                    AttendanceRecord(
                        participant_id=p.id,
                        program_id=prog_id,
                        session_id=sess.id,
                        date=session_date,
                        status="present",
                    )
                )

                db.add(
                    PeriodicAssessment(
                        participant_id=p.id,
                        program_id=prog_id,
                        assessed_by=prof.id,
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
                        notes=f"Derivat de sessió individual del {session_date.isoformat()}.",
                    )
                )

        await db.commit()

        print("=" * 52)
        print("Nova bateria de participants creada")
        print("=" * 52)
        print(f"  Participants:     {len(participants)}")
        print(f"  Baselines:        {len(participants)}")
        print(f"  Sessions:         {session_count} (3 per alumne)")
        print(f"  Observacions:     {obs_count}")
        print(f"  Programa principal: {primary_program_name}")
        print()
        sample_names = [b[0].first_name for b in baselines[:6]]
        print("Exemples d'alumnes:", ", ".join(sample_names), "…")
        print("=" * 52)


if __name__ == "__main__":
    asyncio.run(seed_battery())
