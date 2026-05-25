"""Verifica que el motor SROI calcula beneficis de forma coherent i reproducible."""

from __future__ import annotations

from app.services.program_sroi_metrics import MARGINAL_COST_PER_SESSION_EUR
from app.algorithms.sroi_engine import (
    _NGO_CORRECTION_FACTORS,
    _DEFAULT_PROXIES,
    _apply_corrections,
    _compute_sroi_breakdown,
    _effective_sessions_for_value,
    _outcomes_from_breakdown,
    _session_dose_metrics,
    calculate_sroi,
)


def _manual_components(
    n_p: int,
    gain: float,
    months: int,
    sessions: int,
    hours: float,
    pct_high_risk: float,
    pct_integration: float,
) -> dict[str, float]:
    proxies = _DEFAULT_PROXIES
    corr = _NGO_CORRECTION_FACTORS
    dw, attr, drop = corr["deadweight"], corr["attribution"], corr["drop_off_year1"]

    dose = _session_dose_metrics(sessions, n_p, months)
    sess_eff = dose["sessions_effective"]
    dose_m = dose["dose_outcomes_multiplier"]
    total_h = sess_eff * hours
    n_hr = max(0, round(n_p * pct_high_risk * (gain / 100)))

    family_raw = total_h * proxies["private_tutoring_eur_per_hour"]
    academic_raw = (
        n_p
        * (gain / 25.0)
        * proxies["academic_improvement_eur_per_participant_month"]
        * months
        * dose_m
    )
    excl_raw = (
        n_hr
        * proxies["exclusion_risk_eur_per_participant_year"]
        * (months / 12.0)
        * dose_m
    )
    integ_raw = n_p * pct_integration * proxies["integration_eur_per_participant"] * dose_m
    deliv_raw = total_h * proxies["attendance_eur_per_hour"] * 0.35

    return {
        "family_tutoring_value": round(_apply_corrections(family_raw, dw, attr, drop), 2),
        "academic_ipi_value": round(_apply_corrections(academic_raw, dw, attr, drop), 2),
        "exclusion_risk_reduction": round(_apply_corrections(excl_raw, dw, attr, drop), 2),
        "integration_value": round(_apply_corrections(integ_raw, dw, attr, drop), 2),
        "program_delivery_value": round(_apply_corrections(deliv_raw, dw, attr, drop), 2),
    }


def main() -> None:
    n_p, gain, months, sessions, hours = 25, 18.0, 6, 480, 1.5
    pct_hr, pct_int = 0.28, 0.45
    sess_eff = _effective_sessions_for_value(sessions, n_p, months)
    cost = n_p * months * 45 + int(round(sess_eff)) * MARGINAL_COST_PER_SESSION_EUR
    extra = {
        "sessions": sessions,
        "avg_duration_h": hours,
        "pct_high_risk": pct_hr,
        "pct_integration_gain": pct_int,
    }

    bd, total_engine = _compute_sroi_breakdown(
        n_p, gain, cost, months, _DEFAULT_PROXIES.copy(), _NGO_CORRECTION_FACTORS.copy(), extra
    )
    manual = _manual_components(n_p, gain, months, sessions, hours, pct_hr, pct_int)
    manual_sum = sum(manual.values())
    engine_sum = sum(v for k, v in bd.items() if not k.startswith("_"))
    _, _, _, outcomes_total = _outcomes_from_breakdown(bd)
    calc = calculate_sroi(n_p, gain, cost, months, extra=extra)

    corr_mult = (1 - 0.15) * 0.90 * (1 - 0.10)
    ratio_check = round(outcomes_total / cost, 2) if cost > 0 else 0

    print("=== VERIFICACIO BENEFICIS SROI ===\n")
    print(f"Escenari: {n_p} participants, guany IPI {gain}, {months} mesos, {sessions} sessions")
    print(f"Cost: EUR {cost:,.2f} | Sessions efectives: {sess_eff:.1f}")
    print(f"Correccions NGO: x{corr_mult:.4f}\n")

    ok = True
    for key in manual:
        e, m = bd[key], manual[key]
        match = abs(e - m) < 0.02
        if not match:
            ok = False
        print(f"  {key}: motor={e:,.2f} manual={m:,.2f} {'OK' if match else 'FAIL'}")

    print(f"\nSuma components motor:  EUR {engine_sum:,.2f}")
    print(f"Suma components manual: EUR {manual_sum:,.2f}")
    print(f"Outcomes (agrupat):     EUR {outcomes_total:,.2f}")
    print(f"total_social_value:     EUR {calc['total_social_value_eur']:,.2f}")
    print(f"SROI motor: {calc['sroi_ratio']:.2f}x | recomputat: {ratio_check:.2f}x")

    if abs(engine_sum - manual_sum) > 0.05:
        ok = False
        print("FAIL: suma motor != suma manual")
    if calc["sroi_ratio"] != ratio_check:
        ok = False
        print("FAIL: ratio SROI inconsistent")

    shares = sum(c["share_pct"] for c in calc["formula_explanation"]["numerator_components"])
    print(f"\nShares numerador UI: {shares:.1f}%")
    print("\n=== AUDITORIA METODOLOGICA ===")
    print("1. Estalvi families (28 EUR/h x hores efectives): proxy reforç privat INE/Bofill.")
    print("2. IPI academic (guany/25 x 65 EUR/mes x participants x dose): calibracio model.")
    print("3. Exclusio: participants_alto_risc x (guany_IPI/100) x 2800 EUR/any — revisar si guany global ha de ponderar risc.")
    print("4. Integracio: % participants amb millora integracio x 1200 EUR — des de registres si hi ha avaluacions.")
    print("5. Suport grupal: 35% de 18 EUR/h — complementari, no duplica el 100% de families.")

    print("\nRESULTAT:", "CALCUL CORRECTE (matematiques)" if ok else "ERRORS DETECTATS")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
