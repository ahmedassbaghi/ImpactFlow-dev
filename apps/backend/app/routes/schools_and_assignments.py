"""Schools, assignments, org settings, follow-up assessments, donor SROI."""
from __future__ import annotations

import math
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.algorithms.ipi import DimensionScores, calculate_ipi, calculate_relative_improvement
from app.algorithms.predictor import predict_next_ipi
from app.algorithms.risk_engine import calculate_risk_score
from app.algorithms.sroi_engine import calculate_sroi
from app.config import get_settings
from app.database import get_db
from app.models import (
    BaselineAssessment,
    Organization,
    Participant,
    PeriodicAssessment,
    Program,
    ProgramEnrollment,
    School,
    Session,
    SessionObservation,
    User,
    UserParticipantAssignment,
)
from app.schemas.api import (
    FollowUpAssessmentInput,
    LandingContentUpdate,
    OrganizationSettingsOut,
    OrganizationSettingsUpdate,
    SchoolCreate,
    SchoolOut,
    SchoolUpdate,
    UserAssignmentUpdate,
)
from app.services.session_analytics_service import build_participant_feature_bundle
from app.utils.deps import get_current_user, require_roles
from app.utils.participant_code import next_participant_code

settings = get_settings()
router = APIRouter()


def _scale_10_to_5(score: int | None) -> int | None:
    if score is None:
        return None
    return max(1, min(5, math.ceil(score / 2)))


@router.get(f"{settings.api_prefix}/schools", response_model=list[SchoolOut])
async def list_schools(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    schools_q = await db.execute(
        select(School).where(School.organization_id == current_user.organization_id).order_by(School.name)
    )
    schools = list(schools_q.scalars().all())
    counts_q = await db.execute(
        select(Participant.school_id, func.count(Participant.id))
        .where(Participant.organization_id == current_user.organization_id, Participant.active == True)
        .group_by(Participant.school_id)
    )
    counts = dict(counts_q.all())
    return [
        SchoolOut(
            id=s.id,
            name=s.name,
            abbreviation=s.abbreviation,
            active=s.active,
            participant_count=counts.get(s.id, 0),
        )
        for s in schools
    ]


@router.post(f"{settings.api_prefix}/schools", response_model=SchoolOut)
async def create_school(
    payload: SchoolCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("admin", "coordinator")),
):
    abbr = payload.abbreviation.upper().strip()
    dup = await db.execute(
        select(School).where(
            School.organization_id == current_user.organization_id,
            School.abbreviation == abbr,
        )
    )
    if dup.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="abbreviation_already_exists")
    school = School(
        organization_id=current_user.organization_id,
        name=payload.name.strip(),
        abbreviation=abbr,
    )
    db.add(school)
    await db.commit()
    await db.refresh(school)
    return SchoolOut(
        id=school.id, name=school.name, abbreviation=school.abbreviation, active=school.active, participant_count=0
    )


@router.patch(f"{settings.api_prefix}/schools/{{school_id}}", response_model=SchoolOut)
async def update_school(
    school_id: str,
    payload: SchoolUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("admin", "coordinator")),
):
    result = await db.execute(
        select(School).where(School.id == school_id, School.organization_id == current_user.organization_id)
    )
    school = result.scalar_one_or_none()
    if not school:
        raise HTTPException(status_code=404, detail="School not found")
    if payload.name is not None:
        school.name = payload.name.strip()
    if payload.abbreviation is not None:
        abbr = payload.abbreviation.upper().strip()
        dup = await db.execute(
            select(School).where(
                School.organization_id == current_user.organization_id,
                School.abbreviation == abbr,
                School.id != school_id,
            )
        )
        if dup.scalar_one_or_none():
            raise HTTPException(status_code=409, detail="abbreviation_already_exists")
        school.abbreviation = abbr
    if payload.active is not None:
        school.active = payload.active
    await db.commit()
    await db.refresh(school)
    count_q = await db.execute(
        select(func.count(Participant.id)).where(Participant.school_id == school.id, Participant.active == True)
    )
    return SchoolOut(
        id=school.id,
        name=school.name,
        abbreviation=school.abbreviation,
        active=school.active,
        participant_count=count_q.scalar_one() or 0,
    )


@router.delete(f"{settings.api_prefix}/schools/{{school_id}}")
async def delete_school(
    school_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("admin", "coordinator")),
):
    result = await db.execute(
        select(School).where(School.id == school_id, School.organization_id == current_user.organization_id)
    )
    school = result.scalar_one_or_none()
    if not school:
        raise HTTPException(status_code=404, detail="School not found")
    count_q = await db.execute(select(func.count(Participant.id)).where(Participant.school_id == school_id))
    if (count_q.scalar_one() or 0) > 0:
        raise HTTPException(status_code=403, detail="school_has_participants")
    await db.delete(school)
    await db.commit()
    return {"deleted": True}


@router.get(f"{settings.api_prefix}/schools/{{school_id}}/participants")
async def list_school_participants(
    school_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.utils.participants import participants_to_out_list

    result = await db.execute(
        select(Participant).where(
            Participant.school_id == school_id,
            Participant.organization_id == current_user.organization_id,
        )
    )
    return await participants_to_out_list(db, list(result.scalars().all()))


@router.get(f"{settings.api_prefix}/users/{{user_id}}/participants")
async def get_user_participant_assignments(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("admin", "coordinator")),
):
    from app.utils.participants import participants_to_out_list

    result = await db.execute(
        select(Participant)
        .join(UserParticipantAssignment, UserParticipantAssignment.participant_id == Participant.id)
        .where(
            UserParticipantAssignment.user_id == user_id,
            Participant.organization_id == current_user.organization_id,
        )
    )
    return await participants_to_out_list(db, list(result.scalars().all()))


@router.put(f"{settings.api_prefix}/users/{{user_id}}/participants")
async def set_user_participant_assignments(
    user_id: str,
    payload: UserAssignmentUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("admin", "coordinator")),
):
    user_q = await db.execute(
        select(User).where(User.id == user_id, User.organization_id == current_user.organization_id)
    )
    if not user_q.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="User not found")
    existing = await db.execute(
        select(UserParticipantAssignment).where(UserParticipantAssignment.user_id == user_id)
    )
    for row in existing.scalars().all():
        await db.delete(row)
    for pid in payload.participant_ids:
        db.add(UserParticipantAssignment(user_id=user_id, participant_id=pid))
    await db.commit()
    return {"assigned": len(payload.participant_ids)}


@router.get(f"{settings.api_prefix}/organization/settings", response_model=OrganizationSettingsOut)
async def get_org_settings(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("admin", "coordinator")),
):
    org_q = await db.execute(select(Organization).where(Organization.id == current_user.organization_id))
    org = org_q.scalar_one()
    return OrganizationSettingsOut(participant_code_pattern=org.participant_code_pattern or "{abbr}-{year}-{seq:03}")


@router.patch(f"{settings.api_prefix}/organization/settings", response_model=OrganizationSettingsOut)
async def update_org_settings(
    payload: OrganizationSettingsUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("admin", "coordinator")),
):
    org_q = await db.execute(select(Organization).where(Organization.id == current_user.organization_id))
    org = org_q.scalar_one()
    org.participant_code_pattern = payload.participant_code_pattern
    await db.commit()
    return OrganizationSettingsOut(participant_code_pattern=org.participant_code_pattern)


@router.post(f"{settings.api_prefix}/participants/next-code")
async def preview_next_code(
    school_id: str = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("admin", "coordinator", "professional")),
):
    code = await next_participant_code(db, current_user.organization_id, school_id)
    return {"code": code}


@router.post(f"{settings.api_prefix}/assessments/follow-up")
async def create_follow_up_assessment(
    payload: FollowUpAssessmentInput,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("admin", "coordinator", "professional")),
):
    """Seguiment amb escala 0-10 per dimensió; es mapa a escala 1-5 per IPI."""
    participant_q = await db.execute(select(Participant).where(Participant.id == payload.participant_id))
    participant = participant_q.scalar_one_or_none()
    if not participant:
        raise HTTPException(status_code=404, detail="Participant not found")

    ac = _scale_10_to_5(payload.academic_score)
    co = _scale_10_to_5(payload.cognitive_score)
    so = _scale_10_to_5(payload.social_score)
    in_ = _scale_10_to_5(payload.integration_score)

    scores = DimensionScores(
        reading_level=ac,
        math_level=ac,
        comprehension_level=ac,
        attention_level=co,
        memory_level=co,
        autonomy_level=co,
        peer_interaction=so,
        group_work=so,
        emotional_regulation=so,
        language_fluency=in_,
        cultural_adaptation=in_,
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
        period_label=payload.period_label,
        reading_level=ac,
        math_level=ac,
        comprehension_level=ac,
        attention_level=co,
        memory_level=co,
        autonomy_level=co,
        peer_interaction=so,
        group_work=so,
        emotional_regulation=so,
        language_fluency=in_,
        cultural_adaptation=in_,
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
        "scores_0_10": {
            "academic": payload.academic_score,
            "cognitive": payload.cognitive_score,
            "social": payload.social_score,
            "integration": payload.integration_score,
        },
    }


async def compute_sroi_for_program(
    db: AsyncSession,
    program_id: str,
    cost_eur: float,
    months: int,
) -> dict:
    """Shared SROI calculation used by analytics and public donor endpoint."""
    enrolled_q = await db.execute(
        select(func.count(func.distinct(BaselineAssessment.participant_id))).where(
            BaselineAssessment.program_id == program_id
        )
    )
    n_enrolled = enrolled_q.scalar_one() or 0
    if n_enrolled == 0:
        obs_q = await db.execute(
            select(func.count(func.distinct(SessionObservation.participant_id)))
            .join(Session, Session.id == SessionObservation.session_id)
            .where(Session.program_id == program_id)
        )
        n_enrolled = obs_q.scalar_one() or 1

    def _dim_avg(vals):
        valid = [float(v) for v in vals if v is not None]
        return (sum(valid) / len(valid) - 1) / 4 * 100 if valid else 0.0

    baseline_q = await db.execute(
        select(BaselineAssessment).where(BaselineAssessment.program_id == program_id)
    )
    baselines = baseline_q.scalars().all()
    baseline_ipis = []
    for b in baselines:
        academic = _dim_avg([b.reading_level, b.math_level, b.comprehension_level])
        cognitive = _dim_avg([b.attention_level, b.memory_level, b.autonomy_level])
        social = _dim_avg([b.peer_interaction, b.group_work, b.emotional_regulation])
        integration = _dim_avg([b.language_fluency, b.cultural_adaptation])
        baseline_ipis.append(academic * 0.30 + cognitive * 0.20 + social * 0.30 + integration * 0.20)

    latest_q = await db.execute(
        select(PeriodicAssessment.participant_id, PeriodicAssessment.ipi_score)
        .where(PeriodicAssessment.program_id == program_id)
        .order_by(PeriodicAssessment.assessment_date.desc())
    )
    seen: set = set()
    current_ipis = []
    for row in latest_q.all():
        if row.participant_id not in seen and row.ipi_score:
            seen.add(row.participant_id)
            current_ipis.append(float(row.ipi_score))

    avg_baseline = sum(baseline_ipis) / len(baseline_ipis) if baseline_ipis else 0.0
    avg_current = sum(current_ipis) / len(current_ipis) if current_ipis else avg_baseline
    avg_ipi_gain = max(0.0, avg_current - avg_baseline)

    sessions_q = await db.execute(select(func.count(Session.id)).where(Session.program_id == program_id))
    n_sessions_actual = sessions_q.scalar_one() or 0
    n_sessions = max(n_sessions_actual, months * 3)

    return calculate_sroi(
        n_participants=n_enrolled,
        avg_ipi_gain=avg_ipi_gain,
        program_cost_eur=cost_eur,
        program_duration_months=months,
        extra={"sessions": n_sessions, "avg_duration_h": 1.5},
    )


@router.get(f"{settings.api_prefix}/dashboard/donor/{{org_slug}}/sroi")
async def donor_sroi(
    org_slug: str,
    cost_eur: float = Query(..., gt=0),
    months: int = Query(9, ge=1, le=36),
    program_id: str | None = None,
    db: AsyncSession = Depends(get_db),
):
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
            .order_by(Program.start_date.desc())
        )
    prog = prog_q.scalar_one_or_none() if program_id else prog_q.scalars().first()
    if not prog:
        raise HTTPException(status_code=404, detail="Program not found")
    return await compute_sroi_for_program(db, prog.id, cost_eur, months)


@router.get(f"{settings.api_prefix}/organization/landing")
async def get_landing_content(
    org_slug: str = Query(default="narinan"),
    db: AsyncSession = Depends(get_db),
):
    org_q = await db.execute(select(Organization).where(Organization.slug == org_slug))
    org = org_q.scalar_one_or_none()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    import json

    content = []
    if org.landing_content:
        try:
            content = json.loads(org.landing_content)
        except json.JSONDecodeError:
            content = []
    return {"sections": content}


@router.patch(f"{settings.api_prefix}/organization/landing")
async def update_landing_content(
    payload: LandingContentUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("admin", "coordinator")),
):
    import json

    org_q = await db.execute(select(Organization).where(Organization.id == current_user.organization_id))
    org = org_q.scalar_one()
    org.landing_content = payload.landing_content
    await db.commit()
    try:
        sections = json.loads(payload.landing_content)
    except json.JSONDecodeError:
        raise HTTPException(status_code=422, detail="Invalid JSON")
    return {"sections": sections}
