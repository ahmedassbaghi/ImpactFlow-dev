"""Per-dimension paired effect-size analysis.

Computes Cohen's dz (paired) for each of the 4 IPI dimensions
(academic, cognitive, social, integration) by comparing baseline vs.
latest periodic assessment per participant.

Educational benchmarks (Hattie 2009 — Visible Learning meta-analysis):
- d < 0.2: trivial
- 0.2 ≤ d < 0.4: small (typical school year improvement)
- 0.4 ≤ d < 0.6: above the "hinge point" — meaningful learning effect
- 0.6 ≤ d < 0.8: large effect (top-quartile interventions)
- d ≥ 0.8: very large (transformative)
"""

from __future__ import annotations

import math
from statistics import mean, stdev
from typing import Sequence


def _hattie_label(d: float) -> str:
    if d < 0.2:
        return "trivial"
    if d < 0.4:
        return "petit"
    if d < 0.6:
        return "moderat"
    if d < 0.8:
        return "gran"
    return "molt gran"


def _hattie_color(d: float) -> str:
    if d < 0.2:
        return "muted"
    if d < 0.4:
        return "warn"
    if d < 0.6:
        return "info"
    return "good"


def _cohens_dz(diffs: Sequence[float]) -> tuple[float, float, float]:
    """Returns (dz, mean_diff, sd_diff)."""
    if len(diffs) < 2:
        return 0.0, 0.0, 0.0
    md = mean(diffs)
    sd = stdev(diffs)
    if sd <= 0:
        return 0.0, md, 0.0
    return md / sd, md, sd


def _t_pvalue(t: float, df: int) -> float:
    if df <= 0:
        return 1.0
    abs_t = abs(t)
    if df >= 30:
        z = abs_t
        return min(1.0, 2 * 0.5 * math.erfc(z / math.sqrt(2)))
    try:
        from scipy import stats  # type: ignore
        return float(2 * (1 - stats.t.cdf(abs_t, df)))
    except Exception:
        z = abs_t * math.sqrt(df / (df + abs_t ** 2))
        return min(1.0, 2 * 0.5 * math.erfc(z / math.sqrt(2)))


def compute_dimension_effects(
    pairs_by_dim: dict[str, list[tuple[float, float]]],
) -> dict:
    """Compute Cohen's dz per dimension.

    Args:
        pairs_by_dim: {"academic": [(baseline, post), ...], "cognitive": ..., ...}

    Returns:
        dict with per-dimension breakdown + overall summary.
    """
    out: dict[str, dict] = {}
    summary_n = 0

    for dim, pairs in pairs_by_dim.items():
        valid = [(b, p) for b, p in pairs if b is not None and p is not None]
        n = len(valid)
        if n < 3:
            out[dim] = {
                "n": n,
                "dz": None,
                "mean_diff": None,
                "p_value": None,
                "ci_95": [None, None],
                "interpretation": "insuficient",
                "color": "muted",
                "baseline_mean": None,
                "post_mean": None,
            }
            continue

        diffs = [post - base for base, post in valid]
        dz, md, sd = _cohens_dz(diffs)
        se = sd / math.sqrt(n) if n > 0 and sd > 0 else 0.0
        t_stat = md / se if se > 0 else 0.0
        p_val = _t_pvalue(t_stat, n - 1)

        # 95% CI on mean diff (and translate to dz CI)
        try:
            from scipy import stats  # type: ignore
            t_crit = stats.t.ppf(0.975, n - 1)
        except Exception:
            t_crit = 1.96 if n > 30 else 2.262  # rough fallback for n=10

        ci_low = md - t_crit * se
        ci_high = md + t_crit * se

        baseline_mean = mean(b for b, _ in valid)
        post_mean = mean(p for _, p in valid)

        out[dim] = {
            "n": n,
            "dz": round(dz, 3),
            "mean_diff": round(md, 3),
            "sd_diff": round(sd, 3),
            "p_value": round(p_val, 5),
            "ci_95": [round(ci_low, 3), round(ci_high, 3)],
            "interpretation": _hattie_label(dz),
            "color": _hattie_color(dz),
            "baseline_mean": round(baseline_mean, 2),
            "post_mean": round(post_mean, 2),
            "is_significant": p_val < 0.05 and dz > 0,
        }
        summary_n = max(summary_n, n)

    # Find best and weakest dimension
    valid_dims = {k: v for k, v in out.items() if v["dz"] is not None}
    if valid_dims:
        best = max(valid_dims.items(), key=lambda kv: kv[1]["dz"])
        weakest = min(valid_dims.items(), key=lambda kv: kv[1]["dz"])
    else:
        best = weakest = None

    return {
        "dimensions": out,
        "n": summary_n,
        "strongest_dimension": best[0] if best else None,
        "strongest_dz": best[1]["dz"] if best else None,
        "weakest_dimension": weakest[0] if weakest else None,
        "weakest_dz": weakest[1]["dz"] if weakest else None,
        "methodology": (
            "Cohen's dz (mostres aparellades) per dimensió. "
            "Llindars Hattie (2009): d>=0.4 = aprenentatge meaningful. "
            "p-valor de t-test pre-post. IC95% bilateral."
        ),
    }
