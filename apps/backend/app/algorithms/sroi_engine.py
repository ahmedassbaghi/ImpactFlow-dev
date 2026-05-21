"""SROI (Social Return on Investment) engine — SROI Network Standard (2012).

Proxies calibrats per al context català d'educació i integració social.
Fonts: INE 2023, Fundació Jaume Bofill, SERES.
"""

from __future__ import annotations


_DEFAULT_PROXIES = {
    # €/month reduction in private tutoring per participant improving 25 IPI pts
    # Catalan market rate for group tutoring/reforç escolar: €65/month (2024)
    "academic_improvement_eur_per_participant_month": 65.0,
    # €/year social services cost avoided per high-risk participant
    # Source: INE 2023 / Departament de Drets Socials Generalitat de Catalunya
    "exclusion_risk_eur_per_participant_year": 2800.0,
    # €/participant for integration employment value
    # Source: Fundació Jaume Bofill 2023, updated from 800 → 1200
    "integration_eur_per_participant": 1200.0,
    # €/hour educational supervision per session (professional group support)
    # Catalan socio-educational professional rate: €18/h
    "attendance_eur_per_hour": 18.0,
}

_CORRECTION_FACTORS = {
    "deadweight": 0.25,   # fraction of improvement that would happen without programme
    "attribution": 0.85,  # fraction attributable to the programme
    "drop_off_year1": 0.15,  # value decay after first year
}

_SENSITIVITY = {
    "conservative": {"deadweight": 0.35, "attribution": 0.75, "drop_off_year1": 0.25},
    "central":      {"deadweight": 0.25, "attribution": 0.85, "drop_off_year1": 0.15},
    "optimistic":   {"deadweight": 0.15, "attribution": 0.95, "drop_off_year1": 0.05},
}

_ICC_INTERP = [
    (0.0,  0.40, "pobre"),
    (0.40, 0.60, "moderada"),
    (0.60, 0.75, "bona"),
    (0.75, 1.01, "excel·lent"),
]


def _apply_corrections(raw_value: float, deadweight: float, attribution: float, drop_off: float) -> float:
    return raw_value * (1 - deadweight) * attribution * (1 - drop_off)


def _compute_sroi_breakdown(
    n_participants: int,
    avg_ipi_gain: float,
    program_cost_eur: float,
    program_duration_months: int,
    proxies: dict,
    corrections: dict,
    extra: dict | None = None,
) -> tuple[dict, float]:
    """Returns (value_breakdown, total_social_value_eur)."""
    dw = corrections["deadweight"]
    attr = corrections["attribution"]
    drop = corrections["drop_off_year1"]

    extra = extra or {}
    sessions = extra.get("sessions", n_participants * program_duration_months * 4)
    avg_duration_h = extra.get("avg_duration_h", 1.5)
    pct_high_risk = extra.get("pct_high_risk", 0.30)
    pct_integration_gain = extra.get("pct_integration_gain", min(avg_ipi_gain / 100.0, 1.0))

    n_high_risk_avoided = max(0, round(n_participants * pct_high_risk * (avg_ipi_gain / 100)))

    # Raw values before correction
    academic_raw = (
        n_participants
        * (avg_ipi_gain / 25.0)
        * proxies["academic_improvement_eur_per_participant_month"]
        * program_duration_months
    )
    exclusion_raw = (
        n_high_risk_avoided
        * proxies["exclusion_risk_eur_per_participant_year"]
        * (program_duration_months / 12.0)
    )
    integration_raw = (
        n_participants
        * pct_integration_gain
        * proxies["integration_eur_per_participant"]
    )
    # Value = total programme session-hours of professional educational support.
    # sessions = total sessions across the programme (not per participant).
    attendance_raw = (
        sessions
        * avg_duration_h
        * proxies["attendance_eur_per_hour"]
    )

    breakdown = {
        "academic_improvement": round(_apply_corrections(academic_raw, dw, attr, drop), 2),
        "exclusion_risk_reduction": round(_apply_corrections(exclusion_raw, dw, attr, drop), 2),
        "integration_value": round(_apply_corrections(integration_raw, dw, attr, drop), 2),
        "attendance_value": round(_apply_corrections(attendance_raw, dw, attr, drop), 2),
    }
    total = sum(breakdown.values())
    return breakdown, round(total, 2)


def calculate_sroi(
    n_participants: int,
    avg_ipi_gain: float,
    program_cost_eur: float,
    program_duration_months: int,
    domain: str = "academic_social",
    proxy_config: dict | None = None,
    extra: dict | None = None,
) -> dict:
    """Calculate SROI following SROI Network Standard (2012).

    Args:
        n_participants: Total participants in the programme.
        avg_ipi_gain: Average IPI gain in points (0-100 scale).
        program_cost_eur: Total programme investment in EUR.
        program_duration_months: Duration of the programme.
        domain: Reserved for future domain-specific proxy overrides.
        proxy_config: Optional dict to override specific proxy values.
        extra: Optional dict with sessions, avg_duration_h, pct_high_risk, pct_integration_gain.

    Returns:
        Full SROI result dict.
    """
    proxies = {**_DEFAULT_PROXIES, **(proxy_config or {})}
    corrections = _CORRECTION_FACTORS.copy()

    breakdown, total_social_value = _compute_sroi_breakdown(
        n_participants, avg_ipi_gain, program_cost_eur,
        program_duration_months, proxies, corrections, extra
    )

    sroi_ratio = round(total_social_value / program_cost_eur, 2) if program_cost_eur > 0 else 0.0

    # Sensitivity analysis
    sensitivity: dict[str, float] = {}
    for scenario, corr in _SENSITIVITY.items():
        _, sv = _compute_sroi_breakdown(
            n_participants, avg_ipi_gain, program_cost_eur,
            program_duration_months, proxies, corr, extra
        )
        ratio = round(sv / program_cost_eur, 2) if program_cost_eur > 0 else 0.0
        sensitivity[scenario] = ratio

    return {
        "total_social_value_eur": total_social_value,
        "total_investment_eur": round(program_cost_eur, 2),
        "sroi_ratio": sroi_ratio,
        "sroi_statement": (
            f"Per cada €1 invertit, el programa genera €{sroi_ratio:.2f} de valor social"
        ),
        "value_breakdown": breakdown,
        "sensitivity_analysis": sensitivity,
        "methodology_reference": "SROI Network Standard (2012), proxies INE 2023 / Fundació Jaume Bofill",
        "deadweight_factor": corrections["deadweight"],
        "attribution_factor": corrections["attribution"],
        "n_participants": n_participants,
        "avg_ipi_gain": round(avg_ipi_gain, 2),
        "program_duration_months": program_duration_months,
    }
