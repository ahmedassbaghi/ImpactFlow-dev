"""Monte Carlo simulation for SROI uncertainty quantification.

Alineat amb el motor SROI actual:
- Numerador = beneficis mesurats (4 components, dosi de sessions, correccions NGO)
- Denominador = cost fix + sessions efectives × cost marginal (recalculat per iteració)
"""

from __future__ import annotations

import math
import random
from statistics import mean, median, stdev
from typing import Sequence

from app.algorithms.sroi_engine import (
    _DEFAULT_PROXIES,
    _NGO_CORRECTION_FACTORS,
    _compute_sroi_breakdown,
    _sroi_ratio_outcomes,
)
from app.services.program_sroi_metrics import (
    MARGINAL_COST_PER_SESSION_EUR,
    MONTHLY_FIXED_COST_PER_PARTICIPANT_EUR,
    _program_operating_cost,
)


def _sample_triangular(rng: random.Random, low: float, mode: float, high: float) -> float:
    return rng.triangular(low, high, mode)


def _sample_beta_around(rng: random.Random, mode: float, concentration: float = 30.0) -> float:
    c = max(concentration, 4.0)
    alpha = max(1.0, mode * (c - 2) + 1)
    beta = max(1.0, (1 - mode) * (c - 2) + 1)
    return rng.betavariate(alpha, beta)


def monte_carlo_sroi(
    n_participants: int,
    avg_ipi_gain_mean: float,
    avg_ipi_gain_sd: float,
    program_duration_months: int,
    n_sessions: int | None = None,
    avg_duration_h: float = 1.5,
    pct_high_risk: float = 0.30,
    pct_integration_gain: float | None = None,
    program_cost_eur: float | None = None,
    monthly_fixed_cost_per_participant_eur: float = MONTHLY_FIXED_COST_PER_PARTICIPANT_EUR,
    marginal_cost_per_session_eur: float = MARGINAL_COST_PER_SESSION_EUR,
    n_iter: int = 5000,
    proxy_config: dict | None = None,
    seed: int = 42,
) -> dict:
    """Run Monte Carlo simulation of SROI ratio (outcomes / cost en efectiu)."""
    n_p = max(n_participants, 1)
    months = max(program_duration_months, 1)
    sessions_central = max(
        int(n_sessions) if n_sessions is not None else n_p * months * 4,
        0,
    )

    central_cost, _ = _program_operating_cost(n_p, months, sessions_central)
    if central_cost <= 0 and (program_cost_eur is None or program_cost_eur <= 0):
        return {
            "n_iter": 0,
            "mean": 0.0,
            "median": 0.0,
            "p05": 0.0,
            "p25": 0.0,
            "p75": 0.0,
            "p95": 0.0,
            "prob_above_1": 0.0,
            "prob_above_2": 0.0,
            "central_estimate": 0.0,
            "distribution_bins": [],
            "se_mean": 0.0,
            "interpretation": "No es pot calcular sense sessions ni cost de programa.",
            "inputs": {},
        }

    rng = random.Random(seed)
    base_proxies = {**_DEFAULT_PROXIES, **(proxy_config or {})}
    ngo = _NGO_CORRECTION_FACTORS
    se_gain = (
        avg_ipi_gain_sd / math.sqrt(n_p) if n_p > 0 else max(avg_ipi_gain_sd, 0.5)
    )

    integ_central = (
        pct_integration_gain
        if pct_integration_gain is not None
        else min(avg_ipi_gain_mean / 100.0, 1.0)
    )

    samples: list[float] = []
    for _ in range(n_iter):
        gain = max(0.0, min(100.0, rng.gauss(avg_ipi_gain_mean, max(se_gain, 0.5))))

        proxies = {
            k: _sample_triangular(rng, v * 0.85, v, v * 1.15)
            for k, v in base_proxies.items()
        }

        corrections = {
            "deadweight": _sample_beta_around(rng, ngo["deadweight"], 25),
            "attribution": _sample_beta_around(rng, ngo["attribution"], 25),
            "drop_off_year1": _sample_triangular(
                rng,
                max(0.02, ngo["drop_off_year1"] - 0.08),
                ngo["drop_off_year1"],
                min(0.35, ngo["drop_off_year1"] + 0.08),
            ),
        }

        sessions_sample = max(
            0,
            int(sessions_central * rng.triangular(0.85, 1.0, 1.15)),
        )
        cost_iter, _ = _program_operating_cost(n_p, months, sessions_sample)

        pct_int = min(1.0, max(0.0, integ_central * rng.triangular(0.8, 1.0, 1.2)))
        extra = {
            "sessions": sessions_sample,
            "avg_duration_h": avg_duration_h,
            "pct_high_risk": min(1.0, max(0.0, pct_high_risk * rng.triangular(0.85, 1.0, 1.15))),
            "pct_integration_gain": pct_int,
            "monthly_fixed_cost_per_participant_eur": monthly_fixed_cost_per_participant_eur,
            "marginal_cost_per_session_eur": marginal_cost_per_session_eur,
        }

        breakdown, _ = _compute_sroi_breakdown(
            n_participants=n_p,
            avg_ipi_gain=gain,
            program_cost_eur=cost_iter,
            program_duration_months=months,
            proxies=proxies,
            corrections=corrections,
            extra=extra,
        )
        samples.append(_sroi_ratio_outcomes(breakdown, cost_iter))

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
            f"SROI mitjà {central}× amb {prob_above_1 * 100:.0f}% de probabilitat de superar "
            f"el break-even. Model alineat amb sessions registrades i cost mixt (45€/part./mes + "
            f"10€/sessió efectiva)."
        )
    elif prob_above_1 >= 0.80:
        interp = (
            f"SROI mitjà {central}× amb {prob_above_1 * 100:.0f}% de probabilitat positiva. "
            f"El benefici creix amb les hores de suport i la dosi de sessions."
        )
    elif prob_above_1 >= 0.50:
        interp = (
            f"SROI mitjà {central}×. Incertesa significativa: el {prob_above_1 * 100:.0f}% "
            f"dels escenaris superen el break-even."
        )
    else:
        interp = (
            f"SROI mitjà {central}×. Risc que el valor social no superi la inversió "
            f"({(1 - prob_above_1) * 100:.0f}% dels escenaris sota 1×)."
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
        "methodology": (
            f"Monte Carlo (n={n_iter}): beneficis mesurats (IPI × dosi + hores × €28/h) ÷ "
            f"cost (€{monthly_fixed_cost_per_participant_eur:.0f}/part./mes + "
            f"€{marginal_cost_per_session_eur:.0f}/sessió efectiva); correccions NGO."
        ),
        "inputs": {
            "n_participants": n_p,
            "n_sessions_central": sessions_central,
            "program_duration_months": months,
            "central_cost_eur": round(central_cost, 2),
            "avg_ipi_gain_mean": round(avg_ipi_gain_mean, 2),
            "avg_duration_h": avg_duration_h,
        },
    }
