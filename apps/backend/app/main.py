import asyncio
import json
from datetime import date, datetime, timedelta
from typing import Any

from fastapi import Depends, FastAPI, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.websockets import WebSocket, WebSocketDisconnect
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.algorithms.dropout_model import predict_dropout_probability
from app.algorithms.effect_analysis import compute_intervention_effect
from app.algorithms.ipi import DimensionScores, calculate_ipi, calculate_relative_improvement
from app.algorithms.predictor import predict_ipi_with_uncertainty, predict_next_ipi, probability_of_reaching_target
from app.algorithms.risk_engine import calculate_risk_score
from app.algorithms.segmentation import cluster_participants, recommend_goals_for_cluster
from app.algorithms.dimension_effects import compute_dimension_effects
from app.algorithms.dose_response import fit_dose_response
from app.algorithms.monte_carlo_sroi import monte_carlo_sroi
from app.algorithms.sroi_engine import calculate_sroi
from app.analytics.anomaly_detection import detect_program_anomalies
from app.analytics.cohort_analysis import (
    compute_cohort_trajectories,
    compute_retention_by_cohort,
    dimension_velocity_analysis,
)
from app.analytics.reliability import compute_inter_rater_reliability
from app.config import get_settings
from app.database import Base, engine, get_db
from app.migrations.migrate_v2 import run_migrations
from app.models import (
    AttendanceRecord,
    BaselineAssessment,
    MicroGoal,
    Organization,
    Participant,
    PeriodicAssessment,
    Program,
    ProgramEnrollment,
    ProgramMicroGoal,
    ProgramMicroGoalCompletion,
    Report,
    School,
    Session,
    SessionActivityTag,
    SessionActivityTagLink,
    SessionGoalProgress,
    SessionObservation,
    User,
    UserParticipantAssignment,
)
from app.routes.auth import router as auth_router
from app.routes.data_simulation import router as simulation_router
from app.routes.schools_and_assignments import router as schools_router
from app.routes.schools_and_assignments import compute_ngo_sroi_calculator, compute_sroi_for_program
from app.schemas.api import (
    AssessmentInput,
    UserActivateRequest,
    IndividualMicroGoalCreate,
    IndividualMicroGoalOut,
    MicroGoalCreate,
    MicroGoalOut,
    ParseNoteRequest,
    PlanUpdateRequest,
    LandingContentUpdate,
    ParticipantCreate,
    ParticipantEnrollIn,
    ParticipantOut,
    ParticipantUpdate,
    ProgramCreate,
    ProgramOut,
    ReportListItem,
    ReportRequest,
    ReportStatus,
    SessionActivityTagCreate,
    SessionActivityTagOut,
    SessionActivityTagUpdate,
    SessionCreate,
    SessionGoalProgressOut,
    SessionObservationOut,
    SessionListOut,
    SessionOut,
    SessionParticipantBrief,
    UserCreateRequest,
    UserOut,
)
from app.services.nlp_service import parse_qualitative_note
from app.services.report_generator import generate_quarterly_report, get_session_quality_summary
from app.services.session_analytics_service import build_participant_feature_bundle
from app.utils.auth import get_password_hash
from app.utils.deps import get_current_user, require_roles
from app.utils.participant_code import next_participant_code
from app.utils.access_control import (
    assign_participant_to_professional,
    assert_professional_assigned,
    ensure_participant_access,
    get_org_participant,
    get_org_program,
)
from app.utils.participant_metrics import (
    build_evolution_payload,
    get_participant_session_context,
    latest_periodic_by_participant,
    resolve_periodic_timeline,
    upsert_periodic_from_observation,
)
from app.utils.participants import participant_to_out, participants_to_out_list

settings = get_settings()

app = FastAPI(
    title="ImpactFlow API",
    description="De l'activitat a l'impacte. Medición de impacto social para ONG y entidades educativas.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    await run_migrations(engine)


app.include_router(auth_router)
app.include_router(schools_router)
app.include_router(simulation_router)


@app.get("/")
def read_root():
    return {"status": "ok", "message": "Welcome to ImpactFlow API"}

@app.get("/api/v1/health")
def health_check():
    return {"status": "healthy"}


@app.get(f"{settings.api_prefix}/users", response_model=list[UserOut])
async def list_users(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("admin", "coordinator")),
) -> list[UserOut]:
    result = await db.execute(select(User).where(User.organization_id == current_user.organization_id))
    return list(result.scalars().all())


@app.post(f"{settings.api_prefix}/users", response_model=UserOut)
async def create_user(
    payload: UserCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("admin", "coordinator")),
) -> UserOut:
    username = (payload.username or payload.email.split("@")[0]).strip().lower()
    existing = await db.execute(
        select(User).where(
            User.organization_id == current_user.organization_id,
            User.username == username,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Nom d'usuari ja en ús")

    user = User(
        organization_id=current_user.organization_id,
        email=str(payload.email).lower(),
        username=username,
        hashed_password=get_password_hash(payload.password),
        full_name=payload.full_name,
        role=payload.role,
        is_active=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@app.patch(f"{settings.api_prefix}/users/{{user_id}}/activate", response_model=UserOut)
async def activate_user(
    user_id: str,
    payload: UserActivateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("admin", "coordinator")),
) -> UserOut:
    result = await db.execute(
        select(User).where(
            User.id == user_id,
            User.organization_id == current_user.organization_id,
        )
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuari no trobat")

    user.role = payload.role
    user.is_active = payload.is_active
    await db.commit()
    await db.refresh(user)
    return user


@app.get(f"{settings.api_prefix}/organizations/me/plan")
async def get_organization_plan(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Organization).where(Organization.id == current_user.organization_id))
    org = result.scalar_one_or_none()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    return {"organization_id": org.id, "name": org.name, "plan": org.plan}


@app.patch(f"{settings.api_prefix}/organizations/me/plan")
async def update_organization_plan(
    payload: PlanUpdateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("admin", "coordinator")),
):
    result = await db.execute(select(Organization).where(Organization.id == current_user.organization_id))
    org = result.scalar_one_or_none()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    org.plan = payload.plan
    await db.commit()
    await db.refresh(org)
    return {"organization_id": org.id, "name": org.name, "plan": org.plan}


@app.get(f"{settings.api_prefix}/programs", response_model=list[ProgramOut])
async def list_programs(
    active_only: bool = True,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[ProgramOut]:
    query = select(Program).where(Program.organization_id == current_user.organization_id)
    if active_only:
        query = query.where(Program.active.is_(True))
    result = await db.execute(query.order_by(Program.name.asc()))
    return list(result.scalars().all())


@app.post(f"{settings.api_prefix}/programs", response_model=ProgramOut)
async def create_program(
    payload: ProgramCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("admin", "coordinator")),
) -> ProgramOut:
    program = Program(
        organization_id=current_user.organization_id,
        name=payload.name,
        description=payload.description,
        program_type=payload.program_type,
        start_date=payload.start_date,
        end_date=payload.end_date,
    )
    db.add(program)
    await db.commit()
    await db.refresh(program)
    return program


@app.get(f"{settings.api_prefix}/programs/{{program_id}}", response_model=ProgramOut)
async def get_program(
    program_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ProgramOut:
    result = await db.execute(
        select(Program).where(
            Program.id == program_id,
            Program.organization_id == current_user.organization_id,
        )
    )
    program = result.scalar_one_or_none()
    if program is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Program not found")
    return program


@app.put(f"{settings.api_prefix}/programs/{{program_id}}", response_model=ProgramOut)
async def update_program(
    program_id: str,
    payload: ProgramCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("admin", "coordinator")),
) -> ProgramOut:
    result = await db.execute(
        select(Program).where(
            Program.id == program_id,
            Program.organization_id == current_user.organization_id,
        )
    )
    program = result.scalar_one_or_none()
    if program is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Program not found")
    program.name = payload.name
    program.description = payload.description
    program.program_type = payload.program_type
    program.start_date = payload.start_date
    program.end_date = payload.end_date
    if hasattr(payload, "active"):
        program.active = payload.active
    await db.commit()
    await db.refresh(program)
    return program


@app.delete(f"{settings.api_prefix}/programs/{{program_id}}", status_code=204)
async def delete_program(
    program_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("admin", "coordinator")),
):
    result = await db.execute(
        select(Program).where(
            Program.id == program_id,
            Program.organization_id == current_user.organization_id,
        )
    )
    program = result.scalar_one_or_none()
    if program is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Program not found")
    program.active = False
    await db.commit()
    return


@app.get(f"{settings.api_prefix}/sessions", response_model=list[SessionListOut])
async def list_sessions(
    program_id: str | None = None,
    participant_id: str | None = None,
    school_id: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    limit: int = Query(default=100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[SessionListOut]:
    query = (
        select(Session)
        .join(Program, Program.id == Session.program_id)
        .where(Program.organization_id == current_user.organization_id)
    )
    if current_user.role == "professional":
        assign_q = await db.execute(
            select(UserParticipantAssignment.participant_id).where(
                UserParticipantAssignment.user_id == current_user.id
            )
        )
        assigned_ids = [r[0] for r in assign_q.all()]
        if not assigned_ids:
            return []
        obs_session_ids = select(SessionObservation.session_id).where(
            SessionObservation.participant_id.in_(assigned_ids)
        )
        query = query.where(
            (Session.professional_id == current_user.id)
            | (Session.id.in_(obs_session_ids))
        )
    if program_id:
        query = query.where(Session.program_id == program_id)
    if participant_id or school_id:
        query = query.join(SessionObservation, SessionObservation.session_id == Session.id)
        if participant_id:
            query = query.where(SessionObservation.participant_id == participant_id)
        if school_id:
            query = query.join(Participant, Participant.id == SessionObservation.participant_id).where(
                Participant.school_id == school_id
            )
    if date_from:
        query = query.where(Session.session_date >= date_from)
    if date_to:
        query = query.where(Session.session_date <= date_to)
    query = query.order_by(Session.session_date.desc(), Session.created_at.desc()).limit(limit)
    result = await db.execute(query)
    sessions = list(result.unique().scalars().all())
    if not sessions:
        return []

    session_ids = [s.id for s in sessions]
    obs_q = await db.execute(
        select(
            SessionObservation.session_id,
            Participant.id,
            Participant.first_name,
            Participant.code,
        )
        .join(Participant, Participant.id == SessionObservation.participant_id)
        .where(SessionObservation.session_id.in_(session_ids))
        .order_by(Participant.first_name)
    )
    by_session: dict[str, list[SessionParticipantBrief]] = {sid: [] for sid in session_ids}
    seen: dict[str, set[str]] = {sid: set() for sid in session_ids}
    for sid, pid, fname, code in obs_q.all():
        if pid in seen[sid]:
            continue
        seen[sid].add(pid)
        by_session[sid].append(SessionParticipantBrief(id=pid, first_name=fname, code=code))

    # Bulk-load activity tag ids per session.
    tag_q = await db.execute(
        select(SessionActivityTagLink.session_id, SessionActivityTagLink.tag_id).where(
            SessionActivityTagLink.session_id.in_(session_ids)
        )
    )
    tags_by_session: dict[str, list[str]] = {sid: [] for sid in session_ids}
    for sid, tid in tag_q.all():
        tags_by_session[sid].append(tid)

    return [
        SessionListOut(
            id=s.id,
            program_id=s.program_id,
            session_date=s.session_date,
            session_time=s.session_time,
            session_type=s.session_type,
            duration_minutes=s.duration_minutes,
            notes=s.notes,
            notes_ai_summary=s.notes_ai_summary,
            notes_sentiment=s.notes_sentiment,
            activity_tag_ids=tags_by_session.get(s.id, []),
            participants=by_session.get(s.id, []),
        )
        for s in sessions
    ]


@app.get(f"{settings.api_prefix}/participants", response_model=list[ParticipantOut])
async def list_participants(
    program_id: str | None = None,
    school_id: str | None = None,
    not_in_program: str | None = Query(None, description="Program ID — return participants not actively enrolled"),
    limit: int = Query(default=100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[ParticipantOut]:
    query = select(Participant).where(
        Participant.organization_id == current_user.organization_id,
        Participant.active == True,
    )
    if program_id:
        query = query.join(
            ProgramEnrollment, ProgramEnrollment.participant_id == Participant.id
        ).where(
            ProgramEnrollment.program_id == program_id,
            ProgramEnrollment.active == True,
        )
    if not_in_program:
        await get_org_program(db, not_in_program, current_user.organization_id)
        enrolled_subq = (
            select(ProgramEnrollment.participant_id)
            .where(
                ProgramEnrollment.program_id == not_in_program,
                ProgramEnrollment.active == True,
            )
        )
        query = query.where(Participant.id.not_in(enrolled_subq))
    if school_id:
        query = query.where(Participant.school_id == school_id)
    if current_user.role == "professional" and not not_in_program:
        assign_q = await db.execute(
            select(UserParticipantAssignment.participant_id).where(
                UserParticipantAssignment.user_id == current_user.id
            )
        )
        assigned_ids = [r[0] for r in assign_q.all()]
        if not assigned_ids:
            return []
        query = query.where(Participant.id.in_(assigned_ids))
    result = await db.execute(query.order_by(Participant.first_name).limit(limit))
    return await participants_to_out_list(db, list(result.scalars().all()))


# ── Program enrollment endpoints ──────────────────────────────────────────────

@app.get(f"{settings.api_prefix}/programs/{{program_id}}/participants", response_model=list[ParticipantOut])
async def list_program_participants(
    program_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[ParticipantOut]:
    query = (
        select(Participant)
        .join(ProgramEnrollment, ProgramEnrollment.participant_id == Participant.id)
        .where(
            ProgramEnrollment.program_id == program_id,
            ProgramEnrollment.active == True,
            Participant.organization_id == current_user.organization_id,
        )
    )
    if current_user.role == "professional":
        assign_q = await db.execute(
            select(UserParticipantAssignment.participant_id).where(
                UserParticipantAssignment.user_id == current_user.id
            )
        )
        assigned_ids = [r[0] for r in assign_q.all()]
        if assigned_ids:
            query = query.where(Participant.id.in_(assigned_ids))
        else:
            return []
    result = await db.execute(query)
    return await participants_to_out_list(db, list(result.scalars().all()))


@app.post(f"{settings.api_prefix}/programs/{{program_id}}/participants")
async def enroll_participant(
    program_id: str,
    payload: ParticipantEnrollIn,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("admin", "coordinator", "professional")),
):
    await get_org_program(db, program_id, current_user.organization_id)
    participant = await get_org_participant(
        db, payload.participant_id, current_user.organization_id
    )
    existing = await db.execute(
        select(ProgramEnrollment).where(
            ProgramEnrollment.program_id == program_id,
            ProgramEnrollment.participant_id == payload.participant_id,
        )
    )
    enroll = existing.scalar_one_or_none()
    if enroll:
        enroll.active = True
    else:
        db.add(ProgramEnrollment(
            program_id=program_id,
            participant_id=payload.participant_id,
            enrolled_at=date.today(),
            active=True,
        ))
    if current_user.role == "professional":
        await assign_participant_to_professional(db, current_user.id, participant.id)
    await db.commit()
    return {"enrolled": True}


@app.get(f"{settings.api_prefix}/participants/{{participant_id}}/programs", response_model=list[ProgramOut])
async def list_participant_programs(
    participant_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[ProgramOut]:
    result = await db.execute(
        select(Program)
        .join(ProgramEnrollment, ProgramEnrollment.program_id == Program.id)
        .where(
            ProgramEnrollment.participant_id == participant_id,
            ProgramEnrollment.active == True,
            Program.organization_id == current_user.organization_id,
        )
    )
    return list(result.scalars().all())


@app.delete(f"{settings.api_prefix}/programs/{{program_id}}/participants/{{participant_id}}")
async def unenroll_participant(
    program_id: str,
    participant_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("admin", "coordinator", "professional")),
):
    await get_org_program(db, program_id, current_user.organization_id)
    await ensure_participant_access(db, current_user, participant_id)
    result = await db.execute(
        select(ProgramEnrollment).where(
            ProgramEnrollment.program_id == program_id,
            ProgramEnrollment.participant_id == participant_id,
        )
    )
    enroll = result.scalar_one_or_none()
    if enroll:
        enroll.active = False
        await db.commit()
    return {"unenrolled": True}


@app.post(f"{settings.api_prefix}/participants", response_model=ParticipantOut)
async def create_participant(
    payload: ParticipantCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("admin", "coordinator")),
) -> ParticipantOut:
    school_q = await db.execute(
        select(School).where(
            School.id == payload.school_id,
            School.organization_id == current_user.organization_id,
        )
    )
    school = school_q.scalar_one_or_none()
    if not school:
        raise HTTPException(status_code=404, detail="School not found")

    code = payload.code
    if not code:
        code = await next_participant_code(db, current_user.organization_id, payload.school_id)

    participant = Participant(
        organization_id=current_user.organization_id,
        school_id=payload.school_id,
        code=code,
        first_name=payload.first_name,
        birth_year=payload.birth_year,
        gender=payload.gender,
        nationality=payload.nationality,
        enrollment_date=payload.enrollment_date,
        consent_given=payload.consent_given,
        is_control_group=payload.is_control_group,
    )
    db.add(participant)
    await db.flush()
    if payload.program_id:
        await get_org_program(db, payload.program_id, current_user.organization_id)
        db.add(
            ProgramEnrollment(
                program_id=payload.program_id,
                participant_id=participant.id,
                enrolled_at=payload.enrollment_date,
                active=True,
            )
        )
    if current_user.role == "professional":
        await assign_participant_to_professional(db, current_user.id, participant.id)
    await db.commit()
    await db.refresh(participant)
    return participant_to_out(participant, school)


@app.get(f"{settings.api_prefix}/participants/{{participant_id}}", response_model=ParticipantOut)
async def get_participant(
    participant_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ParticipantOut:
    result = await db.execute(
        select(Participant, School)
        .join(School, Participant.school_id == School.id)
        .where(
            Participant.id == participant_id,
            Participant.organization_id == current_user.organization_id,
        )
    )
    row = result.one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Participant not found")
    participant, school = row
    await assert_professional_assigned(db, current_user, participant_id)
    return participant_to_out(participant, school)


@app.patch(f"{settings.api_prefix}/participants/{{participant_id}}", response_model=ParticipantOut)
async def update_participant(
    participant_id: str,
    payload: ParticipantUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("admin", "coordinator")),
) -> ParticipantOut:
    result = await db.execute(
        select(Participant).where(
            Participant.id == participant_id,
            Participant.organization_id == current_user.organization_id,
        )
    )
    participant = result.scalar_one_or_none()
    if not participant:
        raise HTTPException(status_code=404, detail="Participant not found")
    school = None
    if payload.school_id is not None:
        school_q = await db.execute(
            select(School).where(
                School.id == payload.school_id,
                School.organization_id == current_user.organization_id,
            )
        )
        school = school_q.scalar_one_or_none()
        if not school:
            raise HTTPException(status_code=404, detail="School not found")
        participant.school_id = payload.school_id
    if payload.first_name is not None:
        participant.first_name = payload.first_name
    if payload.code is not None:
        participant.code = payload.code
    if payload.birth_year is not None:
        participant.birth_year = payload.birth_year
    if payload.gender is not None:
        participant.gender = payload.gender
    if payload.nationality is not None:
        participant.nationality = payload.nationality
    if payload.active is not None:
        participant.active = payload.active
    await db.commit()
    await db.refresh(participant)
    if school is None:
        school_q = await db.execute(select(School).where(School.id == participant.school_id))
        school = school_q.scalar_one_or_none()
    return participant_to_out(participant, school)


@app.post(f"{settings.api_prefix}/participants/{{participant_id}}/baseline")
async def create_baseline_assessment(
    participant_id: str,
    payload: AssessmentInput,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("admin", "coordinator", "professional")),
):
    scores = DimensionScores(
        reading_level=payload.reading_level,
        math_level=payload.math_level,
        comprehension_level=payload.comprehension_level,
        attention_level=payload.attention_level,
        memory_level=payload.memory_level,
        autonomy_level=payload.autonomy_level,
        peer_interaction=payload.peer_interaction,
        group_work=payload.group_work,
        emotional_regulation=payload.emotional_regulation,
        language_fluency=payload.language_fluency,
        cultural_adaptation=payload.cultural_adaptation,
    )
    ipi_result = calculate_ipi(scores)
    baseline = BaselineAssessment(
        participant_id=participant_id,
        program_id=payload.program_id,
        assessed_by=current_user.id,
        assessment_date=payload.assessment_date,
        reading_level=payload.reading_level,
        math_level=payload.math_level,
        comprehension_level=payload.comprehension_level,
        attention_level=payload.attention_level,
        memory_level=payload.memory_level,
        autonomy_level=payload.autonomy_level,
        peer_interaction=payload.peer_interaction,
        group_work=payload.group_work,
        emotional_regulation=payload.emotional_regulation,
        language_fluency=payload.language_fluency,
        cultural_adaptation=payload.cultural_adaptation,
        ipi_baseline=ipi_result["ipi"],
        notes=payload.notes,
    )
    db.add(baseline)
    await db.commit()
    await db.refresh(baseline)
    return {"id": baseline.id, "ipi_baseline": baseline.ipi_baseline, "dimensions": ipi_result["dimensions"]}


@app.get(f"{settings.api_prefix}/participants/{{participant_id}}/session-context")
async def participant_session_context(
    participant_id: str,
    program_id: str = Query(...),
    session_date: date | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """IPI i dimensions de referència per mostrar evolució al registre de sessió."""
    await ensure_participant_access(db, current_user, participant_id)
    await get_org_program(db, program_id, current_user.organization_id)
    return await get_participant_session_context(
        db,
        participant_id=participant_id,
        program_id=program_id,
        reference_date=session_date or date.today(),
    )


@app.get(f"{settings.api_prefix}/participants/{{participant_id}}/evolution")
async def participant_evolution(
    participant_id: str,
    program_id: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    row_q = await db.execute(
        select(Participant, School)
        .join(School, Participant.school_id == School.id)
        .where(
            Participant.id == participant_id,
            Participant.organization_id == current_user.organization_id,
        )
    )
    row = row_q.one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Participant not found")
    participant, school = row
    await assert_professional_assigned(db, current_user, participant_id)

    resolved_program_id = program_id
    if not resolved_program_id:
        latest_pa_q = await db.execute(
            select(PeriodicAssessment.program_id)
            .where(PeriodicAssessment.participant_id == participant_id)
            .order_by(PeriodicAssessment.assessment_date.desc())
            .limit(1)
        )
        resolved_program_id = latest_pa_q.scalar_one_or_none()
        if not resolved_program_id:
            enroll_q = await db.execute(
                select(ProgramEnrollment.program_id)
                .where(
                    ProgramEnrollment.participant_id == participant_id,
                    ProgramEnrollment.active.is_(True),
                )
                .limit(1)
            )
            resolved_program_id = enroll_q.scalar_one_or_none()

    baseline = None
    if resolved_program_id:
        baseline_q = await db.execute(
            select(BaselineAssessment).where(
                BaselineAssessment.participant_id == participant_id,
                BaselineAssessment.program_id == resolved_program_id,
            )
        )
        baseline = baseline_q.scalar_one_or_none()
    else:
        baseline_q = await db.execute(
            select(BaselineAssessment)
            .where(BaselineAssessment.participant_id == participant_id)
            .limit(1)
        )
        baseline = baseline_q.scalar_one_or_none()
        if baseline:
            resolved_program_id = baseline.program_id

    periodic_stmt = (
        select(PeriodicAssessment)
        .where(PeriodicAssessment.participant_id == participant_id)
        .order_by(PeriodicAssessment.assessment_date)
    )
    if resolved_program_id:
        periodic_stmt = periodic_stmt.where(PeriodicAssessment.program_id == resolved_program_id)
    periodic_q = await db.execute(periodic_stmt)
    periodic = list(periodic_q.scalars().all())

    return build_evolution_payload(
        participant_id=participant_id,
        code=participant.code,
        first_name=participant.first_name,
        school_abbreviation=school.abbreviation,
        school_name=school.name,
        enrollment_date=participant.enrollment_date,
        program_id=resolved_program_id,
        baseline=baseline,
        periodic=periodic,
    )


@app.get(f"{settings.api_prefix}/participants/{{participant_id}}/risk")
async def participant_risk(
    participant_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    last_assess = await db.execute(
        select(PeriodicAssessment)
        .where(PeriodicAssessment.participant_id == participant_id)
        .order_by(PeriodicAssessment.assessment_date.desc())
        .limit(1)
    )
    assessment = last_assess.scalar_one_or_none()
    if not assessment:
        return {"risk_score": 0.2, "risk_level": "medium", "contributing_factors": ["insufficient_data"]}
    return {
        "risk_score": assessment.risk_score,
        "risk_level": assessment.risk_level,
        "contributing_factors": [],
    }


@app.post(f"{settings.api_prefix}/sessions", response_model=SessionOut)
async def create_session(
    payload: SessionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("admin", "coordinator", "professional")),
) -> SessionOut:
    parsed = await parse_qualitative_note(payload.notes or "")
    session = Session(
        program_id=payload.program_id,
        professional_id=current_user.id,
        session_date=payload.session_date,
        session_time=payload.session_time,
        session_type=payload.session_type,
        duration_minutes=payload.duration_minutes,
        notes=payload.notes,
        notes_ai_summary=parsed.get("summary"),
        notes_sentiment=parsed.get("sentiment_score"),
    )
    db.add(session)
    await db.flush()

    # ── Activity tag links (validated against the user's organization) ───────
    if payload.activity_tag_ids:
        valid_tags_q = await db.execute(
            select(SessionActivityTag.id).where(
                SessionActivityTag.id.in_(payload.activity_tag_ids),
                SessionActivityTag.organization_id == current_user.organization_id,
            )
        )
        valid_tag_ids = {row[0] for row in valid_tags_q.all()}
        for tag_id in payload.activity_tag_ids:
            if tag_id in valid_tag_ids:
                db.add(SessionActivityTagLink(session_id=session.id, tag_id=tag_id))

    for obs in payload.observations:
        parsed_note = await parse_qualitative_note(obs.qualitative_note or "")
        observation = SessionObservation(
            session_id=session.id,
            participant_id=obs.participant_id,
            academic_score=obs.academic_score,
            cognitive_score=obs.cognitive_score,
            social_score=obs.social_score,
            integration_score=obs.integration_score,
            qualitative_note=obs.qualitative_note,
            qualitative_note_parsed_tags=json.dumps(parsed_note.get("tags", [])),
            mood_indicator=obs.mood_indicator,
            arrival_mood=obs.arrival_mood,
            departure_mood=obs.departure_mood,
            verbal_participation=obs.verbal_participation,
            time_on_task_pct=obs.time_on_task_pct,
            flag_alert=obs.flag_alert,
            self_eval_emoji=obs.self_eval_emoji,
            volunteer_progress_sense=obs.volunteer_progress_sense,
        )
        db.add(observation)
        await db.flush()  # need observation.id for goal_progress FK

        # Per-goal GAS progress entries (only for goals belonging to this participant + program).
        if obs.goal_progress:
            goal_ids = [gp.micro_goal_id for gp in obs.goal_progress]
            owned_q = await db.execute(
                select(MicroGoal.id).where(
                    MicroGoal.id.in_(goal_ids),
                    MicroGoal.participant_id == obs.participant_id,
                    MicroGoal.program_id == payload.program_id,
                )
            )
            owned_ids = {row[0] for row in owned_q.all()}
            for gp in obs.goal_progress:
                if gp.micro_goal_id not in owned_ids:
                    continue
                db.add(
                    SessionGoalProgress(
                        session_observation_id=observation.id,
                        micro_goal_id=gp.micro_goal_id,
                        progress=gp.progress,
                        note=gp.note,
                    )
                )

        db.add(
            AttendanceRecord(
                participant_id=obs.participant_id,
                program_id=payload.program_id,
                session_id=session.id,
                date=payload.session_date,
                status=obs.attendance_status,
            )
        )
    for item in payload.micro_goal_completions:
        goal_q = await db.execute(select(ProgramMicroGoal).where(ProgramMicroGoal.id == item.goal_id))
        goal = goal_q.scalar_one_or_none()
        if not goal or goal.program_id != payload.program_id:
            continue

        existing_q = await db.execute(
            select(ProgramMicroGoalCompletion).where(
                ProgramMicroGoalCompletion.program_micro_goal_id == item.goal_id,
                ProgramMicroGoalCompletion.session_id == session.id,
            )
        )
        if existing_q.scalar_one_or_none():
            continue

        db.add(
            ProgramMicroGoalCompletion(
                program_micro_goal_id=item.goal_id,
                session_id=session.id,
                verified_by=current_user.id,
                note=item.note,
            )
        )

    # ── Auto-enroll + auto PeriodicAssessment from session observations ────────
    for obs in payload.observations:
        scores = [obs.academic_score, obs.cognitive_score, obs.social_score, obs.integration_score]
        has_ipi_signal = (
            any(s is not None for s in scores)
            or bool(obs.goal_progress)
            or obs.volunteer_progress_sense
            or obs.verbal_participation is not None
            or obs.time_on_task_pct is not None
        )
        if not has_ipi_signal:
            continue

        # Auto-enroll participant in program if not already enrolled
        enroll_q = await db.execute(
            select(ProgramEnrollment).where(
                ProgramEnrollment.program_id == payload.program_id,
                ProgramEnrollment.participant_id == obs.participant_id,
            )
        )
        if not enroll_q.scalar_one_or_none():
            db.add(ProgramEnrollment(
                program_id=payload.program_id,
                participant_id=obs.participant_id,
                enrolled_at=payload.session_date,
                active=True,
            ))

        await upsert_periodic_from_observation(
            db,
            obs=obs,
            program_id=payload.program_id,
            session_date=payload.session_date,
            assessed_by=current_user.id,
        )

    await db.commit()
    await db.refresh(session)
    tag_q = await db.execute(
        select(SessionActivityTagLink.tag_id).where(
            SessionActivityTagLink.session_id == session.id
        )
    )
    tag_ids = [row[0] for row in tag_q.all()]
    return SessionOut(
        id=session.id,
        program_id=session.program_id,
        session_date=session.session_date,
        session_time=session.session_time,
        session_type=session.session_type,
        duration_minutes=session.duration_minutes,
        notes=session.notes,
        notes_ai_summary=session.notes_ai_summary,
        notes_sentiment=session.notes_sentiment,
        activity_tag_ids=tag_ids,
    )


@app.get(f"{settings.api_prefix}/sessions/{{session_id}}", response_model=SessionOut)
async def get_session(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SessionOut:
    result = await db.execute(select(Session).where(Session.id == session_id))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    tag_q = await db.execute(
        select(SessionActivityTagLink.tag_id).where(SessionActivityTagLink.session_id == session_id)
    )
    return SessionOut(
        id=session.id,
        program_id=session.program_id,
        session_date=session.session_date,
        session_time=session.session_time,
        session_type=session.session_type,
        duration_minutes=session.duration_minutes,
        notes=session.notes,
        notes_ai_summary=session.notes_ai_summary,
        notes_sentiment=session.notes_sentiment,
        activity_tag_ids=[row[0] for row in tag_q.all()],
    )


@app.get(f"{settings.api_prefix}/sessions/{{session_id}}/observations", response_model=list[SessionObservationOut])
async def get_session_observations(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[SessionObservationOut]:
    result = await db.execute(
        select(SessionObservation).where(SessionObservation.session_id == session_id)
    )
    observations = list(result.scalars().all())
    if not observations:
        return []
    obs_ids = [o.id for o in observations]
    gp_q = await db.execute(
        select(SessionGoalProgress).where(SessionGoalProgress.session_observation_id.in_(obs_ids))
    )
    progress_by_obs: dict[str, list[SessionGoalProgressOut]] = {oid: [] for oid in obs_ids}
    for gp in gp_q.scalars().all():
        progress_by_obs[gp.session_observation_id].append(
            SessionGoalProgressOut(
                micro_goal_id=gp.micro_goal_id,
                progress=gp.progress,
                note=gp.note,
            )
        )
    return [
        SessionObservationOut(
            id=o.id,
            participant_id=o.participant_id,
            academic_score=o.academic_score,
            cognitive_score=o.cognitive_score,
            social_score=o.social_score,
            integration_score=o.integration_score,
            qualitative_note=o.qualitative_note,
            mood_indicator=o.mood_indicator,
            arrival_mood=o.arrival_mood,
            departure_mood=o.departure_mood,
            verbal_participation=o.verbal_participation,
            time_on_task_pct=o.time_on_task_pct,
            flag_alert=bool(o.flag_alert),
            self_eval_emoji=o.self_eval_emoji,
            goal_progress=progress_by_obs.get(o.id, []),
        )
        for o in observations
    ]


@app.patch(f"{settings.api_prefix}/sessions/{{session_id}}/observations")
async def patch_session_observations(
    session_id: str,
    observations: list[dict[str, Any]],
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("admin", "coordinator", "professional")),
):
    for obs in observations:
        record_q = await db.execute(
            select(SessionObservation).where(
                SessionObservation.session_id == session_id,
                SessionObservation.participant_id == obs["participant_id"],
            )
        )
        record = record_q.scalar_one_or_none()
        if not record:
            continue
        for key in ["academic_score", "cognitive_score", "social_score", "integration_score", "qualitative_note"]:
            if key in obs:
                setattr(record, key, obs[key])
    await db.commit()
    return {"updated": len(observations)}


@app.post(f"{settings.api_prefix}/assessments/periodic")
async def create_periodic_assessment(
    payload: AssessmentInput,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("admin", "coordinator", "professional")),
):
    participant_q = await db.execute(select(Participant).where(Participant.id == payload.participant_id))
    participant = participant_q.scalar_one_or_none()
    if not participant:
        raise HTTPException(status_code=404, detail="Participant not found")

    scores = DimensionScores(
        reading_level=payload.reading_level,
        math_level=payload.math_level,
        comprehension_level=payload.comprehension_level,
        attention_level=payload.attention_level,
        memory_level=payload.memory_level,
        autonomy_level=payload.autonomy_level,
        peer_interaction=payload.peer_interaction,
        group_work=payload.group_work,
        emotional_regulation=payload.emotional_regulation,
        language_fluency=payload.language_fluency,
        cultural_adaptation=payload.cultural_adaptation,
    )
    ipi_result = calculate_ipi(scores)
    baseline_q = await db.execute(
        select(BaselineAssessment).where(
            BaselineAssessment.participant_id == payload.participant_id,
            BaselineAssessment.program_id == payload.program_id,
        )
    )
    baseline = baseline_q.scalar_one_or_none()
    baseline_ipi = baseline.ipi_baseline if baseline and baseline.ipi_baseline is not None else 0
    delta_vs_baseline = (
        calculate_relative_improvement(baseline_ipi, ipi_result["ipi"])["relative_delta_pct"]
        if ipi_result["ipi"] is not None
        else None
    )

    prev_q = await db.execute(
        select(PeriodicAssessment)
        .where(
            PeriodicAssessment.participant_id == payload.participant_id,
            PeriodicAssessment.program_id == payload.program_id,
        )
        .order_by(PeriodicAssessment.assessment_date.desc())
        .limit(1)
    )
    prev = prev_q.scalar_one_or_none()
    delta_vs_previous = (
        calculate_relative_improvement(prev.ipi_score, ipi_result["ipi"])["relative_delta_pct"]
        if prev and ipi_result["ipi"] is not None
        else None
    )

    history_q = await db.execute(
        select(PeriodicAssessment.ipi_score, PeriodicAssessment.assessment_date)
        .where(
            PeriodicAssessment.participant_id == payload.participant_id,
            PeriodicAssessment.program_id == payload.program_id,
        )
        .order_by(PeriodicAssessment.assessment_date)
    )
    historical = history_q.all()
    historical_ipis = [row[0] for row in historical] + ([ipi_result["ipi"]] if ipi_result["ipi"] else [])
    historical_dates = [row[1] for row in historical] + [payload.assessment_date]
    prediction = predict_next_ipi(historical_ipis, historical_dates)

    weeks_in_program = max(1, (payload.assessment_date - participant.enrollment_date).days // 7)
    feature_bundle = await build_participant_feature_bundle(
        db=db,
        participant_id=payload.participant_id,
        program_id=payload.program_id,
        reference_date=payload.assessment_date,
    )

    risk = calculate_risk_score(
        attendance_rate_last_30d=feature_bundle["attendance_rate_last_30d"],
        attendance_rate_prev_30d=feature_bundle["attendance_rate_prev_30d"],
        ipi_delta_last_period=delta_vs_previous,
        days_since_last_session=feature_bundle["days_since_last_session"],
        micro_goals_completion_rate=feature_bundle["micro_goals_completion_rate"],
        num_unjustified_absences_last_30d=feature_bundle["num_unjustified_absences_last_30d"],
        avg_mood_last_5_sessions=feature_bundle["avg_mood_last_5_sessions"],
        weeks_in_program=weeks_in_program,
        session_score_trend=feature_bundle["session_score_trend"],
        session_score_volatility=feature_bundle["session_score_volatility"],
        evidence_completeness=feature_bundle["evidence_completeness"],
        engagement_index=feature_bundle["engagement_index"],
        sentiment_mean_last_30d=feature_bundle["sentiment_mean_last_30d"],
    )

    item = PeriodicAssessment(
        participant_id=payload.participant_id,
        program_id=payload.program_id,
        assessed_by=current_user.id,
        assessment_date=payload.assessment_date,
        period_label=payload.period_label or f"M{payload.assessment_date.month}-{payload.assessment_date.year}",
        reading_level=payload.reading_level,
        math_level=payload.math_level,
        comprehension_level=payload.comprehension_level,
        attention_level=payload.attention_level,
        memory_level=payload.memory_level,
        autonomy_level=payload.autonomy_level,
        peer_interaction=payload.peer_interaction,
        group_work=payload.group_work,
        emotional_regulation=payload.emotional_regulation,
        language_fluency=payload.language_fluency,
        cultural_adaptation=payload.cultural_adaptation,
        ipi_score=ipi_result["ipi"] or 0,
        ipi_delta_vs_baseline=delta_vs_baseline,
        ipi_delta_vs_previous=delta_vs_previous,
        predicted_next_ipi=prediction["predicted_ipi"],
        risk_score=risk["risk_score"],
        risk_level=risk["risk_level"],
        notes=payload.notes,
    )
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return {
        "id": item.id,
        "ipi_score": item.ipi_score,
        "risk_score": item.risk_score,
        "risk_level": item.risk_level,
        "predicted_next_ipi": item.predicted_next_ipi,
        "risk_breakdown": risk.get("breakdown", {}),
        "analytics_features": feature_bundle,
    }


@app.get(f"{settings.api_prefix}/assessments/cohort-comparison")
async def cohort_comparison(
    program_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Participant.is_control_group, func.avg(PeriodicAssessment.ipi_score))
        .join(PeriodicAssessment, Participant.id == PeriodicAssessment.participant_id)
        .where(PeriodicAssessment.program_id == program_id)
        .group_by(Participant.is_control_group)
    )
    data = {("control" if k else "intervention"): round(v or 0, 1) for k, v in result.all()}
    return {"comparison": data}


@app.get(f"{settings.api_prefix}/dashboard/professional")
async def professional_dashboard(
    program_id: str | None = None,
    school_id: str | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("professional", "coordinator", "admin")),
):
    part_filters = [Participant.organization_id == current_user.organization_id, Participant.active == True]
    if school_id:
        part_filters.append(Participant.school_id == school_id)
    if current_user.role == "professional":
        assign_q = await db.execute(
            select(UserParticipantAssignment.participant_id).where(
                UserParticipantAssignment.user_id == current_user.id
            )
        )
        assigned_ids = [r[0] for r in assign_q.all()]
        if not assigned_ids:
            return {
                "my_recent_sessions": [],
                "avg_ipi": 0.0,
                "trend": [],
                "by_school": [],
                "by_program": [],
                "by_participant": [],
                "comparison": {
                    "baseline_avg": None,
                    "current_avg": None,
                    "avg_delta": None,
                    "n_with_baseline": 0,
                    "n_with_current": 0,
                    "n_improving": 0,
                    "n_declining": 0,
                    "n_stable": 0,
                },
                "n_participants": 0,
            }
        part_filters.append(Participant.id.in_(assigned_ids))

    participants_q = await db.execute(
        select(Participant, School.abbreviation)
        .join(School, Participant.school_id == School.id)
        .where(*part_filters)
    )
    participant_rows = participants_q.all()
    participants = [row[0] for row in participant_rows]
    school_abbr_by_pid = {row[0].id: row[1] for row in participant_rows}
    pids = [p.id for p in participants]

    if program_id and pids:
        enrolled_q = await db.execute(
            select(ProgramEnrollment.participant_id).where(
                ProgramEnrollment.program_id == program_id,
                ProgramEnrollment.active == True,
                ProgramEnrollment.participant_id.in_(pids),
            )
        )
        enrolled_pids = {row[0] for row in enrolled_q.all()}
        participants = [p for p in participants if p.id in enrolled_pids]
        participant_rows = [(p, school_abbr_by_pid[p.id]) for p in participants]
        school_abbr_by_pid = {p.id: abbr for p, abbr in participant_rows}
        pids = [p.id for p in participants]

    avg_ipi = 0.0
    trend: list[dict] = []
    by_school: list[dict] = []
    by_program: list[dict] = []
    by_participant: list[dict] = []
    comparison: dict[str, Any] = {
        "baseline_avg": None,
        "current_avg": None,
        "avg_delta": None,
        "n_with_baseline": 0,
        "n_with_current": 0,
        "n_improving": 0,
        "n_declining": 0,
        "n_stable": 0,
    }

    if pids and program_id:
        start_date = date.today() - timedelta(days=180)

        bl_q = await db.execute(
            select(BaselineAssessment.participant_id, BaselineAssessment.ipi_baseline).where(
                BaselineAssessment.program_id == program_id,
                BaselineAssessment.participant_id.in_(pids),
            )
        )
        baselines = {
            row[0]: float(row[1])
            for row in bl_q.all()
            if row[1] is not None
        }

        pa_q = await db.execute(
            select(PeriodicAssessment)
            .where(
                PeriodicAssessment.program_id == program_id,
                PeriodicAssessment.participant_id.in_(pids),
            )
            .order_by(
                PeriodicAssessment.participant_id,
                PeriodicAssessment.assessment_date,
            )
        )
        all_periodic = list(pa_q.scalars().all())
        latest_by_pid = latest_periodic_by_participant(all_periodic)

        canonical_currents = [
            float(pa.ipi_score) for pa in latest_by_pid.values() if pa.ipi_score is not None
        ]
        if canonical_currents:
            avg_ipi = round(sum(canonical_currents) / len(canonical_currents), 1)

        # Tendència: mitjana del grup amb una fila canònica per alumne i data
        by_date_scores: dict[date, list[float]] = {}
        by_pid_rows: dict[str, list[PeriodicAssessment]] = {}
        for row in all_periodic:
            by_pid_rows.setdefault(row.participant_id, []).append(row)
        for pid in pids:
            series = resolve_periodic_timeline(by_pid_rows.get(pid, []))
            for pa in series:
                if pa.assessment_date >= start_date and pa.ipi_score is not None:
                    by_date_scores.setdefault(pa.assessment_date, []).append(float(pa.ipi_score))
        trend = [
            {
                "period": d.isoformat(),
                "avg_ipi": round(sum(scores) / len(scores), 1),
            }
            for d, scores in sorted(by_date_scores.items())
        ]

        participant_map = {p.id: p for p in participants}
        deltas: list[float] = []
        baselines_vals: list[float] = []
        currents: list[float] = []

        for pid in pids:
            p = participant_map.get(pid)
            if not p:
                continue
            pa = latest_by_pid.get(pid)
            base = baselines.get(pid)
            current = float(pa.ipi_score) if pa and pa.ipi_score is not None else None
            delta = (
                round(current - base, 1)
                if current is not None and base is not None
                else None
            )
            if base is not None:
                baselines_vals.append(base)
                comparison["n_with_baseline"] += 1
            if current is not None:
                currents.append(current)
                comparison["n_with_current"] += 1
            if delta is not None:
                deltas.append(delta)
                if delta > 2:
                    comparison["n_improving"] += 1
                elif delta < -2:
                    comparison["n_declining"] += 1
                else:
                    comparison["n_stable"] += 1

            by_participant.append(
                {
                    "participant_id": pid,
                    "code": p.code,
                    "first_name": p.first_name,
                    "school_id": p.school_id,
                    "school_abbreviation": school_abbr_by_pid.get(pid),
                    "baseline_ipi": round(base, 1) if base is not None else None,
                    "current_ipi": round(current, 1) if current is not None else None,
                    "delta_vs_baseline": delta,
                }
            )

        by_participant.sort(
            key=lambda row: (
                row["current_ipi"] is None,
                -(row["delta_vs_baseline"] or -999),
            )
        )

        if baselines_vals:
            comparison["baseline_avg"] = round(sum(baselines_vals) / len(baselines_vals), 1)
        if currents:
            comparison["current_avg"] = round(sum(currents) / len(currents), 1)
        if deltas:
            comparison["avg_delta"] = round(sum(deltas) / len(deltas), 1)

        school_ipi: dict[str, list[float]] = {}
        for pid, pa in latest_by_pid.items():
            p = participant_map.get(pid)
            if p and pa.ipi_score is not None:
                school_ipi.setdefault(p.school_id, []).append(float(pa.ipi_score))
        if school_ipi:
            schools_q = await db.execute(
                select(School.id, School.name, School.abbreviation).where(
                    School.id.in_(list(school_ipi.keys())),
                    School.organization_id == current_user.organization_id,
                )
            )
            by_school = [
                {
                    "school_id": row[0],
                    "name": row[1],
                    "abbreviation": row[2],
                    "avg_ipi": round(sum(school_ipi[row[0]]) / len(school_ipi[row[0]]), 1),
                }
                for row in schools_q.all()
                if school_ipi.get(row[0])
            ]

    if not program_id and pids:
        programs_q = await db.execute(
            select(Program.id, Program.name, func.avg(PeriodicAssessment.ipi_score))
            .join(PeriodicAssessment, PeriodicAssessment.program_id == Program.id)
            .where(
                Program.organization_id == current_user.organization_id,
                PeriodicAssessment.participant_id.in_(pids),
            )
            .group_by(Program.id, Program.name)
        )
        by_program = [
            {"program_id": row[0], "name": row[1], "avg_ipi": round(float(row[2] or 0), 1)}
            for row in programs_q.all()
            if row[2] is not None
        ]

    recent_sessions = await db.execute(
        select(Session).where(Session.professional_id == current_user.id).order_by(Session.session_date.desc()).limit(10)
    )
    return {
        "my_recent_sessions": [s.id for s in recent_sessions.scalars().all()],
        "avg_ipi": avg_ipi,
        "trend": trend,
        "by_school": by_school,
        "by_program": by_program,
        "by_participant": by_participant,
        "comparison": comparison,
        "n_participants": len(participants),
    }


@app.get(f"{settings.api_prefix}/dashboard/coordinator")
async def coordinator_dashboard(
    period_start: date | None = None,
    period_end: date | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("coordinator", "admin")),
):
    if period_start and period_end and period_end < period_start:
        raise HTTPException(status_code=400, detail="period_end must be greater than or equal to period_start")

    last_30d = date.today() - timedelta(days=30)
    window_start = period_start or last_30d
    window_end = period_end or date.today()

    assessment_filters = [Participant.organization_id == current_user.organization_id]
    if period_start:
        assessment_filters.append(PeriodicAssessment.assessment_date >= period_start)
    if period_end:
        assessment_filters.append(PeriodicAssessment.assessment_date <= period_end)

    participants_count = await db.execute(
        select(func.count(Participant.id)).where(Participant.organization_id == current_user.organization_id)
    )
    assessments_count = await db.execute(
        select(func.count(PeriodicAssessment.id))
        .join(Participant, Participant.id == PeriodicAssessment.participant_id)
        .where(*assessment_filters)
    )
    ipi_avg = await db.execute(
        select(func.avg(PeriodicAssessment.ipi_score))
        .join(Participant, Participant.id == PeriodicAssessment.participant_id)
        .where(*assessment_filters)
    )
    risk_avg = await db.execute(
        select(func.avg(PeriodicAssessment.risk_score))
        .join(Participant, Participant.id == PeriodicAssessment.participant_id)
        .where(*assessment_filters)
    )
    low_risk = await db.execute(
        select(func.count(PeriodicAssessment.id))
        .join(Participant, Participant.id == PeriodicAssessment.participant_id)
        .where(
            *assessment_filters,
            PeriodicAssessment.risk_level == "low",
        )
    )
    medium_risk = await db.execute(
        select(func.count(PeriodicAssessment.id))
        .join(Participant, Participant.id == PeriodicAssessment.participant_id)
        .where(
            *assessment_filters,
            PeriodicAssessment.risk_level == "medium",
        )
    )
    high_risk = await db.execute(
        select(func.count(PeriodicAssessment.id))
        .join(Participant, Participant.id == PeriodicAssessment.participant_id)
        .where(
            *assessment_filters,
            PeriodicAssessment.risk_level == "high",
        )
    )
    sessions_last_30d = await db.execute(
        select(func.count(Session.id))
        .where(Session.session_date >= window_start, Session.session_date <= window_end)
        .join(Program, Program.id == Session.program_id)
        .where(Program.organization_id == current_user.organization_id)
    )
    attendance_rows = await db.execute(
        select(AttendanceRecord.status, func.count(AttendanceRecord.id))
        .join(Participant, Participant.id == AttendanceRecord.participant_id)
        .where(
            Participant.organization_id == current_user.organization_id,
            AttendanceRecord.date >= window_start,
            AttendanceRecord.date <= window_end,
        )
        .group_by(AttendanceRecord.status)
    )
    attendance_stats = {status: count for status, count in attendance_rows.all()}
    attendance_total = sum(attendance_stats.values())
    attendance_effective = attendance_stats.get("present", 0) + attendance_stats.get("late", 0)
    attendance_present_rate_last_30d = (attendance_effective / attendance_total) if attendance_total else 0

    session_obs_rows = await db.execute(
        select(
            SessionObservation.academic_score,
            SessionObservation.cognitive_score,
            SessionObservation.social_score,
            SessionObservation.integration_score,
            SessionObservation.qualitative_note,
        )
        .join(Session, Session.id == SessionObservation.session_id)
        .join(Program, Program.id == Session.program_id)
        .where(
            Program.organization_id == current_user.organization_id,
            Session.session_date >= window_start,
            Session.session_date <= window_end,
        )
    )
    session_obs = session_obs_rows.all()
    evidence_quality_flags = []
    for row in session_obs:
        score_values = [row[0], row[1], row[2], row[3]]
        filled_scores = sum(1 for v in score_values if v is not None)
        has_note = bool((row[4] or "").strip())
        evidence_quality_flags.append(1.0 if filled_scores >= 2 and has_note else 0.0)
    evidence_completeness_last_30d = (
        (sum(evidence_quality_flags) / len(evidence_quality_flags)) if evidence_quality_flags else 0
    )

    return {
        "participants_active": participants_count.scalar_one() or 0,
        "assessments_count": assessments_count.scalar_one() or 0,
        "avg_ipi": round((ipi_avg.scalar_one() or 0), 1),
        "avg_risk_score": round((risk_avg.scalar_one() or 0), 3),
        "low_risk": low_risk.scalar_one() or 0,
        "medium_risk": medium_risk.scalar_one() or 0,
        "high_risk": high_risk.scalar_one() or 0,
        "sessions_last_30d": sessions_last_30d.scalar_one() or 0,
        "attendance_present_rate_last_30d": round(attendance_present_rate_last_30d, 3),
        "evidence_completeness_last_30d": round(evidence_completeness_last_30d, 3),
    }


@app.get(f"{settings.api_prefix}/dashboard/donor/{{org_slug}}")
async def donor_dashboard(
    org_slug: str,
    program_id: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    """Enhanced donor dashboard — hero metrics, risk distribution, dimension evolution, narrative."""
    from app.services.report_generator import _get_risk_distribution

    # Resolve org
    org_q = await db.execute(select(Organization).where(Organization.slug == org_slug))
    org = org_q.scalar_one_or_none()
    org_id = org.id if org else None

    # Resolve program
    if program_id:
        prog_q = await db.execute(select(Program).where(Program.id == program_id))
    elif org_id:
        prog_q = await db.execute(
            select(Program)
            .where(Program.organization_id == org_id, Program.active.is_(True))
            .order_by(Program.start_date.desc())
        )
    else:
        prog_q = await db.execute(select(Program).where(Program.active.is_(True)).order_by(Program.start_date.desc()))

    prog = prog_q.scalar_one_or_none() if program_id else prog_q.scalars().first()
    pid = prog.id if prog else None

    # Hero: total active participants
    if pid:
        part_q = await db.execute(
            select(func.count(Participant.id))
            .join(Program, Program.id == pid)
            .where(Participant.active.is_(True))
        )
    else:
        part_q = await db.execute(select(func.count(Participant.id)).where(Participant.active.is_(True)))
    n_participants = part_q.scalar_one() or 0

    # Baseline IPI per participant
    if pid:
        baseline_q = await db.execute(
            select(
                BaselineAssessment.participant_id,
                BaselineAssessment.ipi_baseline,
                BaselineAssessment.reading_level,
                BaselineAssessment.math_level,
                BaselineAssessment.comprehension_level,
                BaselineAssessment.attention_level,
                BaselineAssessment.memory_level,
                BaselineAssessment.autonomy_level,
                BaselineAssessment.peer_interaction,
                BaselineAssessment.group_work,
                BaselineAssessment.emotional_regulation,
                BaselineAssessment.language_fluency,
                BaselineAssessment.cultural_adaptation,
            ).where(BaselineAssessment.program_id == pid)
        )
        baselines = baseline_q.all()
    else:
        baselines = []

    def _dim_avg(vals: list) -> float:
        valid = [float(v) for v in vals if v is not None]
        return (sum(valid) / len(valid) - 1) / 4 * 100 if valid else 0.0

    baseline_dims = {"academic": [], "cognitive": [], "social": [], "integration": []}
    for b in baselines:
        baseline_dims["academic"].append(_dim_avg([b.reading_level, b.math_level, b.comprehension_level]))
        baseline_dims["cognitive"].append(_dim_avg([b.attention_level, b.memory_level, b.autonomy_level]))
        baseline_dims["social"].append(_dim_avg([b.peer_interaction, b.group_work, b.emotional_regulation]))
        baseline_dims["integration"].append(_dim_avg([b.language_fluency, b.cultural_adaptation]))

    def _avg(lst):
        return round(sum(lst) / len(lst), 1) if lst else 0.0

    baseline_by_dim = {d: _avg(v) for d, v in baseline_dims.items()}

    # Latest IPI per participant + dimension scores from raw assessment fields
    if pid:
        latest_q = await db.execute(
            select(
                PeriodicAssessment.participant_id,
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
            .where(PeriodicAssessment.program_id == pid)
            .order_by(PeriodicAssessment.assessment_date.desc())
        )
        all_recent = latest_q.all()
        seen: set[str] = set()
        latest_assessments = []
        for row in all_recent:
            if row.participant_id not in seen:
                seen.add(row.participant_id)
                latest_assessments.append(row)
    else:
        latest_assessments = []

    def _pa_dim(r: Any, fields: list[str]) -> float:
        return _dim_avg([getattr(r, f, None) for f in fields])

    current_dims = {
        "academic": _avg([_pa_dim(r, ["reading_level", "math_level", "comprehension_level"]) for r in latest_assessments]),
        "cognitive": _avg([_pa_dim(r, ["attention_level", "memory_level", "autonomy_level"]) for r in latest_assessments]),
        "social": _avg([_pa_dim(r, ["peer_interaction", "group_work", "emotional_regulation"]) for r in latest_assessments]),
        "integration": _avg([_pa_dim(r, ["language_fluency", "cultural_adaptation"]) for r in latest_assessments]),
    }
    current_ipi = _avg([float(r.ipi_score) for r in latest_assessments if r.ipi_score])

    baseline_ipi_by_participant = {}
    for b in baselines:
        if b.participant_id not in baseline_ipi_by_participant and b.ipi_baseline is not None:
            baseline_ipi_by_participant[b.participant_id] = float(b.ipi_baseline)

    per_participant_gains = [
        float(r.ipi_score) - baseline_ipi_by_participant[r.participant_id]
        for r in latest_assessments
        if r.ipi_score is not None and r.participant_id in baseline_ipi_by_participant
    ]
    avg_ipi_gain = round(
        sum(per_participant_gains) / len(per_participant_gains), 1
    ) if per_participant_gains else 0.0
    avg_baseline_ipi = (
        sum(baseline_ipi_by_participant.values()) / len(baseline_ipi_by_participant)
        if baseline_ipi_by_participant
        else _avg(list(baseline_by_dim.values()))
    )
    avg_ipi_gain_pct = (
        round((avg_ipi_gain / avg_baseline_ipi) * 100, 1) if avg_baseline_ipi > 0 else 0.0
    )

    # ── Fallback: quan no hi ha PeriodicAssessments, usar SessionObservations ──
    # La simulació crea SessionObservations (puntuacions 1-5 per dimensió) però NO
    # PeriodicAssessments; sense fallback totes les dimensions surten a 0 al portal.
    if not per_participant_gains and pid:
        _so_q = await db.execute(
            select(
                SessionObservation.participant_id,
                SessionObservation.academic_score,
                SessionObservation.cognitive_score,
                SessionObservation.social_score,
                SessionObservation.integration_score,
            )
            .join(Session, SessionObservation.session_id == Session.id)
            .where(
                Session.program_id == pid,
                SessionObservation.academic_score.isnot(None),
            )
            .order_by(Session.session_date.desc(), Session.id.desc())
        )
        _so_all = _so_q.all()
        _so_seen: set[str] = set()
        _so_latest = []
        for _row in _so_all:
            if _row.participant_id not in _so_seen:
                _so_seen.add(_row.participant_id)
                _so_latest.append(_row)

        if _so_latest:
            def _so_avg_dim(rows: list, field: str) -> float:
                vals = [((getattr(r, field) - 1) / 4.0 * 100.0) for r in rows if getattr(r, field) is not None]
                return round(sum(vals) / len(vals), 1) if vals else 0.0

            current_dims = {
                "academic":    _so_avg_dim(_so_latest, "academic_score"),
                "cognitive":   _so_avg_dim(_so_latest, "cognitive_score"),
                "social":      _so_avg_dim(_so_latest, "social_score"),
                "integration": _so_avg_dim(_so_latest, "integration_score"),
            }
            _so_weights = {"academic": 0.35, "cognitive": 0.25, "social": 0.25, "integration": 0.15}
            _ipi_vals: list[float] = []
            for _r in _so_latest:
                _obs = {
                    "academic":    (_r.academic_score - 1) / 4.0 * 100.0 if _r.academic_score else None,
                    "cognitive":   (_r.cognitive_score - 1) / 4.0 * 100.0 if _r.cognitive_score else None,
                    "social":      (_r.social_score - 1) / 4.0 * 100.0 if _r.social_score else None,
                    "integration": (_r.integration_score - 1) / 4.0 * 100.0 if _r.integration_score else None,
                }
                _valid = {d: v for d, v in _obs.items() if v is not None}
                if not _valid:
                    continue
                _tw = sum(_so_weights[d] for d in _valid)
                _ipi_val = sum(_so_weights[d] * v for d, v in _valid.items()) / _tw
                _ipi_vals.append(_ipi_val)
                _bl = baseline_ipi_by_participant.get(_r.participant_id)
                if _bl is not None:
                    per_participant_gains.append(_ipi_val - _bl)

            if per_participant_gains:
                avg_ipi_gain = round(sum(per_participant_gains) / len(per_participant_gains), 1)
                avg_ipi_gain_pct = round((avg_ipi_gain / avg_baseline_ipi) * 100, 1) if avg_baseline_ipi > 0 else 0.0
            current_ipi = round(sum(_ipi_vals) / len(_ipi_vals), 1) if _ipi_vals else 0.0

    # Hours of support (total session hours)
    if pid:
        sessions_q = await db.execute(
            select(func.count(Session.id)).where(Session.program_id == pid)
        )
        n_sessions = sessions_q.scalar_one() or 0
    else:
        n_sessions = 0
    hours_of_support = round(n_sessions * 1.5, 0)

    # Retention rate (active vs. enrolled)
    if pid:
        enrolled_q = await db.execute(
            select(func.count(Participant.id))
        )
        enrolled_n = enrolled_q.scalar_one() or 1
    else:
        enrolled_n = max(n_participants, 1)
    retention_rate = round(n_participants / enrolled_n, 3) if enrolled_n else 1.0

    # Risk distribution
    risk_dist = await _get_risk_distribution(pid, db) if pid else {"low": 0, "medium": 0, "high": 0}

    # Programme duration in months
    duration_months = 9
    if prog and hasattr(prog, "start_date") and prog.start_date:
        try:
            delta = date.today() - prog.start_date
            duration_months = max(1, round(delta.days / 30))
        except Exception:
            pass

    # Narrative
    if avg_ipi_gain > 5:
        narrative = (
            f"El programa ha acompanyat {n_participants} participants cap a un creixement mesurable. "
            f"La millora mitjana de l'IPI és de {avg_ipi_gain:.1f} punts."
        )
    elif avg_ipi_gain > 0:
        narrative = f"El programa mostra una evolució positiva moderada amb {n_participants} participants actius."
    else:
        narrative = f"El programa s'ha iniciat recentment amb {n_participants} participants en seguiment actiu."

    # ── SROI canònic (mateix motor que /analytics/sroi al dashboard coordinador) ──
    # Període: últims 6 mesos. Sense autenticació, usem la capa de servei directament.
    canonical_sroi_ratio = 0.0
    canonical_sroi_value_eur = 0.0
    canonical_sroi_cost_eur = 0.0
    try:
        if pid:
            from app.algorithms.sroi_engine import build_sroi_extra, calculate_sroi
            from app.services.program_sroi_metrics import load_program_period_metrics

            _sroi_end = date.today()
            # 6 calendar months back — same as JS setMonth(-6) used by the coordinator frontend
            _sm = _sroi_end.month - 6
            _sy = _sroi_end.year + (_sm - 1) // 12 if _sm <= 0 else _sroi_end.year
            _sm = _sm + 12 if _sm <= 0 else _sm
            import calendar as _cal
            _sroi_start = _sroi_end.replace(
                year=_sy, month=_sm,
                day=min(_sroi_end.day, _cal.monthrange(_sy, _sm)[1]),
            )
            _m = await load_program_period_metrics(db, pid, _sroi_start, _sroi_end)
            _extra = build_sroi_extra(
                sessions=_m["n_sessions"],
                avg_duration_h=_m["avg_duration_h"],
                pct_high_risk=_m["pct_high_risk"],
                avg_ipi_gain=_m["avg_ipi_gain"],
                pct_integration_gain=_m.get("pct_integration_gain"),
            )
            _extra["monthly_fixed_cost_per_participant_eur"] = _m["monthly_fixed_cost_per_participant_eur"]
            _extra["marginal_cost_per_session_eur"] = _m["marginal_cost_per_session_eur"]
            _sroi_result = calculate_sroi(
                n_participants=_m["n_participants"],
                avg_ipi_gain=_m["avg_ipi_gain"],
                program_cost_eur=_m["operating_cost_eur"],
                program_duration_months=_m["program_duration_months"],
                extra=_extra,
            )
            canonical_sroi_ratio = float(_sroi_result.get("sroi_ratio", 0.0))
            canonical_sroi_value_eur = float(_sroi_result.get("total_social_value_eur", 0.0))
            canonical_sroi_cost_eur = float(_sroi_result.get("total_investment_eur", 0.0))
    except Exception:
        pass

    return {
        "organization": org_slug,
        "program_id": pid,
        # Hero metrics
        "n_participants": n_participants,
        "avg_ipi_gain_pct": avg_ipi_gain_pct,
        "avg_ipi_gain": avg_ipi_gain,
        "hours_of_support": int(hours_of_support),
        "retention_rate": retention_rate,
        # Canonical SROI (same engine as coordinator dashboard — last 6 months)
        "sroi_ratio": canonical_sroi_ratio,
        "sroi_total_value_eur": canonical_sroi_value_eur,
        "sroi_cost_eur": canonical_sroi_cost_eur,
        # Before/after by dimension
        "dimension_evolution": {
            dim: {
                "baseline": baseline_by_dim.get(dim, 0.0),
                "current": current_dims.get(dim, 0.0),
                "gain": round(current_dims.get(dim, 0.0) - baseline_by_dim.get(dim, 0.0), 1),
            }
            for dim in ["academic", "cognitive", "social", "integration"]
        },
        "risk_distribution": risk_dist,
        "narrative": narrative,
        # SROI inputs
        "sroi_inputs": {
            "n_participants": n_participants,
            "avg_ipi_gain": avg_ipi_gain,
            "duration_months": duration_months,
        },
        # Legacy fields for backwards compat
        "children_served": n_participants,
        "avg_ipi": current_ipi,
    }

@app.get(f"{settings.api_prefix}/dashboard/donor/{{org_slug}}/sroi")
async def donor_sroi(
    org_slug: str,
    cost_eur: float = Query(..., gt=0),
    months: int = Query(9, ge=1),
    program_id: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    """Legacy SROI — redirigeix a la calculadora ONG amb cost imputat."""
    org_q = await db.execute(select(Organization).where(Organization.slug == org_slug))
    org = org_q.scalar_one_or_none()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    if program_id:
        prog_q = await db.execute(select(Program).where(Program.id == program_id))
    else:
        prog_q = await db.execute(
            select(Program)
            .where(Program.organization_id == org.id, Program.active.is_(True))
            .limit(1)
        )
    prog = prog_q.scalar_one_or_none()
    if not prog:
        raise HTTPException(status_code=404, detail="Program not found")
    calc = await compute_ngo_sroi_calculator(
        db, prog.id, contribution_eur=cost_eur
    )
    impact = calc["impact"]
    prog = calc["program"]
    return {
        "total_social_value_eur": impact["outcomes_value_eur"],
        "total_investment_eur": prog.get("operating_cost_eur", 0),
        "sroi_ratio": impact["sroi_per_euro_invested"],
        "sroi_statement": impact["sroi_statement"],
        "value_breakdown": impact.get("outcomes_breakdown", impact.get("value_breakdown", {})),
        "sensitivity_analysis": calc.get("sensitivity_analysis", {}),
        "methodology_reference": calc["methodology_reference"],
        "n_participants": calc["program"]["n_participants"],
        "avg_ipi_gain": calc["program"]["avg_ipi_gain"],
        "program_duration_months": months,
        "ngo_calculator": calc,
    }

@app.get(f"{settings.api_prefix}/organization/{{org_slug}}/programs/public")
async def list_org_programs_public(
    org_slug: str,
    db: AsyncSession = Depends(get_db),
):
    """Lista pública de programas activos para selector del portal donante."""
    org_q = await db.execute(select(Organization).where(Organization.slug == org_slug))
    org = org_q.scalar_one_or_none()
    if not org:
        return []

    prog_q = await db.execute(
        select(Program.id, Program.name)
        .where(
            Program.organization_id == org.id,
            Program.active == True
        )
        .order_by(Program.name.asc())
    )

    return [{"id": r[0], "name": r[1]} for r in prog_q.all()]

@app.get(f"{settings.api_prefix}/micro-goals/templates")
async def micro_goal_templates():
    return [
        {"dimension": "academic", "title": "Llegir 10 minuts seguits", "difficulty": 1},
        {"dimension": "academic", "title": "Resoldre 5 problemes sense ajuda", "difficulty": 2},
        {"dimension": "cognitive", "title": "Completar una tasca de 20 min sense interrupcions", "difficulty": 2},
        {"dimension": "social", "title": "Participar almenys 1 cop en activitat de grup", "difficulty": 1},
        {"dimension": "integration", "title": "Explicar una cosa del seu pais en catala", "difficulty": 1},
    ]


@app.get(f"{settings.api_prefix}/micro-goals", response_model=list[MicroGoalOut])
async def list_micro_goals(
    program_id: str | None = None,
    active_only: bool = True,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = (
        select(
            ProgramMicroGoal,
            func.count(ProgramMicroGoalCompletion.id).label("completions_count"),
            func.max(ProgramMicroGoalCompletion.completed_at).label("last_completed_at"),
        )
        .outerjoin(ProgramMicroGoalCompletion, ProgramMicroGoalCompletion.program_micro_goal_id == ProgramMicroGoal.id)
        .join(Program, Program.id == ProgramMicroGoal.program_id)
        .where(Program.organization_id == current_user.organization_id)
    )
    if program_id:
        query = query.where(ProgramMicroGoal.program_id == program_id)
    if active_only:
        query = query.where(ProgramMicroGoal.active.is_(True))

    query = query.group_by(ProgramMicroGoal.id).order_by(ProgramMicroGoal.created_at.desc())
    result = await db.execute(query)
    return [
        MicroGoalOut(
            id=goal.id,
            program_id=goal.program_id,
            title=goal.title,
            description=goal.description,
            dimension=goal.dimension,
            difficulty=goal.difficulty,
            target_date=goal.target_date,
            active=goal.active,
            created_at=goal.created_at,
            completions_count=int(completions_count or 0),
            last_completed_at=last_completed_at,
        )
        for goal, completions_count, last_completed_at in result.all()
    ]


@app.post(f"{settings.api_prefix}/micro-goals")
async def create_micro_goal(
    payload: MicroGoalCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("professional", "coordinator", "admin")),
):
    goal = ProgramMicroGoal(
        program_id=payload.program_id,
        created_by=current_user.id,
        title=payload.title,
        description=payload.description,
        dimension=payload.dimension,
        difficulty=payload.difficulty,
        target_date=payload.target_date,
    )
    db.add(goal)
    await db.commit()
    await db.refresh(goal)
    return {"id": goal.id}


@app.post(f"{settings.api_prefix}/micro-goals/{{goal_id}}/complete")
async def complete_micro_goal(
    goal_id: str,
    note: str = "",
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("professional", "coordinator", "admin")),
):
    completion = ProgramMicroGoalCompletion(program_micro_goal_id=goal_id, verified_by=current_user.id, note=note)
    db.add(completion)
    await db.commit()
    await db.refresh(completion)
    return {"id": completion.id, "completed_at": completion.completed_at}


# ── Individualised micro-goals (per participant, GAS-friendly) ────────────────
def _individual_goal_out(goal: MicroGoal) -> IndividualMicroGoalOut:
    return IndividualMicroGoalOut(
        id=goal.id,
        participant_id=goal.participant_id,
        program_id=goal.program_id,
        title=goal.title,
        description=goal.description,
        dimension=goal.dimension,
        difficulty=goal.difficulty,
        target_date=goal.target_date,
        active=goal.active,
    )


@app.get(
    f"{settings.api_prefix}/participants/{{participant_id}}/active-goals",
    response_model=list[IndividualMicroGoalOut],
)
async def list_participant_active_goals(
    participant_id: str,
    program_id: str | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Active per-participant goals — used by the SessionLogger to render GAS sliders."""
    # Authorize: ensure the participant belongs to the user's org.
    await ensure_participant_access(db, current_user, participant_id)

    query = (
        select(MicroGoal)
        .where(MicroGoal.participant_id == participant_id, MicroGoal.active.is_(True))
        .order_by(MicroGoal.created_at.desc())
    )
    if program_id:
        query = query.where(MicroGoal.program_id == program_id)
    result = await db.execute(query)
    return [_individual_goal_out(g) for g in result.scalars().all()]


@app.post(
    f"{settings.api_prefix}/micro-goals/individual",
    response_model=IndividualMicroGoalOut,
)
async def create_individual_micro_goal(
    payload: IndividualMicroGoalCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("professional", "coordinator", "admin")),
):
    await ensure_participant_access(db, current_user, payload.participant_id)
    await get_org_program(db, payload.program_id, current_user.organization_id)

    goal = MicroGoal(
        participant_id=payload.participant_id,
        program_id=payload.program_id,
        created_by=current_user.id,
        title=payload.title,
        description=payload.description,
        dimension=payload.dimension,
        difficulty=payload.difficulty,
        target_date=payload.target_date,
    )
    db.add(goal)
    await db.commit()
    await db.refresh(goal)
    return _individual_goal_out(goal)


@app.patch(
    f"{settings.api_prefix}/micro-goals/individual/{{goal_id}}",
    response_model=IndividualMicroGoalOut,
)
async def update_individual_micro_goal(
    goal_id: str,
    payload: dict[str, Any],
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("professional", "coordinator", "admin")),
):
    goal_q = await db.execute(select(MicroGoal).where(MicroGoal.id == goal_id))
    goal = goal_q.scalar_one_or_none()
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    await ensure_participant_access(db, current_user, goal.participant_id)

    for key in ("title", "description", "dimension", "difficulty", "target_date", "active"):
        if key in payload:
            setattr(goal, key, payload[key])
    await db.commit()
    await db.refresh(goal)
    return _individual_goal_out(goal)


# ── Session activity tags (org-scoped catalog) ───────────────────────────────
def _tag_out(tag: SessionActivityTag) -> SessionActivityTagOut:
    dims = [d.strip() for d in (tag.dimensions or "").split(",") if d.strip()]
    return SessionActivityTagOut(
        id=tag.id,
        slug=tag.slug,
        label=tag.label,
        color=tag.color,
        dimensions=dims,
        active=tag.active,
    )


@app.get(
    f"{settings.api_prefix}/session-activity-tags",
    response_model=list[SessionActivityTagOut],
)
async def list_session_activity_tags(
    active_only: bool = True,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = select(SessionActivityTag).where(
        SessionActivityTag.organization_id == current_user.organization_id
    )
    if active_only:
        query = query.where(SessionActivityTag.active.is_(True))
    query = query.order_by(SessionActivityTag.label.asc())
    result = await db.execute(query)
    return [_tag_out(t) for t in result.scalars().all()]


@app.post(
    f"{settings.api_prefix}/session-activity-tags",
    response_model=SessionActivityTagOut,
)
async def create_session_activity_tag(
    payload: SessionActivityTagCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("coordinator", "admin")),
):
    existing_q = await db.execute(
        select(SessionActivityTag).where(
            SessionActivityTag.organization_id == current_user.organization_id,
            SessionActivityTag.slug == payload.slug,
        )
    )
    if existing_q.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Slug already exists for this organization")

    tag = SessionActivityTag(
        organization_id=current_user.organization_id,
        slug=payload.slug,
        label=payload.label,
        color=payload.color,
        dimensions=",".join(payload.dimensions) if payload.dimensions else None,
    )
    db.add(tag)
    await db.commit()
    await db.refresh(tag)
    return _tag_out(tag)


@app.patch(
    f"{settings.api_prefix}/session-activity-tags/{{tag_id}}",
    response_model=SessionActivityTagOut,
)
async def update_session_activity_tag(
    tag_id: str,
    payload: SessionActivityTagUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("coordinator", "admin")),
):
    tag_q = await db.execute(
        select(SessionActivityTag).where(
            SessionActivityTag.id == tag_id,
            SessionActivityTag.organization_id == current_user.organization_id,
        )
    )
    tag = tag_q.scalar_one_or_none()
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")

    if payload.label is not None:
        tag.label = payload.label
    if payload.color is not None:
        tag.color = payload.color
    if payload.dimensions is not None:
        tag.dimensions = ",".join(payload.dimensions) if payload.dimensions else None
    if payload.active is not None:
        tag.active = payload.active
    await db.commit()
    await db.refresh(tag)
    return _tag_out(tag)


@app.post(f"{settings.api_prefix}/reports/generate", response_model=ReportStatus)
async def generate_report(
    payload: ReportRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("coordinator", "admin")),
):
    if payload.period_end < payload.period_start:
        raise HTTPException(status_code=400, detail="period_end must be greater than or equal to period_start")

    program_result = await db.execute(
        select(Program).where(
            Program.id == payload.program_id,
            Program.organization_id == current_user.organization_id,
        )
    )
    program = program_result.scalar_one_or_none()
    if not program:
        raise HTTPException(status_code=404, detail="Program not found for this organization")

    content = await generate_quarterly_report(payload.program_id, payload.period_start, payload.period_end, db)
    report = Report(
        organization_id=current_user.organization_id,
        program_id=payload.program_id,
        created_by=current_user.id,
        report_type=payload.report_type,
        period_start=payload.period_start,
        period_end=payload.period_end,
        title=payload.title,
        content_json=json.dumps(content),
        status="ready",
    )
    db.add(report)
    await db.commit()
    await db.refresh(report)
    return ReportStatus(id=report.id, status=report.status, created_at=report.created_at)


@app.get(f"{settings.api_prefix}/reports", response_model=list[ReportListItem])
async def list_reports(
    limit: int = Query(default=100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rows = await db.execute(
        select(Report, User.full_name, Program.name)
        .join(User, User.id == Report.created_by)
        .outerjoin(Program, Program.id == Report.program_id)
        .where(Report.organization_id == current_user.organization_id)
        .order_by(Report.created_at.desc())
        .limit(limit)
    )
    return [
        ReportListItem(
            id=report.id,
            title=report.title,
            status=report.status,
            report_type=report.report_type,
            period_start=report.period_start,
            period_end=report.period_end,
            created_at=report.created_at,
            created_by_name=creator_name,
            program_id=report.program_id,
            program_name=program_name,
        )
        for report, creator_name, program_name in rows.all()
    ]


@app.get(f"{settings.api_prefix}/reports/{{report_id}}/status", response_model=ReportStatus)
async def report_status(
    report_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Report).where(Report.id == report_id))
    report = result.scalar_one_or_none()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    return ReportStatus(id=report.id, status=report.status, created_at=report.created_at)


@app.get(f"{settings.api_prefix}/reports/{{report_id}}/download")
async def report_download(
    report_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Report).where(Report.id == report_id))
    report = result.scalar_one_or_none()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    return {"report_id": report.id, "title": report.title, "content": json.loads(report.content_json)}


@app.get(f"{settings.api_prefix}/analytics/ipi-distribution")
async def ipi_distribution(
    program_id: str,
    period_start: date | None = None,
    period_end: date | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if period_start and period_end and period_end < period_start:
        raise HTTPException(status_code=400, detail="period_end must be greater than or equal to period_start")

    query = select(PeriodicAssessment.ipi_score).where(PeriodicAssessment.program_id == program_id)
    if period_start:
        query = query.where(PeriodicAssessment.assessment_date >= period_start)
    if period_end:
        query = query.where(PeriodicAssessment.assessment_date <= period_end)

    rows = await db.execute(query)
    bins = {"0-20": 0, "21-40": 0, "41-60": 0, "61-80": 0, "81-100": 0}
    for (ipi,) in rows.all():
        if ipi <= 20:
            bins["0-20"] += 1
        elif ipi <= 40:
            bins["21-40"] += 1
        elif ipi <= 60:
            bins["41-60"] += 1
        elif ipi <= 80:
            bins["61-80"] += 1
        else:
            bins["81-100"] += 1
    return bins


@app.get(f"{settings.api_prefix}/analytics/trend")
async def analytics_trend(
    program_id: str,
    months: int = 6,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    start_date = date.today() - timedelta(days=months * 30)

    # Intentar primer amb PeriodicAssessment (avaluacions formals)
    pa_result = await db.execute(
        select(PeriodicAssessment.period_label, func.avg(PeriodicAssessment.ipi_score))
        .where(
            PeriodicAssessment.program_id == program_id,
            PeriodicAssessment.assessment_date >= start_date,
            PeriodicAssessment.ipi_score.isnot(None),
        )
        .group_by(PeriodicAssessment.period_label)
        .order_by(PeriodicAssessment.period_label)
    )
    pa_rows = pa_result.all()
    if len(pa_rows) >= 2:
        return [{"period": p, "avg_ipi": round(v or 0, 1)} for p, v in pa_rows]

    # Fallback: derivar IPI mensual des de SessionObservation
    # IPI = 0.35*academic + 0.25*cognitive + 0.25*social + 0.15*integration (escala 1-5 → 0-100)
    ipi_expr = (
        0.35 * (func.coalesce(SessionObservation.academic_score,    3) - 1) / 4.0 * 100 +
        0.25 * (func.coalesce(SessionObservation.cognitive_score,    3) - 1) / 4.0 * 100 +
        0.25 * (func.coalesce(SessionObservation.social_score,       3) - 1) / 4.0 * 100 +
        0.15 * (func.coalesce(SessionObservation.integration_score,  3) - 1) / 4.0 * 100
    )
    so_result = await db.execute(
        select(
            func.strftime("%Y-%m", Session.session_date).label("month"),
            func.avg(ipi_expr).label("avg_ipi"),
        )
        .join(Session, SessionObservation.session_id == Session.id)
        .where(
            Session.program_id == program_id,
            Session.session_date >= start_date,
            SessionObservation.academic_score.isnot(None),
        )
        .group_by(func.strftime("%Y-%m", Session.session_date))
        .order_by(func.strftime("%Y-%m", Session.session_date))
    )
    so_rows = so_result.all()
    if so_rows:
        return [{"period": m, "avg_ipi": round(v or 0, 1)} for m, v in so_rows]

    # Si no hi ha res, retornar els PeriodicAssessment individuals que hi hagi
    return [{"period": p, "avg_ipi": round(v or 0, 1)} for p, v in pa_rows]


@app.get(f"{settings.api_prefix}/analytics/impact-statement")
async def impact_statement(
    program_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rows = await db.execute(
        select(func.avg(BaselineAssessment.ipi_baseline), func.avg(PeriodicAssessment.ipi_score))
        .join(
            PeriodicAssessment,
            (BaselineAssessment.participant_id == PeriodicAssessment.participant_id)
            & (BaselineAssessment.program_id == PeriodicAssessment.program_id),
        )
        .where(PeriodicAssessment.program_id == program_id)
    )
    base_avg, current_avg = rows.one_or_none() or (0, 0)
    base = base_avg or 0
    curr = current_avg or 0
    improvement = round(((curr - base) / base) * 100, 1) if base else 0
    return {"statement": f"El programa mejora el IPI medio un {improvement}% respecto al baseline."}


@app.get(f"{settings.api_prefix}/analytics/session-quality")
async def analytics_session_quality(
    program_id: str,
    period_start: date,
    period_end: date,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if period_end < period_start:
        raise HTTPException(status_code=400, detail="period_end must be greater than or equal to period_start")
    return await get_session_quality_summary(program_id, period_start, period_end, db)


@app.get(f"{settings.api_prefix}/analytics/cost-effectiveness")
async def analytics_cost_effectiveness(
    program_id: str,
    period_start: date,
    period_end: date,
    total_cost_eur: float | None = Query(default=None, ge=0),
    comparator_cost_eur: float | None = Query(default=None, ge=0),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if period_end < period_start:
        raise HTTPException(status_code=400, detail="period_end must be greater than or equal to period_start")

    from app.services.program_sroi_metrics import (
        OPERATING_COST_PER_SESSION_EUR,
        period_operating_cost_eur,
    )

    n_sessions_period, auto_period_cost, _ = await period_operating_cost_eur(
        db, program_id, period_start, period_end
    )

    period_days = (period_end - period_start).days + 1
    comparator_end = period_start - timedelta(days=1)
    comparator_start = comparator_end - timedelta(days=max(period_days - 1, 0))

    n_sessions_comparator, auto_comparator_cost, _ = await period_operating_cost_eur(
        db, program_id, comparator_start, comparator_end
    )

    use_auto_period = total_cost_eur is None or total_cost_eur <= 0
    use_auto_comparator = comparator_cost_eur is None or comparator_cost_eur <= 0
    total_cost_eur = auto_period_cost if use_auto_period else float(total_cost_eur)
    comparator_cost_eur = auto_comparator_cost if use_auto_comparator else float(comparator_cost_eur)

    baseline_rows = await db.execute(
        select(BaselineAssessment.participant_id, BaselineAssessment.ipi_baseline).where(BaselineAssessment.program_id == program_id)
    )
    baseline_by_participant = {pid: float(ipi or 0) for pid, ipi in baseline_rows.all()}

    current_rows = await db.execute(
        select(
            PeriodicAssessment.participant_id,
            PeriodicAssessment.assessment_date,
            PeriodicAssessment.ipi_score,
            PeriodicAssessment.risk_level,
        ).where(
            PeriodicAssessment.program_id == program_id,
            PeriodicAssessment.assessment_date >= period_start,
            PeriodicAssessment.assessment_date <= period_end,
        )
    )
    current_latest: dict[str, tuple[date, float, str | None]] = {}
    for pid, assessed_at, ipi_score, risk_level in current_rows.all():
        current = current_latest.get(pid)
        if current is None or assessed_at > current[0]:
            current_latest[pid] = (assessed_at, float(ipi_score or 0), risk_level)

    comparator_rows = await db.execute(
        select(
            PeriodicAssessment.participant_id,
            PeriodicAssessment.assessment_date,
            PeriodicAssessment.ipi_score,
        ).where(
            PeriodicAssessment.program_id == program_id,
            PeriodicAssessment.assessment_date >= comparator_start,
            PeriodicAssessment.assessment_date <= comparator_end,
        )
    )
    comparator_latest: dict[str, tuple[date, float]] = {}
    for pid, assessed_at, ipi_score in comparator_rows.all():
        current = comparator_latest.get(pid)
        if current is None or assessed_at > current[0]:
            comparator_latest[pid] = (assessed_at, float(ipi_score or 0))

    beneficiaries_n = len(current_latest)
    if beneficiaries_n == 0:
        return {
            "methodology": "Cost-Effectiveness Analysis (CEA)",
            "standards_reference": ["OECD DAC", "Social Impact Measurement"],
            "period": {"start": period_start, "end": period_end},
            "comparator_period": {"start": comparator_start, "end": comparator_end},
            "beneficiaries_n": 0,
            "outcome_achievement_rate": 0.0,
            "avg_ipi_gain_vs_baseline": 0.0,
            "high_risk_share": 0.0,
            "cost_metrics": {
                "total_cost_eur": total_cost_eur,
                "comparator_cost_eur": comparator_cost_eur,
                "cost_per_beneficiary": None,
                "cost_per_improved_participant": None,
                "cost_per_ipi_point_gained": None,
                "icer_vs_previous_period": None,
            },
            "period_investment": {
                "n_sessions": n_sessions_period,
                "cost_per_session_eur": OPERATING_COST_PER_SESSION_EUR,
                "total_cost_eur": total_cost_eur,
                "auto_calculated": use_auto_period,
            },
            "comparator_investment": {
                "n_sessions": n_sessions_comparator,
                "total_cost_eur": comparator_cost_eur,
                "auto_calculated": use_auto_comparator,
            },
        }

    improved_threshold = 5.0
    improved_n = 0
    ipi_gains: list[float] = []
    high_risk_n = 0
    for pid, (_, ipi_score, risk_level) in current_latest.items():
        baseline_ipi = baseline_by_participant.get(pid, 0.0)
        gain = ipi_score - baseline_ipi
        ipi_gains.append(gain)
        if gain >= improved_threshold:
            improved_n += 1
        if (risk_level or "").lower() == "high":
            high_risk_n += 1

    outcome_achievement_rate = improved_n / beneficiaries_n
    avg_ipi_gain_vs_baseline = sum(ipi_gains) / len(ipi_gains)
    high_risk_share = high_risk_n / beneficiaries_n
    total_positive_ipi_gain = sum(max(g, 0.0) for g in ipi_gains)

    comparator_improved_n = 0
    comparator_beneficiaries_n = len(comparator_latest)
    if comparator_beneficiaries_n > 0:
        for pid, (_, ipi_score) in comparator_latest.items():
            baseline_ipi = baseline_by_participant.get(pid, 0.0)
            if (ipi_score - baseline_ipi) >= improved_threshold:
                comparator_improved_n += 1
        comparator_effect_rate = comparator_improved_n / comparator_beneficiaries_n
    else:
        comparator_effect_rate = 0.0

    delta_effect = outcome_achievement_rate - comparator_effect_rate
    delta_cost = total_cost_eur - comparator_cost_eur

    cost_per_beneficiary = (total_cost_eur / beneficiaries_n) if total_cost_eur > 0 else None
    cost_per_improved_participant = (total_cost_eur / improved_n) if (total_cost_eur > 0 and improved_n > 0) else None
    cost_per_ipi_point_gained = (
        total_cost_eur / total_positive_ipi_gain if (total_cost_eur > 0 and total_positive_ipi_gain > 0) else None
    )
    icer_vs_previous_period = (delta_cost / delta_effect) if abs(delta_effect) > 1e-9 else None

    return {
        "methodology": "Cost-Effectiveness Analysis (CEA)",
        "standards_reference": ["OECD DAC", "Social Impact Measurement"],
        "period": {"start": period_start, "end": period_end},
        "comparator_period": {"start": comparator_start, "end": comparator_end},
        "beneficiaries_n": beneficiaries_n,
        "improved_participants_n": improved_n,
        "outcome_achievement_rate": round(outcome_achievement_rate, 4),
        "avg_ipi_gain_vs_baseline": round(avg_ipi_gain_vs_baseline, 4),
        "high_risk_share": round(high_risk_share, 4),
        "comparator_outcome_achievement_rate": round(comparator_effect_rate, 4),
        "cost_metrics": {
            "total_cost_eur": round(total_cost_eur, 2),
            "comparator_cost_eur": round(comparator_cost_eur, 2),
            "cost_per_beneficiary": round(cost_per_beneficiary, 2) if cost_per_beneficiary is not None else None,
            "cost_per_improved_participant": (
                round(cost_per_improved_participant, 2) if cost_per_improved_participant is not None else None
            ),
            "cost_per_ipi_point_gained": (
                round(cost_per_ipi_point_gained, 2) if cost_per_ipi_point_gained is not None else None
            ),
            "icer_vs_previous_period": round(icer_vs_previous_period, 2) if icer_vs_previous_period is not None else None,
        },
        "period_investment": {
            "n_sessions": n_sessions_period,
            "cost_per_session_eur": OPERATING_COST_PER_SESSION_EUR,
            "total_cost_eur": round(total_cost_eur, 2),
            "auto_calculated": use_auto_period,
        },
        "comparator_investment": {
            "n_sessions": n_sessions_comparator,
            "total_cost_eur": round(comparator_cost_eur, 2),
            "auto_calculated": use_auto_comparator,
        },
    }


@app.post(f"{settings.api_prefix}/nlp/parse-note")
async def nlp_parse_note(
    payload: ParseNoteRequest,
    current_user: User = Depends(require_roles("professional", "coordinator", "admin")),
):
    return await parse_qualitative_note(payload.note_text, payload.participant_context)


# ============================================================
# SPRINT 1 — Motor Analítico Avanzado
# ============================================================

@app.get(f"{settings.api_prefix}/analytics/intervention-effect")
async def analytics_intervention_effect(
    program_id: str,
    period_start: date | None = None,
    period_end: date | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Módulo A — Cohen's d, Wilcoxon, Bootstrap CI para el efecto del programa."""
    baseline_q = await db.execute(
        select(BaselineAssessment.participant_id, BaselineAssessment.ipi_baseline).where(
            BaselineAssessment.program_id == program_id
        )
    )
    baselines = {pid: float(ipi) for pid, ipi in baseline_q.all() if ipi is not None}
    if not baselines:
        return {"error": "no_baselines", "n_participants": 0}

    filters = [PeriodicAssessment.program_id == program_id]
    if period_start:
        filters.append(PeriodicAssessment.assessment_date >= period_start)
    if period_end:
        filters.append(PeriodicAssessment.assessment_date <= period_end)

    periodic_q = await db.execute(
        select(
            PeriodicAssessment.participant_id,
            PeriodicAssessment.assessment_date,
            PeriodicAssessment.ipi_score,
        )
        .where(*filters)
        .order_by(PeriodicAssessment.participant_id, PeriodicAssessment.assessment_date.desc())
    )

    latest_by_participant: dict[str, float] = {}
    for pid, _assessed_at, ipi_score in periodic_q.all():
        if pid not in latest_by_participant:
            latest_by_participant[pid] = float(ipi_score)

    if not latest_by_participant:
        return {"error": "no_assessments_in_period", "n_participants": 0}

    ctrl_q = await db.execute(
        select(Participant.id, Participant.is_control_group).where(
            Participant.id.in_(list(latest_by_participant.keys()))
        )
    )
    is_control = {pid: ctrl for pid, ctrl in ctrl_q.all()}

    baseline_ipis: list[float] = []
    final_ipis: list[float] = []
    control_ipis: list[float] = []

    for pid, final_ipi in latest_by_participant.items():
        if pid not in baselines:
            continue
        if is_control.get(pid, False):
            control_ipis.append(final_ipi)
        else:
            baseline_ipis.append(baselines[pid])
            final_ipis.append(final_ipi)

    return compute_intervention_effect(
        baseline_ipis=baseline_ipis,
        final_ipis=final_ipis,
        control_ipis=control_ipis if control_ipis else None,
    )


@app.get(f"{settings.api_prefix}/participants/{{participant_id}}/prediction-probabilistic")
async def participant_prediction_probabilistic(
    participant_id: str,
    weeks_ahead: int = 12,
    target_ipi: float = 70.0,
    confidence: float = 0.80,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Módulo B.1+B.2 — Predicción IPI con IC bootstrapped + probabilidad de alcanzar objetivo."""
    history_q = await db.execute(
        select(PeriodicAssessment.ipi_score, PeriodicAssessment.assessment_date)
        .where(PeriodicAssessment.participant_id == participant_id)
        .order_by(PeriodicAssessment.assessment_date)
    )
    rows = history_q.all()
    historical_ipis = [float(r[0]) for r in rows]
    historical_dates = [r[1] for r in rows]

    prediction = predict_ipi_with_uncertainty(
        historical_ipis, historical_dates, weeks_ahead=weeks_ahead, confidence=confidence
    )
    prob = probability_of_reaching_target(historical_ipis, target_ipi=target_ipi, weeks_ahead=weeks_ahead)

    return {**prediction, **prob}


@app.get(f"{settings.api_prefix}/analytics/dropout-probability/{{participant_id}}")
async def analytics_dropout_probability(
    participant_id: str,
    program_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Módulo B.3 — Probabilidad de abandono del programa a 30 y 60 días."""
    participant_q = await db.execute(select(Participant).where(Participant.id == participant_id))
    participant = participant_q.scalar_one_or_none()
    if not participant:
        raise HTTPException(status_code=404, detail="Participant not found")

    feature_bundle = await build_participant_feature_bundle(
        db=db,
        participant_id=participant_id,
        program_id=program_id,
        reference_date=date.today(),
    )

    last_assess_q = await db.execute(
        select(PeriodicAssessment)
        .where(
            PeriodicAssessment.participant_id == participant_id,
            PeriodicAssessment.program_id == program_id,
        )
        .order_by(PeriodicAssessment.assessment_date.desc())
        .limit(1)
    )
    last_assess = last_assess_q.scalar_one_or_none()

    feature_bundle["ipi_delta_last_period"] = last_assess.ipi_delta_vs_previous if last_assess else None
    feature_bundle["weeks_in_program"] = max(1, (date.today() - participant.enrollment_date).days // 7)

    return predict_dropout_probability(feature_bundle)


# ============================================================
# SPRINT 2 — Segmentació K-Means i Anàlisi de Cohortes
# ============================================================

@app.get(f"{settings.api_prefix}/analytics/participant-segments")
async def analytics_participant_segments(
    program_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Módulo C — K-Means clustering dels participants.
    Agrupa per les 4 dimensions del IPI en baseline i retorna perfils semàntics.
    """
    baseline_q = await db.execute(
        select(
            BaselineAssessment.participant_id,
            BaselineAssessment.reading_level,
            BaselineAssessment.math_level,
            BaselineAssessment.comprehension_level,
            BaselineAssessment.attention_level,
            BaselineAssessment.memory_level,
            BaselineAssessment.autonomy_level,
            BaselineAssessment.peer_interaction,
            BaselineAssessment.group_work,
            BaselineAssessment.emotional_regulation,
            BaselineAssessment.language_fluency,
            BaselineAssessment.cultural_adaptation,
        ).where(BaselineAssessment.program_id == program_id)
    )

    def _dim_avg(vals: list) -> float | None:
        valid = [float(v) for v in vals if v is not None]
        if not valid:
            return None
        return (sum(valid) / len(valid) - 1) / 4 * 100

    participants_data = []
    for row in baseline_q.all():
        pid = row[0]
        academic = _dim_avg([row[1], row[2], row[3]])
        cognitive = _dim_avg([row[4], row[5], row[6]])
        social = _dim_avg([row[7], row[8], row[9]])
        integration = _dim_avg([row[10], row[11]])
        if any(v is not None for v in [academic, cognitive, social, integration]):
            participants_data.append({
                "participant_id": pid,
                "academic": academic or 0.0,
                "cognitive": cognitive or 0.0,
                "social": social or 0.0,
                "integration": integration or 0.0,
            })

    if not participants_data:
        return {"error": "no_baseline_data", "n": 0}

    return cluster_participants(participants_data, n_clusters=5)


@app.get(f"{settings.api_prefix}/participants/{{participant_id}}/profile-cluster")
async def participant_profile_cluster(
    participant_id: str,
    program_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retorna el perfil K-Means del participant + micro-goals recomanats."""
    baseline_q = await db.execute(
        select(BaselineAssessment).where(
            BaselineAssessment.participant_id == participant_id,
            BaselineAssessment.program_id == program_id,
        )
    )
    baseline = baseline_q.scalar_one_or_none()
    if not baseline:
        raise HTTPException(status_code=404, detail="Baseline not found")

    def _dim_avg(vals: list) -> float:
        valid = [float(v) for v in vals if v is not None]
        return (sum(valid) / len(valid) - 1) / 4 * 100 if valid else 0.0

    single = [{
        "participant_id": participant_id,
        "academic": _dim_avg([baseline.reading_level, baseline.math_level, baseline.comprehension_level]),
        "cognitive": _dim_avg([baseline.attention_level, baseline.memory_level, baseline.autonomy_level]),
        "social": _dim_avg([baseline.peer_interaction, baseline.group_work, baseline.emotional_regulation]),
        "integration": _dim_avg([baseline.language_fluency, baseline.cultural_adaptation]),
    }]

    result = cluster_participants(single, n_clusters=1)
    cluster_label = result["clusters"][0]["label"] if result["clusters"] else "En Construcció"

    return {
        "participant_id": participant_id,
        "cluster_label": cluster_label,
        "cluster_description": result["clusters"][0]["description"] if result["clusters"] else "",
        "strategy": result["clusters"][0]["strategy"] if result["clusters"] else "",
        "recommended_goals": recommend_goals_for_cluster(cluster_label),
        "dimensions": single[0],
    }


@app.get(f"{settings.api_prefix}/analytics/cohort-trajectories")
async def analytics_cohort_trajectories(
    program_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Módulo D — Evolució IPI per cohorte trimestral (0, 3, 6, 9, 12 mesos)."""
    return await compute_cohort_trajectories(program_id, db)


@app.get(f"{settings.api_prefix}/analytics/cohort-retention")
async def analytics_cohort_retention(
    program_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Módulo D — Retención per cohorte (estil Kaplan-Meier simplificat)."""
    return await compute_retention_by_cohort(program_id, db)


@app.get(f"{settings.api_prefix}/analytics/dimension-velocity")
async def analytics_dimension_velocity(
    program_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Módulo D — Velocitat de millora per dimensió i fase del programa."""
    return await dimension_velocity_analysis(program_id, db)


# ── Sprint 3 — SROI, Inter-rater Reliability, Evidence Export, WebSocket ──────


@app.get(f"{settings.api_prefix}/analytics/sroi")
async def analytics_sroi(
    program_id: str,
    period_start: date | None = None,
    period_end: date | None = None,
    cost_eur: float | None = Query(default=None, ge=0, description="Override cost; default = sessions del període"),
    months: int | None = Query(default=None, description="Durada en mesos (opcional)"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Modulo E — SROI; cost des de sessions registrades si hi ha període."""
    from app.algorithms.sroi_engine import build_sroi_extra, calculate_sroi
    from app.services.program_sroi_metrics import load_program_period_metrics, load_program_sroi_metrics

    if period_start and period_end:
        if period_end < period_start:
            raise HTTPException(status_code=400, detail="period_end must be >= period_start")
        metrics = await load_program_period_metrics(db, program_id, period_start, period_end)
        investment = cost_eur if cost_eur and cost_eur > 0 else metrics["operating_cost_eur"]
        duration_months = months or metrics["program_duration_months"]
        extra = build_sroi_extra(
            sessions=metrics["n_sessions"],
            avg_duration_h=metrics["avg_duration_h"],
            pct_high_risk=metrics["pct_high_risk"],
            avg_ipi_gain=metrics["avg_ipi_gain"],
            pct_integration_gain=metrics.get("pct_integration_gain"),
        )
        extra["monthly_fixed_cost_per_participant_eur"] = metrics[
            "monthly_fixed_cost_per_participant_eur"
        ]
        extra["marginal_cost_per_session_eur"] = metrics["marginal_cost_per_session_eur"]
        result = calculate_sroi(
            n_participants=metrics["n_participants"],
            avg_ipi_gain=metrics["avg_ipi_gain"],
            program_cost_eur=investment,
            program_duration_months=duration_months,
            extra=extra,
        )
        result["period"] = {"start": period_start, "end": period_end}
        result["period_investment"] = {
            "n_sessions": metrics["n_sessions"],
            "marginal_cost_per_session_eur": metrics["marginal_cost_per_session_eur"],
            "monthly_fixed_cost_per_participant_eur": metrics["monthly_fixed_cost_per_participant_eur"],
            "cost_per_session_eur": metrics["marginal_cost_per_session_eur"],
            "total_cost_eur": investment,
            "auto_calculated": not (cost_eur and cost_eur > 0),
            "volunteer_reference_value_eur": metrics["volunteer_reference_value_eur"],
        }
        return result

    metrics = await load_program_sroi_metrics(db, program_id)
    investment = cost_eur if cost_eur and cost_eur > 0 else metrics["operating_cost_eur"]
    duration_months = months or metrics["program_duration_months"]
    extra = build_sroi_extra(
        sessions=metrics["n_sessions"],
        avg_duration_h=metrics["avg_duration_h"],
        pct_high_risk=metrics["pct_high_risk"],
        avg_ipi_gain=metrics["avg_ipi_gain"],
        pct_integration_gain=metrics.get("pct_integration_gain"),
    )
    extra["monthly_fixed_cost_per_participant_eur"] = metrics[
        "monthly_fixed_cost_per_participant_eur"
    ]
    extra["marginal_cost_per_session_eur"] = metrics["marginal_cost_per_session_eur"]
    return calculate_sroi(
        n_participants=metrics["n_participants"],
        avg_ipi_gain=metrics["avg_ipi_gain"],
        program_cost_eur=investment,
        program_duration_months=duration_months,
        extra=extra,
    )


@app.get(f"{settings.api_prefix}/analytics/inter-rater-reliability")
async def analytics_inter_rater_reliability(
    program_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Modulo F — Fiabilitat inter-avaluador ICC(2,1) entre professionals."""
    return await compute_inter_rater_reliability(program_id, db)


# ═══════════════════════════════════════════════════════════════════════════
# ADVANCED ANALYTICS: Causal Inference, Dose-Response, Monte Carlo, Anomalies
# ═══════════════════════════════════════════════════════════════════════════

@app.get(f"{settings.api_prefix}/analytics/dimension-effects")
async def analytics_dimension_effects(
    program_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Per-dimension Cohen's dz effect sizes (paired pre-post).

    Returns the effect size for each of the 4 IPI dimensions (academic, cognitive,
    social, integration) benchmarked against Hattie 2009 educational research norms.
    """
    enrollments_q = await db.execute(
        select(Participant)
        .join(ProgramEnrollment, ProgramEnrollment.participant_id == Participant.id)
        .where(
            ProgramEnrollment.program_id == program_id,
            ProgramEnrollment.active == True,
        )
    )
    participants = list(enrollments_q.scalars().all())

    def _dim_avg(vals):
        valid = [float(v) for v in vals if v is not None]
        return (sum(valid) / len(valid) - 1) / 4 * 100 if valid else None

    pairs = {"academic": [], "cognitive": [], "social": [], "integration": []}

    for p in participants:
        b_q = await db.execute(
            select(BaselineAssessment).where(
                BaselineAssessment.participant_id == p.id,
                BaselineAssessment.program_id == program_id,
            )
        )
        b = b_q.scalar_one_or_none()
        if b is None:
            continue

        latest_q = await db.execute(
            select(PeriodicAssessment)
            .where(
                PeriodicAssessment.participant_id == p.id,
                PeriodicAssessment.program_id == program_id,
            )
            .order_by(PeriodicAssessment.assessment_date.desc())
            .limit(1)
        )
        pa = latest_q.scalar_one_or_none()
        if pa is None:
            continue

        b_acad = _dim_avg([b.reading_level, b.math_level, b.comprehension_level])
        b_cog = _dim_avg([b.attention_level, b.memory_level, b.autonomy_level])
        b_soc = _dim_avg([b.peer_interaction, b.group_work, b.emotional_regulation])
        b_int = _dim_avg([b.language_fluency, b.cultural_adaptation])

        p_acad = _dim_avg([pa.reading_level, pa.math_level, pa.comprehension_level])
        p_cog = _dim_avg([pa.attention_level, pa.memory_level, pa.autonomy_level])
        p_soc = _dim_avg([pa.peer_interaction, pa.group_work, pa.emotional_regulation])
        p_int = _dim_avg([pa.language_fluency, pa.cultural_adaptation])

        if b_acad is not None and p_acad is not None:
            pairs["academic"].append((b_acad, p_acad))
        if b_cog is not None and p_cog is not None:
            pairs["cognitive"].append((b_cog, p_cog))
        if b_soc is not None and p_soc is not None:
            pairs["social"].append((b_soc, p_soc))
        if b_int is not None and p_int is not None:
            pairs["integration"].append((b_int, p_int))

    return compute_dimension_effects(pairs)


@app.get(f"{settings.api_prefix}/analytics/dose-response")
async def analytics_dose_response(
    program_id: str,
    dose_type: str = Query("sessions", regex="^(sessions|hours)$"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Hill-curve dose-response: how IPI gain scales with attended sessions/hours.

    Returns Vmax (asymptotic gain), K (half-saturation), 90% optimal dose, R².
    """
    enrolled_q = await db.execute(
        select(Participant)
        .join(ProgramEnrollment, ProgramEnrollment.participant_id == Participant.id)
        .where(ProgramEnrollment.program_id == program_id, ProgramEnrollment.active == True)
    )
    participants = list(enrolled_q.scalars().all())

    doses: list[float] = []
    gains: list[float] = []

    def _dim_avg(vals):
        valid = [float(v) for v in vals if v is not None]
        return (sum(valid) / len(valid) - 1) / 4 * 100 if valid else None

    for p in participants:
        b_q = await db.execute(
            select(BaselineAssessment).where(
                BaselineAssessment.participant_id == p.id,
                BaselineAssessment.program_id == program_id,
            )
        )
        b = b_q.scalar_one_or_none()
        if b is None:
            continue
        if b.ipi_baseline is not None:
            baseline_ipi = float(b.ipi_baseline)
        else:
            academic = _dim_avg([b.reading_level, b.math_level, b.comprehension_level])
            cognitive = _dim_avg([b.attention_level, b.memory_level, b.autonomy_level])
            social = _dim_avg([b.peer_interaction, b.group_work, b.emotional_regulation])
            integration = _dim_avg([b.language_fluency, b.cultural_adaptation])
            if any(x is None for x in [academic, cognitive, social, integration]):
                continue
            baseline_ipi = academic * 0.30 + cognitive * 0.20 + social * 0.30 + integration * 0.20

        latest_q = await db.execute(
            select(PeriodicAssessment.ipi_score)
            .where(
                PeriodicAssessment.participant_id == p.id,
                PeriodicAssessment.program_id == program_id,
            )
            .order_by(PeriodicAssessment.assessment_date.desc())
            .limit(1)
        )
        latest = latest_q.scalar_one_or_none()
        if latest is None:
            continue

        # Compute dose
        if dose_type == "sessions":
            dose_q = await db.execute(
                select(func.count(SessionObservation.id))
                .join(Session, Session.id == SessionObservation.session_id)
                .where(
                    SessionObservation.participant_id == p.id,
                    Session.program_id == program_id,
                )
            )
            dose = float(dose_q.scalar_one() or 0)
        else:  # hours
            dose_q = await db.execute(
                select(func.coalesce(func.sum(Session.duration_minutes), 0))
                .join(SessionObservation, SessionObservation.session_id == Session.id)
                .where(
                    SessionObservation.participant_id == p.id,
                    Session.program_id == program_id,
                )
            )
            dose = float(dose_q.scalar_one() or 0) / 60.0

        if dose <= 0:
            continue

        raw_gain = float(latest) - float(baseline_ipi)
        max_gain = max(0.0, 100.0 - float(baseline_ipi))
        gain = max(0.0, min(raw_gain, max_gain))
        doses.append(dose)
        gains.append(gain)

    dose_unit = "sessions" if dose_type == "sessions" else "hores"
    return {
        "dose_type": dose_type,
        **fit_dose_response(doses, gains, dose_unit=dose_unit),
    }


@app.get(f"{settings.api_prefix}/analytics/sroi-monte-carlo")
async def analytics_sroi_monte_carlo(
    program_id: str,
    cost_eur: float | None = Query(default=None, gt=0),
    months: int | None = Query(default=None, ge=1),
    period_start: date | None = None,
    period_end: date | None = None,
    n_iter: int = Query(5000, ge=500, le=20000),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Monte Carlo SROI alineat amb el model actual (dosi, cost mixt, beneficis per sessions)."""
    from app.services.program_sroi_metrics import (
        load_program_period_metrics,
        load_program_sroi_metrics,
    )

    if period_start and period_end:
        if period_end < period_start:
            raise HTTPException(status_code=400, detail="period_end must be >= period_start")
        metrics = await load_program_period_metrics(
            db, program_id, period_start, period_end
        )
    else:
        metrics = await load_program_sroi_metrics(db, program_id)

    baseline_q = await db.execute(
        select(BaselineAssessment.participant_id, BaselineAssessment.ipi_baseline).where(
            BaselineAssessment.program_id == program_id
        )
    )
    baseline_by = {
        row.participant_id: float(row.ipi_baseline)
        for row in baseline_q.all()
        if row.ipi_baseline is not None
    }

    latest_q = await db.execute(
        select(
            PeriodicAssessment.participant_id,
            PeriodicAssessment.ipi_score,
        )
        .where(PeriodicAssessment.program_id == program_id)
        .order_by(PeriodicAssessment.assessment_date.desc())
    )
    seen: set = set()
    individual_gains: list[float] = []
    for row in latest_q.all():
        if row.participant_id in seen or row.ipi_score is None:
            continue
        seen.add(row.participant_id)
        bl = baseline_by.get(row.participant_id)
        if bl is None:
            continue
        individual_gains.append(float(row.ipi_score) - bl)

    avg_gain = metrics["avg_ipi_gain"]
    if individual_gains:
        avg_gain = sum(individual_gains) / len(individual_gains)
        if len(individual_gains) > 1:
            from statistics import stdev as _stdev

            sd_gain = _stdev(individual_gains)
        else:
            sd_gain = max(avg_gain * 0.3, 1.0)
    else:
        sd_gain = max(avg_gain * 0.3, 1.0) if avg_gain > 0 else 1.0

    duration = months or metrics["program_duration_months"]
    central_cost = cost_eur if cost_eur and cost_eur > 0 else metrics["operating_cost_eur"]

    return monte_carlo_sroi(
        n_participants=metrics["n_participants"],
        avg_ipi_gain_mean=max(0.0, avg_gain),
        avg_ipi_gain_sd=max(1.0, sd_gain),
        program_duration_months=duration,
        n_sessions=metrics["n_sessions"],
        avg_duration_h=metrics["avg_duration_h"],
        pct_high_risk=metrics["pct_high_risk"],
        pct_integration_gain=metrics.get("pct_integration_gain"),
        program_cost_eur=central_cost,
        monthly_fixed_cost_per_participant_eur=metrics[
            "monthly_fixed_cost_per_participant_eur"
        ],
        marginal_cost_per_session_eur=metrics["marginal_cost_per_session_eur"],
        n_iter=n_iter,
    )


@app.get(f"{settings.api_prefix}/analytics/trajectory-anomalies")
async def analytics_trajectory_anomalies(
    program_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Detect plateaus, regressions and breakthroughs in participant IPI trajectories."""
    return await detect_program_anomalies(program_id, db)


@app.get(f"{settings.api_prefix}/analytics/evidence-export")
async def analytics_evidence_export(
    program_id: str,
    period_start: str | None = None,
    period_end: str | None = None,
    cost_eur: float | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Evidence Package — JSON estructurat complet per a justificacio de subvencions."""
    from app.algorithms.effect_analysis import compute_intervention_effect
    from app.analytics.cohort_analysis import compute_cohort_trajectories

    p_start = date.fromisoformat(period_start) if period_start else (date.today() - timedelta(days=365))
    p_end = date.fromisoformat(period_end) if period_end else date.today()

    prog = await get_org_program(db, program_id, current_user.organization_id)
    program_meta = {
        "program_id": program_id,
        "program_name": prog.name if prog else "Unknown",
        "period_start": p_start.isoformat(),
        "period_end": p_end.isoformat(),
        "export_date": date.today().isoformat(),
    }

    try:
        intervention_effect = await compute_intervention_effect(program_id, p_start, p_end, db)
    except Exception:
        intervention_effect = {"error": "insufficient_data"}

    ipi_q = await db.execute(
        select(
            PeriodicAssessment.assessment_date,
            func.avg(PeriodicAssessment.ipi_score),
        )
        .where(
            PeriodicAssessment.program_id == program_id,
            PeriodicAssessment.assessment_date >= p_start,
            PeriodicAssessment.assessment_date <= p_end,
        )
        .group_by(PeriodicAssessment.assessment_date)
        .order_by(PeriodicAssessment.assessment_date)
    )
    ipi_evolution = [
        {"date": str(row[0]), "avg_ipi": round(float(row[1]), 1)}
        for row in ipi_q.all()
    ]

    risk_q = await db.execute(
        select(PeriodicAssessment.risk_level, func.count(PeriodicAssessment.id))
        .where(PeriodicAssessment.program_id == program_id)
        .group_by(PeriodicAssessment.risk_level)
    )
    risk_distribution = {"low": 0, "medium": 0, "high": 0}
    for level, count in risk_q.all():
        if level in risk_distribution:
            risk_distribution[level] = count

    goals_q = await db.execute(
        select(func.count(ProgramMicroGoal.id)).where(ProgramMicroGoal.program_id == program_id)
    )
    goals_completions_q = await db.execute(
        select(func.count(ProgramMicroGoalCompletion.id))
        .join(ProgramMicroGoal, ProgramMicroGoal.id == ProgramMicroGoalCompletion.program_micro_goal_id)
        .where(ProgramMicroGoal.program_id == program_id)
    )
    n_goals = goals_q.scalar_one() or 0
    n_completions = goals_completions_q.scalar_one() or 0
    goals_summary = {
        "assigned_goals": n_goals,
        "completed_goals": n_completions,
        "completion_rate": round(n_completions / n_goals, 3) if n_goals else 0.0,
    }

    try:
        cohort_trajectories = await compute_cohort_trajectories(program_id, db)
    except Exception:
        cohort_trajectories = {"error": "insufficient_data"}

    sroi = None
    if cost_eur and cost_eur > 0:
        baseline_q = await db.execute(
            select(BaselineAssessment).where(BaselineAssessment.program_id == program_id)
        )
        baselines = baseline_q.scalars().all()
        n_p = len(baselines) or 1
        latest_q2 = await db.execute(
            select(PeriodicAssessment.ipi_score)
            .where(PeriodicAssessment.program_id == program_id)
            .order_by(PeriodicAssessment.assessment_date.desc())
        )
        ipis = [float(r) for r in latest_q2.scalars().all() if r]
        avg_gain = max(0.0, (sum(ipis[:n_p]) / min(len(ipis), n_p)) - 50.0) if ipis else 0.0
        duration = max(1, round((p_end - p_start).days / 30))
        sroi = calculate_sroi(
            n_participants=n_p,
            avg_ipi_gain=avg_gain,
            program_cost_eur=cost_eur,
            program_duration_months=duration,
        )

    gain_val = intervention_effect.get("avg_ipi_gain", 0) if isinstance(intervention_effect, dict) else 0
    if gain_val and gain_val > 5:
        narrative = (
            "L'avaluacio independent confirma un efecte d'intervencio estadisticament significatiu. "
            "El programa demostra impacte mesurable i atribuible en les dimensions de l'IPI."
        )
    else:
        narrative = "Les dades recollides mostren una tendencia positiva pendent d'analisi longitudinal completa."

    return {
        "schema_version": "1.0",
        "program_meta": program_meta,
        "intervention_effect": intervention_effect,
        "ipi_evolution": ipi_evolution,
        "risk_distribution": risk_distribution,
        "goals_summary": goals_summary,
        "cohort_trajectories": cohort_trajectories,
        "sroi": sroi,
        "narrative": narrative,
        "methodology_standards": [
            "SROI Network Standard (2012)",
            "OECD DAC Evaluation Criteria",
            "Non-parametric Statistics (Wilcoxon, Bootstrap CI)",
            "Cohen's d — Effect Size",
        ],
    }


@app.websocket(f"{settings.api_prefix}/ws/alerts/{{organization_id}}")
async def ws_alerts(websocket: WebSocket, organization_id: str):
    """WebSocket — alertes en temps real per participants d'alt risc."""
    await websocket.accept()
    try:
        while True:
            async with engine.connect() as raw_conn:
                from sqlalchemy.ext.asyncio import AsyncSession as _WsSession
                async with _WsSession(raw_conn) as ws_db:
                    since = date.today() - timedelta(days=7)
                    risk_q = await ws_db.execute(
                        select(
                            PeriodicAssessment.participant_id,
                            PeriodicAssessment.risk_level,
                            PeriodicAssessment.risk_factors,
                            PeriodicAssessment.assessment_date,
                        )
                        .join(Program, Program.id == PeriodicAssessment.program_id)
                        .where(
                            Program.organization_id == organization_id,
                            PeriodicAssessment.risk_level == "high",
                            PeriodicAssessment.assessment_date >= since,
                        )
                        .order_by(PeriodicAssessment.assessment_date.desc())
                        .limit(20)
                    )
                    rows = risk_q.all()

            now_iso = datetime.utcnow().isoformat()
            if rows:
                for row in rows:
                    factors = []
                    if row.risk_factors:
                        try:
                            factors = (
                                json.loads(row.risk_factors)
                                if isinstance(row.risk_factors, str)
                                else row.risk_factors
                            )
                        except Exception:
                            factors = []
                    await websocket.send_json({
                        "type": "risk_alert",
                        "participant_id": row.participant_id,
                        "risk_level": row.risk_level,
                        "factors": factors,
                        "timestamp": now_iso,
                    })
            else:
                await websocket.send_json({
                    "type": "heartbeat",
                    "timestamp": now_iso,
                    "message": "No high-risk alerts in the last 7 days",
                })
            await asyncio.sleep(30)
    except WebSocketDisconnect:
        pass
    except Exception:
        try:
            await websocket.close()
        except Exception:
            pass
