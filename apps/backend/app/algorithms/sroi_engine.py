"""SROI (Social Return on Investment) engine — SROI Network Standard (2012).

Proxies calibrats per al context català d'educació i integració social.
Fonts: INE 2023, Fundació Jaume Bofill, SERES.

Nota sobre la corba de saturació:
  El SROI real per a programes NGO educatius se situa entre 2:1 i 6:1 (F.Jaume Bofill).
  Per reflectir els rendiments decreixents (primeres sessions = major impacte,
  sessions addicionals = menor impacte marginal), s'aplica escala logarítmica
  al component d'assistència per sobre de la intensitat esperada.
  Això produeix una corba natural d'estabilització als 3-5x.
"""

from __future__ import annotations
import math


_EXPECTED_SESSIONS_PER_PARTICIPANT_MONTH = 4

_DEFAULT_PROXIES = {
    "academic_improvement_eur_per_participant_month": 65.0,
    "exclusion_risk_eur_per_participant_year": 2800.0,
    "integration_eur_per_participant": 1200.0,
    "private_tutoring_eur_per_hour": 28.0,
    "attendance_eur_per_hour": 18.0,
}

# Correccions estàndard SROI
_CORRECTION_FACTORS = {
    "deadweight": 0.25,
    "attribution": 0.85,
    "drop_off_year1": 0.15,
}

# ONG: el voluntariat no és despesa en efectiu — correccions una mica més properes al impacte atribuïble
_NGO_CORRECTION_FACTORS = {
    "deadweight": 0.15,
    "attribution": 0.90,
    "drop_off_year1": 0.10,
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


def build_sroi_extra(
    *,
    sessions: int,
    avg_duration_h: float,
    pct_high_risk: float,
    avg_ipi_gain: float = 0.0,
    pct_integration_gain: float | None = None,
) -> dict:
    """Paràmetres SROI des de registres reals (sessions, IPI, risc, integració)."""
    extra: dict = {
        "sessions": sessions,
        "avg_duration_h": avg_duration_h,
        "pct_high_risk": pct_high_risk,
    }
    if pct_integration_gain is not None:
        extra["pct_integration_gain"] = pct_integration_gain
    elif avg_ipi_gain > 0:
        extra["pct_integration_gain"] = min(avg_ipi_gain / 100.0, 1.0)
    return extra


def _session_dose_metrics(
    sessions: int,
    n_participants: int,
    program_duration_months: int,
) -> dict[str, float]:
    """Dosi de programa (sessions reals vs intensitat esperada) per alinear cost i valor."""
    n_p = max(n_participants, 1)
    months = max(program_duration_months, 1)
    baseline = float(n_p * months * _EXPECTED_SESSIONS_PER_PARTICIPANT_MONTH)
    registered = float(max(sessions, 0))
    effective = _effective_sessions_for_value(int(registered), n_p, months)
    dose = effective / baseline if baseline > 0 else 1.0
    # Outcomes atribuïbles a la intensitat del programa (sublineal per sobre de l'esperat)
    dose_outcomes = min(max(dose, 0.25), 2.0)
    return {
        "baseline_sessions": baseline,
        "sessions_registered": registered,
        "sessions_effective": effective,
        "dose_ratio": round(dose, 3),
        "dose_outcomes_multiplier": round(dose_outcomes, 3),
        "sessions_per_participant": round(registered / n_p, 2),
    }


def _effective_sessions_for_value(
    sessions: int,
    n_participants: int,
    program_duration_months: int,
) -> float:
    """Aplica rendiments decreixents a la valoració de les sessions d'assistència.

    Justificació metodològica (SROI Network, Displacement/Attribution):
    - La intensitat esperada és 4 sessions/participant/mes.
    - Per sota d'aquest llindar: cada sessió té valor complet (el participant
      necessitava atenció i rep el programa en la seva intensitat prevista).
    - Per sobre del llindar: rendiments decreixents — ja rep atenció intensiva,
      la millora marginal per sessió addicional és progressivament menor.
    - Escala logarítmica: reflex de la corba d'aprenentatge real.

    Resultat: corba SROI que s'estabilitza naturalment als 3-5x,
    consistent amb els rangs documentats per F.Jaume Bofill i SERES.
    """
    baseline = float(n_participants * program_duration_months * 4)  # 4 sess/p/mes = esperada
    if baseline <= 0:
        return float(sessions)
    if sessions <= baseline:
        return float(sessions)
    extra = float(sessions) - baseline
    # log1p(extra/baseline): creix ràpid fins al doble, s'aplana progressivament
    return baseline + baseline * math.log1p(extra / baseline)


def _compute_sroi_breakdown(
    n_participants: int,
    avg_ipi_gain: float,
    program_cost_eur: float,
    program_duration_months: int,
    proxies: dict,
    corrections: dict,
    extra: dict | None = None,
) -> tuple[dict, float]:
    dw = corrections["deadweight"]
    attr = corrections["attribution"]
    drop = corrections["drop_off_year1"]

    extra = extra or {}
    sessions = int(extra.get("sessions", n_participants * program_duration_months * 4))
    avg_duration_h = float(extra.get("avg_duration_h", 1.5))
    pct_high_risk = float(extra.get("pct_high_risk", 0.30))
    pct_integration_gain = float(
        extra.get("pct_integration_gain", min(avg_ipi_gain / 100.0, 1.0))
    )

    dose = _session_dose_metrics(sessions, n_participants, program_duration_months)
    sessions_eff = dose["sessions_effective"]
    dose_m = dose["dose_outcomes_multiplier"]
    total_hours = sessions_eff * avg_duration_h

    n_high_risk_avoided = max(0, round(n_participants * pct_high_risk * (avg_ipi_gain / 100)))

    # Estalvi famílies: creix amb hores de suport registrades (reforç privat no pagat)
    family_raw = total_hours * proxies["private_tutoring_eur_per_hour"]

    # Resultats IPI (acadèmic, risc, integració): escalats per la dosi de sessions del període
    academic_raw = (
        n_participants
        * (avg_ipi_gain / 25.0)
        * proxies["academic_improvement_eur_per_participant_month"]
        * program_duration_months
        * dose_m
    )
    exclusion_raw = (
        n_high_risk_avoided
        * proxies["exclusion_risk_eur_per_participant_year"]
        * (program_duration_months / 12.0)
        * dose_m
    )
    integration_raw = (
        n_participants
        * pct_integration_gain
        * proxies["integration_eur_per_participant"]
        * dose_m
    )
    # Valor social del suport grupal (complementari a l'estalvi privat, no duplica tota l'hora)
    delivery_raw = total_hours * proxies["attendance_eur_per_hour"] * 0.35

    breakdown = {
        "family_tutoring_value": round(_apply_corrections(family_raw, dw, attr, drop), 2),
        "academic_ipi_value": round(_apply_corrections(academic_raw, dw, attr, drop), 2),
        "exclusion_risk_reduction": round(_apply_corrections(exclusion_raw, dw, attr, drop), 2),
        "integration_value": round(_apply_corrections(integration_raw, dw, attr, drop), 2),
        "program_delivery_value": round(_apply_corrections(delivery_raw, dw, attr, drop), 2),
        "_dose_metrics": dose,
    }
    total = sum(v for k, v in breakdown.items() if not k.startswith("_"))
    return breakdown, round(total, 2)


def _outcomes_from_breakdown(breakdown: dict[str, float]) -> tuple[dict[str, float], float, float, float]:
    """Beneficis mesurables per al ratio SROI (denominador = cost en efectiu).

    Inclou el valor del suport educatiu (sessions amb saturació logarítmica).
    El voluntariat no entra al denominador; el seu valor sí al numerador (SROI Network).
    """
    family = breakdown.get("family_tutoring_value") or breakdown.get("academic_improvement", 0)
    academic_ipi = breakdown.get("academic_ipi_value", 0)
    exclusion = breakdown.get("exclusion_risk_reduction", 0)
    integration = breakdown.get("integration_value", 0)
    delivery = breakdown.get("program_delivery_value") or breakdown.get("attendance_value", 0)
    family_total = round(family + academic_ipi, 2)
    outcomes = {
        "family_tutoring_savings": family_total,
        "public_services_saved": round(exclusion, 2),
        "integration_gains": round(integration, 2),
        "program_delivery_value": round(delivery, 2),
    }
    collective = round(exclusion + integration + delivery, 2)
    total = round(family + academic_ipi + collective, 2)
    return outcomes, round(family + academic_ipi, 2), round(collective, 2), total


def _sroi_ratio_outcomes(breakdown: dict[str, float], program_cost_eur: float) -> float:
    _, _, _, outcomes_eur = _outcomes_from_breakdown(breakdown)
    return round(outcomes_eur / program_cost_eur, 2) if program_cost_eur > 0 else 0.0


_OUTCOME_COMPONENT_META = [
    {
        "key": "family_tutoring_savings",
        "label": "Estalvi famílies",
        "short": "Reforç escolar",
        "hint": "Hores de sessió × €28/h (reforç privat evitat) + millora IPI atribuïble × dosi",
        "color": "academic",
    },
    {
        "key": "public_services_saved",
        "label": "Serveis públics",
        "short": "Menys exclusió",
        "hint": "Risc alt × millora IPI × dosi de sessions × €2.800/any",
        "color": "risk",
    },
    {
        "key": "integration_gains",
        "label": "Integració",
        "short": "Pertinença",
        "hint": "Millora integració × dosi de sessions × €1.200/part.",
        "color": "integration",
    },
    {
        "key": "program_delivery_value",
        "label": "Suport educatiu grupal",
        "short": "Sessions",
        "hint": "35% del valor hora social (€18/h) sobre hores efectives registrades",
        "color": "social",
    },
]


def build_sroi_formula_explanation(
    *,
    n_participants: int,
    avg_ipi_gain: float,
    program_cost_eur: float,
    program_duration_months: int,
    outcomes_breakdown: dict[str, float],
    outcomes_eur: float,
    sroi_ratio: float,
    extra: dict,
    corrections: dict,
    sensitivity: dict[str, float],
    monthly_fixed_cost_per_participant_eur: float = 45.0,
    marginal_cost_per_session_eur: float = 10.0,
) -> dict:
    """Metadades per visualitzar la fórmula SROI al dashboard."""
    sessions = int(extra.get("sessions", n_participants * program_duration_months * 4))
    avg_duration_h = float(extra.get("avg_duration_h", 1.5))
    pct_high_risk = float(extra.get("pct_high_risk", 0.30))
    pct_integration = extra.get("pct_integration_gain")
    if pct_integration is None:
        pct_integration = min(avg_ipi_gain / 100.0, 1.0)
    pct_integration = float(pct_integration)

    dose = _session_dose_metrics(sessions, n_participants, program_duration_months)
    sessions_effective = dose["sessions_effective"]
    baseline_sessions = int(dose["baseline_sessions"])
    fixed_cost = round(
        n_participants * program_duration_months * monthly_fixed_cost_per_participant_eur, 2
    )
    variable_cost = round(sessions_effective * marginal_cost_per_session_eur, 2)

    numerator_parts = []
    for meta in _OUTCOME_COMPONENT_META:
        eur = round(outcomes_breakdown.get(meta["key"], 0), 2)
        if eur <= 0:
            continue
        share = round((eur / outcomes_eur) * 100, 1) if outcomes_eur > 0 else 0
        numerator_parts.append({**meta, "eur": eur, "share_pct": share})

    dw = corrections["deadweight"]
    attr = corrections["attribution"]
    drop = corrections["drop_off_year1"]
    correction_multiplier = round((1 - dw) * attr * (1 - drop), 3)

    return {
        "headline": "Beneficis mesurats ÷ Cost en efectiu = SROI",
        "numerator_eur": round(outcomes_eur, 2),
        "denominator_eur": round(program_cost_eur, 2),
        "ratio": sroi_ratio,
        "numerator_components": numerator_parts,
        "denominator_components": [
            {
                "id": "fixed",
                "label": "Base fixa del programa",
                "eur": fixed_cost,
                "formula_text": (
                    f"{n_participants} participants × {program_duration_months} mesos "
                    f"× €{monthly_fixed_cost_per_participant_eur:.0f}/mes"
                ),
            },
            {
                "id": "variable",
                "label": "Cost variable (sessions efectives)",
                "eur": variable_cost,
                "formula_text": (
                    f"{int(sessions_effective)} sessions efectives × "
                    f"€{marginal_cost_per_session_eur:.0f}/sessió "
                    f"(registrades: {sessions})"
                ),
            },
        ],
        "inputs": {
            "n_participants": n_participants,
            "program_duration_months": program_duration_months,
            "n_sessions_registered": sessions,
            "n_sessions_baseline": baseline_sessions,
            "n_sessions_effective": round(sessions_effective, 1),
            "sessions_per_participant": dose["sessions_per_participant"],
            "dose_ratio": dose["dose_ratio"],
            "dose_outcomes_multiplier": dose["dose_outcomes_multiplier"],
            "sessions_above_baseline": max(0, sessions - baseline_sessions),
            "avg_duration_h": avg_duration_h,
            "avg_ipi_gain": round(avg_ipi_gain, 2),
            "pct_high_risk": round(pct_high_risk * 100, 1),
            "pct_integration_gain": round(pct_integration * 100, 1),
            "total_volunteer_hours": round(sessions_effective * avg_duration_h, 1),
        },
        "corrections": {
            "deadweight_pct": round(dw * 100, 0),
            "attribution_pct": round(attr * 100, 0),
            "drop_off_pct": round(drop * 100, 0),
            "combined_multiplier": correction_multiplier,
            "note": (
                "Cada component es multiplica per "
                f"(1−{round(dw*100):.0f}%) × {round(attr*100):.0f}% × (1−{round(drop*100):.0f}%) "
                f"≈ ×{correction_multiplier}"
            ),
        },
        "saturation_note": (
            f"Dosi del programa: {dose['dose_ratio']:.2f}× "
            f"(esperat {baseline_sessions} sessions = 4/infant/mes; "
            f"registrades {sessions}, efectives {int(sessions_effective)}). "
            f"Els beneficis IPI es multipliquen per {dose['dose_outcomes_multiplier']:.2f}; "
            f"l'estalvi familiar creix amb {round(sessions_effective * avg_duration_h, 0)} h de suport."
        ),
        "sensitivity": sensitivity,
        "methodology_reference": "SROI Network (2012); proxies INE 2023 / Fundació Jaume Bofill",
    }


def calculate_sroi(
    n_participants: int,
    avg_ipi_gain: float,
    program_cost_eur: float,
    program_duration_months: int,
    domain: str = "academic_social",
    proxy_config: dict | None = None,
    extra: dict | None = None,
) -> dict:
    proxies = {**_DEFAULT_PROXIES, **(proxy_config or {})}
    # Mateixes correccions que la calculadora ONG (context realista NGO educatiu)
    corrections = _NGO_CORRECTION_FACTORS.copy()

    breakdown, total_raw = _compute_sroi_breakdown(
        n_participants, avg_ipi_gain, program_cost_eur,
        program_duration_months, proxies, corrections, extra
    )
    outcomes_breakdown, _, _, outcomes_eur = _outcomes_from_breakdown(breakdown)
    sroi_ratio = _sroi_ratio_outcomes(breakdown, program_cost_eur)

    sensitivity: dict[str, float] = {}
    for scenario, corr in _SENSITIVITY.items():
        bd, _ = _compute_sroi_breakdown(
            n_participants, avg_ipi_gain, program_cost_eur,
            program_duration_months, proxies, corr, extra
        )
        sensitivity[scenario] = _sroi_ratio_outcomes(bd, program_cost_eur)

    extra = extra or {}
    monthly_fixed = float(extra.get("monthly_fixed_cost_per_participant_eur", 45.0))
    # Default €10/sessió (alineat amb program_sroi_metrics.MARGINAL_COST_PER_SESSION_EUR).
    marginal = float(extra.get("marginal_cost_per_session_eur", 10.0))

    formula_explanation = build_sroi_formula_explanation(
        n_participants=n_participants,
        avg_ipi_gain=avg_ipi_gain,
        program_cost_eur=program_cost_eur,
        program_duration_months=program_duration_months,
        outcomes_breakdown=outcomes_breakdown,
        outcomes_eur=outcomes_eur,
        sroi_ratio=sroi_ratio,
        extra=extra,
        corrections=corrections,
        sensitivity=sensitivity,
        monthly_fixed_cost_per_participant_eur=monthly_fixed,
        marginal_cost_per_session_eur=marginal,
    )

    return {
        "total_social_value_eur": outcomes_eur,
        "total_social_value_eur_raw": round(total_raw, 2),
        "total_investment_eur": round(program_cost_eur, 2),
        "sroi_ratio": sroi_ratio,
        "sroi_statement": (
            f"Per cada €1 invertit, el programa genera €{sroi_ratio:.2f} de valor social"
        ),
        "value_breakdown": {
            k: v for k, v in breakdown.items() if not str(k).startswith("_")
        },
        "outcomes_breakdown": outcomes_breakdown,
        "dose_metrics": breakdown.get("_dose_metrics") or {},
        "formula_explanation": formula_explanation,
        "sensitivity_analysis": sensitivity,
        "methodology_reference": "SROI Network Standard (2012), proxies INE 2023 / Fundació Jaume Bofill",
        "deadweight_factor": corrections["deadweight"],
        "attribution_factor": corrections["attribution"],
        "n_participants": n_participants,
        "avg_ipi_gain": round(avg_ipi_gain, 2),
        "program_duration_months": program_duration_months,
    }


def build_ngo_sroi_calculator(
    *,
    n_participants: int,
    avg_ipi_gain: float,
    program_duration_months: int,
    n_sessions: int,
    total_volunteer_hours: float,
    avg_duration_h: float,
    operating_cost_eur: float,
    volunteer_reference_value_eur: float,
    contribution_eur: float = 1000.0,
    volunteer_hours: float = 1.0,
    program_date_from: str | None = None,
    program_date_to: str | None = None,
    operating_cost_per_session_eur: float = 10.0,
    monthly_fixed_cost_per_participant_eur: float = 45.0,
    pct_high_risk: float = 0.30,
    pct_integration_gain: float | None = None,
) -> dict:
    """Calculadora ONG basada només en dades registrades.

    DENOMINADOR SROI = cost operatiu en efectiu (materials, coordinació, espai per sessió).
    El voluntariat (hores dels registres) es mostra com a recurs aportat, NO com a despesa en caixa.

    BENEFICIS (numerador, des de l'IPI):
    - Famílies: estalvi en reforç escolar privat
    - Sistema públic: menys pressió en serveis socials per risc d'exclusió
    - Integració: valor social de la millora en pertinença i autonomia
    """
    session_extra = build_sroi_extra(
        sessions=n_sessions,
        avg_duration_h=avg_duration_h,
        pct_high_risk=pct_high_risk,
        avg_ipi_gain=avg_ipi_gain,
        pct_integration_gain=pct_integration_gain,
    )

    raw_breakdown, _ = _compute_sroi_breakdown(
        n_participants,
        avg_ipi_gain,
        operating_cost_eur,
        program_duration_months,
        _DEFAULT_PROXIES.copy(),
        _NGO_CORRECTION_FACTORS.copy(),
        session_extra,
    )

    outcomes_breakdown, family_eur, collective_eur, outcomes_eur = _outcomes_from_breakdown(
        raw_breakdown
    )

    sroi_per_euro = _sroi_ratio_outcomes(raw_breakdown, operating_cost_eur)

    # Aportació en €: beneficis proporcionals al pes de la seva aportació sobre el cost operatiu
    scale_money = (
        contribution_eur / operating_cost_eur if operating_cost_eur > 0 else 0.0
    )
    money_family = round(family_eur * scale_money, 2)
    money_public = round(
        outcomes_breakdown.get("public_services_saved", 0) * scale_money, 2
    )
    money_integration = round(
        outcomes_breakdown.get("integration_gains", 0) * scale_money, 2
    )
    money_delivery = round(
        outcomes_breakdown.get("program_delivery_value", 0) * scale_money, 2
    )
    money_total = round(outcomes_eur * scale_money, 2)
    money_ratio = round(money_total / contribution_eur, 2) if contribution_eur > 0 else 0.0

    hours_unit = max(volunteer_hours, 0.01)
    hours_scale = hours_unit / total_volunteer_hours if total_volunteer_hours > 0 else 0.0
    vol_family = round(family_eur * hours_scale, 2)
    vol_public = round(outcomes_breakdown.get("public_services_saved", 0) * hours_scale, 2)
    vol_integration = round(outcomes_breakdown.get("integration_gains", 0) * hours_scale, 2)
    vol_delivery = round(
        outcomes_breakdown.get("program_delivery_value", 0) * hours_scale, 2
    )
    vol_total = round(outcomes_eur * hours_scale, 2)
    vol_per_h = round(outcomes_eur / total_volunteer_hours, 2) if total_volunteer_hours > 0 else 0.0

    period_label = ""
    if program_date_from and program_date_to:
        period_label = f" ({program_date_from} → {program_date_to})"

    return {
        "model_explanation": {
            "input_cash": (
                f"Cost operatiu en efectiu: "
                f"{n_participants} participants × {program_duration_months} mesos × "
                f"€{monthly_fixed_cost_per_participant_eur:.0f}/mes + "
                f"{n_sessions} sessions × €{operating_cost_per_session_eur:.0f} = "
                f"€{operating_cost_eur:,.0f}"
            ),
            "input_volunteers": (
                f"Voluntariat registrat: {total_volunteer_hours:,.0f} h "
                f"(referència €{volunteer_reference_value_eur:,.0f}; entra al numerador SROI, "
                f"no al denominador en efectiu)"
            ),
            "output_family": (
                "Estalvi per famílies: reforç escolar privat que no han de pagar gràcies al progrés de l'IPI"
            ),
            "output_public": (
                "Menys pressió en serveis socials públics: menys situacions d'exclusió greu"
            ),
            "output_integration": (
                "Millora en integració: llengua, pertinença i autonomia (valor social)"
            ),
            "output_delivery": (
                "Suport educatiu directe: hores de sessió registrades amb rendiments decreixents "
                "per sobre de 4 sessions/participant/mes"
            ),
            "ratio_note": (
                "€ retorn = beneficis mesurats (IPI + sessions saturades) ÷ cost operatiu en efectiu"
            ),
        },
        "methodology_reference": (
            "Proxies INE 2023 / Fundació Jaume Bofill; hores i sessions des de registres reals"
        ),
        "program": {
            "n_participants": n_participants,
            "n_sessions": n_sessions,
            "total_volunteer_hours": total_volunteer_hours,
            "avg_duration_h": avg_duration_h,
            "program_duration_months": program_duration_months,
            "program_date_from": program_date_from,
            "program_date_to": program_date_to,
            "avg_ipi_gain": round(avg_ipi_gain, 2),
            "operating_cost_eur": operating_cost_eur,
            "operating_cost_per_session_eur": operating_cost_per_session_eur,
            "volunteer_reference_value_eur": volunteer_reference_value_eur,
            "data_source": "registres_sessions",
            "imputed_volunteer_cost_eur": volunteer_reference_value_eur,
            "imputed_program_cost_eur": operating_cost_eur,
        },
        "impact": {
            "outcomes_value_eur": outcomes_eur,
            "family_benefit_eur": family_eur,
            "collective_benefit_eur": collective_eur,
            "public_services_benefit_eur": round(
                outcomes_breakdown.get("public_services_saved", 0), 2
            ),
            "integration_benefit_eur": round(
                outcomes_breakdown.get("integration_gains", 0), 2
            ),
            "program_delivery_benefit_eur": round(
                outcomes_breakdown.get("program_delivery_value", 0), 2
            ),
            "outcomes_breakdown": outcomes_breakdown,
            "value_breakdown_components": raw_breakdown,
            "sroi_per_euro_invested": sroi_per_euro,
            "sroi_statement": (
                f"Per cada €1 de cost operatiu del programa, es generen "
                f"€{sroi_per_euro:.2f} de beneficis mesurables"
                if operating_cost_eur > 0
                else "Encara no hi ha sessions registrades"
            ),
            "total_value_eur": outcomes_eur,
            "economic_value_eur": family_eur,
            "social_value_eur": collective_eur,
            "value_breakdown": outcomes_breakdown,
            "sroi_ratio_imputed": sroi_per_euro,
            "sroi_outcomes_only": sroi_per_euro,
        },
        "money_calculator": {
            "contribution_eur": round(contribution_eur, 2),
            "family_benefit_eur": money_family,
            "public_services_benefit_eur": money_public,
            "integration_benefit_eur": money_integration,
            "program_delivery_benefit_eur": money_delivery,
            "collective_benefit_eur": round(money_public + money_integration + money_delivery, 2),
            "total_benefit_eur": money_total,
            "value_per_euro": money_ratio,
            "share_of_program_pct": round(scale_money * 100, 2) if operating_cost_eur > 0 else 0.0,
            "statement": (
                f"Aportant €{contribution_eur:,.0f} en efectiu, mobilitzes €{money_total:,.0f} "
                f"de beneficis mesurables al programa"
                if contribution_eur > 0
                else ""
            ),
            "note": (
                f"El programa costa ~€{operating_cost_eur:,.0f} en efectiu{period_label} i "
                f"ha generat €{outcomes_eur:,.0f} de beneficis amb {n_sessions} sessions registrades."
            ),
            "social_value_eur": round(money_public + money_integration + money_delivery, 2),
            "economic_value_eur": money_family,
            "total_value_eur": money_total,
        },
        "volunteer_calculator": {
            "volunteer_hours": round(hours_unit, 2),
            "family_benefit_eur": vol_family,
            "public_services_benefit_eur": vol_public,
            "integration_benefit_eur": vol_integration,
            "program_delivery_benefit_eur": vol_delivery,
            "collective_benefit_eur": round(vol_public + vol_integration + vol_delivery, 2),
            "total_benefit_eur": vol_total,
            "outcomes_per_hour_eur": vol_per_h,
            "statement": (
                f"{hours_unit:g} h registrades al programa mobilitzen €{vol_total:,.0f} de beneficis"
                if total_volunteer_hours > 0
                else ""
            ),
            "note": (
                f"Dades reals: {total_volunteer_hours:,.0f} h totals "
                f"({n_sessions} sessions, mitjana {avg_duration_h} h/sessió)"
            ),
            "social_value_eur": round(vol_public + vol_integration + vol_delivery, 2),
            "economic_value_eur": vol_family,
            "total_value_eur": vol_total,
            "total_value_per_hour_eur": vol_per_h,
        },
        "sensitivity_analysis": {
            scenario: _sroi_ratio_outcomes(
                _compute_sroi_breakdown(
                    n_participants,
                    avg_ipi_gain,
                    operating_cost_eur,
                    program_duration_months,
                    _DEFAULT_PROXIES.copy(),
                    corr,
                    session_extra,
                )[0],
                operating_cost_eur,
            )
            for scenario, corr in _SENSITIVITY.items()
        },
    }
