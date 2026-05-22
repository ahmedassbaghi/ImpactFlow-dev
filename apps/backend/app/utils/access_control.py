"""Organization-scoped access checks for participants and programs."""

from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Participant, Program, ProgramEnrollment, User, UserParticipantAssignment


async def get_org_program(
    db: AsyncSession, program_id: str, organization_id: str
) -> Program:
    result = await db.execute(
        select(Program).where(
            Program.id == program_id,
            Program.organization_id == organization_id,
        )
    )
    program = result.scalar_one_or_none()
    if not program:
        raise HTTPException(status_code=404, detail="Program not found")
    return program


async def get_org_participant(
    db: AsyncSession, participant_id: str, organization_id: str
) -> Participant:
    result = await db.execute(
        select(Participant).where(
            Participant.id == participant_id,
            Participant.organization_id == organization_id,
        )
    )
    participant = result.scalar_one_or_none()
    if not participant:
        raise HTTPException(status_code=404, detail="Participant not found")
    return participant


async def assert_professional_assigned(
    db: AsyncSession, user: User, participant_id: str
) -> None:
    if user.role != "professional":
        return
    assign_q = await db.execute(
        select(UserParticipantAssignment.id).where(
            UserParticipantAssignment.user_id == user.id,
            UserParticipantAssignment.participant_id == participant_id,
        )
    )
    if not assign_q.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Participant not assigned to you")


async def ensure_participant_access(
    db: AsyncSession, user: User, participant_id: str
) -> Participant:
    participant = await get_org_participant(db, participant_id, user.organization_id)
    await assert_professional_assigned(db, user, participant_id)
    return participant


async def assign_participant_to_professional(
    db: AsyncSession, user_id: str, participant_id: str
) -> None:
    existing = await db.execute(
        select(UserParticipantAssignment).where(
            UserParticipantAssignment.user_id == user_id,
            UserParticipantAssignment.participant_id == participant_id,
        )
    )
    if not existing.scalar_one_or_none():
        db.add(UserParticipantAssignment(user_id=user_id, participant_id=participant_id))
