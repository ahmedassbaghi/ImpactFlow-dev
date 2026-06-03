"""Academic years and grade-level catalog."""
from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.constants.grade_levels import GRADE_LEVELS, label_for_key, next_grade
from app.database import get_db
from app.models import (
    AcademicYear,
    Participant,
    ParticipantGradeHistory,
    School,
    User,
)
from app.services.academic_year_context import (
    ensure_single_current,
    suggest_academic_year,
)
from app.utils.deps import require_roles

settings = get_settings()
router = APIRouter(prefix=settings.api_prefix, tags=["academic-years"])


class AcademicYearOut(BaseModel):
    id: str
    title: str
    start_date: date
    end_date: date
    is_current: bool
    active: bool

    class Config:
        from_attributes = True


class AcademicYearCreate(BaseModel):
    title: str
    start_date: date
    end_date: date
    is_current: bool = False


class AcademicYearUpdate(BaseModel):
    title: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    is_current: bool | None = None


class StudentYearOut(BaseModel):
    participant_id: str
    code: str
    first_name: str
    school_name: str | None
    grade_key: str | None
    grade_label: str | None
    grade_status: str | None


class PromoteItem(BaseModel):
    participant_id: str
    code: str
    first_name: str
    current_grade_key: str | None
    current_grade_label: str | None
    proposed_grade_key: str | None
    proposed_grade_label: str | None
    action: str


class PromoteRequest(BaseModel):
    execute: bool = False
    overrides: list[dict] | None = None


class PromoteResponse(BaseModel):
    preview: list[PromoteItem]
    applied: int = 0
    skipped: int = 0
    no_next_level: list[str] = Field(default_factory=list)


def _year_status(year: AcademicYear) -> str:
    today = date.today()
    if year.is_current:
        return "current"
    if year.end_date < today:
        return "past"
    if year.start_date > today:
        return "future"
    return "past"


@router.get("/grade-levels")
async def list_grade_levels() -> list[dict]:
    return GRADE_LEVELS


@router.get("/academic-years/suggest")
async def suggest_year(
    current_user: User = Depends(require_roles("admin", "coordinator")),
) -> dict:
    return suggest_academic_year()


@router.get("/academic-years", response_model=list[AcademicYearOut])
async def list_academic_years(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("admin", "coordinator")),
) -> list[AcademicYear]:
    result = await db.execute(
        select(AcademicYear)
        .where(
            AcademicYear.organization_id == current_user.organization_id,
            AcademicYear.active == True,
        )
        .order_by(AcademicYear.start_date.desc())
    )
    return list(result.scalars().all())


@router.post("/academic-years", response_model=AcademicYearOut, status_code=status.HTTP_201_CREATED)
async def create_academic_year(
    payload: AcademicYearCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("admin", "coordinator")),
) -> AcademicYear:
    dup = await db.execute(
        select(AcademicYear).where(
            AcademicYear.organization_id == current_user.organization_id,
            AcademicYear.title == payload.title,
        )
    )
    if dup.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Ja existeix un any amb aquest títol")

    count_q = await db.execute(
        select(AcademicYear).where(
            AcademicYear.organization_id == current_user.organization_id,
            AcademicYear.active == True,
        )
    )
    is_first = count_q.scalar_one_or_none() is None
    make_current = payload.is_current or is_first

    year = AcademicYear(
        organization_id=current_user.organization_id,
        title=payload.title,
        start_date=payload.start_date,
        end_date=payload.end_date,
        is_current=make_current,
    )
    db.add(year)
    await db.flush()
    if make_current:
        await ensure_single_current(db, current_user.organization_id, year.id)
    await db.commit()
    await db.refresh(year)
    return year


@router.patch("/academic-years/{year_id}", response_model=AcademicYearOut)
async def update_academic_year(
    year_id: str,
    payload: AcademicYearUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("admin", "coordinator")),
) -> AcademicYear:
    result = await db.execute(
        select(AcademicYear).where(
            AcademicYear.id == year_id,
            AcademicYear.organization_id == current_user.organization_id,
        )
    )
    year = result.scalar_one_or_none()
    if not year:
        raise HTTPException(status_code=404, detail="Any escolar no trobat")
    if payload.title is not None:
        year.title = payload.title
    if payload.start_date is not None:
        year.start_date = payload.start_date
    if payload.end_date is not None:
        year.end_date = payload.end_date
    if payload.is_current is True:
        await ensure_single_current(db, current_user.organization_id, year.id)
    await db.commit()
    await db.refresh(year)
    return year


@router.delete("/academic-years/{year_id}")
async def deactivate_academic_year(
    year_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("admin", "coordinator")),
) -> dict:
    result = await db.execute(
        select(AcademicYear).where(
            AcademicYear.id == year_id,
            AcademicYear.organization_id == current_user.organization_id,
        )
    )
    year = result.scalar_one_or_none()
    if not year:
        raise HTTPException(status_code=404, detail="Any escolar no trobat")
    year.active = False
    year.is_current = False
    await db.commit()
    return {"deactivated": True}


@router.post("/academic-years/{year_id}/set-current", response_model=AcademicYearOut)
async def set_current_year(
    year_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("admin", "coordinator")),
) -> AcademicYear:
    result = await db.execute(
        select(AcademicYear).where(
            AcademicYear.id == year_id,
            AcademicYear.organization_id == current_user.organization_id,
            AcademicYear.active == True,
        )
    )
    year = result.scalar_one_or_none()
    if not year:
        raise HTTPException(status_code=404, detail="Any escolar no trobat")
    await ensure_single_current(db, current_user.organization_id, year.id)
    await db.commit()
    await db.refresh(year)
    return year


@router.get("/academic-years/{year_id}/students", response_model=list[StudentYearOut])
async def list_year_students(
    year_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("admin", "coordinator")),
) -> list[StudentYearOut]:
    result = await db.execute(
        select(ParticipantGradeHistory, Participant, School)
        .join(Participant, Participant.id == ParticipantGradeHistory.participant_id)
        .outerjoin(School, School.id == Participant.school_id)
        .where(
            ParticipantGradeHistory.academic_year_id == year_id,
            Participant.organization_id == current_user.organization_id,
        )
        .order_by(Participant.first_name)
    )
    out: list[StudentYearOut] = []
    for gh, p, school in result.all():
        out.append(
            StudentYearOut(
                participant_id=p.id,
                code=p.code,
                first_name=p.first_name,
                school_name=school.name if school else None,
                grade_key=gh.grade_key,
                grade_label=gh.grade_label,
                grade_status=gh.status,
            )
        )
    return out


@router.post("/academic-years/{year_id}/promote-students", response_model=PromoteResponse)
async def promote_students(
    year_id: str,
    body: PromoteRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("admin", "coordinator")),
) -> PromoteResponse:
    target_result = await db.execute(
        select(AcademicYear).where(
            AcademicYear.id == year_id,
            AcademicYear.organization_id == current_user.organization_id,
        )
    )
    target_year = target_result.scalar_one_or_none()
    if not target_year:
        raise HTTPException(status_code=404, detail="Any destí no trobat")

    prev_result = await db.execute(
        select(AcademicYear)
        .where(
            AcademicYear.organization_id == current_user.organization_id,
            AcademicYear.active == True,
            AcademicYear.id != year_id,
        )
        .order_by(AcademicYear.start_date.desc())
        .limit(1)
    )
    prev_year = prev_result.scalar_one_or_none()
    if not prev_year:
        raise HTTPException(status_code=400, detail="No hi ha any anterior per promocionar")

    prev_grades = await db.execute(
        select(ParticipantGradeHistory, Participant)
        .join(Participant, Participant.id == ParticipantGradeHistory.participant_id)
        .where(ParticipantGradeHistory.academic_year_id == prev_year.id)
    )
    existing_target = await db.execute(
        select(ParticipantGradeHistory.participant_id).where(
            ParticipantGradeHistory.academic_year_id == year_id
        )
    )
    already_in_target = {r[0] for r in existing_target.all()}

    override_map: dict[str, str] = {}
    if body.overrides:
        for o in body.overrides:
            pid = o.get("participant_id")
            action = o.get("action", "accept")
            if pid:
                override_map[pid] = action

    preview: list[PromoteItem] = []
    no_next: list[str] = []
    applied = 0
    skipped = 0

    for gh, p in prev_grades.all():
        if p.id in already_in_target:
            preview.append(
                PromoteItem(
                    participant_id=p.id,
                    code=p.code,
                    first_name=p.first_name,
                    current_grade_key=gh.grade_key,
                    current_grade_label=gh.grade_label,
                    proposed_grade_key=None,
                    proposed_grade_label=None,
                    action="skip",
                )
            )
            skipped += 1
            continue

        proposed_key = next_grade(gh.grade_key)
        proposed_label = label_for_key(proposed_key) if proposed_key else None
        action = override_map.get(p.id, "accept")

        if action == "skip":
            preview.append(
                PromoteItem(
                    participant_id=p.id,
                    code=p.code,
                    first_name=p.first_name,
                    current_grade_key=gh.grade_key,
                    current_grade_label=gh.grade_label,
                    proposed_grade_key=proposed_key,
                    proposed_grade_label=proposed_label,
                    action="skip",
                )
            )
            skipped += 1
            continue

        if action == "repeated":
            new_key, new_label, new_status = gh.grade_key, gh.grade_label, "repeated"
        elif action == "advanced" and proposed_key:
            adv = next_grade(proposed_key)
            if adv:
                new_key, new_label, new_status = adv, label_for_key(adv), "advanced"
            else:
                new_key, new_label, new_status = proposed_key, proposed_label, "advanced"
        elif not proposed_key:
            no_next.append(p.code)
            preview.append(
                PromoteItem(
                    participant_id=p.id,
                    code=p.code,
                    first_name=p.first_name,
                    current_grade_key=gh.grade_key,
                    current_grade_label=gh.grade_label,
                    proposed_grade_key=None,
                    proposed_grade_label=None,
                    action="no_next",
                )
            )
            continue
        else:
            new_key, new_label, new_status = proposed_key, proposed_label, "promoted"

        preview.append(
            PromoteItem(
                participant_id=p.id,
                code=p.code,
                first_name=p.first_name,
                current_grade_key=gh.grade_key,
                current_grade_label=gh.grade_label,
                proposed_grade_key=new_key,
                proposed_grade_label=new_label,
                action=action if action in ("repeated", "advanced") else "accept",
            )
        )

        if body.execute and new_key and new_label:
            db.add(
                ParticipantGradeHistory(
                    participant_id=p.id,
                    academic_year_id=year_id,
                    grade_key=new_key,
                    grade_label=new_label,
                    status=new_status,
                )
            )
            p.current_grade_key = new_key
            p.current_grade_label = new_label
            applied += 1

    if body.execute:
        await db.commit()

    return PromoteResponse(
        preview=preview,
        applied=applied,
        skipped=skipped,
        no_next_level=no_next,
    )
