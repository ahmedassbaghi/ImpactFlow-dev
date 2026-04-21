from app.algorithms.risk_engine import calculate_risk_score


def test_risk_low():
    result = calculate_risk_score(
        attendance_rate_last_30d=0.95,
        attendance_rate_prev_30d=0.93,
        ipi_delta_last_period=8.0,
        days_since_last_session=2,
        micro_goals_completion_rate=0.8,
        num_unjustified_absences_last_30d=0,
        avg_mood_last_5_sessions=4.2,
        weeks_in_program=20,
    )
    assert result["risk_level"] == "low"
    assert result["risk_score"] < 0.25


def test_risk_high():
    result = calculate_risk_score(
        attendance_rate_last_30d=0.4,
        attendance_rate_prev_30d=0.8,
        ipi_delta_last_period=-12.0,
        days_since_last_session=40,
        micro_goals_completion_rate=0.1,
        num_unjustified_absences_last_30d=4,
        avg_mood_last_5_sessions=2.0,
        weeks_in_program=20,
    )
    assert result["risk_level"] == "high"
    assert result["risk_score"] >= 0.55
