import json
from datetime import date, timedelta
from typing import Any

from fastapi import Depends, FastAPI, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.algorithms.ipi import DimensionScores, calculate_ipi, calculate_relative_improvement
from app.algorithms.predictor import predict_next_ipi
from app.algorithms.risk_engine import calculate_risk_score
from app.config import get_settings
from app.database import Base, engine, get_db
from app.models import (
    AttendanceRecord,
    BaselineAssessment,
    Organization,
    Participant,
    PeriodicAssessment,
    Program,
    ProgramMicroGoal,
    ProgramMicroGoalCompletion,
    Report,
    Session,
    SessionObservation,
    User,
)
from app.schemas.api import (
    AssessmentInput,
    LoginRequest,
    MicroGoalCreate,
    MicroGoalOut,
    ParseNoteRequest,
    PlanUpdateRequest,
    ParticipantCreate,
    ParticipantOut,
    ProgramOut,
    ReportListItem,
    ReportRequest,
    ReportStatus,
    SessionCreate,
    SessionOut,
    TokenResponse,
    UserCreateRequest,
    UserOut,
)
from app.services.nlp_service import parse_qualitative_note
from app.services.report_generator import generate_quarterly_report, get_session_quality_summary
from app.services.session_analytics_service import build_participant_feature_bundle
from app.utils.auth import create_token, get_password_hash, verify_password
from app.utils.deps import get_current_user, require_roles

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


@app.get("/")
def read_root():
    return {"status": "ok", "message": "Welcome to ImpactFlow API"}

@app.get("/api/v1/health")
def health_check():
    return {"status": "healthy"}


@app.post(f"{settings.api_prefix}/auth/login", response_model=TokenResponse)
async def login(payload: LoginRequest, db: AsyncSession = Depends(get_db)) -> TokenResponse:
    user_result = await db.execute(select(User).where(User.email == payload.email))
    user = user_result.scalar_one_or_none()
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    access_token = create_token(user.id, "access", {"role": user.role, "org_id": user.organization_id})
    refresh_token = create_token(user.id, "refresh")
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        role=user.role,
        user_id=user.id,
    )


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
    user = User(
        organization_id=current_user.organization_id,
        email=payload.email,
        hashed_password=get_password_hash(payload.password),
        full_name=payload.full_name,
        role=payload.role,
    )
    db.add(user)
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


@app.get(f"{settings.api_prefix}/participants", response_model=list[ParticipantOut])
async def list_participants(
    program_id: str | None = None,
    limit: int = Query(default=100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[ParticipantOut]:
    query = select(Participant).where(Participant.organization_id == current_user.organization_id)
    if program_id:
        query = query.join(BaselineAssessment, BaselineAssessment.participant_id == Participant.id).where(
            BaselineAssessment.program_id == program_id
        )
    result = await db.execute(query.limit(limit))
    return list(result.scalars().all())


@app.post(f"{settings.api_prefix}/participants", response_model=ParticipantOut)
async def create_participant(
    payload: ParticipantCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("admin", "coordinator", "professional")),
) -> ParticipantOut:
    participant = Participant(
        organization_id=current_user.organization_id,
        code=payload.code,
        first_name=payload.first_name,
        birth_year=payload.birth_year,
        gender=payload.gender,
        nationality=payload.nationality,
        enrollment_date=payload.enrollment_date,
        consent_given=payload.consent_given,
        is_control_group=payload.is_control_group,
    )
    db.add(participant)
    await db.commit()
    await db.refresh(participant)
    return participant


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


@app.get(f"{settings.api_prefix}/participants/{{participant_id}}/evolution")
async def participant_evolution(
    participant_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    baseline_q = await db.execute(
        select(BaselineAssessment).where(BaselineAssessment.participant_id == participant_id).limit(1)
    )
    baseline = baseline_q.scalar_one_or_none()

    periodic_q = await db.execute(
        select(PeriodicAssessment)
        .where(PeriodicAssessment.participant_id == participant_id)
        .order_by(PeriodicAssessment.assessment_date)
    )
    periodic = list(periodic_q.scalars().all())
    historical_ipi = [p.ipi_score for p in periodic]
    dates = [p.assessment_date for p in periodic]
    prediction = predict_next_ipi(historical_ipi, dates)
    return {
        "baseline_ipi": baseline.ipi_baseline if baseline else None,
        "timeline": [
            {
                "date": p.assessment_date,
                "ipi_score": p.ipi_score,
                "delta_vs_baseline": p.ipi_delta_vs_baseline,
                "risk_level": p.risk_level,
            }
            for p in periodic
        ],
        "prediction": prediction,
    }


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
        session_type=payload.session_type,
        duration_minutes=payload.duration_minutes,
        notes=payload.notes,
        notes_ai_summary=parsed.get("summary"),
        notes_sentiment=parsed.get("sentiment_score"),
    )
    db.add(session)
    await db.flush()
    for obs in payload.observations:
        parsed_note = await parse_qualitative_note(obs.qualitative_note or "")
        db.add(
            SessionObservation(
                session_id=session.id,
                participant_id=obs.participant_id,
                academic_score=obs.academic_score,
                cognitive_score=obs.cognitive_score,
                social_score=obs.social_score,
                integration_score=obs.integration_score,
                qualitative_note=obs.qualitative_note,
                qualitative_note_parsed_tags=json.dumps(parsed_note.get("tags", [])),
                mood_indicator=obs.mood_indicator,
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
    await db.commit()
    await db.refresh(session)
    return session


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
    return session


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
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("professional", "coordinator", "admin")),
):
    recent_sessions = await db.execute(
        select(Session).where(Session.professional_id == current_user.id).order_by(Session.session_date.desc()).limit(10)
    )
    return {"my_recent_sessions": [s.id for s in recent_sessions.scalars().all()]}


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
async def donor_dashboard(org_slug: str, db: AsyncSession = Depends(get_db)):
    participant_n = await db.execute(select(func.count(Participant.id)))
    avg_ipi = await db.execute(select(func.avg(PeriodicAssessment.ipi_score)))
    return {
        "organization": org_slug,
        "children_served": participant_n.scalar_one() or 0,
        "avg_ipi": round(avg_ipi.scalar_one() or 0, 1),
    }


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
    result = await db.execute(
        select(PeriodicAssessment.period_label, func.avg(PeriodicAssessment.ipi_score))
        .where(
            PeriodicAssessment.program_id == program_id,
            PeriodicAssessment.assessment_date >= start_date,
        )
        .group_by(PeriodicAssessment.period_label)
        .order_by(PeriodicAssessment.period_label)
    )
    return [{"period": p, "avg_ipi": round(v or 0, 1)} for p, v in result.all()]


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
    total_cost_eur: float = Query(default=0, ge=0),
    comparator_cost_eur: float = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if period_end < period_start:
        raise HTTPException(status_code=400, detail="period_end must be greater than or equal to period_start")

    period_days = (period_end - period_start).days + 1
    comparator_end = period_start - timedelta(days=1)
    comparator_start = comparator_end - timedelta(days=max(period_days - 1, 0))

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
                "cost_per_beneficiary": None,
                "cost_per_improved_participant": None,
                "cost_per_ipi_point_gained": None,
                "icer_vs_previous_period": None,
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
    }


@app.post(f"{settings.api_prefix}/nlp/parse-note")
async def nlp_parse_note(
    payload: ParseNoteRequest,
    current_user: User = Depends(require_roles("professional", "coordinator", "admin")),
):
    return await parse_qualitative_note(payload.note_text, payload.participant_context)
