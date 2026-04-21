from dataclasses import dataclass
from typing import Optional
import math

# Pesos por defecto (configurables por organización)
DEFAULT_WEIGHTS = {
    "academic":    0.35,   # Lectura, matemáticas, comprensión
    "cognitive":   0.25,   # Atención, memoria, autonomía
    "social":      0.25,   # Interacción, trabajo en grupo, regulación emocional
    "integration": 0.15,   # Fluidez idioma, adaptación cultural
}

@dataclass
class DimensionScores:
    # Académica (3 indicadores, escala 1-5)
    reading_level:          Optional[int] = None
    math_level:             Optional[int] = None
    comprehension_level:    Optional[int] = None
    # Cognitiva
    attention_level:        Optional[int] = None
    memory_level:           Optional[int] = None
    autonomy_level:         Optional[int] = None
    # Social
    peer_interaction:       Optional[int] = None
    group_work:             Optional[int] = None
    emotional_regulation:   Optional[int] = None
    # Integración
    language_fluency:       Optional[int] = None
    cultural_adaptation:    Optional[int] = None

def _dimension_avg(values: list[Optional[int]]) -> Optional[float]:
    """Calcula la media ignorando valores nulos. Retorna None si no hay datos."""
    valid = [v for v in values if v is not None]
    if not valid:
        return None
    return sum(valid) / len(valid)

def _normalize_to_100(value: float, min_val: float = 1.0, max_val: float = 5.0) -> float:
    """Normaliza una puntuación 1-5 a escala 0-100."""
    return ((value - min_val) / (max_val - min_val)) * 100

def calculate_ipi(
    scores: DimensionScores,
    weights: dict[str, float] = DEFAULT_WEIGHTS
) -> dict:
    dim_scores = {
        "academic": _dimension_avg([
            scores.reading_level,
            scores.math_level,
            scores.comprehension_level
        ]),
        "cognitive": _dimension_avg([
            scores.attention_level,
            scores.memory_level,
            scores.autonomy_level
        ]),
        "social": _dimension_avg([
            scores.peer_interaction,
            scores.group_work,
            scores.emotional_regulation
        ]),
        "integration": _dimension_avg([
            scores.language_fluency,
            scores.cultural_adaptation
        ]),
    }
    
    # Normalizar dimensiones a 0-100
    normalized = {
        dim: _normalize_to_100(score) if score is not None else None
        for dim, score in dim_scores.items()
    }
    
    # Calcular IPI ponderado solo con dimensiones disponibles
    available = {d: s for d, s in normalized.items() if s is not None}
    
    if not available:
        return {"ipi": None, "dimensions": normalized, "completeness": 0.0}
    
    # Renormalizar pesos si hay dimensiones faltantes
    total_weight = sum(weights[d] for d in available)
    ipi = sum(
        (weights[d] / total_weight) * score
        for d, score in available.items()
    )
    
    # Completeness: % de indicadores con datos
    all_values = [
        scores.reading_level, scores.math_level, scores.comprehension_level,
        scores.attention_level, scores.memory_level, scores.autonomy_level,
        scores.peer_interaction, scores.group_work, scores.emotional_regulation,
        scores.language_fluency, scores.cultural_adaptation
    ]
    completeness = sum(1 for v in all_values if v is not None) / len(all_values)
    
    return {
        "ipi": round(ipi, 1),
        "dimensions": {k: round(v, 1) if v is not None else None for k, v in normalized.items()},
        "completeness": round(completeness, 2)
    }

def calculate_relative_improvement(
    baseline_ipi: float,
    current_ipi: float
) -> dict:
    if baseline_ipi == 0:
        return {"absolute_delta": current_ipi, "relative_delta_pct": None}
    
    absolute_delta = current_ipi - baseline_ipi
    relative_delta_pct = (absolute_delta / baseline_ipi) * 100
    
    return {
        "absolute_delta": round(absolute_delta, 1),
        "relative_delta_pct": round(relative_delta_pct, 1),
        "trajectory": "improving" if relative_delta_pct > 5 else 
                      "stable" if relative_delta_pct >= -5 else "declining"
    }
