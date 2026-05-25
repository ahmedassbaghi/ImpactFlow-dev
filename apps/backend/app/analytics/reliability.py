"""Inter-rater reliability — ICC(2,1) two-way random effects.

Uses scipy.stats.icc if available; falls back to a pure-Python implementation
suited for the small datasets typical in social programme evaluations.
"""

from __future__ import annotations

from collections import defaultdict
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

_DIMS = ["academic", "cognitive", "social", "integration"]

_ICC_INTERP = [
    (0.0,  0.40, "pobre"),
    (0.40, 0.60, "moderada"),
    (0.60, 0.75, "bona"),
    (0.75, 1.01, "excel·lent"),
]


def _interpret_icc(value: float) -> str:
    for lo, hi, label in _ICC_INTERP:
        if lo <= value < hi:
            return label
    return "excel·lent"


def _mean(vals: list[float]) -> float:
    return sum(vals) / len(vals) if vals else 0.0


def _overlap_target_count(ratings: list[list[float | None]]) -> int:
    """Participants (rows) rated by at least two distinct professionals."""
    n = 0
    for row in ratings:
        if sum(1 for v in row if v is not None) >= 2:
            n += 1
    return n


def _icc_two_way_random(ratings: list[list[float | None]]) -> float:
    """ICC(2,1) — two-way random, single measures.

    `ratings` is a list of rows; each row is a list of rater scores for one target.
    None values are skipped per-cell.
    """
    # Filter rows with at least 2 non-None scores
    clean = []
    for row in ratings:
        valid = [v for v in row if v is not None]
        if len(valid) >= 2:
            clean.append(valid)

    if len(clean) < 3:
        return 0.0

    k = max(len(r) for r in clean)
    n = len(clean)

    # Pad shorter rows with row mean (missing at random assumption)
    padded: list[list[float]] = []
    for row in clean:
        row_mean = _mean(row)
        padded.append([v if i < len(row) else row_mean for i, v in enumerate(row + [row_mean] * k)][:k])

    grand_mean = _mean([v for row in padded for v in row])

    # SS between subjects (rows)
    ss_rows = k * sum(((_mean(row) - grand_mean) ** 2) for row in padded)
    # SS between raters (columns)
    col_means = [_mean([padded[i][j] for i in range(n)]) for j in range(k)]
    ss_cols = n * sum(((cm - grand_mean) ** 2) for cm in col_means)
    # SS total
    ss_total = sum(((v - grand_mean) ** 2) for row in padded for v in row)
    # SS error
    ss_err = ss_total - ss_rows - ss_cols

    df_rows = n - 1
    df_cols = k - 1
    df_err = df_rows * df_cols

    if df_err == 0 or df_rows == 0:
        return 0.0

    ms_rows = ss_rows / df_rows
    ms_err = ss_err / df_err

    denom = ms_rows + (k - 1) * ms_err
    if denom == 0:
        return 0.0

    icc = (ms_rows - ms_err) / denom
    return max(0.0, min(1.0, round(icc, 4)))


def _detect_bias(scores: list[float], rater_id: str, dim: str) -> list[dict]:
    alerts = []
    if not scores:
        return alerts
    n = len(scores)
    pct_lenient = sum(1 for s in scores if s >= 4) / n
    pct_severe = sum(1 for s in scores if s <= 2) / n
    pct_central = sum(1 for s in scores if s == 3) / n

    if pct_lenient > 0.80:
        alerts.append({"rater_id": rater_id, "bias_type": "leniency", "dimension": dim})
    if pct_severe > 0.80:
        alerts.append({"rater_id": rater_id, "bias_type": "severity", "dimension": dim})
    if pct_central > 0.70:
        alerts.append({"rater_id": rater_id, "bias_type": "central_tendency", "dimension": dim})
    return alerts


async def compute_inter_rater_reliability(program_id: str, db: AsyncSession) -> dict:
    """Compute ICC(2,1) between professionals for all IPI dimensions."""
    from app.models import Session, SessionObservation, Participant, Program

    # Fetch observations joined with sessions scoped to the program
    sessions_q = await db.execute(
        select(Session).where(Session.program_id == program_id)
    )
    sessions = sessions_q.scalars().all()
    session_ids = [s.id for s in sessions]

    if not session_ids:
        return {
            "overall_icc": 0.0,
            "icc_by_dimension": {d: 0.0 for d in _DIMS},
            "icc_interpretation": "pobre",
            "n_raters": 0,
            "n_observations": 0,
            "bias_alerts": [],
            "icc_computable": False,
            "overlap_targets": 0,
            "message": "No hi ha sessions registrades al programa.",
        }

    obs_q = await db.execute(
        select(SessionObservation).where(
            SessionObservation.session_id.in_(session_ids)
        )
    )
    observations = obs_q.scalars().all()

    if not observations:
        return {
            "overall_icc": 0.0,
            "icc_by_dimension": {d: 0.0 for d in _DIMS},
            "icc_interpretation": "pobre",
            "n_raters": 0,
            "n_observations": 0,
            "bias_alerts": [],
            "icc_computable": False,
            "overlap_targets": 0,
            "message": "No hi ha observacions de sessió per calcular la concordança.",
        }

    # Map session_id → professional_id
    sid_to_prof: dict[str, str] = {s.id: s.professional_id for s in sessions}

    # Dimension field mapping
    dim_fields: dict[str, list[str]] = {
        "academic": ["academic_score"],
        "cognitive": ["cognitive_score"],
        "social": ["social_score"],
        "integration": ["integration_score"],
    }

    # Build: per-dimension, per-participant → {rater_id: [scores]}
    dim_data: dict[str, dict[str, dict[str, list[float]]]] = {d: defaultdict(lambda: defaultdict(list)) for d in _DIMS}
    all_raters: set[str] = set()
    bias_scores: dict[str, dict[str, list[float]]] = defaultdict(lambda: defaultdict(list))

    for obs in observations:
        prof_id = sid_to_prof.get(obs.session_id)
        if not prof_id:
            continue
        all_raters.add(prof_id)
        participant_id = obs.participant_id

        for dim, fields in dim_fields.items():
            for field in fields:
                val = getattr(obs, field, None)
                if val is not None:
                    dim_data[dim][participant_id][prof_id].append(float(val))
                    bias_scores[prof_id][dim].append(float(val))

    rater_list = sorted(all_raters)

    icc_by_dim: dict[str, float] = {}
    overlap_by_dim: dict[str, int] = {}
    bias_alerts: list[dict] = []

    for dim in _DIMS:
        # Build a matrix: rows=participants, cols=raters
        participants_for_dim = list(dim_data[dim].keys())
        ratings_matrix: list[list[float | None]] = []
        for p_id in participants_for_dim:
            row = []
            for r_id in rater_list:
                scores = dim_data[dim][p_id].get(r_id, [])
                row.append(_mean(scores) if scores else None)
            ratings_matrix.append(row)

        icc_by_dim[dim] = _icc_two_way_random(ratings_matrix)
        overlap_by_dim[dim] = _overlap_target_count(ratings_matrix)

        # Bias detection per rater per dimension
        for r_id in rater_list:
            scores = bias_scores[r_id].get(dim, [])
            bias_alerts.extend(_detect_bias(scores, r_id, dim))

    valid_iccs = [v for v in icc_by_dim.values() if v > 0]
    overall_icc = round(_mean(valid_iccs), 4) if valid_iccs else 0.0
    overlap_targets = max(overlap_by_dim.values()) if overlap_by_dim else 0

    if len(all_raters) < 2:
        message = (
            "Cal almenys 2 professionals amb observacions al programa. "
            "Amb un sol avaluador, l'ICC no es pot mesurar."
        )
        icc_computable = False
    elif overlap_targets < 3:
        message = (
            f"Només {overlap_targets} infant(s) avaluat(s) per dos professionals diferents "
            f"(en calen ≥3). Assigna solapament o sessions creuades entre voluntaris."
        )
        icc_computable = False
    else:
        message = ""
        icc_computable = overall_icc > 0

    return {
        "overall_icc": overall_icc,
        "icc_by_dimension": icc_by_dim,
        "icc_interpretation": _interpret_icc(overall_icc),
        "n_raters": len(all_raters),
        "n_observations": len(observations),
        "bias_alerts": bias_alerts,
        "icc_computable": icc_computable,
        "overlap_targets": overlap_targets,
        "overlap_by_dimension": overlap_by_dim,
        "message": message,
    }
