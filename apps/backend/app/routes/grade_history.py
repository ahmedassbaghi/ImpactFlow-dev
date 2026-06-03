"""Participant grade history endpoints."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.constants.grade_levels import is_valid_grade_key, label_for_key
from app.database import get_db
from app.models import AcademicYear, Participant, ParticipantGradeHistory, User
from app.services.academic_year_context import get_current_academic_year, resolve_academic_year_id
from app.utils.deps import require_roles

settings = get_settings()
router = APIRouter(prefix=settings.api_prefix, tags=["grade-history"])


class GradeHistoryOut(BaseModel):
    id: str
    academic_year_id: str
    academic_year_title: str | None = None
    grade_key: str
    grade_label: str
    status: str
    notes: str | None = None

    class Config:
        from_attributes = True


class GradeHistoryCreate(BaseModel):
    participant_id: str
    academic_year_id: str | None = None
    grade_key: str
    status: str = "enrolled"
    notes: str | None = None


class GradeHistoryUpdate(BaseModel):
    grade_key: str | None = None
    status: str | None = None
    notes: str | None = None


@router.get("/participants/{participant_id}/grade-history", response_model=list[GradeHistoryOut])
async def get_participant_grade_history(
    participant_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("admin", "coordinator", "professional")),
) -> list[GradeHistoryOut]:
    p_result = await db.execute(
        select(Participant).where(
            Participant.id == participant_id,
            Participant.organization_id == current_user.organization_id,
        )
    )
    if not p_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Participant not found")

    result = await db.execute(
        select(ParticipantGradeHistory, AcademicYear)
        .join(AcademicYear, AcademicYear.id == ParticipantGradeHistory.academic_year_id)
        .where(ParticipantGradeHistory.participant_id == participant_id)
        .order_by(AcademicYear.start_date.desc())
    )
    return [
        GradeHistoryOut(
            id=gh.id,
            academic_year_id=gh.academic_year_id,
            academic_year_title=ay.title,
            grade_key=gh.grade_key,
            grade_label=gh.grade_label,
            status=gh.status,
            notes=gh.notes,
        )
        for gh, ay in result.all()
    ]


@router.post("/participant-grade-history", response_model=GradeHistoryOut, status_code=status.HTTP_201_CREATED)
async def create_grade_history(
    payload: GradeHistoryCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("admin", "coordinator")),
) -> GradeHistoryOut:
    if not is_valid_grade_key(payload.grade_key):
        raise HTTPException(status_code=400, detail="Nivell no vàlid")

    p_result = await db.execute(
        select(Participant).where(
            Participant.id == payload.participant_id,
            Participant.organization_id == current_user.organization_id,
        )
    )
    participant = p_result.scalar_one_or_none()
    if not participant:
        raise HTTPException(status_code=404, detail="Participant not found")

    year_id = payload.academic_year_id
    if not year_id:
        year_id = await resolve_academic_year_id(db, current_user.organization_id, None)
    if not year_id:
        raise HTTPException(status_code=400, detail="No hi ha any escolar actual")

    label = label_for_key(payload.grade_key) or payload.grade_key
    existing = await db.execute(
        select(ParticipantGradeHistory).where(
            ParticipantGradeHistory.participant_id == payload.participant_id,
            ParticipantGradeHistory.academic_year_id == year_id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Ja té nivell assignat per aquest any")

    gh = ParticipantGradeHistory(
        participant_id=payload.participant_id,
        academic_year_id=year_id,
        grade_key=payload.grade_key,
        grade_label=label,
        status=payload.status,
        notes=payload.notes,
    )
    db.add(gh)
    participant.current_grade_key = payload.grade_key
    participant.current_grade_label = label
    await db.commit()
    await db.refresh(gh)

    ay_result = await db.execute(select(AcademicYear).where(AcademicYear.id == year_id))
    ay = ay_result.scalar_one_or_none()
    return GradeHistoryOut(
        id=gh.id,
        academic_year_id=gh.academic_year_id,
        academic_year_title=ay.title if ay else None,
        grade_key=gh.grade_key,
        grade_label=gh.grade_label,
        status=gh.status,
        notes=gh.notes,
    )


@router.patch("/participant-grade-history/{history_id}", response_model=GradeHistoryOut)
async def update_grade_history(
    history_id: str,
    payload: GradeHistoryUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("admin", "coordinator")),
) -> GradeHistoryOut:
    result = await db.execute(
        select(ParticipantGradeHistory, Participant)
        .join(Participant, Participant.id == ParticipantGradeHistory.participant_id)
        .where(
            ParticipantGradeHistory.id == history_id,
            Participant.organization_id == current_user.organization_id,
        )
    )
    row = result.one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Historial no trobat")
    gh, participant = row

    if payload.grade_key is not None:
        if not is_valid_grade_key(payload.grade_key):
            raise HTTPException(status_code=400, detail="Nivell no vàlid")
        gh.grade_key = payload.grade_key
        gh.grade_label = label_for_key(payload.grade_key) or payload.grade_key
        participant.current_grade_key = gh.grade_key
        participant.current_grade_label = gh.grade_label
    if payload.status is not None:
        gh.status = payload.status
    if payload.notes is not None:
        gh.notes = payload.notes

    await db.commit()
    await db.refresh(gh)
    ay_result = await db.execute(select(AcademicYear).where(AcademicYear.id == gh.academic_year_id))
    ay = ay_result.scalar_one_or_none()
    return GradeHistoryOut(
        id=gh.id,
        academic_year_id=gh.academic_year_id,
        academic_year_title=ay.title if ay else None,
        grade_key=gh.grade_key,
        grade_label=gh.grade_label,
        status=gh.status,
        notes=gh.notes,
    )
