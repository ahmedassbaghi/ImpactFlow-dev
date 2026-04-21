from typing import Optional

def calculate_risk_score(
    attendance_rate_last_30d: float,      # 0.0 - 1.0
    attendance_rate_prev_30d: float,      # 0.0 - 1.0
    ipi_delta_last_period: Optional[float],  # % cambio último período
    days_since_last_session: int,
    micro_goals_completion_rate: float,    # 0.0 - 1.0
    num_unjustified_absences_last_30d: int,
    avg_mood_last_5_sessions: Optional[float],  # 1-5
    weeks_in_program: int,
    session_score_trend: Optional[float] = None,      # slope over last sessions (1-5 scale)
    session_score_volatility: Optional[float] = None,  # std over session composite score
    evidence_completeness: Optional[float] = None,     # 0.0 - 1.0
    engagement_index: Optional[float] = None,          # 0.0 - 1.0
    sentiment_mean_last_30d: Optional[float] = None,   # -1.0 to 1.0
) -> dict:
    def _clamp(value: float, min_v: float = 0.0, max_v: float = 1.0) -> float:
        return max(min_v, min(max_v, value))

    scores = []
    
    # 1. Factor asistencia (peso 0.22)
    attendance_drop = attendance_rate_prev_30d - attendance_rate_last_30d
    attendance_risk = _clamp(
        (1 - attendance_rate_last_30d) * 0.5 + max(0, attendance_drop) * 1.5
    )
    scores.append(("attendance", attendance_risk, 0.22))
    
    # 2. Factor IPI / progreso (peso 0.20)
    if ipi_delta_last_period is not None:
        if ipi_delta_last_period < -10:
            ipi_risk = 0.9
        elif ipi_delta_last_period < -5:
            ipi_risk = 0.6
        elif ipi_delta_last_period < 2:
            ipi_risk = 0.3    # Estancamiento
        else:
            ipi_risk = 0.0
    else:
        ipi_risk = 0.2        # Sin datos, riesgo neutro
    scores.append(("ipi_progress", ipi_risk, 0.20))
    
    # 3. Factor micro-objetivos (peso 0.10)
    goals_risk = _clamp((0.45 - micro_goals_completion_rate) * 2.2)
    scores.append(("micro_goals", goals_risk, 0.10))
    
    # 4. Factor ausencias injustificadas (peso 0.12)
    absence_risk = _clamp(num_unjustified_absences_last_30d * 0.3)
    scores.append(("absences", absence_risk, 0.12))
    
    # 5. Factor estado emocional (peso 0.10)
    if avg_mood_last_5_sessions is not None:
        mood_risk = _clamp((3.2 - avg_mood_last_5_sessions) / 2.2)
    else:
        mood_risk = 0.2
    scores.append(("mood", mood_risk, 0.10))
    
    # 6. Factor inactividad reciente (peso 0.08)
    if days_since_last_session > 21:
        inactivity_risk = _clamp((days_since_last_session - 14) / 30)
    else:
        inactivity_risk = 0.0
    scores.append(("inactivity", inactivity_risk, 0.08))

    # 7. Tendencia de desempeño en sesiones (peso 0.08)
    if session_score_trend is not None:
        # slope < 0 is deterioration. Typical slope range approx [-1, +1].
        trend_risk = _clamp((-session_score_trend + 0.05) / 0.35)
    else:
        trend_risk = 0.25
    scores.append(("session_trend", trend_risk, 0.08))

    # 8. Volatilidad de desempeño (peso 0.05)
    if session_score_volatility is not None:
        volatility_risk = _clamp(session_score_volatility / 1.5)
    else:
        volatility_risk = 0.2
    scores.append(("session_volatility", volatility_risk, 0.05))

    # 9. Calidad/evidencia del registro (peso 0.03)
    if evidence_completeness is not None:
        evidence_risk = _clamp(1 - evidence_completeness)
    else:
        evidence_risk = 0.25
    scores.append(("evidence_quality", evidence_risk, 0.03))

    # 10. Engagement compuesto (peso 0.015)
    if engagement_index is not None:
        engagement_risk = _clamp(1 - engagement_index)
    else:
        engagement_risk = 0.25
    scores.append(("engagement", engagement_risk, 0.015))

    # 11. Sentimiento global de notas (peso 0.015)
    if sentiment_mean_last_30d is not None:
        sentiment_risk = _clamp((0.1 - sentiment_mean_last_30d) / 0.7)
    else:
        sentiment_risk = 0.2
    scores.append(("sentiment", sentiment_risk, 0.015))
    
    # Score ponderado final
    total_risk = sum(s * w for _, s, w in scores)
    total_risk = round(_clamp(total_risk), 3)
    
    # Clasificación
    if total_risk < 0.28:
        risk_level = "low"
    elif total_risk < 0.58:
        risk_level = "medium"
    else:
        risk_level = "high"
    
    # Factores contribuyentes (para explicabilidad — mostrar al coordinador)
    contributing_factors = [
        factor for factor, score, _ in scores if score > 0.4
    ]
    
    return {
        "risk_score": total_risk,
        "risk_level": risk_level,
        "contributing_factors": contributing_factors,
        "breakdown": {factor: round(s, 2) for factor, s, _ in scores}
    }
