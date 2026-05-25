"""Generació de sessions simulades per a demo i proves (coordinació)."""

from __future__ import annotations

import asyncio
import dataclasses
import random
import uuid
from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import Any

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.algorithms.ipi import DimensionScores, calculate_ipi
from app.algorithms.risk_engine import calculate_risk_score
from app.database import SessionLocal
from app.models import (
    AttendanceRecord,
    BaselineAssessment,
    Participant,
    PeriodicAssessment,
    Program,
    ProgramEnrollment,
    ProgramMicroGoalCompletion,
    School,
    Session,
    SessionObservation,
    User,
    UserParticipantAssignment,
)
from app.utils.participant_metrics import (
    apply_progressive_session_ipi,
    dimension_scores_from_baseline,
    pick_best_periodic,
    resolve_periodic_timeline,
)

SIMULATION_PERIOD_LABEL = "simulation"

# ─── Profile constants ────────────────────────────────────────────────────────
PROFILES = ("stable", "plateau", "late_bloomer", "struggler", "erratic")
PROFILE_WEIGHTS = (0.55, 0.15, 0.12, 0.13, 0.05)
PROFILE_LABELS = {
    "stable": "Millora estable",
    "plateau": "Meseta",
    "late_bloomer": "Despertar tardà",
    "struggler": "Dificultats",
    "erratic": "Irregular",
}

# ─── Name pools ───────────────────────────────────────────────────────────────
FIRST_NAMES = [
    "Ahmed", "Fatima", "Mohamed", "Aisha", "Omar", "Nour", "Yusuf", "Mariam",
    "Karim", "Layla", "Hassan", "Sara", "Ali", "Amina", "Ibrahim", "Zara",
    "Lucas", "Emma", "Pablo", "Sofia", "Marc", "Carla", "David", "Laura",
    "Miguel", "Ana", "Jordi", "Marta", "Ivan", "Elena", "Arjun", "Priya",
    "Wei", "Lin", "Carlos", "Isabella", "Luis", "Valentina", "Andrei", "Ioana",
    "Hamza", "Yasmine", "Bilal", "Hana", "Tariq", "Samira", "Jawad", "Rania",
    "Léa", "Théo", "Camila", "Santiago", "Mateo", "Valentín", "Sofía", "Diego",
]

LAST_NAMES = [
    "García", "Martínez", "López", "Sánchez", "González", "Fernández",
    "El Amrani", "Benali", "Rachidi", "Ouali", "Benhaddou", "Lahlou",
    "Popescu", "Ionescu", "Popa", "Stan", "Dumitrescu",
    "Khan", "Malik", "Patel", "Singh", "Hussain",
    "Zhang", "Li", "Wang", "Chen", "Liu",
    "Diallo", "Traoré", "Koné", "Santos", "Silva", "Souza", "Ramos",
]

NATIONALITIES = [
    "Marroc", "Senegal", "Romania", "Pakistan", "Xina", "Índia",
    "Bolívia", "Equador", "Colòmbia", "Síria", "Ghana", "Filipines",
    "Espanya", "Hondures", "Perú", "Mali", "Guinea", "Bangla Desh",
]

# ─── Session notes ────────────────────────────────────────────────────────────
SESSION_NOTES = [
    "Sessió de seguiment individual. Treball de reforç segons el pla.",
    "Repàs de deures i comprensió lectora amb suport del voluntari.",
    "Activitats curtes de concentració i feedback immediat.",
    "Dinàmica de grup reduït; participació {qual}.",
    "Sessió centrada en objectius de la setmana; actitud {qual}.",
    "Pràctica guiada de matemàtiques i lectura.",
    "Revisió d'avenços i definició de petits objectius.",
    "Tasca d'autonomia de 25 minuts amb suport mínim.",
]

QUALITATIVE = [
    "Avança de forma constant.",
    "Setmana complicada; cal reforçar la confiança.",
    "Millora visible respecte el mes passat.",
    "Costa mantenir l'atenció, però acaba les tasques.",
    "Molt bon clima a la sessió.",
    "Ha necessitat més suport del habitual.",
    "Participació activa i respectuosa.",
]


# ─── In-memory job store ──────────────────────────────────────────────────────
_jobs: dict[str, dict[str, Any]] = {}


def get_job(job_id: str) -> dict[str, Any] | None:
    return _jobs.get(job_id)


def _new_job() -> dict[str, Any]:
    return {
        "status": "pending",        # pending | running | done | error
        "progress": 0,              # 0-100
        "current_name": "",
        "participants_done": 0,
        "participants_total": 0,
        "sessions_created": 0,
        "log": [],                  # live console entries [{t, msg, ipi, delta}]
        "result": None,
        "error": None,
    }


# ─── Data structures ──────────────────────────────────────────────────────────
@dataclass
class SimulationResult:
    participants_processed: int = 0
    sessions_created: int = 0
    observations_created: int = 0
    sessions_cleared: int = 0
    profile_counts: dict[str, int] = field(default_factory=dict)
    profile_ipi_start: dict[str, list[float]] = field(default_factory=dict)
    profile_ipi_end: dict[str, list[float]] = field(default_factory=dict)
    ipi_gain_avg: float = 0.0
    ipi_gain_by_profile: dict[str, float] = field(default_factory=dict)
    messages: list[str] = field(default_factory=list)


@dataclass
class SeedResult:
    participants_created: int = 0
    program_name: str = ""
    school_name: str = ""
    baseline_ipi_avg: float = 0.0
    baseline_ipi_min: float = 0.0
    baseline_ipi_max: float = 0.0
    profile_counts: dict[str, int] = field(default_factory=dict)
    messages: list[str] = field(default_factory=list)


# ─── Math helpers ─────────────────────────────────────────────────────────────
def _clamp(v: float) -> int:
    return max(1, min(5, round(v)))


def _effective_progress(
    linear_progress: float,
    phases: list[tuple[float, float]],
) -> float:
    """
    Maps a linear progress [0..1] to an effective progress weighted by phase
    intensities.  A phase with intensity > 1.0 causes faster IPI advancement.
    """
    total_weighted = sum(p * m for p, m in phases)
    if total_weighted == 0:
        return linear_progress

    cumulative_lin = 0.0
    cumulative_eff = 0.0
    for prop, mult in phases:
        if linear_progress <= cumulative_lin + prop + 1e-9:
            within = (linear_progress - cumulative_lin) / max(prop, 1e-9)
            within = max(0.0, min(1.0, within))
            return min(1.0, (cumulative_eff + prop * mult * within) / total_weighted)
        cumulative_eff += prop * mult
        cumulative_lin += prop
    return 1.0


def _trajectory_score(
    profile: str,
    eff: float,               # effective progress 0..1
    base: float,
    optimism_bias: float = 0.0,
    noise_level: float = 1.0,
) -> float:
    """
    Compute a smooth continuous dimension score (1.0–5.0) for a given profile
    and progress.  Returns a FLOAT — callers decide how to round/store.

    noise_level: 0.3 (very smooth) .. 2.0 (very noisy). Scales trajectory σ.
    optimism_bias: -1.0 (pessimistic) .. +1.0 (very optimistic).
    """
    noise = random.gauss(0, 0.08 * noise_level)
    bm = 1.0 + optimism_bias        # bias multiplier: 0.0 to 2.0

    if profile == "stable":
        raw_gain = min(4.5, base + 1.8) - base
        target = base + raw_gain * bm
        v = base + (target - base) * eff + noise

    elif profile == "plateau":
        peak = base + 1.0 * bm
        if eff < 0.35:
            v = base + (peak - base) * (eff / 0.35) + noise
        else:
            v = peak + noise * 0.5

    elif profile == "late_bloomer":
        if eff < 0.55:
            v = base + 0.25 * bm * eff + noise * 0.4
        else:
            v = base + 0.25 * bm + (eff - 0.55) * 3.5 * bm + noise

    elif profile == "struggler":
        if eff < 0.35:
            v = base - 0.5 * (eff / 0.35) + noise
        elif eff < 0.65:
            v = base - 0.5 + 0.15 * ((eff - 0.35) / 0.3) + noise
        else:
            v = base - 0.35 + 0.9 * bm * ((eff - 0.65) / 0.35) + noise

    elif profile == "erratic":
        v = base + random.gauss(0.4 * eff * bm, 0.22 * noise_level)

    else:
        v = base + noise

    return max(1.0, min(5.0, v))


def _dimension_scores(
    profile: str,
    step: int,
    total: int,
    base: DimensionScores,
    optimism_bias: float = 0.0,
    phases: list[tuple[float, float]] | None = None,
    noise_level: float = 1.0,
) -> tuple[float, float, float, float]:
    """
    Returns 4 continuous (float) dimension scores for this session step.
    No rounding here — callers generate per-indicator integer scatter around
    these floats so the IPI averages over non-integer values.
    """
    def dim_avg(fields: list[int | None]) -> float:
        vals = [float(f) for f in fields if f is not None]
        return sum(vals) / len(vals) if vals else 2.5

    b_ac = dim_avg([base.reading_level, base.math_level, base.comprehension_level])
    b_cog = dim_avg([base.attention_level, base.memory_level, base.autonomy_level])
    b_soc = dim_avg([base.peer_interaction, base.group_work, base.emotional_regulation])
    b_ing = dim_avg([base.language_fluency, base.cultural_adaptation])

    lin = step / max(1, total - 1)
    eff = _effective_progress(lin, phases or [(1.0, 1.0)])

    ac_f  = _trajectory_score(profile, eff, b_ac,  optimism_bias, noise_level)
    cog_f = _trajectory_score(profile, eff, b_cog, optimism_bias, noise_level)
    soc_f = _trajectory_score(profile, eff, b_soc, optimism_bias, noise_level)
    ing_f = _trajectory_score(profile, eff, b_ing, optimism_bias, noise_level)

    return ac_f, cog_f, soc_f, ing_f


def _mood_for_scores(ac: float, cog: float, soc: float, ing: float) -> str:
    avg = (ac + cog + soc + ing) / 4
    if avg >= 4.2:
        return random.choice(["excellent", "good", "positive"])
    if avg >= 3.5:
        return random.choice(["good", "neutral", "good"])
    if avg >= 2.8:
        return random.choice(["neutral", "low"])
    return random.choice(["low", "very_low", "neutral"])


def _attendance_status(profile: str, progress: float, absence_rate: float) -> str:
    if random.random() < absence_rate:
        return random.choice(["absent", "unjustified_absence"])
    if profile == "struggler" and progress < 0.4 and random.random() < 0.12:
        return random.choice(["late", "partial"])
    return "present"


def _random_baseline_dims(profile: str) -> DimensionScores:
    """Genera una baseline aleatòria normalitzada (valors 1-3)."""
    centers: dict[str, float] = {
        "stable": 2.3,
        "plateau": 2.0,
        "late_bloomer": 1.7,
        "struggler": 1.6,
        "erratic": 2.0,
    }
    center = centers.get(profile, 2.0)

    def r() -> int:
        return _clamp(random.gauss(center, 0.65))

    return DimensionScores(
        reading_level=r(),
        math_level=r(),
        comprehension_level=r(),
        attention_level=r(),
        memory_level=r(),
        autonomy_level=r(),
        peer_interaction=r(),
        group_work=r(),
        emotional_regulation=r(),
        language_fluency=r(),
        cultural_adaptation=r(),
    )


# ─── Current-state query ──────────────────────────────────────────────────────
async def get_simulation_status(
    db: AsyncSession,
    organization_id: str,
    program_id: str | None = None,
) -> dict:
    """Resum de l'estat actual abans de simular."""
    part_q = select(Participant.id).where(
        Participant.organization_id == organization_id,
        Participant.active.is_(True),
    )
    if program_id:
        part_q = part_q.join(
            ProgramEnrollment,
            ProgramEnrollment.participant_id == Participant.id,
        ).where(
            ProgramEnrollment.program_id == program_id,
            ProgramEnrollment.active.is_(True),
        )

    participant_ids = list((await db.execute(part_q)).scalars().all())
    n_participants = len(participant_ids)

    n_with_baseline = 0
    if participant_ids:
        bl_q = await db.execute(
            select(func.count(func.distinct(BaselineAssessment.participant_id))).where(
                BaselineAssessment.participant_id.in_(participant_ids)
            )
        )
        n_with_baseline = bl_q.scalar_one() or 0

    session_counts: list[int] = []
    for pid in participant_ids:
        c_q = await db.execute(
            select(func.count(Session.id))
            .join(SessionObservation, SessionObservation.session_id == Session.id)
            .where(SessionObservation.participant_id == pid)
        )
        session_counts.append(c_q.scalar_one() or 0)

    avg_sessions = sum(session_counts) / len(session_counts) if session_counts else 0
    min_s = min(session_counts) if session_counts else 0
    max_s = max(session_counts) if session_counts else 0

    total_sessions_q = await db.execute(
        select(func.count(Session.id))
        .join(Program, Program.id == Session.program_id)
        .where(Program.organization_id == organization_id)
    )
    total_sessions = total_sessions_q.scalar_one() or 0

    return {
        "participants_active": n_participants,
        "participants_with_baseline": n_with_baseline,
        "avg_sessions_per_participant": round(avg_sessions, 1),
        "min_sessions": min_s,
        "max_sessions": max_s,
        "total_sessions": total_sessions,
        "profile_options": [
            {"id": p, "label": PROFILE_LABELS[p], "weight_pct": int(PROFILE_WEIGHTS[i] * 100)}
            for i, p in enumerate(PROFILES)
        ],
    }


# ─── Clear helpers ────────────────────────────────────────────────────────────
async def _dedupe_periodic_for_participants(
    db: AsyncSession, participant_ids: list[str], program_id: str | None = None
) -> int:
    """Elimina avaluacions periòdiques duplicades (mateix dia); conserva la fila canònica."""
    if not participant_ids:
        return 0
    removed = 0
    filters = [PeriodicAssessment.participant_id.in_(participant_ids)]
    if program_id:
        filters.append(PeriodicAssessment.program_id == program_id)
    pa_q = await db.execute(select(PeriodicAssessment).where(*filters))
    all_rows = list(pa_q.scalars().all())
    by_key: dict[tuple[str, str, date], list[PeriodicAssessment]] = {}
    for row in all_rows:
        key = (row.participant_id, row.program_id, row.assessment_date)
        by_key.setdefault(key, []).append(row)
    for group in by_key.values():
        if len(group) <= 1:
            continue
        keep = pick_best_periodic(group)
        for row in group:
            if row.id != keep.id:
                await db.delete(row)
                removed += 1
    if removed:
        await db.flush()
    return removed


async def _clear_sessions_for_participants(db: AsyncSession, participant_ids: list[str]) -> int:
    if not participant_ids:
        return 0

    obs_q = await db.execute(
        select(SessionObservation.session_id).where(
            SessionObservation.participant_id.in_(participant_ids)
        )
    )
    session_ids = list({r[0] for r in obs_q.all()})
    if not session_ids:
        await db.execute(
            delete(PeriodicAssessment).where(
                PeriodicAssessment.participant_id.in_(participant_ids)
            )
        )
        return 0

    await db.execute(
        delete(ProgramMicroGoalCompletion).where(
            ProgramMicroGoalCompletion.session_id.in_(session_ids)
        )
    )
    await db.execute(
        delete(SessionObservation).where(
            SessionObservation.participant_id.in_(participant_ids)
        )
    )
    await db.execute(
        delete(AttendanceRecord).where(AttendanceRecord.participant_id.in_(participant_ids))
    )
    await db.execute(delete(Session).where(Session.id.in_(session_ids)))
    await db.execute(
        delete(PeriodicAssessment).where(PeriodicAssessment.participant_id.in_(participant_ids))
    )
    return len(session_ids)


# ─── Reset & seed ─────────────────────────────────────────────────────────────
async def reset_and_seed(
    db: AsyncSession,
    *,
    organization_id: str,
    n_participants: int = 20,
    program_id: str | None = None,
    random_seed: int | None = None,
) -> SeedResult:
    """
    Esborra tots els participants de l'organització i en crea de nous
    amb baselines aleatòries normalitzades.
    """
    if random_seed is not None:
        random.seed(random_seed)

    result = SeedResult()
    today = date.today()

    # 1. Get school
    school_q = await db.execute(
        select(School).where(
            School.organization_id == organization_id,
            School.active.is_(True),
        )
    )
    school = school_q.scalars().first()
    if not school:
        result.messages.append("No hi ha escoles actives a l'organització.")
        return result

    # 2. Get professional users
    profs_q = await db.execute(
        select(User).where(
            User.organization_id == organization_id,
            User.role.in_(["professional", "coordinator", "admin"]),
            User.is_active.is_(True),
        )
    )
    professionals = list(profs_q.scalars().all())
    if not professionals:
        result.messages.append("No hi ha professionals a l'organització.")
        return result

    # 3. Get or find target program
    if program_id:
        prog_q = await db.execute(select(Program).where(Program.id == program_id))
        program = prog_q.scalar_one_or_none()
    else:
        prog_q = await db.execute(
            select(Program).where(
                Program.organization_id == organization_id,
                Program.active.is_(True),
            ).order_by(Program.start_date.asc())
        )
        program = prog_q.scalars().first()

    if not program:
        result.messages.append("No hi ha programes actius.")
        return result

    # 4. Delete all existing participants (and all dependent data)
    # synchronize_session=False és obligatori en async SQLAlchemy per evitar MissingGreenlet
    existing_ids_q = await db.execute(
        select(Participant.id).where(Participant.organization_id == organization_id)
    )
    existing_ids = list(existing_ids_q.scalars().all())
    if existing_ids:
        await _clear_sessions_for_participants(db, existing_ids)
        # Eliminar taules dependents que _clear_sessions no cobreix
        await db.execute(
            delete(BaselineAssessment)
            .where(BaselineAssessment.participant_id.in_(existing_ids))
            .execution_options(synchronize_session=False)
        )
        await db.execute(
            delete(ProgramEnrollment)
            .where(ProgramEnrollment.participant_id.in_(existing_ids))
            .execution_options(synchronize_session=False)
        )
        await db.execute(
            delete(UserParticipantAssignment)
            .where(UserParticipantAssignment.participant_id.in_(existing_ids))
            .execution_options(synchronize_session=False)
        )
        await db.execute(
            delete(Participant)
            .where(Participant.organization_id == organization_id)
            .execution_options(synchronize_session=False)
        )
        await db.flush()

    # Cache names before any commit (post-commit objects are expired in async SA)
    _program_name = program.name
    _school_name = school.name

    # 5. Create N fresh participants with random baselines
    baselines_ipi: list[float] = []

    for i in range(n_participants):
        profile = random.choices(PROFILES, weights=PROFILE_WEIGHTS, k=1)[0]
        result.profile_counts[profile] = result.profile_counts.get(profile, 0) + 1

        first_name = random.choice(FIRST_NAMES)
        last_name = random.choice(LAST_NAMES)
        nationality = random.choice(NATIONALITIES)
        birth_year = random.randint(2009, 2014)
        gender = random.choice(["male", "female", "male", "female", "unknown"])
        enrollment_months_ago = random.randint(2, 18)
        enrollment_date = today - timedelta(days=enrollment_months_ago * 30)

        participant = Participant(
            organization_id=organization_id,
            school_id=school.id,
            code=f"SIM-{i + 1:03d}",
            first_name=f"{first_name} {last_name}",
            birth_year=birth_year,
            gender=gender,
            nationality=nationality,
            enrollment_date=enrollment_date,
            consent_given=True,
            active=True,
        )
        db.add(participant)
        await db.flush()

        # Program enrollment
        db.add(
            ProgramEnrollment(
                program_id=program.id,
                participant_id=participant.id,
                enrolled_at=enrollment_date,
                active=True,
            )
        )

        # Professional assignment (round-robin)
        prof = professionals[i % len(professionals)]
        db.add(
            UserParticipantAssignment(
                user_id=prof.id,
                participant_id=participant.id,
            )
        )

        # Baseline assessment with normalized random scores
        base_dims = _random_baseline_dims(profile)
        bl_ipi = float(calculate_ipi(base_dims)["ipi"] or 0)
        baselines_ipi.append(bl_ipi)

        db.add(
            BaselineAssessment(
                participant_id=participant.id,
                program_id=program.id,
                assessed_by=professionals[0].id,
                assessment_date=enrollment_date,
                reading_level=base_dims.reading_level,
                math_level=base_dims.math_level,
                comprehension_level=base_dims.comprehension_level,
                attention_level=base_dims.attention_level,
                memory_level=base_dims.memory_level,
                autonomy_level=base_dims.autonomy_level,
                peer_interaction=base_dims.peer_interaction,
                group_work=base_dims.group_work,
                emotional_regulation=base_dims.emotional_regulation,
                language_fluency=base_dims.language_fluency,
                cultural_adaptation=base_dims.cultural_adaptation,
                ipi_baseline=bl_ipi,
                notes=f"Baseline simulada — perfil {PROFILE_LABELS[profile]}.",
            )
        )

    await db.commit()

    result.participants_created = n_participants
    result.program_name = _program_name
    result.school_name = _school_name
    if baselines_ipi:
        result.baseline_ipi_avg = round(sum(baselines_ipi) / len(baselines_ipi), 1)
        result.baseline_ipi_min = round(min(baselines_ipi), 1)
        result.baseline_ipi_max = round(max(baselines_ipi), 1)
    result.messages.append(
        f"Creat pool de {n_participants} alumnes per a \"{_program_name}\". "
        f"IPI baseline: {result.baseline_ipi_min}–{result.baseline_ipi_max} "
        f"(mitjana {result.baseline_ipi_avg})."
    )
    return result


# ─── Session simulation (core engine) ────────────────────────────────────────
async def run_session_simulation(
    db: AsyncSession,
    *,
    organization_id: str,
    sessions_per_participant: int = 30,
    # Legacy alias kept for backward-compat with sync endpoint
    target_sessions_per_participant: int | None = None,
    run_mode: str = "additive",   # "additive" = always add N | "fill" = fill up to N
    clear_existing_sessions: bool = False,
    program_id: str | None = None,
    span_weeks: int = 30,
    start_date: date | None = None,   # Data d'inici explícita (sobreescriu span_weeks)
    end_date: date | None = None,     # Data de fi explícita (sobreescriu span_weeks)
    absence_rate: float = 0.04,
    optimism_bias: float = 0.0,
    noise_level: float = 1.0,
    profile_weights: dict[str, float] | None = None,
    period_configs: list[dict] | None = None,
    random_seed: int | None = None,
    job_id: str | None = None,
) -> SimulationResult:
    # Backward-compat alias
    if target_sessions_per_participant is not None:
        sessions_per_participant = target_sessions_per_participant
    if random_seed is not None:
        random.seed(random_seed)

    result = SimulationResult()
    today = date.today()

    # Build phases from period_configs
    phases: list[tuple[float, float]] = [(1.0, 1.0)]
    if period_configs:
        total_weeks = sum(pc.get("weeks", 10) for pc in period_configs) or 1
        phases = [
            (pc.get("weeks", 10) / total_weeks, max(0.1, float(pc.get("intensity", 1.0))))
            for pc in period_configs
        ]

    profs_q = await db.execute(
        select(User).where(
            User.organization_id == organization_id,
            User.role == "professional",
            User.is_active.is_(True),
        )
    )
    professionals = list(profs_q.scalars().all())
    if not professionals:
        result.messages.append("No hi ha professionals actius.")
        return result

    assign_rows = (
        await db.execute(
            select(UserParticipantAssignment)
            .join(Participant, Participant.id == UserParticipantAssignment.participant_id)
            .where(Participant.organization_id == organization_id)
        )
    ).scalars().all()
    assign_map = {a.participant_id: a.user_id for a in assign_rows}

    query = (
        select(Participant, BaselineAssessment)
        .join(BaselineAssessment, BaselineAssessment.participant_id == Participant.id)
        .where(
            Participant.organization_id == organization_id,
            Participant.active.is_(True),
        )
    )
    if program_id:
        query = query.where(BaselineAssessment.program_id == program_id)

    rows = (await db.execute(query)).all()
    if not rows:
        result.messages.append("Cap participant amb baseline trobat.")
        return result

    participant_ids = [p.id for p, _ in rows]
    prog_filter = program_id or (rows[0][1].program_id if rows else None)
    if clear_existing_sessions:
        result.sessions_cleared = await _clear_sessions_for_participants(db, participant_ids)
    elif prog_filter:
        deduped = await _dedupe_periodic_for_participants(db, participant_ids, prog_filter)
        if deduped:
            result.messages.append(f"Netejades {deduped} avaluacions periòdiques duplicades.")

    # Resolve profile weights (custom or default)
    _profile_keys = list(PROFILES)
    if profile_weights:
        _pw = [max(0.0, float(profile_weights.get(k, 0.0))) for k in _profile_keys]
        _total_pw = sum(_pw) or 1.0
        _pw = [w / _total_pw for w in _pw]
    else:
        _pw = list(PROFILE_WEIGHTS)

    if job_id and job_id in _jobs:
        _jobs[job_id]["participants_total"] = len(rows)
        _jobs[job_id]["status"] = "running"

    from datetime import datetime as _dt
    gains: list[float] = []

    for idx, (participant, baseline) in enumerate(rows):
        # Update job progress
        if job_id and job_id in _jobs:
            _jobs[job_id]["current_name"] = participant.first_name
            _jobs[job_id]["participants_done"] = idx
            _jobs[job_id]["sessions_created"] = result.sessions_created
            _jobs[job_id]["progress"] = int((idx / len(rows)) * 95)

        profile = random.choices(_profile_keys, weights=_pw, k=1)[0]
        result.profile_counts[profile] = result.profile_counts.get(profile, 0) + 1

        if run_mode == "fill":
            existing_q = await db.execute(
                select(func.count(Session.id))
                .join(SessionObservation, SessionObservation.session_id == Session.id)
                .where(SessionObservation.participant_id == participant.id)
            )
            existing = existing_q.scalar_one() or 0
            to_create = max(0, sessions_per_participant - existing)
        else:
            # Additive: always create exactly sessions_per_participant new sessions
            existing = 0
            to_create = sessions_per_participant

        if to_create == 0:
            result.participants_processed += 1
            continue

        base_dims = dimension_scores_from_baseline(baseline)
        base_ipi = float(baseline.ipi_baseline or 0)
        prog_id = baseline.program_id
        prof_id = assign_map.get(participant.id) or professionals[0].id
        prof_ids = [p.id for p in professionals]
        secondary_prof_id: str | None = None
        if len(prof_ids) >= 2:
            primary_idx = prof_ids.index(prof_id) if prof_id in prof_ids else 0
            secondary_prof_id = prof_ids[(primary_idx + 1) % len(prof_ids)]

        # Track per-profile IPI data
        result.profile_ipi_start.setdefault(profile, []).append(base_ipi)

        # Dates: si l'usuari especifica rang explícit l'usem; sinó, span_weeks des d'avui
        if start_date and end_date:
            earliest_date = start_date
            latest_date = end_date
        elif start_date:
            earliest_date = start_date
            latest_date = today
        elif end_date:
            earliest_date = end_date - timedelta(weeks=span_weeks)
            latest_date = end_date
        else:
            earliest_date = today - timedelta(weeks=span_weeks)
            latest_date = today - timedelta(weeks=1)
        last_assess_q = await db.execute(
            select(PeriodicAssessment.assessment_date)
            .where(
                PeriodicAssessment.participant_id == participant.id,
                PeriodicAssessment.program_id == prog_id,
            )
            .order_by(PeriodicAssessment.assessment_date.desc())
            .limit(1)
        )
        last_assess_date = last_assess_q.scalar_one_or_none()
        if last_assess_date and last_assess_date >= earliest_date:
            earliest_date = last_assess_date + timedelta(days=1)
        if earliest_date > latest_date:
            earliest_date = latest_date - timedelta(days=max(to_create, 7))

        total_days = max((latest_date - earliest_date).days, to_create - 1)
        session_dates = [
            earliest_date + timedelta(days=round(total_days * s / max(1, to_create - 1)))
            for s in range(to_create)
        ]

        prev_pa: PeriodicAssessment | None = None
        prev_ipi: float | None = None
        prior_timeline: list[PeriodicAssessment] = []
        if existing > 0 or last_assess_date:
            prev_rows_q = await db.execute(
                select(PeriodicAssessment)
                .where(
                    PeriodicAssessment.participant_id == participant.id,
                    PeriodicAssessment.program_id == prog_id,
                )
                .order_by(PeriodicAssessment.assessment_date.asc())
            )
            prior_timeline = resolve_periodic_timeline(list(prev_rows_q.scalars().all()))
            if prior_timeline:
                prev_pa = prior_timeline[-1]
                if prev_pa.ipi_score is not None:
                    prev_ipi = float(prev_pa.ipi_score)

        prior_session_count = len(prior_timeline)
        final_ipi = base_ipi
        for step in range(to_create):
            session_date = session_dates[step]
            progress_val = step / max(1, to_create - 1)

            # ── Dimension base floats ──────────────────────────────────────────
            ac_f, cog_f, soc_f, ing_f = _dimension_scores(
                profile, step, to_create, base_dims, optimism_bias, phases, noise_level
            )

            # ── Per-indicator scatter — σ scales with noise_level ─────────────
            # Each sub-indicator within a dimension gets a slightly different int
            # so the dimension average fed to calculate_ipi is non-integer → smooth IPI.
            _sigma = 0.32 * noise_level
            def sub(base_f: float) -> int:
                return _clamp(base_f + random.gauss(0, _sigma))

            rl, ml, cl = sub(ac_f),  sub(ac_f),  sub(ac_f)
            al, mm, au = sub(cog_f), sub(cog_f), sub(cog_f)
            pi, gw, er = sub(soc_f), sub(soc_f), sub(soc_f)
            lf, ca     = sub(ing_f), sub(ing_f)

            dim = DimensionScores(
                reading_level=rl, math_level=ml, comprehension_level=cl,
                attention_level=al, memory_level=mm, autonomy_level=au,
                peer_interaction=pi, group_work=gw, emotional_regulation=er,
                language_fluency=lf, cultural_adaptation=ca,
            )
            ac_i = _clamp(ac_f)
            cog_i = _clamp(cog_f)
            soc_i = _clamp(soc_f)
            ing_i = _clamp(ing_f)

            raw_ipi = float(calculate_ipi(dim)["ipi"] or 0)
            merged_levels = {
                "academic": ac_i,
                "cognitive": cog_i,
                "social": soc_i,
                "integration": ing_i,
            }
            session_index = prior_session_count + step + 1
            ipi_score, _ = apply_progressive_session_ipi(
                raw_ipi,
                merged_levels,
                prev_pa=prev_pa,
                baseline_ipi=base_ipi,
                has_full_explicit=True,
                session_index=session_index,
            )
            final_ipi = ipi_score
            delta_baseline = round(ipi_score - base_ipi, 2)
            delta_prev = round(ipi_score - prev_ipi, 2) if prev_ipi is not None else None
            prev_ipi = ipi_score
            prev_pa = PeriodicAssessment(
                participant_id=participant.id,
                program_id=prog_id,
                assessment_date=session_date,
                period_label=SIMULATION_PERIOD_LABEL,
                reading_level=rl,
                math_level=ml,
                comprehension_level=cl,
                attention_level=al,
                memory_level=mm,
                autonomy_level=au,
                peer_interaction=pi,
                group_work=gw,
                emotional_regulation=er,
                language_fluency=lf,
                cultural_adaptation=ca,
                ipi_score=ipi_score,
            )

            qual_word = (
                "excel·lent" if ipi_score >= 65 else "correcta" if ipi_score >= 45 else "feble"
            )
            note = random.choice(SESSION_NOTES).format(qual=qual_word)
            att = _attendance_status(profile, progress_val, absence_rate)

            # ── Live log entry (every 3rd session + last) ─────────────────────
            if job_id and job_id in _jobs and (step % 3 == 0 or step == to_create - 1):
                sign = "+" if (delta_prev or 0) >= 0 else ""
                _jobs[job_id]["log"].append({
                    "t": _dt.now().strftime("%H:%M:%S"),
                    "name": participant.first_name,
                    "session": step + 1,
                    "total": to_create,
                    "ipi": round(ipi_score, 1),
                    "delta": f"{sign}{delta_prev:.1f}" if delta_prev is not None else "—",
                    "profile": profile,
                    "att": att,
                })
                if len(_jobs[job_id]["log"]) > 60:
                    _jobs[job_id]["log"] = _jobs[job_id]["log"][-60:]

            risk = calculate_risk_score(
                attendance_rate_last_30d=0.0 if att != "present" else 1.0,
                attendance_rate_prev_30d=0.85,
                ipi_delta_last_period=delta_prev,
                days_since_last_session=7,
                micro_goals_completion_rate=0.3 + progress_val * 0.5,
                num_unjustified_absences_last_30d=1 if att == "unjustified_absence" else 0,
                avg_mood_last_5_sessions=2.5 + progress_val * 1.5,
                weeks_in_program=max(4, (today - participant.enrollment_date).days // 7),
            )

            # Sessions creuades: un altre voluntari avalua el mateix infant (ICC inter-avaluador)
            session_prof_id = prof_id
            if secondary_prof_id and step > 0 and step % 4 == 0:
                session_prof_id = secondary_prof_id

            sess = Session(
                program_id=prog_id,
                professional_id=session_prof_id,
                session_date=session_date,
                session_type="individual",
                duration_minutes=random.choice([45, 50, 55, 60]),
                notes=note,
                notes_sentiment=round(-0.1 + progress_val * 0.5 + random.uniform(-0.08, 0.08), 2),
            )
            db.add(sess)
            await db.flush()
            result.sessions_created += 1

            db.add(
                SessionObservation(
                    session_id=sess.id,
                    participant_id=participant.id,
                    academic_score=ac_i if att == "present" else max(1, ac_i - 1),
                    cognitive_score=cog_i if att == "present" else max(1, cog_i - 1),
                    social_score=soc_i if att == "present" else max(1, soc_i - 1),
                    integration_score=ing_i if att == "present" else max(1, ing_i - 1),
                    qualitative_note=random.choice(QUALITATIVE),
                    mood_indicator=_mood_for_scores(ac_f, cog_f, soc_f, ing_f),
                )
            )
            result.observations_created += 1

            db.add(
                AttendanceRecord(
                    participant_id=participant.id,
                    program_id=prog_id,
                    session_id=sess.id,
                    date=session_date,
                    status=att,
                )
            )

            same_day_q = await db.execute(
                select(PeriodicAssessment).where(
                    PeriodicAssessment.participant_id == participant.id,
                    PeriodicAssessment.program_id == prog_id,
                    PeriodicAssessment.assessment_date == session_date,
                )
            )
            same_day = list(same_day_q.scalars().all())
            pa_fields = dict(
                assessed_by=session_prof_id,
                period_label=SIMULATION_PERIOD_LABEL,
                reading_level=rl,
                math_level=ml,
                comprehension_level=cl,
                attention_level=al,
                memory_level=mm,
                autonomy_level=au,
                peer_interaction=pi,
                group_work=gw,
                emotional_regulation=er,
                language_fluency=lf,
                cultural_adaptation=ca,
                ipi_score=ipi_score,
                ipi_delta_vs_baseline=delta_baseline,
                ipi_delta_vs_previous=delta_prev,
                risk_score=risk["risk_score"],
                risk_level=risk["risk_level"],
                notes=f"Simulació ({PROFILE_LABELS[profile]}).",
            )
            sim_existing = next(
                (r for r in same_day if (r.period_label or "") == SIMULATION_PERIOD_LABEL),
                None,
            )
            if sim_existing:
                for key, value in pa_fields.items():
                    setattr(sim_existing, key, value)
            elif same_day:
                keep = pick_best_periodic(same_day)
                for row in same_day:
                    if row.id != keep.id:
                        await db.delete(row)
                for key, value in pa_fields.items():
                    setattr(keep, key, value)
            else:
                db.add(
                    PeriodicAssessment(
                        participant_id=participant.id,
                        program_id=prog_id,
                        assessment_date=session_date,
                        **pa_fields,
                    )
                )

        result.profile_ipi_end.setdefault(profile, []).append(final_ipi)
        if to_create > 0:
            gains.append(final_ipi - base_ipi)

        result.participants_processed += 1

    # Compute summary stats
    if gains:
        result.ipi_gain_avg = round(sum(gains) / len(gains), 1)

    for prof_key in result.profile_counts:
        starts = result.profile_ipi_start.get(prof_key, [])
        ends = result.profile_ipi_end.get(prof_key, [])
        if starts and ends:
            avg_start = sum(starts) / len(starts)
            avg_end = sum(ends) / len(ends)
            result.ipi_gain_by_profile[prof_key] = round(avg_end - avg_start, 1)

    await db.commit()
    result.messages.append(
        f"Generades {result.sessions_created} sessions per "
        f"{result.participants_processed} participants."
    )
    return result


# ─── Background job runner ────────────────────────────────────────────────────
async def _run_simulation_job(job_id: str, organization_id: str, **kwargs: Any) -> None:
    """Background asyncio task: runs simulation and stores result in _jobs."""
    async with SessionLocal() as db:
        try:
            result = await run_session_simulation(
                db,
                organization_id=organization_id,
                job_id=job_id,
                **kwargs,
            )
            _jobs[job_id]["status"] = "done"
            _jobs[job_id]["progress"] = 100
            _jobs[job_id]["sessions_created"] = result.sessions_created
            _jobs[job_id]["result"] = dataclasses.asdict(result)
        except Exception as exc:
            _jobs[job_id]["status"] = "error"
            _jobs[job_id]["error"] = str(exc)


def start_simulation_job(organization_id: str, **kwargs: Any) -> str:
    """Creates a background simulation job and returns its job_id."""
    job_id = str(uuid.uuid4())
    _jobs[job_id] = _new_job()
    asyncio.create_task(_run_simulation_job(job_id, organization_id, **kwargs))
    return job_id
