from typing import Optional
import math
import random
import statistics
from datetime import date


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _linear_regression(x: list[float], y: list[float]) -> tuple[float, float]:
    """Ordinary least squares. Returns (slope, intercept)."""
    n = len(x)
    if n < 2:
        return 0.0, y[0] if y else 0.0
    x_mean = sum(x) / n
    y_mean = sum(y) / n
    num = sum((xi - x_mean) * (yi - y_mean) for xi, yi in zip(x, y))
    den = sum((xi - x_mean) ** 2 for xi in x)
    slope = num / den if den != 0 else 0.0
    return slope, y_mean - slope * x_mean


_Z_TABLE = {0.70: 1.036, 0.75: 1.150, 0.80: 1.282, 0.85: 1.440, 0.90: 1.645, 0.95: 1.960, 0.99: 2.576}


def _z_for_confidence(confidence: float) -> float:
    return _Z_TABLE.get(round(confidence, 2), 1.645)


# ---------------------------------------------------------------------------
# Original predictor (backward-compatible — usado en periodic assessment)
# ---------------------------------------------------------------------------

def predict_next_ipi(
    historical_ipis: list[float],
    historical_dates: list[date],
    weeks_ahead: int = 12,
) -> dict:
    n = len(historical_ipis)

    if n < 2:
        return {
            "predicted_ipi": historical_ipis[-1] if historical_ipis else None,
            "confidence": "low",
            "trend": "insufficient_data",
        }

    weights = [0.5 ** (n - 1 - i) for i in range(n)]
    w_sum = sum(weights)
    weights = [w / w_sum for w in weights]
    weighted_mean = sum(v * w for v, w in zip(historical_ipis, weights))

    if n >= 3:
        x = list(range(n))
        slope, intercept = _linear_regression(x, historical_ipis)
        periods_ahead = weeks_ahead / 12
        predicted_ipi = max(0.0, min(100.0, intercept + slope * (n + periods_ahead - 1)))
    else:
        slope = historical_ipis[-1] - historical_ipis[-2]
        predicted_ipi = max(0.0, min(100.0, historical_ipis[-1] + slope * 0.8))

    if n >= 3:
        std = statistics.stdev(historical_ipis)
        confidence = "high" if std < 5 else "medium" if std < 12 else "low"
    else:
        confidence = "low"

    recent_slope = historical_ipis[-1] - historical_ipis[0]
    trend = "improving" if recent_slope > 3 else "stable" if recent_slope >= -3 else "declining"

    return {
        "predicted_ipi": round(predicted_ipi, 1),
        "confidence": confidence,
        "trend": trend,
        "slope_per_period": round(slope, 2) if n >= 3 else None,
        "historical_std": round(statistics.stdev(historical_ipis), 2) if n >= 3 else None,
    }


# ---------------------------------------------------------------------------
# Módulo B.1 — Predictor probabilístico con intervalo de confianza
# ---------------------------------------------------------------------------

def predict_ipi_with_uncertainty(
    historical_ipis: list[float],
    historical_dates: list[date],
    weeks_ahead: int = 12,
    n_bootstrap: int = 1000,
    confidence: float = 0.80,
) -> dict:
    """
    Predicción IPI con banda de incertidumbre.
    - n < 5: intervalo de predicción paramétrico (OLS + t-distribution aprox.)
    - n ≥ 5: bootstrap residual 1000 iteraciones
    """
    n = len(historical_ipis)

    if n < 2:
        val = historical_ipis[-1] if historical_ipis else None
        return {
            "predicted_ipi": val,
            "ci_lower": val,
            "ci_upper": val,
            "confidence_level": confidence,
            "method": "insufficient_data",
            "n_observations": n,
            "trend": "insufficient_data",
            "slope_per_12w": None,
        }

    x = [float(i) for i in range(n)]
    periods_ahead = weeks_ahead / 12.0
    x_pred = n + periods_ahead - 1.0

    slope, intercept = _linear_regression(x, historical_ipis)
    point_estimate = max(0.0, min(100.0, intercept + slope * x_pred))

    x_mean = sum(x) / n
    Sxx = sum((xi - x_mean) ** 2 for xi in x)
    residuals = [historical_ipis[i] - (intercept + slope * x[i]) for i in range(n)]
    mse = sum(r ** 2 for r in residuals) / max(n - 2, 1)
    std_resid = math.sqrt(mse)

    if n >= 5:
        rng = random.Random(42)
        boot_preds: list[float] = []
        for _ in range(n_bootstrap):
            # Residual bootstrap: resample residuals, refit
            boot_y = [intercept + slope * xi + rng.choice(residuals) for xi in x]
            try:
                b_slope, b_intercept = _linear_regression(x, boot_y)
                pred = b_intercept + b_slope * x_pred + rng.gauss(0, std_resid)
                boot_preds.append(max(0.0, min(100.0, pred)))
            except Exception:
                pass

        if boot_preds:
            boot_preds.sort()
            alpha = 1 - confidence
            lo = boot_preds[max(0, int(alpha / 2 * len(boot_preds)))]
            hi = boot_preds[min(len(boot_preds) - 1, int((1 - alpha / 2) * len(boot_preds)) - 1)]
            method = "bootstrap"
        else:
            lo, hi, method = _parametric_interval(point_estimate, Sxx, x_mean, x_pred, n, mse, confidence)
    else:
        lo, hi, method = _parametric_interval(point_estimate, Sxx, x_mean, x_pred, n, mse, confidence)

    # Trend
    recent_slope = historical_ipis[-1] - historical_ipis[0]
    trend = "improving" if recent_slope > 3 else "stable" if recent_slope >= -3 else "declining"

    # Slope expressed as IPI points per 12 weeks (one quarter)
    periods_total = max(n - 1, 1)
    slope_per_12w = slope * (12.0 / max(periods_total, 1))

    return {
        "predicted_ipi": round(point_estimate, 1),
        "ci_lower": round(lo, 1),
        "ci_upper": round(hi, 1),
        "confidence_level": confidence,
        "method": method,
        "n_observations": n,
        "trend": trend,
        "slope_per_12w": round(slope_per_12w, 2),
    }


def _parametric_interval(
    point: float,
    Sxx: float,
    x_mean: float,
    x_pred: float,
    n: int,
    mse: float,
    confidence: float,
) -> tuple[float, float, str]:
    se_pred = math.sqrt(mse * (1 + 1 / n + (x_pred - x_mean) ** 2 / max(Sxx, 1e-10)))
    z = _z_for_confidence(confidence)
    lo = max(0.0, point - z * se_pred)
    hi = min(100.0, point + z * se_pred)
    return lo, hi, "parametric"


# ---------------------------------------------------------------------------
# Módulo B.2 — Probabilidad de alcanzar objetivo (Monte Carlo)
# ---------------------------------------------------------------------------

def probability_of_reaching_target(
    historical_ipis: list[float],
    target_ipi: float = 70.0,
    weeks_ahead: int = 12,
    n_simulations: int = 5000,
) -> dict:
    """
    Simulación Monte Carlo: P(IPI_futuro ≥ target_ipi) en `weeks_ahead` semanas.
    Usa la distribución empírica de residuos + bootstrap de pendientes.
    """
    n = len(historical_ipis)

    if n < 2:
        current = historical_ipis[-1] if historical_ipis else 0.0
        p = 1.0 if current >= target_ipi else 0.0
        return {
            "target_ipi": target_ipi,
            "probability": p,
            "probability_label": _prob_label(p),
            "weeks_ahead": weeks_ahead,
            "simulations": 0,
        }

    x = [float(i) for i in range(n)]
    periods_ahead = weeks_ahead / 12.0
    x_pred = n + periods_ahead - 1.0

    slope, intercept = _linear_regression(x, historical_ipis)
    residuals = [historical_ipis[i] - (intercept + slope * x[i]) for i in range(n)]
    std_resid = math.sqrt(sum(r ** 2 for r in residuals) / max(n - 2, 1))

    rng = random.Random(42)
    successes = 0

    for _ in range(n_simulations):
        # Bootstrap slope estimate
        if n >= 3:
            sampled_idx = [rng.randint(0, n - 1) for _ in range(n)]
            bx = [x[i] for i in sampled_idx]
            by = [historical_ipis[i] for i in sampled_idx]
            try:
                b_slope, b_intercept = _linear_regression(bx, by)
            except Exception:
                b_slope, b_intercept = slope, intercept
        else:
            b_slope, b_intercept = slope, intercept

        # Add Gaussian residual noise for prediction uncertainty
        pred = b_intercept + b_slope * x_pred + rng.gauss(0, std_resid)
        pred = max(0.0, min(100.0, pred))

        if pred >= target_ipi:
            successes += 1

    probability = successes / n_simulations

    return {
        "target_ipi": target_ipi,
        "probability": round(probability, 3),
        "probability_label": _prob_label(probability),
        "weeks_ahead": weeks_ahead,
        "simulations": n_simulations,
    }


def _prob_label(p: float) -> str:
    if p >= 0.80:
        return f"alta ({round(p * 100)}%)"
    if p >= 0.50:
        return f"moderada ({round(p * 100)}%)"
    if p >= 0.25:
        return f"baixa ({round(p * 100)}%)"
    return f"molt baixa ({round(p * 100)}%)"
