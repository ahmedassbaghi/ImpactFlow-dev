"""Curva d'aprenentatge per IPI de sessió (rendiments decreixents, asímptota personal).

Inspirat en corbes d'aprenentatge amb fase d'acceleració i rendiments decreixents
(Pusic et al., learning curves in health professions education): el progrés
s'aproxima a un màxim realista M, no a 100 linealment.

Trajectòria ideal per sessió n (des de baseline b):
    P(n) = M - (M - b) * exp(-k * n)

Cada sessió es mou cap a P(n) i cap a l'observació (dimensions), amb pas
màxim proporcional al «headroom» restant (saturació suau).
"""

from __future__ import annotations

import math

# Guany màxim realista respecte baseline (no tothom arriba a 100)
ASYMPTOTE_GAIN_ABOVE_BASELINE = 38.0
ABSOLUTE_IPI_CEILING = 88.0
BASELINE_FLOOR_MARGIN = 15.0

# Velocitat d'aproximació a M (~15–20 sessions per cobrir ~85% del rang)
CURVE_K = 0.09

# Fracció màxima del «headroom» que es pot tancar en una sessió
MAX_HEADROOM_FRACTION_PER_SESSION = 0.12

# Pesos: trajectòria ideal vs observació del voluntari
WEIGHT_TOWARD_IDEAL = 0.45
WEIGHT_TOWARD_OBSERVED = 0.22

# Pas negatiu màxim per sessió (recaigudes)
MAX_NEGATIVE_STEP = 6.0


def personal_asymptote(baseline_ipi: float | None, reference_ipi: float) -> float:
    """Màxim teòric personal (asímptota de la corba)."""
    base = baseline_ipi if baseline_ipi is not None else reference_ipi
    return min(ABSOLUTE_IPI_CEILING, base + ASYMPTOTE_GAIN_ABOVE_BASELINE)


def learning_curve_target(baseline_ipi: float, session_index: int) -> float:
    """Punt de la corva d'aprenentatge a la sessió n (1-indexed)."""
    n = max(1, session_index)
    b = baseline_ipi
    m = personal_asymptote(b, b)
    span = max(1.0, m - b)
    return m - span * math.exp(-CURVE_K * n)


def apply_learning_curve_ipi(
    *,
    prev_ipi: float | None,
    observed_ipi: float,
    baseline_ipi: float | None,
    session_index: int,
) -> float:
    """Combina observació de sessió amb corva d'aprenentatge (rendiments decreixents)."""
    b = baseline_ipi if baseline_ipi is not None else (prev_ipi if prev_ipi is not None else observed_ipi)
    m = personal_asymptote(baseline_ipi, b if prev_ipi is None else prev_ipi)
    floor = max(0.0, b - BASELINE_FLOOR_MARGIN)
    n = max(1, session_index)
    ideal = learning_curve_target(b, n)

    if prev_ipi is None:
        # Primera avaluació de sessió: no saltar directament a observed
        blended = 0.55 * ideal + 0.45 * min(observed_ipi, ideal + 5.0)
        return round(max(floor, min(m, blended)), 1)

    headroom_up = max(0.0, m - prev_ipi)
    headroom_down = max(0.0, prev_ipi - floor)

    toward_ideal = WEIGHT_TOWARD_IDEAL * (ideal - prev_ipi)
    toward_observed = WEIGHT_TOWARD_OBSERVED * (observed_ipi - prev_ipi)
    delta = toward_ideal + toward_observed

    if delta > 0 and headroom_up > 0:
        # Saturació: a prop de M, el guany marginal és petit (1 - e^(-headroom/scale))
        saturation = 1.0 - math.exp(-headroom_up / 22.0)
        delta *= max(0.12, saturation)
        delta = min(delta, headroom_up * MAX_HEADROOM_FRACTION_PER_SESSION)
    elif delta < 0:
        delta = max(delta, -MAX_NEGATIVE_STEP)
        if headroom_down > 0:
            delta = max(delta, -headroom_down * 0.2)

    final = prev_ipi + delta
    return round(max(floor, min(m, final)), 1)
