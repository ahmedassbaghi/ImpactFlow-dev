"""Dose-Response curve fitting for programme dosage optimisation.

Fits a Hill / Michaelis-Menten model:
    gain(d) = Vmax * d^n / (K^n + d^n)

Where:
    d = dose (number of sessions attended, or hours)
    Vmax = asymptotic maximum gain (IPI points)
    K = dose at which gain = Vmax/2 (half-saturation)
    n = Hill coefficient (cooperativity / curve steepness, fixed at 1 for parsimony)

Used in pharmacology, education research (Bloom 1984 mastery learning),
and programme evaluation to identify the dose at which marginal returns
diminish.

This implementation uses scipy.optimize.curve_fit when available; falls
back to a robust grid search over (Vmax, K) otherwise.
"""

from __future__ import annotations

import math
from typing import Sequence

# Guany màxim plausible (IPI 0–100): Vmax de la corba és guany, no puntuació absoluta
MAX_IPI_GAIN = 100.0


def _hill_n1(d: float, vmax: float, k: float) -> float:
    if k + d <= 0:
        return 0.0
    return vmax * d / (k + d)


def _r_squared(y_obs: Sequence[float], y_pred: Sequence[float]) -> float:
    if not y_obs:
        return 0.0
    y_mean = sum(y_obs) / len(y_obs)
    ss_tot = sum((y - y_mean) ** 2 for y in y_obs)
    ss_res = sum((yo - yp) ** 2 for yo, yp in zip(y_obs, y_pred))
    if ss_tot <= 0:
        return 0.0
    return max(0.0, 1.0 - ss_res / ss_tot)


def _grid_search_fit(doses: Sequence[float], gains: Sequence[float]) -> tuple[float, float]:
    """Robust fallback: grid over Vmax in [max gain, 3*max gain] and K in [0.1, 3*max dose]."""
    if not doses or not gains:
        return 0.0, 1.0
    max_gain = max(max(gains), 1.0)
    max_dose = max(max(doses), 1.0)
    best = (max_gain, max_dose / 2)
    best_ss = float("inf")
    for v_step in range(20):
        v = min(MAX_IPI_GAIN, max_gain * (1.0 + v_step * 0.15))  # 1.0x to ~3.85x
        for k_step in range(40):
            k = 0.1 + (3.0 * max_dose - 0.1) * (k_step / 39)
            ss = sum((g - _hill_n1(d, v, k)) ** 2 for d, g in zip(doses, gains))
            if ss < best_ss:
                best_ss = ss
                best = (v, k)
    return best


def fit_dose_response(
    doses: Sequence[float],
    gains: Sequence[float],
    *,
    dose_unit: str = "sessions",
) -> dict:
    """Fit Hill (n=1) curve to (dose, gain) observations.

    Args:
        doses: dose per participant (e.g. number of sessions attended).
        gains: IPI gain (post - baseline) per participant.

    Returns:
        dict with vmax, k_half, optimal_dose_90pct, r_squared, n_observations,
        curve_points (sampled for chart), interpretation.
    """
    pairs = [
        (d, min(MAX_IPI_GAIN, max(0.0, g)))
        for d, g in zip(doses, gains)
        if d is not None and g is not None and d >= 0
    ]
    if len(pairs) < 4:
        return {
            "vmax": None,
            "k_half": None,
            "optimal_dose_90pct": None,
            "r_squared": None,
            "n_observations": len(pairs),
            "curve_points": [],
            "interpretation": "Mostra insuficient (cal n>=4) per ajustar la corba dosi-resposta.",
            "model": "Hill n=1 (Michaelis-Menten)",
        }

    d_arr = [p[0] for p in pairs]
    g_arr = [p[1] for p in pairs]

    vmax: float
    k_half: float
    try:
        from scipy.optimize import curve_fit  # type: ignore
        import numpy as np  # type: ignore

        x = np.array(d_arr, dtype=float)
        y = np.array(g_arr, dtype=float)
        # Initial guess
        v0 = min(MAX_IPI_GAIN, max(float(y.max()), 1.0))
        k0 = max(float(np.median(x)), 1.0)
        popt, _ = curve_fit(
            _hill_n1, x, y,
            p0=[v0, k0],
            bounds=([0.0, 0.01], [MAX_IPI_GAIN, max(float(x.max()) * 5, 1.0)]),
            maxfev=5000,
        )
        vmax = min(MAX_IPI_GAIN, float(popt[0]))
        k_half = float(popt[1])
    except Exception:
        vmax, k_half = _grid_search_fit(d_arr, g_arr)
        vmax = min(MAX_IPI_GAIN, vmax)

    # K no pot ser absurdament més gran que la dosi observada (evita «1090 sessions»)
    max_observed_dose = max(d_arr) if d_arr else 1.0
    k_half = max(0.1, min(k_half, max_observed_dose * 4.0))

    y_pred = [_hill_n1(d, vmax, k_half) for d in d_arr]
    r2 = _r_squared(g_arr, y_pred)

    # Optimal dose: 90% of Vmax → d = 9*K
    optimal_dose = min(9.0 * k_half, max_observed_dose * 6.0)

    # Sample curve points for chart
    max_d = max(max(d_arr), optimal_dose * 1.1)
    n_pts = 50
    curve_points = [
        {"dose": round(i * max_d / n_pts, 2), "gain": round(_hill_n1(i * max_d / n_pts, vmax, k_half), 3)}
        for i in range(n_pts + 1)
    ]

    if r2 >= 0.5:
        quality = "fort"
    elif r2 >= 0.25:
        quality = "moderat"
    else:
        quality = "feble"

    unit = dose_unit if dose_unit in ("sessions", "hores") else "sessions"
    interp_plain = (
        f"Amb les dades actuals ({len(pairs)} infants), la millora mitjana en l'Índex de Progrés "
        f"Integral (IPI, escala 0–100) no supera uns +{vmax:.0f} punts respecte l'entrada al programa. "
        f"Això NO vol dir que l'infant arribi a IPI {vmax:.0f}: si entra amb IPI 45, un +{vmax:.0f} "
        f"seria IPI {min(100, 45 + vmax):.0f} com a màxim teòric."
    )
    interp_dose = (
        f"El model situa la meitat d'aquesta millora al voltant de {k_half:.0f} {unit}, "
        f"i el 90% al voltant de {optimal_dose:.0f} {unit}. "
        f"A partir d'allà, afegir més suport aporta poc més (rendiments decreixents)."
    )
    if optimal_dose > 200 or k_half > 80:
        interp_dose += (
            " (Valors de sessions molt alts: l'ajust és poc fiable — revisa dades atípiques o "
            "mostra insuficient.)"
        )

    return {
        "vmax": round(vmax, 3),
        "k_half": round(k_half, 3),
        "optimal_dose_90pct": round(optimal_dose, 2),
        "r_squared": round(r2, 4),
        "n_observations": len(pairs),
        "curve_points": curve_points,
        "observed_points": [
            {"dose": round(d, 2), "gain": round(g, 3)} for d, g in pairs
        ],
        "interpretation": f"Ajust {quality} (R²={r2:.2f}). {interp_plain} {interp_dose}",
        "interpretation_plain": interp_plain,
        "interpretation_dose": interp_dose,
        "max_gain_label": "Millora màxima en l'IPI (respecte l'entrada)",
        "model": "Hill n=1 (Michaelis-Menten)",
    }
