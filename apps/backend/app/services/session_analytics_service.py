from __future__ import annotations

from datetime import date, datetime, time, timedelta
from statistics import mean, stdev

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    AttendanceRecord,
    ProgramMicroGoal,
    ProgramMicroGoalCompletion,
    Session,
    SessionObservation,
)

PRESENT_STATUSES = {"present", "late"}
MOOD_TO_SCORE = {
    "very_low": 1.0,
    "low": 2.0,
    "neutral": 3.0,
    "good": 4.0,
    "excellent": 5.0,
}


def _clamp(value: float, min_v: float, max_v: float) -> float:
    return max(min_v, min(max_v, value))


def _safe_mean(values: list[float]) -> float | None:
    return mean(values) if values else None


def _weighted_slope(values: list[float]) -> float | None:
    n = len(values)
    if n < 2:
        return None
    x = list(range(n))
    # Exponential decay to prioritize recent observations.
    weights = [0.6 ** (n - 1 - i) for i in x]
    w_sum = sum(weights)
    if w_sum == 0:
        return None
    weights = [w / w_sum for w in weights]
    x_w_mean = sum(w * xi for w, xi in zip(weights, x))
    y_w_mean = sum(w * yi for w, yi in zip(weights, values))
    numerator = sum(w * (xi - x_w_mean) * (yi - y_w_mean) for w, xi, yi in zip(weights, x, values))
    denominator = sum(w * (xi - x_w_mean) ** 2 for w, xi in zip(weights, x))
    if denominator == 0:
        return 0.0
    return numerator / denominator


def _session_composite_score(obs: SessionObservation) -> float | None:
    points = [
        obs.academic_score,
        obs.cognitive_score,
        obs.social_score,
        obs.integration_score,
    ]
    valid = [float(v) for v in points if v is not None]
    return _safe_mean(valid)


def _has_quality_evidence(obs: SessionObservation) -> bool:
    score_values = [obs.academic_score, obs.cognitive_score, obs.social_score, obs.integration_score]
    filled_scores = sum(1 for v in score_values if v is not None)
    has_note = bool((obs.qualitative_note or "").strip())
    return filled_scores >= 2 and has_note


async def build_participant_feature_bundle(
    db: AsyncSession,
    participant_id: str,
    program_id: str,
    reference_date: date,
) -> dict:
    last_30d_start = reference_date - timedelta(days=30)
    prev_30d_start = reference_date - timedelta(days=60)
    last_8w_start = reference_date - timedelta(days=56)

    # Attendance signals
    attendance_rows = await db.execute(
        select(AttendanceRecord.date, AttendanceRecord.status).where(
            AttendanceRecord.participant_id == participant_id,
            AttendanceRecord.program_id == program_id,
            AttendanceRecord.date >= prev_30d_start,
            AttendanceRecord.date <= reference_date,
        )
    )
    attendance_entries = attendance_rows.all()
    last_30_entries = [row for row in attendance_entries if row[0] >= last_30d_start]
    prev_30_entries = [row for row in attendance_entries if row[0] < last_30d_start]

    def _attendance_rate(entries: list[tuple[date, str]]) -> float:
        if not entries:
            return 0.8
        present = sum(1 for _, status in entries if status in PRESENT_STATUSES)
        return _clamp(present / len(entries), 0.0, 1.0)

    attendance_rate_last_30d = _attendance_rate(last_30_entries)
    attendance_rate_prev_30d = _attendance_rate(prev_30_entries)
    num_unjustified_absences_last_30d = sum(1 for _, status in last_30_entries if status == "absent_unjustified")

    # Session + observation signals
    observation_rows = await db.execute(
        select(Session.session_date, Session.notes_sentiment, SessionObservation).join(
            SessionObservation, SessionObservation.session_id == Session.id
        ).where(
            SessionObservation.participant_id == participant_id,
            Session.program_id == program_id,
            Session.session_date >= last_8w_start,
            Session.session_date <= reference_date,
        ).order_by(Session.session_date.asc())
    )
    observation_entries = observation_rows.all()
    recent_obs_entries = [entry for entry in observation_entries if entry[0] >= last_30d_start]

    if observation_entries:
        days_since_last_session = max(0, (reference_date - observation_entries[-1][0]).days)
    else:
        days_since_last_session = 30

    composite_scores = [_session_composite_score(obs) for _, _, obs in observation_entries]
    composite_scores = [score for score in composite_scores if score is not None]
    session_score_trend = _weighted_slope(composite_scores) if composite_scores else None
    session_score_volatility = stdev(composite_scores) if len(composite_scores) >= 2 else 0.0

    mood_scores = [MOOD_TO_SCORE.get((obs.mood_indicator or "").lower()) for _, _, obs in observation_entries]
    mood_scores = [m for m in mood_scores if m is not None]
    avg_mood_last_5_sessions = _safe_mean(mood_scores[-5:]) if mood_scores else None

    evidence_flags = [1.0 if _has_quality_evidence(obs) else 0.0 for _, _, obs in recent_obs_entries]
    evidence_completeness = _safe_mean(evidence_flags) if evidence_flags else 0.5

    sentiment_values = [float(sent) for _, sent, _ in recent_obs_entries if sent is not None]
    sentiment_mean_last_30d = _safe_mean(sentiment_values)

    session_count_last_30d = len({session_date for session_date, _, _ in recent_obs_entries})
    session_frequency_index = _clamp(session_count_last_30d / 8, 0.0, 1.0)
    mood_index = _clamp(((avg_mood_last_5_sessions or 3.0) - 1) / 4, 0.0, 1.0)
    engagement_index = _clamp(
        0.45 * attendance_rate_last_30d + 0.3 * session_frequency_index + 0.25 * mood_index,
        0.0,
        1.0,
    )

    # Program-level micro-goal completion signal (global goals)
    total_goals_q = await db.execute(
        select(func.count(ProgramMicroGoal.id)).where(ProgramMicroGoal.program_id == program_id)
    )
    total_goals = total_goals_q.scalar_one() or 0

    completion_cutoff = datetime.combine(reference_date + timedelta(days=1), time.min)
    completed_goals_q = await db.execute(
        select(func.count(func.distinct(ProgramMicroGoalCompletion.program_micro_goal_id))).join(
            ProgramMicroGoal, ProgramMicroGoal.id == ProgramMicroGoalCompletion.program_micro_goal_id
        ).where(
            ProgramMicroGoal.program_id == program_id,
            ProgramMicroGoalCompletion.completed_at < completion_cutoff,
        )
    )
    completed_goals = completed_goals_q.scalar_one() or 0
    micro_goals_completion_rate = (
        _clamp(completed_goals / total_goals, 0.0, 1.0) if total_goals else 0.5
    )

    return {
        "attendance_rate_last_30d": round(attendance_rate_last_30d, 3),
        "attendance_rate_prev_30d": round(attendance_rate_prev_30d, 3),
        "num_unjustified_absences_last_30d": num_unjustified_absences_last_30d,
        "days_since_last_session": days_since_last_session,
        "avg_mood_last_5_sessions": round(avg_mood_last_5_sessions, 2) if avg_mood_last_5_sessions else None,
        "micro_goals_completion_rate": round(micro_goals_completion_rate, 3),
        "session_score_trend": round(session_score_trend, 3) if session_score_trend is not None else None,
        "session_score_volatility": round(session_score_volatility, 3),
        "evidence_completeness": round(evidence_completeness or 0.0, 3),
        "engagement_index": round(engagement_index, 3),
        "sentiment_mean_last_30d": round(sentiment_mean_last_30d, 3) if sentiment_mean_last_30d is not None else None,
        "session_count_last_30d": session_count_last_30d,
    }
