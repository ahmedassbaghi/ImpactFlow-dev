"""Academic year resolution and current-year management."""
from __future__ import annotations

from datetime import date

from fastapi import HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.core import AcademicYear


def suggest_academic_year() -> dict[str, str | date]:
    """Suggest title and dates for a new academic year."""
    today = date.today()
    y = today.year
    if today.month >= 9 or today.month >= 7:
        title = f"{y}/{y + 1}"
        start = date(y, 9, 1)
        end = date(y + 1, 6, 30)
    elif 1 <= today.month <= 6:
        title = f"{y - 1}/{y}"
        start = date(y - 1, 9, 1)
        end = date(y, 6, 30)
    else:
        title = f"{y}/{y + 1}"
        start = date(y, 9, 1)
        end = date(y + 1, 6, 30)
    return {"title": title, "start_date": start, "end_date": end}


async def get_current_academic_year(
    db: AsyncSession, organization_id: str
) -> AcademicYear | None:
    result = await db.execute(
        select(AcademicYear).where(
            AcademicYear.organization_id == organization_id,
            AcademicYear.is_current == True,
            AcademicYear.active == True,
        )
    )
    return result.scalar_one_or_none()


async def resolve_academic_year_id(
    db: AsyncSession,
    organization_id: str,
    query_param: str | None,
) -> str | None:
    if query_param:
        result = await db.execute(
            select(AcademicYear).where(
                AcademicYear.id == query_param,
                AcademicYear.organization_id == organization_id,
                AcademicYear.active == True,
            )
        )
        year = result.scalar_one_or_none()
        if not year:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Academic year not found",
            )
        return year.id
    current = await get_current_academic_year(db, organization_id)
    return current.id if current else None


async def ensure_single_current(
    db: AsyncSession, organization_id: str, year_id: str
) -> None:
    await db.execute(
        update(AcademicYear)
        .where(
            AcademicYear.organization_id == organization_id,
            AcademicYear.id != year_id,
        )
        .values(is_current=False)
    )
    await db.execute(
        update(AcademicYear)
        .where(AcademicYear.id == year_id)
        .values(is_current=True)
    )
