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
        v = max_gain * (1.0 + v_step * 0.15)  # 1.0x to ~3.85x
        for k_step in range(40):
            k = 0.1 + (3.0 * max_dose - 0.1) * (k_step / 39)
            ss = sum((g - _hill_n1(d, v, k)) ** 2 for d, g in zip(doses, gains))
            if ss < best_ss:
                best_ss = ss
                best = (v, k)
    return best


def fit_dose_response(doses: Sequence[float], gains: Sequence[float]) -> dict:
    """Fit Hill (n=1) curve to (dose, gain) observations.

    Args:
        doses: dose per participant (e.g. number of sessions attended).
        gains: IPI gain (post - baseline) per participant.

    Returns:
        dict with vmax, k_half, optimal_dose_90pct, r_squared, n_observations,
        curve_points (sampled for chart), interpretation.
    """
    pairs = [(d, g) for d, g in zip(doses, gains) if d is not None and g is not None and d >= 0]
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
        v0 = max(y.max(), 1.0)
        k0 = max(np.median(x), 1.0)
        popt, _ = curve_fit(
            _hill_n1, x, y,
            p0=[v0, k0],
            bounds=([0.0, 0.01], [v0 * 5, x.max() * 5]),
            maxfev=5000,
        )
        vmax = float(popt[0])
        k_half = float(popt[1])
    except Exception:
        vmax, k_half = _grid_search_fit(d_arr, g_arr)

    y_pred = [_hill_n1(d, vmax, k_half) for d in d_arr]
    r2 = _r_squared(g_arr, y_pred)

    # Optimal dose: 90% of Vmax → d = 9*K
    optimal_dose = 9.0 * k_half

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

    interp = (
        f"Ajust {quality} (R²={r2:.2f}). Sostre estimat del programa: {vmax:.1f} punts d'IPI. "
        f"Cal aproximadament {k_half:.1f} dosis per assolir el 50% del màxim, "
        f"i {optimal_dose:.1f} per al 90% (rendiments decreixents)."
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
        "interpretation": interp,
        "model": "Hill n=1 (Michaelis-Menten)",
    }
