"""Causal inference for ONG impact measurement.

Implements:
- Difference-in-Differences (DiD): the gold-standard quasi-experimental
  estimator for treatment effects when a control group is available.
  Used by the World Bank, J-PAL, IFS for randomised programme evaluation.
- Welch's t-test on difference scores (handles unequal variance).
- Bootstrap CI on the DiD estimator (non-parametric, robust to non-normality).

Reference: Card & Krueger (1994), Imbens & Wooldridge (2009).
"""

from __future__ import annotations

import math
import random
from statistics import mean, stdev
from typing import Sequence


def _safe_stdev(values: Sequence[float]) -> float:
    if len(values) < 2:
        return 0.0
    return stdev(values)


def _t_pvalue_two_sided(t: float, df: float) -> float:
    """Approximate two-sided p-value from t-statistic via normal CDF for df >= 30,
    fallback to Student's t survival function for small df.
    """
    if df <= 0 or math.isnan(t):
        return 1.0
    abs_t = abs(t)
    if df >= 30:
        # Normal approximation
        z = abs_t
        p_one_sided = 0.5 * math.erfc(z / math.sqrt(2))
        return min(1.0, 2 * p_one_sided)
    # Use scipy if available for exact
    try:
        from scipy import stats  # type: ignore
        return float(2 * (1 - stats.t.cdf(abs_t, df)))
    except Exception:
        # Crude fallback
        z = abs_t * math.sqrt(df / (df + abs_t ** 2))
        p_one_sided = 0.5 * math.erfc(z / math.sqrt(2))
        return min(1.0, 2 * p_one_sided)


def _welch_df(s1_sq: float, n1: int, s2_sq: float, n2: int) -> float:
    if n1 < 2 or n2 < 2:
        return max(1.0, n1 + n2 - 2)
    num = (s1_sq / n1 + s2_sq / n2) ** 2
    den = (s1_sq / n1) ** 2 / (n1 - 1) + (s2_sq / n2) ** 2 / (n2 - 1)
    return num / den if den > 0 else max(1.0, n1 + n2 - 2)


def difference_in_differences(
    treatment_pre: Sequence[float],
    treatment_post: Sequence[float],
    control_pre: Sequence[float],
    control_post: Sequence[float],
    bootstrap_iters: int = 2000,
) -> dict:
    """Compute paired DiD with Welch's t-test and bootstrap CI.

    Each list is one observation per participant. treatment_pre[i] and
    treatment_post[i] correspond to the same participant. Same for control.
    Lengths within group must match.

    Returns:
        dict with did_estimate, treatment_change, control_change, t_stat,
        p_value, ci_95, n_treatment, n_control, interpretation.
    """
    if len(treatment_pre) != len(treatment_post):
        raise ValueError("treatment pre/post lengths must match")
    if len(control_pre) != len(control_post):
        raise ValueError("control pre/post lengths must match")

    n_t = len(treatment_pre)
    n_c = len(control_pre)

    if n_t < 2 or n_c < 2:
        return {
            "did_estimate": None,
            "treatment_change": None,
            "control_change": None,
            "t_stat": None,
            "p_value": None,
            "ci_95": [None, None],
            "n_treatment": n_t,
            "n_control": n_c,
            "interpretation": "Mostra insuficient (necessites >=2 a cada grup).",
            "is_significant": False,
        }

    diffs_t = [post - pre for pre, post in zip(treatment_pre, treatment_post)]
    diffs_c = [post - pre for pre, post in zip(control_pre, control_post)]

    delta_t = mean(diffs_t)
    delta_c = mean(diffs_c)
    did = delta_t - delta_c

    s_t = _safe_stdev(diffs_t)
    s_c = _safe_stdev(diffs_c)

    se_did = math.sqrt((s_t ** 2) / n_t + (s_c ** 2) / n_c) if (n_t > 1 and n_c > 1) else 0.0
    df = _welch_df(s_t ** 2, n_t, s_c ** 2, n_c)
    t_stat = did / se_did if se_did > 0 else 0.0
    p_value = _t_pvalue_two_sided(t_stat, df)

    # Bootstrap CI
    rng = random.Random(42)
    boot_estimates: list[float] = []
    for _ in range(bootstrap_iters):
        bt = [diffs_t[rng.randrange(n_t)] for _ in range(n_t)]
        bc = [diffs_c[rng.randrange(n_c)] for _ in range(n_c)]
        boot_estimates.append(mean(bt) - mean(bc))
    boot_estimates.sort()
    ci_low = boot_estimates[int(0.025 * bootstrap_iters)]
    ci_high = boot_estimates[int(0.975 * bootstrap_iters)]

    # Interpretation
    if did is None:
        interp = "—"
    elif p_value < 0.01 and did > 0:
        interp = "Impacte causal molt fort i altament significatiu."
    elif p_value < 0.05 and did > 0:
        interp = "Impacte causal positiu estadísticament significatiu."
    elif p_value < 0.10 and did > 0:
        interp = "Tendència positiva marginalment significativa."
    elif did > 0:
        interp = "Diferència positiva no significativa amb la mostra actual."
    else:
        interp = "Sense evidència d'impacte causal positiu."

    return {
        "did_estimate": round(did, 3),
        "treatment_change": round(delta_t, 3),
        "control_change": round(delta_c, 3),
        "t_stat": round(t_stat, 3),
        "p_value": round(p_value, 4),
        "ci_95": [round(ci_low, 3), round(ci_high, 3)],
        "se": round(se_did, 3),
        "df": round(df, 1),
        "n_treatment": n_t,
        "n_control": n_c,
        "interpretation": interp,
        "is_significant": p_value < 0.05 and did > 0,
        "methodology": "Difference-in-Differences (Card & Krueger 1994) amb Welch t-test i bootstrap CI95% (2000 iter).",
    }
