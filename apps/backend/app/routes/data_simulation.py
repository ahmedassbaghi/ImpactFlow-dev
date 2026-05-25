"""Endpoints de simulació de dades (coordinació / admin)."""

import dataclasses
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_db
from app.models import User
from app.services.data_simulation_service import (
    _dedupe_periodic_for_participants,
    get_job,
    get_simulation_status,
    reset_and_seed,
    run_session_simulation,
    start_simulation_job,
)
from app.models import Participant
from sqlalchemy import select
from app.utils.deps import require_roles

settings = get_settings()
router = APIRouter()


# ─── Pydantic models ──────────────────────────────────────────────────────────

class PeriodConfigIn(BaseModel):
    weeks: int = Field(10, ge=1, le=52)
    intensity: float = Field(1.0, ge=0.1, le=3.0)
    label: str = ""


class SimulationGenerateIn(BaseModel):
    sessions_per_participant: int = Field(20, ge=1, le=120)
    run_mode: str = "additive"           # "additive" | "fill"
    clear_existing_sessions: bool = False
    program_id: str | None = None
    span_weeks: int = Field(24, ge=4, le=104)
    start_date: date | None = None       # Si es proporciona, distribueix sessions a partir d'aquí
    end_date: date | None = None         # Si es proporciona, distribueix sessions fins aquí
    absence_rate: float = Field(0.05, ge=0.0, le=0.40)
    optimism_bias: float = Field(0.0, ge=-1.0, le=1.0)
    noise_level: float = Field(1.0, ge=0.2, le=2.5)
    profile_weights: dict[str, float] | None = None
    period_configs: list[PeriodConfigIn] | None = None
    random_seed: int | None = None


class SimulationGenerateOut(BaseModel):
    participants_processed: int
    sessions_created: int
    observations_created: int
    sessions_cleared: int
    profile_counts: dict[str, int]
    profile_ipi_start: dict[str, list[float]]
    profile_ipi_end: dict[str, list[float]]
    ipi_gain_avg: float
    ipi_gain_by_profile: dict[str, float]
    messages: list[str]


class ResetAndSeedIn(BaseModel):
    n_participants: int = Field(20, ge=5, le=100)
    program_id: str | None = None
    random_seed: int | None = None


class ResetAndSeedOut(BaseModel):
    participants_created: int
    program_name: str
    school_name: str
    baseline_ipi_avg: float
    baseline_ipi_min: float
    baseline_ipi_max: float
    profile_counts: dict[str, int]
    messages: list[str]


class SimulationJobIn(BaseModel):
    sessions_per_participant: int = Field(20, ge=1, le=120)
    run_mode: str = "additive"
    clear_existing_sessions: bool = False
    program_id: str | None = None
    span_weeks: int = Field(24, ge=4, le=104)
    start_date: date | None = None       # Si es proporciona, distribueix sessions a partir d'aquí
    end_date: date | None = None         # Si es proporciona, distribueix sessions fins aquí
    absence_rate: float = Field(0.05, ge=0.0, le=0.40)
    optimism_bias: float = Field(0.0, ge=-1.0, le=1.0)
    noise_level: float = Field(1.0, ge=0.2, le=2.5)
    profile_weights: dict[str, float] | None = None
    period_configs: list[PeriodConfigIn] | None = None
    random_seed: int | None = None


class SimulationJobStartOut(BaseModel):
    job_id: str


class LogEntryOut(BaseModel):
    t: str
    name: str
    session: int
    total: int
    ipi: float
    delta: str
    profile: str
    att: str


class JobStatusOut(BaseModel):
    status: str
    progress: int
    current_name: str
    participants_done: int
    participants_total: int
    sessions_created: int
    log: list[dict]
    result: dict | None
    error: str | None


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get(f"{settings.api_prefix}/simulation/status")
async def simulation_status(
    program_id: str | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("admin", "coordinator")),
):
    return await get_simulation_status(db, current_user.organization_id, program_id)


@router.post(f"{settings.api_prefix}/simulation/generate", response_model=SimulationGenerateOut)
async def simulation_generate(
    payload: SimulationGenerateIn,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("admin", "coordinator")),
):
    period_configs = [pc.model_dump() for pc in payload.period_configs] if payload.period_configs else None
    result = await run_session_simulation(
        db,
        organization_id=current_user.organization_id,
        sessions_per_participant=payload.sessions_per_participant,
        run_mode=payload.run_mode,
        clear_existing_sessions=payload.clear_existing_sessions,
        program_id=payload.program_id,
        span_weeks=payload.span_weeks,
        start_date=payload.start_date,
        end_date=payload.end_date,
        absence_rate=payload.absence_rate,
        optimism_bias=payload.optimism_bias,
        noise_level=payload.noise_level,
        profile_weights=payload.profile_weights,
        period_configs=period_configs,
        random_seed=payload.random_seed,
    )
    return dataclasses.asdict(result)


@router.post(f"{settings.api_prefix}/simulation/reset-and-seed", response_model=ResetAndSeedOut)
async def simulation_reset_and_seed(
    payload: ResetAndSeedIn,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("admin", "coordinator")),
):
    result = await reset_and_seed(
        db,
        organization_id=current_user.organization_id,
        n_participants=payload.n_participants,
        program_id=payload.program_id,
        random_seed=payload.random_seed,
    )
    return dataclasses.asdict(result)


@router.post(f"{settings.api_prefix}/simulation/generate-async", response_model=SimulationJobStartOut)
async def simulation_generate_async(
    payload: SimulationJobIn,
    current_user: User = Depends(require_roles("admin", "coordinator")),
):
    period_configs = [pc.model_dump() for pc in payload.period_configs] if payload.period_configs else None
    job_id = start_simulation_job(
        current_user.organization_id,
        sessions_per_participant=payload.sessions_per_participant,
        run_mode=payload.run_mode,
        clear_existing_sessions=payload.clear_existing_sessions,
        program_id=payload.program_id,
        span_weeks=payload.span_weeks,
        start_date=payload.start_date,
        end_date=payload.end_date,
        absence_rate=payload.absence_rate,
        optimism_bias=payload.optimism_bias,
        noise_level=payload.noise_level,
        profile_weights=payload.profile_weights,
        period_configs=period_configs,
        random_seed=payload.random_seed,
    )
    return {"job_id": job_id}


@router.get(f"{settings.api_prefix}/simulation/job/{{job_id}}", response_model=JobStatusOut)
async def simulation_job_status(
    job_id: str,
    current_user: User = Depends(require_roles("admin", "coordinator")),
):
    job = get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job no trobat.")
    return job


@router.post(f"{settings.api_prefix}/simulation/dedupe-periodic")
async def simulation_dedupe_periodic(
    program_id: str | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("admin", "coordinator")),
):
    """Elimina avaluacions periòdiques duplicades (mateix alumne + dia)."""
    q = select(Participant.id).where(
        Participant.organization_id == current_user.organization_id,
        Participant.active.is_(True),
    )
    pids = [row[0] for row in (await db.execute(q)).all()]
    removed = await _dedupe_periodic_for_participants(db, pids, program_id)
    await db.commit()
    return {"removed": removed, "message": f"Eliminades {removed} files duplicades."}
