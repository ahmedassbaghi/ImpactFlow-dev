"""
Módulo B.3 — Modelo de abandono (dropout probability).

MVP heurístico: usa los features del risk_engine como log-odds calibrados.
Los coeficientes están normalizados para generar P(abandono_30d) ~5-15%
en participantes sin factores de riesgo, y ~40-60% en perfiles de alto riesgo.

v2 (cuando haya datos históricos reales): entrenar sklearn LogisticRegression
sobre el histórico de abandonos reales de la organización.
"""
from __future__ import annotations

import math

# ---------------------------------------------------------------------------
# Coeficientes calibrados (log-odds)
# Basados en los pesos del risk_engine y evidencia de literatura de dropout.
# ---------------------------------------------------------------------------

_BIAS_30D = -2.5   # P base ~7.5% sin factores de riesgo
_BIAS_60D = -2.0   # P base ~11.9% a 60 días


def _sigmoid(x: float) -> float:
    x = max(-30.0, min(30.0, x))
    return 1.0 / (1.0 + math.exp(-x))


def predict_dropout_probability(feature_bundle: dict) -> dict:
    """
    Estima la probabilidad de abandono del programa a 30 y 60 días.

    Input: feature_bundle tal como lo genera build_participant_feature_bundle,
    opcionalmente enriquecido con:
      - ipi_delta_last_period: float | None
      - weeks_in_program: int

    Returns:
      dropout_probability_30d, dropout_probability_60d,
      risk_trajectory, top_risk_factors, recommended_intervention
    """
    lo30 = _BIAS_30D
    lo60 = _BIAS_60D
    risk_factors: list[str] = []

    # --- Asistencia (efecto más fuerte) ---
    att = float(feature_bundle.get("attendance_rate_last_30d") or 0.8)
    att_contrib = -3.0 * att  # alta asistencia reduce abandono
    lo30 += att_contrib
    lo60 += att_contrib * 0.85
    if att < 0.65:
        risk_factors.append("attendance_drop")

    # --- Ausencias injustificadas ---
    absen = int(feature_bundle.get("num_unjustified_absences_last_30d") or 0)
    abs_contrib = 0.55 * absen
    lo30 += abs_contrib
    lo60 += abs_contrib * 0.75
    if absen >= 2:
        risk_factors.append("unjustified_absences")

    # --- Inactividad reciente ---
    days_inactive = int(feature_bundle.get("days_since_last_session") or 7)
    inactive_contrib = 0.04 * max(0, days_inactive - 14)
    lo30 += inactive_contrib
    lo60 += inactive_contrib * 0.65
    if days_inactive > 21:
        risk_factors.append("prolonged_inactivity")

    # --- Engagement compuesto ---
    eng = float(feature_bundle.get("engagement_index") or 0.6)
    eng_contrib = -2.5 * eng
    lo30 += eng_contrib
    lo60 += eng_contrib * 0.90
    if eng < 0.40:
        risk_factors.append("low_engagement")

    # --- Cumplimiento micro-objetivos ---
    mgr = float(feature_bundle.get("micro_goals_completion_rate") or 0.5)
    lo30 += -1.8 * mgr
    lo60 += -1.6 * mgr
    if mgr < 0.25:
        risk_factors.append("low_goal_completion")

    # --- Tendencia sesiones ---
    trend = feature_bundle.get("session_score_trend")
    if trend is not None:
        trend_contrib = -1.5 * float(trend)
        lo30 += trend_contrib
        lo60 += trend_contrib * 0.80
        if float(trend) < -0.35:
            risk_factors.append("declining_session_scores")

    # --- Delta IPI último periodo ---
    ipi_delta = feature_bundle.get("ipi_delta_last_period")
    if ipi_delta is not None:
        delta_contrib = -0.018 * float(ipi_delta)
        lo30 += delta_contrib
        lo60 += delta_contrib * 0.75
        if float(ipi_delta) < -10:
            risk_factors.append("ipi_decline")

    # --- Estado emocional ---
    mood = feature_bundle.get("avg_mood_last_5_sessions")
    if mood is not None:
        mood_contrib = -0.55 * float(mood)
        lo30 += mood_contrib
        lo60 += mood_contrib * 0.80
        if float(mood) < 2.5:
            risk_factors.append("mood_decline")

    # --- Sentimiento notas (NLP) ---
    sent = feature_bundle.get("sentiment_mean_last_30d")
    if sent is not None:
        sent_contrib = -1.2 * float(sent)
        lo30 += sent_contrib
        lo60 += sent_contrib * 0.75
        if float(sent) < -0.20:
            risk_factors.append("negative_session_sentiment")

    # --- Factor de tiempo en el programa (cuanto más tiempo, más enraizado) ---
    weeks = int(feature_bundle.get("weeks_in_program") or 12)
    stability_bonus = -0.025 * min(weeks, 52)
    lo30 += stability_bonus
    lo60 += stability_bonus

    p30 = _sigmoid(lo30)
    p60 = _sigmoid(lo60)

    # Trayectoria de riesgo
    if p60 > p30 * 1.25:
        trajectory = "increasing"
    elif p60 < p30 * 0.85:
        trajectory = "decreasing"
    else:
        trajectory = "stable"

    return {
        "dropout_probability_30d": round(p30, 3),
        "dropout_probability_60d": round(p60, 3),
        "risk_trajectory": trajectory,
        "top_risk_factors": risk_factors[:3],
        "recommended_intervention": _recommend(risk_factors, p30),
    }


def _recommend(risk_factors: list[str], p30: float) -> str:
    if p30 > 0.40:
        if "attendance_drop" in risk_factors or "unjustified_absences" in risk_factors:
            return "Contacte familiar urgent + visita si cal"
        if "mood_decline" in risk_factors or "negative_session_sentiment" in risk_factors:
            return "Entrevista individual amb psicopedagog"
        return "Reunió urgent coordinador + família"
    if p30 > 0.20:
        if "low_goal_completion" in risk_factors:
            return "Revisió i simplificació de micro-objectius"
        if "declining_session_scores" in risk_factors:
            return "Canvi de metodologia de reforç"
        return "Seguiment intensificat pròximes 2 setmanes"
    return "Seguiment rutinari — sense intervenció urgent"
