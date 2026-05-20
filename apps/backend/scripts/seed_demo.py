"""Demo seed — creates a realistic dataset for ImpactFlow demo access."""
import asyncio
import random
from datetime import date, datetime, timedelta

from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.algorithms.ipi import DimensionScores, calculate_ipi, calculate_relative_improvement
from app.algorithms.risk_engine import calculate_risk_score
from app.database import Base, SessionLocal, engine
from app.models import (
    AttendanceRecord,
    BaselineAssessment,
    Organization,
    Participant,
    PeriodicAssessment,
    Program,
    ProgramEnrollment,
    ProgramMicroGoal,
    ProgramMicroGoalCompletion,
    School,
    Session,
    SessionObservation,
    User,
    UserParticipantAssignment,
)
from app.utils.auth import get_password_hash

random.seed(42)

NATIONALITIES = ["Marroc", "Pakistan", "Catalunya", "Síria", "Hondures", "Senegal", "Romania", "Filipines"]
MOODS = ["great", "good", "neutral", "bad", "very_bad"]
SESSION_TYPES = ["individual", "group", "group", "group"]
GOAL_TEMPLATES = [
    ("academic", "Llegir 10 minuts seguits sense interrupcions", 1),
    ("academic", "Resoldre 5 problemes de matemàtiques sense ajuda", 2),
    ("academic", "Completar els deures 3 dies seguits", 1),
    ("cognitive", "Completar una tasca de 20 min sense distraccions", 2),
    ("cognitive", "Recordar i explicar 3 conceptes de la sessió anterior", 2),
    ("social", "Participar almenys 1 cop en una activitat de grup", 1),
    ("social", "Resoldre un conflicte verbal de manera pacífica", 3),
    ("social", "Iniciar una conversa amb un company nou", 2),
    ("integration", "Explicar una tradició del seu país en català", 2),
    ("integration", "Llegir i comprendre un text en català", 1),
]


async def cleanup(db: AsyncSession) -> None:
    for model in [
        UserParticipantAssignment, ProgramEnrollment,
        ProgramMicroGoalCompletion, ProgramMicroGoal,
        SessionObservation, AttendanceRecord, Session,
        PeriodicAssessment, BaselineAssessment,
        Participant, School, Program, User, Organization,
    ]:
        await db.execute(delete(model))
    await db.commit()


def random_score(base: int, drift: int = 0) -> int:
    return max(1, min(5, base + drift + random.choice([-1, 0, 0, 1])))


async def seed() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with SessionLocal() as db:
        await cleanup(db)

        # ── Organisation ──────────────────────────────────────────────
        org = Organization(name="Narinan", slug="narinan", plan="pro")
        db.add(org)
        await db.flush()

        # ── Users ─────────────────────────────────────────────────────
        users = [
            User(organization_id=org.id, email="admin@impactflow.dev",
                 hashed_password=get_password_hash("admin123"),
                 full_name="Admin Demo", role="admin"),
            User(organization_id=org.id, email="coord1@impactflow.dev",
                 hashed_password=get_password_hash("coord123"),
                 full_name="Marina Solà", role="coordinator"),
            User(organization_id=org.id, email="prof1@impactflow.dev",
                 hashed_password=get_password_hash("prof123"),
                 full_name="Jordi Puig", role="professional"),
            User(organization_id=org.id, email="prof2@impactflow.dev",
                 hashed_password=get_password_hash("prof123"),
                 full_name="Laia Ferrer", role="professional"),
            User(organization_id=org.id, email="donor@impactflow.dev",
                 hashed_password=get_password_hash("donor123"),
                 full_name="Donant Fundació", role="donor"),
        ]
        db.add_all(users)
        await db.flush()

        admin_user, coord_user, prof1, prof2, donor_user = users
        professionals = [prof1, prof2]

        # ── Programs ──────────────────────────────────────────────────
        programs = [
            Program(organization_id=org.id, name="Reforç Escolar",
                    description="Suport acadèmic intensiu per a infants en risc d'exclusió",
                    program_type="academic_support",
                    start_date=date.today() - timedelta(days=180)),
            Program(organization_id=org.id, name="Teatre Social",
                    description="Desenvolupament social i integració a través de les arts",
                    program_type="theater",
                    start_date=date.today() - timedelta(days=180)),
        ]
        db.add_all(programs)
        await db.flush()

        schools = [
            School(organization_id=org.id, name="Escola Sagrada Família", abbreviation="ESF"),
            School(organization_id=org.id, name="Institut Montserrat", abbreviation="IMO"),
            School(organization_id=org.id, name="Escola El Cim", abbreviation="ELC"),
        ]
        db.add_all(schools)
        await db.flush()

        # ── Program micro-goals ────────────────────────────────────────
        program_goals: list[ProgramMicroGoal] = []
        for prog in programs:
            for dim, title, diff in GOAL_TEMPLATES:
                goal = ProgramMicroGoal(
                    program_id=prog.id,
                    created_by=coord_user.id,
                    title=title,
                    dimension=dim,
                    difficulty=diff,
                    target_date=date.today() + timedelta(days=random.randint(14, 60)),
                )
                program_goals.append(goal)
        db.add_all(program_goals)
        await db.flush()

        # ── Participants + Assessments ────────────────────────────────
        participants: list[Participant] = []
        for i in range(1, 51):
            school = schools[i % len(schools)]
            p = Participant(
                organization_id=org.id,
                school_id=school.id,
                code=f"{school.abbreviation}-2024-{i:03d}",
                first_name=f"Participant-{i}",
                birth_year=random.randint(2012, 2020),
                gender=random.choice(["M", "F", "NB", "unknown"]),
                nationality=random.choice(NATIONALITIES),
                enrollment_date=date.today() - timedelta(days=random.randint(90, 180)),
                consent_given=True,
                is_control_group=i % 4 == 0,
                active=True,
            )
            participants.append(p)
        db.add_all(participants)
        await db.flush()

        for idx, participant in enumerate(participants[:25]):
            db.add(UserParticipantAssignment(user_id=prof1.id, participant_id=participant.id))
        for idx, participant in enumerate(participants[25:]):
            db.add(UserParticipantAssignment(user_id=prof2.id, participant_id=participant.id))
        await db.flush()

        for idx, participant in enumerate(participants):
            program = programs[idx % 2]
            db.add(
                ProgramEnrollment(
                    program_id=program.id,
                    participant_id=participant.id,
                    enrolled_at=participant.enrollment_date,
                    active=True,
                )
            )
            base_dims = DimensionScores(
                reading_level=random.randint(1, 3),
                math_level=random.randint(1, 3),
                comprehension_level=random.randint(1, 3),
                attention_level=random.randint(1, 3),
                memory_level=random.randint(1, 3),
                autonomy_level=random.randint(1, 3),
                peer_interaction=random.randint(1, 4),
                group_work=random.randint(1, 4),
                emotional_regulation=random.randint(1, 4),
                language_fluency=random.randint(1, 3),
                cultural_adaptation=random.randint(1, 3),
            )
            base_ipi = calculate_ipi(base_dims)["ipi"] or 0
            baseline = BaselineAssessment(
                participant_id=participant.id,
                program_id=program.id,
                assessed_by=professionals[idx % 2].id,
                assessment_date=date.today() - timedelta(days=170),
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
            )
            db.add(baseline)

            # Two periodic assessment points — M3 and M6
            for offset, period in [(90, "M3"), (0, "M6")]:
                drift = 1 if idx % 10 < 7 else 0
                current_dims = DimensionScores(
                    reading_level=random_score(base_dims.reading_level or 2, drift),
                    math_level=random_score(base_dims.math_level or 2, drift),
                    comprehension_level=random_score(base_dims.comprehension_level or 2, drift),
                    attention_level=random_score(base_dims.attention_level or 2, drift),
                    memory_level=random_score(base_dims.memory_level or 2, drift),
                    autonomy_level=random_score(base_dims.autonomy_level or 2, drift),
                    peer_interaction=random_score(base_dims.peer_interaction or 2, drift),
                    group_work=random_score(base_dims.group_work or 2, drift),
                    emotional_regulation=random_score(base_dims.emotional_regulation or 2, drift),
                    language_fluency=random_score(base_dims.language_fluency or 2, drift),
                    cultural_adaptation=random_score(base_dims.cultural_adaptation or 2, drift),
                )
                ipi = calculate_ipi(current_dims)["ipi"] or 0
                delta = calculate_relative_improvement(base_ipi or 1, ipi)
                risk = calculate_risk_score(
                    attendance_rate_last_30d=random.uniform(0.65, 0.98),
                    attendance_rate_prev_30d=random.uniform(0.65, 0.98),
                    ipi_delta_last_period=delta["relative_delta_pct"],
                    days_since_last_session=random.randint(1, 30),
                    micro_goals_completion_rate=random.uniform(0.2, 0.95),
                    num_unjustified_absences_last_30d=random.randint(0, 4),
                    avg_mood_last_5_sessions=random.uniform(2.2, 4.8),
                    weeks_in_program=24,
                )
                pa = PeriodicAssessment(
                    participant_id=participant.id,
                    program_id=program.id,
                    assessed_by=professionals[idx % 2].id,
                    assessment_date=date.today() - timedelta(days=offset),
                    period_label=f"{period}-2026",
                    reading_level=current_dims.reading_level,
                    math_level=current_dims.math_level,
                    comprehension_level=current_dims.comprehension_level,
                    attention_level=current_dims.attention_level,
                    memory_level=current_dims.memory_level,
                    autonomy_level=current_dims.autonomy_level,
                    peer_interaction=current_dims.peer_interaction,
                    group_work=current_dims.group_work,
                    emotional_regulation=current_dims.emotional_regulation,
                    language_fluency=current_dims.language_fluency,
                    cultural_adaptation=current_dims.cultural_adaptation,
                    ipi_score=ipi,
                    ipi_delta_vs_baseline=delta["relative_delta_pct"],
                    ipi_delta_vs_previous=delta["relative_delta_pct"],
                    predicted_next_ipi=min(100, ipi + random.uniform(1, 8)),
                    risk_score=risk["risk_score"],
                    risk_level=risk["risk_level"],
                )
                db.add(pa)

        await db.flush()

        # ── Sessions + Observations ───────────────────────────────────
        # 2 sessions per week over last 6 months → ~48 sessions per program
        sessions_created: list[Session] = []
        for prog_idx, program in enumerate(programs):
            prog_participants = [p for i, p in enumerate(participants) if i % 2 == prog_idx]
            for week in range(24):  # 24 weeks
                for day_offset in [0, 3]:  # Mon + Thu
                    session_date = date.today() - timedelta(weeks=week, days=day_offset)
                    prof = professionals[week % 2]
                    session_type = random.choice(SESSION_TYPES)
                    sess = Session(
                        program_id=program.id,
                        professional_id=prof.id,
                        session_date=session_date,
                        session_type=session_type,
                        duration_minutes=random.choice([60, 90, 90, 120]),
                        notes=f"Sessió {session_type} del {session_date}. Bona participació general.",
                        notes_sentiment=random.uniform(0.3, 0.9),
                    )
                    db.add(sess)
                    sessions_created.append(sess)

        await db.flush()

        # Assign observations to sessions
        obs_count = 0
        for sess in sessions_created:
            prog_participants = [p for i, p in enumerate(participants)
                                 if (i % 2) == programs.index(
                                     next(pr for pr in programs if pr.id == sess.program_id)
                                 )]
            # 8-15 participants per group session, 1 for individual
            n_obs = 1 if sess.session_type == "individual" else min(len(prog_participants), random.randint(8, 15))
            sampled = random.sample(prog_participants, min(n_obs, len(prog_participants)))
            seen_participants: set[str] = set()
            for participant in sampled:
                if participant.id in seen_participants:
                    continue
                seen_participants.add(participant.id)
                obs = SessionObservation(
                    session_id=sess.id,
                    participant_id=participant.id,
                    academic_score=random.choice([None, random.randint(1, 5)]),
                    cognitive_score=random.choice([None, random.randint(1, 5)]),
                    social_score=random.randint(1, 5),
                    integration_score=random.choice([None, random.randint(1, 5)]),
                    mood_indicator=random.choice(MOODS),
                    qualitative_note=random.choice([
                        None, None,
                        "Molt participatiu avui, ha ajudat els companys.",
                        "Ha mostrat millora en la comprensió lectora.",
                        "Necessita suport addicional en matemàtiques.",
                        "Excel·lent actitud i concentració durant tota la sessió.",
                        "Ha tingut dificultats per mantenir l'atenció avui.",
                    ]),
                )
                db.add(obs)
                obs_count += 1

        # ── Micro-goal completions ────────────────────────────────────
        for goal in program_goals:
            prog_participants = [p for i, p in enumerate(participants)
                                 if (i % 2) == programs.index(
                                     next(pr for pr in programs if pr.id == goal.program_id)
                                 )]
            # ~40% completion rate
            completers = random.sample(prog_participants, max(1, int(len(prog_participants) * 0.4)))
            for participant in completers[:random.randint(2, min(8, len(completers)))]:
                completion = ProgramMicroGoalCompletion(
                    program_micro_goal_id=goal.id,
                    completed_at=datetime.now() - timedelta(days=random.randint(1, 60)),
                    verified_by=coord_user.id,
                    note="Completat satisfactòriament.",
                )
                db.add(completion)

        await db.commit()

        print("=" * 50)
        print("ImpactFlow demo seed created successfully")
        print("=" * 50)
        print(f"  Organisation: Narinan (pro)")
        print(f"  Participants: {len(participants)} (50)")
        print(f"  Programs:     {len(programs)} (Reforç Escolar + Teatre Social)")
        print(f"  Sessions:     {len(sessions_created)}")
        print(f"  Observations: {obs_count}")
        print(f"  Micro-goals:  {len(program_goals)}")
        print()
        print("Demo users:")
        print("  coord1@impactflow.dev  / coord123  [Coordinadora]")
        print("  prof1@impactflow.dev   / prof123   [Professional]")
        print("  donor@impactflow.dev   / donor123  [Donant]")
        print("  admin@impactflow.dev   / admin123  [Admin]")
        print("=" * 50)


if __name__ == "__main__":
    asyncio.run(seed())
