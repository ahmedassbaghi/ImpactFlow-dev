"""Trajectory anomaly detection for participant IPI series.

Detects three classes of anomaly per participant:
- plateau: low variance over last 3+ assessments (stagnation)
- regression: significant negative trend (linear slope < threshold)
- breakthrough: latest score exceeds μ+1.5σ of recent history

Statistical basis:
- Linear least-squares slope on (t, IPI) pairs
- Coefficient of variation for plateau detection
- Z-score against personal baseline distribution for breakthroughs
"""

from __future__ import annotations

from datetime import date
from statistics import mean, stdev
from typing import Sequence

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Participant, PeriodicAssessment, ProgramEnrollment


def _linear_slope(xs: Sequence[float], ys: Sequence[float]) -> float:
    n = len(xs)
    if n < 2:
        return 0.0
    mx = sum(xs) / n
    my = sum(ys) / n
    num = sum((xs[i] - mx) * (ys[i] - my) for i in range(n))
    den = sum((xs[i] - mx) ** 2 for i in range(n))
    return num / den if den > 0 else 0.0


def _classify(scores: list[float], dates: list[date]) -> tuple[str | None, float, str]:
    """Return (anomaly_type, severity_score, message).

    anomaly_type ∈ {"plateau", "regression", "breakthrough", None}
    severity_score: 0..1 magnitude of the signal.
    """
    n = len(scores)
    if n < 3:
        return None, 0.0, "Mostra insuficient (cal n>=3 mesures)."

    # Convert dates to days-from-first
    base = dates[0]
    xs = [(d - base).days for d in dates]
    last = scores[-1]
    prev_window = scores[:-1]
    mu_prev = mean(prev_window)
    sd_prev = stdev(prev_window) if len(prev_window) >= 2 else 0.0

    # Slope over full series
    slope = _linear_slope(xs, scores)  # IPI per day
    slope_per_month = slope * 30

    # Coefficient of variation on last 3
    last3 = scores[-3:]
    sd3 = stdev(last3) if len(last3) >= 2 else 0.0
    mean3 = mean(last3) if last3 else 0.0
    cv3 = sd3 / mean3 if mean3 > 0 else 0.0

    # Breakthrough: latest score > μ+1.5σ of prev_window
    if sd_prev > 0 and last > mu_prev + 1.5 * sd_prev:
        z = (last - mu_prev) / sd_prev
        return ("breakthrough", min(1.0, z / 4.0),
                f"Salt qualitatiu: última IPI {last:.1f} (z={z:.2f}σ sobre la mitjana personal).")

    # Regression: negative slope >= 1 IPI/month and last < first
    if slope_per_month <= -1.0 and last < scores[0]:
        return ("regression", min(1.0, abs(slope_per_month) / 5.0),
                f"Regressió: tendència de {slope_per_month:.1f} pts IPI/mes durant {n} mesures.")

    # Plateau: CV on last 3 < 0.03 (3%) and slope ~0
    if cv3 < 0.03 and abs(slope_per_month) < 0.5 and n >= 4:
        return ("plateau", 1.0 - cv3 / 0.03,
                f"Plateau: variabilitat <3% en les últimes 3 mesures sense tendència significativa.")

    return None, 0.0, "Trajectòria estable."


async def detect_program_anomalies(program_id: str, db: AsyncSession) -> dict:
    """Scan all participants enrolled in program, detect trajectory anomalies."""
    enrolled_q = await db.execute(
        select(Participant)
        .join(ProgramEnrollment, ProgramEnrollment.participant_id == Participant.id)
        .where(ProgramEnrollment.program_id == program_id, ProgramEnrollment.active == True)
    )
    participants = list(enrolled_q.scalars().all())

    alerts: list[dict] = []
    counts = {"plateau": 0, "regression": 0, "breakthrough": 0, "stable": 0, "insufficient": 0}

    for p in participants:
        pa_q = await db.execute(
            select(PeriodicAssessment)
            .where(
                PeriodicAssessment.participant_id == p.id,
                PeriodicAssessment.program_id == program_id,
            )
            .order_by(PeriodicAssessment.assessment_date)
        )
        records = list(pa_q.scalars().all())
        if len(records) < 3:
            counts["insufficient"] += 1
            continue
        scores = [r.ipi_score for r in records if r.ipi_score is not None]
        dates_ = [r.assessment_date for r in records if r.ipi_score is not None]
        if len(scores) < 3:
            counts["insufficient"] += 1
            continue

        anomaly_type, severity, message = _classify(scores, dates_)
        if anomaly_type is None:
            counts["stable"] += 1
            continue
        counts[anomaly_type] += 1
        alerts.append({
            "participant_id": p.id,
            "participant_code": p.code,
            "participant_name": p.first_name,
            "type": anomaly_type,
            "severity": round(severity, 3),
            "message": message,
            "n_observations": len(scores),
            "current_ipi": round(scores[-1], 2),
            "trajectory": [
                {"date": d.isoformat(), "ipi": round(s, 2)} for s, d in zip(scores, dates_)
            ],
        })

    # Sort: regressions first (most urgent), then plateaus, then breakthroughs
    type_priority = {"regression": 0, "plateau": 1, "breakthrough": 2}
    alerts.sort(key=lambda a: (type_priority.get(a["type"], 9), -a["severity"]))

    return {
        "program_id": program_id,
        "n_participants_scanned": len(participants),
        "counts": counts,
        "alerts": alerts,
        "methodology": "Detecció basada en pendent OLS, coeficient de variació i z-score personal.",
    }
