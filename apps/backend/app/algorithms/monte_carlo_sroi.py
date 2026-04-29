"""Monte Carlo simulation for SROI uncertainty quantification.

Sampling distributions:
- avg_ipi_gain ~ Normal(observed_mean, observed_sd / sqrt(n))  [sampling distribution of mean]
- proxy values ~ Triangular(0.8x, x, 1.2x)  [±20% reasonable bounds]
- deadweight ~ Beta calibrated around 0.25
- attribution ~ Beta calibrated around 0.85
- drop_off_year1 ~ Triangular(0.05, 0.15, 0.25)

Returns percentiles + probability that SROI > 1 (break-even).

This addresses funder demand for honest uncertainty disclosure
(IFRS S2, GRI 2024 standards on social impact reporting).
"""

from __future__ import annotations

import math
import random
from statistics import mean, median, stdev
from typing import Sequence

from app.algorithms.sroi_engine import _DEFAULT_PROXIES, _compute_sroi_breakdown


def _sample_triangular(rng: random.Random, low: float, mode: float, high: float) -> float:
    return rng.triangular(low, high, mode)


def _sample_beta_around(rng: random.Random, mode: float, concentration: float = 30.0) -> float:
    """Beta with given mode and concentration (alpha+beta).
    For mode m and concentration c: alpha = m*(c-2) + 1, beta = (1-m)*(c-2) + 1.
    """
    c = max(concentration, 4.0)
    alpha = max(1.0, mode * (c - 2) + 1)
    beta = max(1.0, (1 - mode) * (c - 2) + 1)
    return rng.betavariate(alpha, beta)


def monte_carlo_sroi(
    n_participants: int,
    avg_ipi_gain_mean: float,
    avg_ipi_gain_sd: float,
    program_cost_eur: float,
    program_duration_months: int,
    n_sessions: int | None = None,
    avg_duration_h: float = 1.5,
    pct_high_risk: float = 0.30,
    n_iter: int = 5000,
    proxy_config: dict | None = None,
    seed: int = 42,
) -> dict:
    """Run Monte Carlo simulation of SROI ratio.

    Returns:
        dict with mean, median, p05, p25, p75, p95, prob_above_1,
        prob_above_2, central_estimate, distribution_bins.
    """
    if program_cost_eur <= 0:
        return {
            "n_iter": 0,
            "mean": 0.0, "median": 0.0,
            "p05": 0.0, "p25": 0.0, "p75": 0.0, "p95": 0.0,
            "prob_above_1": 0.0, "prob_above_2": 0.0,
            "central_estimate": 0.0,
            "distribution_bins": [],
            "se_mean": 0.0,
            "interpretation": "No es pot calcular sense cost de programa positiu.",
        }

    rng = random.Random(seed)
    base_proxies = {**_DEFAULT_PROXIES, **(proxy_config or {})}

    # Standard error of the mean for the IPI gain distribution
    se_gain = avg_ipi_gain_sd / math.sqrt(max(1, n_participants)) if n_participants > 0 else avg_ipi_gain_sd

    sessions_central = n_sessions if n_sessions is not None else n_participants * program_duration_months * 4

    samples: list[float] = []
    for _ in range(n_iter):
        # Sample IPI gain (truncated at 0 and 100)
        gain = rng.gauss(avg_ipi_gain_mean, max(se_gain, 0.5))
        gain = max(0.0, min(100.0, gain))

        # Sample proxies (±20% triangular around central)
        proxies = {
            k: _sample_triangular(rng, v * 0.8, v, v * 1.2)
            for k, v in base_proxies.items()
        }

        corrections = {
            "deadweight": _sample_beta_around(rng, 0.25),
            "attribution": _sample_beta_around(rng, 0.85),
            "drop_off_year1": _sample_triangular(rng, 0.05, 0.15, 0.25),
        }

        # Sample session count with ±10%
        sessions_sample = int(sessions_central * rng.triangular(0.9, 1.1, 1.0))

        extra = {
            "sessions": sessions_sample,
            "avg_duration_h": avg_duration_h,
            "pct_high_risk": pct_high_risk,
            "pct_integration_gain": min(gain / 100.0, 1.0),
        }

        _, total_value = _compute_sroi_breakdown(
            n_participants=n_participants,
            avg_ipi_gain=gain,
            program_cost_eur=program_cost_eur,
            program_duration_months=program_duration_months,
            proxies=proxies,
            corrections=corrections,
            extra=extra,
        )
        samples.append(total_value / program_cost_eur)

    samples.sort()
    n = len(samples)

    def pct(p: float) -> float:
        idx = max(0, min(n - 1, int(p * n)))
        return samples[idx]

    mean_v = mean(samples)
    median_v = median(samples)
    sd_v = stdev(samples) if n > 1 else 0.0
    prob_above_1 = sum(1 for s in samples if s > 1.0) / n
    prob_above_2 = sum(1 for s in samples if s > 2.0) / n

    # Histogram for chart (30 bins between p01 and p99 to avoid outliers stretching)
    p01 = pct(0.01)
    p99 = pct(0.99)
    n_bins = 30
    width = (p99 - p01) / n_bins if p99 > p01 else 1.0
    bins = [0] * n_bins
    for s in samples:
        if s < p01 or s > p99:
            continue
        idx = min(n_bins - 1, int((s - p01) / width))
        bins[idx] += 1
    distribution_bins = [
        {"x": round(p01 + i * width + width / 2, 3), "count": bins[i]}
        for i in range(n_bins)
    ]

    central = round(mean_v, 2)
    if prob_above_1 >= 0.95:
        interp = (
            f"SROI mitjà {central}× amb {prob_above_1*100:.0f}% de probabilitat de superar el llindar de break-even (€1→€1). "
            f"Evidència molt sòlida d'eficiència social."
        )
    elif prob_above_1 >= 0.80:
        interp = (
            f"SROI mitjà {central}× amb {prob_above_1*100:.0f}% de probabilitat positiva. "
            f"El programa és probablement eficient socialment."
        )
    elif prob_above_1 >= 0.50:
        interp = (
            f"SROI mitjà {central}×. La incertesa és significativa: només el {prob_above_1*100:.0f}% "
            f"dels escenaris superen el break-even."
        )
    else:
        interp = (
            f"SROI mitjà {central}×. Hi ha un risc important que el valor social no superi la inversió "
            f"({(1-prob_above_1)*100:.0f}% dels escenaris)."
        )

    return {
        "n_iter": n_iter,
        "mean": round(mean_v, 3),
        "median": round(median_v, 3),
        "se_mean": round(sd_v, 3),
        "p05": round(pct(0.05), 3),
        "p25": round(pct(0.25), 3),
        "p75": round(pct(0.75), 3),
        "p95": round(pct(0.95), 3),
        "prob_above_1": round(prob_above_1, 4),
        "prob_above_2": round(prob_above_2, 4),
        "central_estimate": central,
        "distribution_bins": distribution_bins,
        "interpretation": interp,
        "methodology": "Monte Carlo SROI (n=5000), proxies Triangular(±20%), correction factors Beta/Triangular calibrats.",
    }
