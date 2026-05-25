"""
Módulo A — Análisis de Efecto de Intervención
Proporciona evidencia estadística formal del impacto de un programa:
Cohen's d, Wilcoxon signed-rank, Mann-Whitney U, Bootstrap CI.
"""
from __future__ import annotations

import math
import random
from typing import Optional

try:
    import numpy as np
    from scipy import stats as _scipy_stats
    _HAS_SCIPY = True
except ImportError:
    _HAS_SCIPY = False


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _mean(values: list[float]) -> float:
    return sum(values) / len(values)


def _std(values: list[float]) -> float:
    n = len(values)
    if n < 2:
        return 0.0
    m = _mean(values)
    return math.sqrt(sum((x - m) ** 2 for x in values) / (n - 1))


def _p_label(p: float) -> str:
    if p < 0.001:
        return "altamente_significativo_p<0.001"
    if p < 0.01:
        return "muy_significativo_p<0.01"
    if p < 0.05:
        return "significativo_p<0.05"
    if p < 0.10:
        return "tendencia_marginal_p<0.10"
    return "no_significativo"


# ---------------------------------------------------------------------------
# Cohen's d (paired/repeated-measures: dz)
# ---------------------------------------------------------------------------

def cohens_d_paired(
    baseline_scores: list[float],
    final_scores: list[float],
) -> dict:
    """
    Cohen's dz para datos pre-post emparejados (Cohen, 1988).
    Interpretación estándar:
      |d| < 0.2  → trivial
      0.2–0.5    → petit
      0.5–0.8    → mig
      ≥ 0.8      → gran
    """
    n = len(baseline_scores)
    if n < 2 or len(final_scores) != n:
        return {"d": None, "label": "datos_insuficientes", "n": n}

    diffs = [f - b for f, b in zip(final_scores, baseline_scores)]
    mean_diff = _mean(diffs)
    sd_diff = _std(diffs)

    if sd_diff == 0:
        return {"d": None, "label": "sin_varianza", "n": n, "mean_diff": round(mean_diff, 2)}

    d = mean_diff / sd_diff
    abs_d = abs(d)

    if abs_d < 0.2:
        label = "trivial"
    elif abs_d < 0.5:
        label = "petit"
    elif abs_d < 0.8:
        label = "mig"
    else:
        label = "gran"

    return {
        "d": round(d, 3),
        "label": label,
        "n": n,
        "mean_diff": round(mean_diff, 2),
        "sd_diff": round(sd_diff, 2),
    }


# ---------------------------------------------------------------------------
# Wilcoxon signed-rank (non-parametric, ideal para n < 30)
# ---------------------------------------------------------------------------

def wilcoxon_prepost(
    baseline_scores: list[float],
    final_scores: list[float],
    alpha: float = 0.05,
) -> dict:
    """
    Test no paramétrico de Wilcoxon para muestras emparejadas.
    No asume normalidad — adecuado para ONGs con 10-50 participantes.
    H1 (unilateral): la mediana de las diferencias es > 0.
    """
    n = len(baseline_scores)
    if n < 5 or len(final_scores) != n:
        return {
            "statistic": None,
            "p_value": None,
            "significant": None,
            "interpretation": "muestra_insuficiente_min_n5",
            "n": n,
        }

    diffs = [f - b for f, b in zip(final_scores, baseline_scores)]
    non_zero = [d for d in diffs if d != 0]
    if len(non_zero) < 2:
        return {
            "statistic": None,
            "p_value": None,
            "significant": None,
            "interpretation": "sin_diferencias_observables",
            "n": n,
        }

    if _HAS_SCIPY:
        stat, p = _scipy_stats.wilcoxon(non_zero, alternative="greater")
        sig = bool(p < alpha)
        return {
            "statistic": round(float(stat), 3),
            "p_value": round(float(p), 4),
            "significant": sig,
            "interpretation": _p_label(p),
            "n": n,
        }

    # Fallback: test de signo simple
    positives = sum(1 for d in diffs if d > 0)
    crude_sig = positives / n > 0.60
    return {
        "statistic": positives,
        "p_value": None,
        "significant": crude_sig,
        "interpretation": "test_signo_simplificado_instala_scipy",
        "n": n,
    }


# ---------------------------------------------------------------------------
# Mann-Whitney U (grupo control vs. intervención)
# ---------------------------------------------------------------------------

def mann_whitney_groups(
    control_scores: list[float],
    intervention_scores: list[float],
    alpha: float = 0.05,
) -> dict:
    """
    Compara si los participantes del programa mejoran significativamente
    más que el grupo control. Es la prueba de causalidad del sistema.
    """
    nc, ni = len(control_scores), len(intervention_scores)
    if nc < 3 or ni < 3:
        return {
            "U_statistic": None,
            "p_value": None,
            "effect_size_r": None,
            "significant": None,
            "interpretation": "muestras_insuficientes_min_n3",
            "n_control": nc,
            "n_intervention": ni,
        }

    if _HAS_SCIPY:
        stat, p = _scipy_stats.mannwhitneyu(
            intervention_scores, control_scores, alternative="greater"
        )
        N = nc + ni
        z = _scipy_stats.norm.ppf(1 - float(p))
        r = abs(z) / math.sqrt(N)
        sig = bool(p < alpha)
        return {
            "U_statistic": round(float(stat), 1),
            "p_value": round(float(p), 4),
            "effect_size_r": round(float(r), 3),
            "significant": sig,
            "interpretation": "intervención_superior_al_control" if sig else "diferencia_no_significativa",
            "n_control": nc,
            "n_intervention": ni,
        }

    sig = _mean(intervention_scores) > _mean(control_scores)
    return {
        "U_statistic": None,
        "p_value": None,
        "effect_size_r": None,
        "significant": sig,
        "interpretation": "comparacion_medias_sin_scipy",
        "n_control": nc,
        "n_intervention": ni,
    }


# ---------------------------------------------------------------------------
# Bootstrap Confidence Interval (IC para el IPI medio del programa)
# ---------------------------------------------------------------------------

def bootstrap_confidence_interval(
    scores: list[float],
    n_bootstrap: int = 2000,
    ci: float = 0.95,
    seed: int = 42,
) -> dict:
    """
    IC percentil bootstrapped para la media del IPI.
    Más robusto que el IC paramétrico para muestras pequeñas.
    """
    n = len(scores)
    if n == 0:
        return {"mean": None, "ci_lower": None, "ci_upper": None, "std_error": None, "confidence_level": ci}
    if n == 1:
        v = scores[0]
        return {"mean": round(v, 2), "ci_lower": round(v, 2), "ci_upper": round(v, 2), "std_error": 0.0, "confidence_level": ci}

    if _HAS_SCIPY:
        arr = np.array(scores)
        rng = np.random.default_rng(seed)
        boot_means = np.array([np.mean(arr[rng.integers(0, n, n)]) for _ in range(n_bootstrap)])
        alpha = 1 - ci
        lo = float(np.percentile(boot_means, alpha / 2 * 100))
        hi = float(np.percentile(boot_means, (1 - alpha / 2) * 100))
        return {
            "mean": round(float(np.mean(arr)), 2),
            "ci_lower": round(lo, 2),
            "ci_upper": round(hi, 2),
            "std_error": round(float(np.std(boot_means)), 3),
            "n_bootstrap": n_bootstrap,
            "confidence_level": ci,
        }

    rng = random.Random(seed)
    boot_means = sorted(sum(rng.choices(scores, k=n)) / n for _ in range(n_bootstrap))
    alpha = 1 - ci
    lo = boot_means[max(0, int(alpha / 2 * n_bootstrap))]
    hi = boot_means[min(len(boot_means) - 1, int((1 - alpha / 2) * n_bootstrap) - 1)]
    mean_val = sum(scores) / n
    bm = sum(boot_means) / len(boot_means)
    std_e = math.sqrt(sum((x - bm) ** 2 for x in boot_means) / len(boot_means))
    return {
        "mean": round(mean_val, 2),
        "ci_lower": round(lo, 2),
        "ci_upper": round(hi, 2),
        "std_error": round(std_e, 3),
        "n_bootstrap": n_bootstrap,
        "confidence_level": ci,
    }


# ---------------------------------------------------------------------------
# Función integradora
# ---------------------------------------------------------------------------

def compute_intervention_effect(
    baseline_ipis: list[float],
    final_ipis: list[float],
    control_ipis: list[float] | None = None,
) -> dict:
    """
    Análisis completo del efecto de intervención.
    Combina Cohen's d, Wilcoxon, Bootstrap CI y opcionalmente Mann-Whitney.
    """
    n = len(baseline_ipis)
    if n == 0 or len(final_ipis) != n:
        return {"error": "datos_insuficientes", "n_participants": 0}

    mean_b = _mean(baseline_ipis)
    mean_f = _mean(final_ipis)
    abs_change = mean_f - mean_b
    pct_change = (abs_change / mean_b * 100) if mean_b > 0 else 0.0

    cohen = cohens_d_paired(baseline_ipis, final_ipis)
    wilcoxon = wilcoxon_prepost(baseline_ipis, final_ipis)
    ci = bootstrap_confidence_interval(final_ipis)

    result: dict = {
        "n_participants": n,
        "ipi_mean_baseline": round(mean_b, 1),
        "ipi_mean_final": round(mean_f, 1),
        "ipi_change_absolute": round(abs_change, 1),
        "ipi_change_percent": round(pct_change, 1),
        "cohens_d": cohen.get("d"),
        "cohens_d_label": cohen.get("label"),
        "wilcoxon_statistic": wilcoxon.get("statistic"),
        "wilcoxon_p": wilcoxon.get("p_value"),
        "wilcoxon_significant": wilcoxon.get("significant"),
        "bootstrap_ci_95": [ci.get("ci_lower"), ci.get("ci_upper")],
        "bootstrap_mean": ci.get("mean"),
        "has_control_group": bool(control_ipis and len(control_ipis) >= 3),
    }

    if result["has_control_group"]:
        mw = mann_whitney_groups(control_ipis, final_ipis)  # type: ignore[arg-type]
        result["mann_whitney_p"] = mw.get("p_value")
        result["mann_whitney_effect_r"] = mw.get("effect_size_r")
        result["mann_whitney_significant"] = mw.get("significant")

    result["narrative"] = _build_narrative(
        n=n,
        d=cohen.get("d"),
        d_label=cohen.get("label"),
        p=wilcoxon.get("p_value"),
        abs_change=abs_change,
        pct_change=pct_change,
        ci_lower=ci.get("ci_lower"),
        ci_upper=ci.get("ci_upper"),
    )

    return result


def _build_narrative(
    n: int,
    d: float | None,
    d_label: str | None,
    p: float | None,
    abs_change: float,
    pct_change: float,
    ci_lower: float | None,
    ci_upper: float | None,
) -> str:
    direction = "millora" if abs_change >= 0 else "descens"
    text = (
        f"El programa ha atès {n} participants amb una {direction} "
        f"mitjana de {abs(abs_change):.1f} punts IPI ({abs(pct_change):.1f}% vs. baseline). "
    )
    if d is not None:
        label_ca = {
            "trivial": "trivial",
            "petit": "petit",
            "pequeño": "petit",
            "mig": "mig",
            "medio": "mig",
            "gran": "gran",
            "grande": "gran",
        }.get(d_label or "", d_label or "—")
        text += f"La mida de l'efecte és {label_ca} (d={d:.2f}). "
    if p is not None:
        if p < 0.05:
            text += f"La millora és estadísticament significativa (p={p:.3f}). "
        else:
            text += f"La millora no assoleix significació estadística (p={p:.3f}). "
    if ci_lower is not None and ci_upper is not None:
        text += f"IC 95%: [{ci_lower:.1f} – {ci_upper:.1f}]."
    return text.strip()
