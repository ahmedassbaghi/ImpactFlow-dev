import asyncio
import random
from datetime import date, timedelta

from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.algorithms.ipi import DimensionScores, calculate_ipi, calculate_relative_improvement
from app.algorithms.risk_engine import calculate_risk_score
from app.database import Base, SessionLocal, engine
from app.models import (
    BaselineAssessment,
    Organization,
    Participant,
    PeriodicAssessment,
    Program,
    User,
)
from app.utils.auth import get_password_hash


NATIONALITIES = ["Marruecos", "Pakistan", "Cataluna", "Siria", "Honduras", "Senegal"]


async def cleanup(db: AsyncSession) -> None:
    for model in [PeriodicAssessment, BaselineAssessment, Participant, Program, User, Organization]:
        await db.execute(delete(model))
    await db.commit()


def random_score(base: int, drift: int = 0) -> int:
    return max(1, min(5, base + drift + random.choice([-1, 0, 0, 1])))


async def seed() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with SessionLocal() as db:
        await cleanup(db)
        org = Organization(name="Narinan", slug="narinan", plan="pro")
        db.add(org)
        await db.flush()

        users = [
            User(
                organization_id=org.id,
                email="admin@impactflow.dev",
                hashed_password=get_password_hash("admin123"),
                full_name="Admin Demo",
                role="admin",
            ),
            User(
                organization_id=org.id,
                email="coord1@impactflow.dev",
                hashed_password=get_password_hash("coord123"),
                full_name="Coordinator One",
                role="coordinator",
            ),
            User(
                organization_id=org.id,
                email="prof1@impactflow.dev",
                hashed_password=get_password_hash("prof123"),
                full_name="Professional One",
                role="professional",
            ),
            User(
                organization_id=org.id,
                email="donor@impactflow.dev",
                hashed_password=get_password_hash("donor123"),
                full_name="Donor Viewer",
                role="donor",
            ),
        ]
        db.add_all(users)
        await db.flush()

        programs = [
            Program(
                organization_id=org.id,
                name="Reforc escolar",
                description="Programa de suport academic",
                program_type="academic_support",
                start_date=date.today() - timedelta(days=180),
            ),
            Program(
                organization_id=org.id,
                name="Teatre Social",
                description="Programa de desenvolupament social",
                program_type="theater",
                start_date=date.today() - timedelta(days=180),
            ),
        ]
        db.add_all(programs)
        await db.flush()

        participants: list[Participant] = []
        for i in range(1, 51):
            p = Participant(
                organization_id=org.id,
                code=f"NRN-2024-{i:03d}",
                first_name=f"Participant-{i}",
                birth_year=random.randint(2012, 2020),
                gender=random.choice(["M", "F", "NB", "unknown"]),
                nationality=random.choice(NATIONALITIES),
                enrollment_date=date.today() - timedelta(days=random.randint(90, 180)),
                consent_given=True,
                is_control_group=i % 3 == 0,
            )
            participants.append(p)
        db.add_all(participants)
        await db.flush()

        for idx, participant in enumerate(participants):
            program = programs[idx % 2]
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
                assessed_by=users[2].id,
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

            # Two periodic points to show growth trajectory
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
                    assessed_by=users[2].id,
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

        await db.commit()
        print("Demo seed created")
        print("admin@impactflow.dev / admin123")
        print("coord1@impactflow.dev / coord123")
        print("prof1@impactflow.dev / prof123")


if __name__ == "__main__":
    asyncio.run(seed())
