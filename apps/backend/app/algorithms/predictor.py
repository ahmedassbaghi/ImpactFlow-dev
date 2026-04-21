from typing import Optional
import statistics
from datetime import date

def predict_next_ipi(
    historical_ipis: list[float],       # Lista de IPIs ordenados cronológicamente
    historical_dates: list[date],        # Fechas correspondientes
    weeks_ahead: int = 12               # Semanas a predecir (un trimestre)
) -> dict:
    n = len(historical_ipis)
    
    if n < 2:
        return {
            "predicted_ipi": historical_ipis[-1] if historical_ipis else None,
            "confidence": "low",
            "trend": "insufficient_data"
        }
    
    # Pesos exponenciales (más peso a observaciones recientes)
    weights = [0.5 ** (n - 1 - i) for i in range(n)]
    w_sum = sum(weights)
    weights = [w / w_sum for w in weights]
    
    # Media ponderada y tendencia
    weighted_mean = sum(v * w for v, w in zip(historical_ipis, weights))
    
    # Calcular tendencia como pendiente ponderada de los últimos n puntos
    if n >= 3:
        # Regresión lineal simple (mínimos cuadrados)
        x = list(range(n))
        x_mean = sum(x) / n
        y_mean = sum(historical_ipis) / n
        
        numerator = sum((xi - x_mean) * (yi - y_mean) for xi, yi in zip(x, historical_ipis))
        denominator = sum((xi - x_mean) ** 2 for xi in x)
        
        slope = numerator / denominator if denominator != 0 else 0
        intercept = y_mean - slope * x_mean
        
        # Proyectar hacia adelante
        # Asumiendo períodos de evaluación ~12 semanas
        periods_ahead = weeks_ahead / 12
        predicted_ipi = intercept + slope * (n + periods_ahead - 1)
        
        # Limitar entre 0 y 100
        predicted_ipi = max(0.0, min(100.0, predicted_ipi))
    else:
        # Con solo 2 puntos, extrapolar
        slope = historical_ipis[-1] - historical_ipis[-2]
        predicted_ipi = historical_ipis[-1] + slope * 0.8  # Factor de regresión a la media
        predicted_ipi = max(0.0, min(100.0, predicted_ipi))
    
    # Desviación estándar como proxy de confianza
    if n >= 3:
        std = statistics.stdev(historical_ipis)
        confidence = "high" if std < 5 else "medium" if std < 12 else "low"
    else:
        confidence = "low"
    
    # Tendencia
    recent_slope = historical_ipis[-1] - historical_ipis[0]
    trend = "improving" if recent_slope > 3 else "stable" if recent_slope >= -3 else "declining"
    
    return {
        "predicted_ipi": round(predicted_ipi, 1),
        "confidence": confidence,
        "trend": trend,
        "slope_per_period": round(slope, 2) if n >= 3 else None,
        "historical_std": round(statistics.stdev(historical_ipis), 2) if n >= 3 else None
    }
