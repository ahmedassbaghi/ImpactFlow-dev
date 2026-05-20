"""Generate participant codes from organization pattern."""
from __future__ import annotations

import re
from datetime import date

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Organization, Participant, School

DEFAULT_PATTERN = "{abbr}-{year}-{seq:03}"


def _escape_regex(s: str) -> str:
    return re.escape(s)


def build_code_from_pattern(
    pattern: str,
    *,
    abbr: str,
    year: int,
    seq: int,
) -> str:
    code = pattern
    code = code.replace("{abbr}", abbr.upper())
    code = code.replace("{year}", str(year))
    code = code.replace("{seq:03}", f"{seq:03d}")
    code = code.replace("{seq}", str(seq))
    return code


async def next_participant_code(
    db: AsyncSession,
    organization_id: str,
    school_id: str,
) -> str:
    org_q = await db.execute(select(Organization).where(Organization.id == organization_id))
    org = org_q.scalar_one()
    pattern = org.participant_code_pattern or DEFAULT_PATTERN

    school_q = await db.execute(select(School).where(School.id == school_id))
    school = school_q.scalar_one()
    abbr = school.abbreviation.upper()
    year = date.today().year

    prefix = build_code_from_pattern(pattern, abbr=abbr, year=year, seq=0)
    prefix = re.sub(r"\d{3}$", "", prefix) if "{seq" in pattern else prefix

    count_q = await db.execute(
        select(func.count(Participant.id)).where(
            Participant.organization_id == organization_id,
            Participant.code.like(f"{prefix}%"),
        )
    )
    seq = (count_q.scalar_one() or 0) + 1
    return build_code_from_pattern(pattern, abbr=abbr, year=year, seq=seq)
