"""Tests de coherència del motor de beneficis SROI."""

from app.algorithms.sroi_engine import (
    _NGO_CORRECTION_FACTORS,
    _DEFAULT_PROXIES,
    _apply_corrections,
    _compute_sroi_breakdown,
    _outcomes_from_breakdown,
    _session_dose_metrics,
    calculate_sroi,
)


def _manual_breakdown(n_p, gain, months, sessions, hours, pct_hr, pct_int):
    proxies = _DEFAULT_PROXIES
    c = _NGO_CORRECTION_FACTORS
    dw, attr, drop = c["deadweight"], c["attribution"], c["drop_off_year1"]
    dose = _session_dose_metrics(sessions, n_p, months)
    sess_eff = dose["sessions_effective"]
    dose_m = dose["dose_outcomes_multiplier"]
    total_h = sess_eff * hours
    n_hr = max(0, round(n_p * pct_hr * (gain / 100)))

    def corr(raw):
        return round(_apply_corrections(raw, dw, attr, drop), 2)

    return {
        "family_tutoring_value": corr(total_h * proxies["private_tutoring_eur_per_hour"]),
        "academic_ipi_value": corr(
            n_p
            * (gain / 25.0)
            * proxies["academic_improvement_eur_per_participant_month"]
            * months
            * dose_m
        ),
        "exclusion_risk_reduction": corr(
            n_hr * proxies["exclusion_risk_eur_per_participant_year"] * (months / 12.0) * dose_m
        ),
        "integration_value": corr(
            n_p * pct_int * proxies["integration_eur_per_participant"] * dose_m
        ),
        "program_delivery_value": corr(total_h * proxies["attendance_eur_per_hour"] * 0.35),
    }


def test_breakdown_matches_manual_formula():
    extra = {
        "sessions": 120,
        "avg_duration_h": 1.5,
        "pct_high_risk": 0.25,
        "pct_integration_gain": 0.40,
    }
    n_p, gain, months, cost = 20, 12.0, 6, 10_000.0
    bd, total = _compute_sroi_breakdown(
        n_p, gain, cost, months, _DEFAULT_PROXIES.copy(), _NGO_CORRECTION_FACTORS.copy(), extra
    )
    manual = _manual_breakdown(n_p, gain, months, 120, 1.5, 0.25, 0.40)
    for key in manual:
        assert bd[key] == manual[key], key
    assert abs(sum(v for k, v in bd.items() if not k.startswith("_")) - total) < 0.02


def test_sroi_ratio_equals_outcomes_over_cost():
    extra = {"sessions": 80, "avg_duration_h": 1.5, "pct_high_risk": 0.30}
    cost = 8_500.0
    result = calculate_sroi(15, 15.0, cost, 6, extra=extra)
    _, _, _, outcomes = _outcomes_from_breakdown(result["value_breakdown"])
    # value_breakdown in result is without _ keys; recompute from same inputs
    bd, _ = _compute_sroi_breakdown(
        15, 15.0, cost, 6, _DEFAULT_PROXIES.copy(), _NGO_CORRECTION_FACTORS.copy(), extra
    )
    _, _, _, outcomes2 = _outcomes_from_breakdown(bd)
    assert result["total_social_value_eur"] == outcomes2
    assert result["sroi_ratio"] == round(outcomes2 / cost, 2)


def test_corrections_reduce_raw_value():
    raw = 10_000.0
    c = _NGO_CORRECTION_FACTORS
    corrected = _apply_corrections(raw, c["deadweight"], c["attribution"], c["drop_off_year1"])
    assert corrected < raw
    assert corrected == round(raw * (1 - 0.15) * 0.90 * (1 - 0.10), 2)
