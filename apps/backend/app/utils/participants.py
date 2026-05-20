"""Participant serialization helpers."""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Participant, School
from app.schemas.api import ParticipantOut


async def load_schools_map(db: AsyncSession, school_ids: set[str]) -> dict[str, School]:
    if not school_ids:
        return {}
    result = await db.execute(select(School).where(School.id.in_(school_ids)))
    return {s.id: s for s in result.scalars().all()}


def participant_to_out(participant: Participant, school: School | None = None) -> ParticipantOut:
    return ParticipantOut(
        id=participant.id,
        code=participant.code,
        first_name=participant.first_name,
        nationality=participant.nationality,
        enrollment_date=participant.enrollment_date,
        is_control_group=participant.is_control_group,
        active=participant.active,
        school_id=participant.school_id,
        school_name=school.name if school else None,
        school_abbreviation=school.abbreviation if school else None,
    )


async def participants_to_out_list(
    db: AsyncSession, participants: list[Participant]
) -> list[ParticipantOut]:
    school_ids = {p.school_id for p in participants if p.school_id}
    schools = await load_schools_map(db, school_ids)
    return [participant_to_out(p, schools.get(p.school_id)) for p in participants]
