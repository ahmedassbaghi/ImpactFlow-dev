# ImpactFlow Calculation Engine — Technical Reference

**Project:** ImpactFlow / Narinan (Barcelona)
**Scope:** IPI (Indicador de Progrés Individual) and SROI (Social Return on Investment) engines
**Standard:** SROI Network (2012)
**Proxy sources:** INE 2023, Fundació Jaume Bofill, SERES
**Last reviewed:** 2026-05-25

---

## Contents

1. [IPI Formula](#1-ipi-formula)
2. [SROI Calculation Pipeline](#2-sroi-calculation-pipeline)
3. [Cost Model](#3-cost-model)
4. [Social Value Proxies](#4-social-value-proxies)
5. [Correction Factors](#5-correction-factors)
6. [Saturation Model](#6-saturation-model)
7. [Key Constants Table](#7-key-constants-table)
8. [Data Flow: SessionObservation to SROI](#8-data-flow-sessionobservation-to-sroi)
9. [Monte Carlo Uncertainty Model](#9-monte-carlo-uncertainty-model)
10. [Audit Notes — Verified Correctness and Known Issues](#10-audit-notes)
11. [Known Limitations and Assumptions](#11-known-limitations-and-assumptions)

---

## 1. IPI Formula

**File:** `app/algorithms/ipi.py`

### What is the IPI?

The IPI (Indicador de Progrés Individual) is a composite 0–100 score measuring a child's progress across four developmental dimensions. It is the primary outcome metric fed into the SROI engine.

### Dimensions and Weights

| Dimension   | Weight | Indicators (scale 1–5 each)                                         |
|-------------|--------|---------------------------------------------------------------------|
| academic    | 0.35   | reading_level, math_level, comprehension_level                      |
| cognitive   | 0.25   | attention_level, memory_level, autonomy_level                       |
| social      | 0.25   | peer_interaction, group_work, emotional_regulation                  |
| integration | 0.15   | language_fluency, cultural_adaptation                               |

**Sum of weights = 1.00** (verified).

### Formula

For each dimension with available scores:

```
dimension_avg  = mean of non-null indicator scores (scale 1–5)
dimension_0100 = (dimension_avg - 1) / 4 * 100
```

This maps 1 → 0 and 5 → 100.

The weighted IPI:

```
IPI = sum( weight[d] * dimension_0100[d] for d in available_dimensions )
      / sum( weight[d] for d in available_dimensions )
```

Weights are renormalized when a dimension has no data (all indicators null), ensuring the IPI remains on the 0–100 scale with partial data.

### Output

`calculate_ipi()` returns:

```python
{
    "ipi": float | None,          # 0–100, rounded to 1 decimal; None if no data
    "dimensions": {               # per-dimension 0–100 scores (or None)
        "academic": float | None,
        "cognitive": float | None,
        "social": float | None,
        "integration": float | None,
    },
    "completeness": float         # 0.0–1.0, fraction of 11 indicators with data
}
```

### IPI Gain (used in SROI)

IPI gain = current IPI score − baseline IPI score (both on the 0–100 scale).

A typical improving participant shows a gain of 5–15 points over a 6-month program.

---

## 2. SROI Calculation Pipeline

**File:** `app/algorithms/sroi_engine.py`

### Definition

```
SROI ratio = total_social_value_eur / program_cost_eur
```

Where:
- **Numerator** = sum of all corrected benefit components (see Section 4)
- **Denominator** = operating cost in cash (see Section 3)

Volunteer time is counted in the numerator (as program delivery value), but NOT in the denominator, following SROI Network methodology for NGOs.

### Benefit Components (Numerator)

The engine computes four components from real session and IPI data:

#### 1. family_tutoring_value
Private tutoring savings for families — hours of program support that replace private paid tutoring.

```
family_raw = sessions_effective * avg_duration_h * €28/h
```

#### 2. academic_ipi_value
Value of measured academic improvement, scaled by IPI gain and session dose.

```
academic_raw = n_participants
             * (avg_ipi_gain / 25.0)
             * €65/participant/month
             * program_duration_months
             * dose_outcomes_multiplier
```

The divisor 25.0 normalizes IPI gain: a gain of 25 points (on a 100-point scale) is treated as one "unit" of academic improvement. This is a calibration choice anchored to the proxy value of €65/participant/month.

#### 3. exclusion_risk_reduction
Estimated public services savings from reduced social exclusion risk.

```
n_high_risk_avoided = round(n_participants * pct_high_risk * (avg_ipi_gain / 100))
exclusion_raw = n_high_risk_avoided
              * €2,800/participant/year
              * (program_duration_months / 12)
              * dose_outcomes_multiplier
```

#### 4. integration_value
Social value of improved integration (language, cultural belonging, autonomy).

```
integration_raw = n_participants
                * pct_integration_gain
                * €1,200/participant
                * dose_outcomes_multiplier
```

#### 5. program_delivery_value
Value of group educational support (35% factor avoids double-counting with family tutoring).

```
delivery_raw = sessions_effective * avg_duration_h * €18/h * 0.35
```

All five raw components are then passed through the correction multiplier (see Section 5).

### Total Social Value

```
total_social_value = sum of all five corrected components
SROI = total_social_value / program_cost_eur
```

**Important:** `academic_ipi_value` IS included in the total (not just displayed). This was verified in `_outcomes_from_breakdown()`:

```python
family_total = family + academic_ipi       # both go to numerator
total = family + academic_ipi + collective  # collective = exclusion + integration + delivery
```

---

## 3. Cost Model

**File:** `app/services/program_sroi_metrics.py`

### Formula

```
program_cost = fixed_cost + variable_cost
fixed_cost   = n_participants * program_months * €45/participant/month
variable_cost = n_sessions_effective * €5/session
```

### Symmetry with Numerator

The variable cost uses `n_sessions_effective` (after logarithmic saturation), the same value used in the numerator for `family_tutoring_value` and `program_delivery_value`. This is intentional and correct: it prevents the cost denominator from growing linearly while benefits flatten logarithmically, which would artificially inflate SROI at very high session counts.

### Active Participant Count

`n_participants` in cost calculations = participants with actual sessions in the period, not all historically enrolled participants. This is enforced by a `COUNT(DISTINCT participant_id)` query joining `SessionObservation` to sessions within the period range.

### Cost Constants

| Constant                          | Value    | Purpose                                                                             |
|-----------------------------------|----------|-------------------------------------------------------------------------------------|
| MONTHLY_FIXED_COST_PER_PARTICIPANT_EUR | €45/month | Coordination, space, insurance, materials, family follow-up                 |
| MARGINAL_COST_PER_SESSION_EUR     | €5/session | Photocopiables (~€1.5), coordination management (~€2), logistics (~€1.5)      |
| OPERATING_COST_PER_SESSION_EUR    | €15/session | Legacy constant (used only in model_explanation text for older /sroi endpoint) |

**Warning — legacy constant:** `OPERATING_COST_PER_SESSION_EUR = 15.0` appears in `program_sroi_metrics.py` and is referenced in the text output of `build_ngo_sroi_calculator()` in `sroi_engine.py`. The actual cost computation uses `MARGINAL_COST_PER_SESSION_EUR = 5.0`. The €15 figure only appears in a human-readable explanation string, not in any calculation. This is a documentation inconsistency but does not affect computed results.

---

## 4. Social Value Proxies

All proxies are calibrated for the Catalan social education context.

| Proxy                                     | Value         | Source / Justification                                               |
|-------------------------------------------|---------------|----------------------------------------------------------------------|
| academic_improvement_eur_per_participant_month | €65/month | INE 2023, Fundació Jaume Bofill: average private tutoring market rate per child/month in Catalonia |
| exclusion_risk_eur_per_participant_year   | €2,800/year   | Estimated annual public service cost per child at high social exclusion risk (social services, intervention programs) |
| integration_eur_per_participant           | €1,200/person | Social value of successful integration: language access, cultural belonging, autonomy gains |
| private_tutoring_eur_per_hour             | €28/hour      | Market rate for private tutoring in Barcelona (INE 2023)            |
| attendance_eur_per_hour                   | €18/hour      | Reference value for volunteer educator time (SERES benchmark)       |

Proxies can be overridden per call via `proxy_config` dict in `calculate_sroi()`. Default values are defined in `_DEFAULT_PROXIES` in `sroi_engine.py`.

---

## 5. Correction Factors

SROI Network standard corrections for attribution, deadweight, and drop-off.

### NGO Corrections (used in all production calculations)

```python
_NGO_CORRECTION_FACTORS = {
    "deadweight":      0.15,   # 15% would have happened without the program
    "attribution":     0.90,   # 90% of outcomes attributable to this program
    "drop_off_year1":  0.10,   # 10% decay of impact after year 1
}
```

### Combined Multiplier

```
multiplier = (1 - deadweight) * attribution * (1 - drop_off)
           = (1 - 0.15) * 0.90 * (1 - 0.10)
           = 0.85 * 0.90 * 0.90
           = 0.6885  ≈ 0.689
```

Each raw benefit component is multiplied by this factor before summing.

### Sensitivity Scenarios

Three scenarios are computed automatically for every SROI call:

| Scenario    | Deadweight | Attribution | Drop-off |
|-------------|------------|-------------|----------|
| conservative | 35%       | 75%         | 25%      |
| central      | 25%       | 85%         | 15%      |
| optimistic   | 15%       | 95%         | 5%       |

Note: The "central" scenario uses `_DEFAULT_CORRECTION_FACTORS`, while the NGO mode (production) uses `_NGO_CORRECTION_FACTORS`. The NGO central estimate is slightly more favorable than the generic "central" sensitivity scenario, which is methodologically appropriate for a volunteer-based NGO.

---

## 6. Saturation Model

**Function:** `_effective_sessions_for_value()` in `sroi_engine.py`

### Rationale

In educational programs, the first sessions have the highest marginal impact. As session intensity increases beyond a normal level, additional sessions yield progressively smaller marginal improvements (diminishing returns / learning curve effect).

### Baseline

```
baseline_sessions = n_participants * program_duration_months * 4
```

4 sessions per participant per month is defined as the expected program intensity.

### Saturation Formula

```
if sessions <= baseline:
    effective_sessions = sessions               # full value, linear

if sessions > baseline:
    extra = sessions - baseline
    effective_sessions = baseline + baseline * log1p(extra / baseline)
```

`log1p(x) = ln(1 + x)` grows rapidly at first and flattens progressively.

### Example

For 20 participants, 6 months:
- baseline = 20 * 6 * 4 = 480 sessions
- At 480 sessions: effective = 480 (ratio = 1.0)
- At 960 sessions (2×): effective ≈ 480 + 480 * log1p(1) ≈ 480 + 333 = 813 (ratio ≈ 1.69)
- At 1920 sessions (4×): effective ≈ 480 + 480 * log1p(3) ≈ 480 + 664 = 1144 (ratio ≈ 2.38)

### Application to Both Numerator and Denominator

This saturation is applied consistently:
- **Numerator:** `sessions_effective` drives `total_hours` used in `family_tutoring_value` and `program_delivery_value`. The `dose_outcomes_multiplier` (capped at [0.25, 2.0]) scales `academic_ipi_value`, `exclusion_risk_reduction`, and `integration_value`.
- **Denominator:** `_program_operating_cost()` calls `_effective_sessions_for_value()` with the same parameters. Variable cost = `n_sessions_effective * €5`.

This symmetry stabilizes SROI in the 3–5× range for typical program intensities, consistent with the Fundació Jaume Bofill documented range for educational NGOs.

### dose_outcomes_multiplier

```
dose = sessions_effective / baseline_sessions
dose_outcomes_multiplier = clip(dose, min=0.25, max=2.0)
```

A program at baseline intensity (dose = 1.0) gets a multiplier of 1.0. A low-activity program is penalized (minimum 0.25×); a high-intensity program is rewarded but capped at 2.0× to prevent runaway estimates.

---

## 7. Key Constants Table

| Constant                          | Value    | File                        | Affects              |
|-----------------------------------|----------|-----------------------------|----------------------|
| MONTHLY_FIXED_COST_PER_PARTICIPANT_EUR | €45/month | program_sroi_metrics.py  | Denominator (cost)   |
| MARGINAL_COST_PER_SESSION_EUR     | €5/session | program_sroi_metrics.py   | Denominator (cost)   |
| OPERATING_COST_PER_SESSION_EUR    | €15/session | program_sroi_metrics.py  | Text output only (legacy) |
| DEFAULT_SESSION_MINUTES           | 90 min   | program_sroi_metrics.py     | avg_duration_h fallback |
| REFERENCE_VOLUNTEER_HOURLY_EUR    | €18/hour | program_sroi_metrics.py     | Volunteer reference value (informational, not in denominator) |
| _EXPECTED_SESSIONS_PER_PARTICIPANT_MONTH | 4   | sroi_engine.py         | Saturation baseline  |
| private_tutoring_eur_per_hour     | €28/hour | sroi_engine.py              | family_tutoring_value |
| attendance_eur_per_hour           | €18/hour | sroi_engine.py              | program_delivery_value |
| academic_improvement_eur_per_participant_month | €65/month | sroi_engine.py | academic_ipi_value |
| exclusion_risk_eur_per_participant_year | €2,800/year | sroi_engine.py    | exclusion_risk_reduction |
| integration_eur_per_participant   | €1,200   | sroi_engine.py              | integration_value    |
| IPI weights: academic / cognitive / social / integration | 0.35 / 0.25 / 0.25 / 0.15 | ipi.py | IPI score |

---

## 8. Data Flow: SessionObservation to SROI

```
SessionObservation
  ├── academic_score   (1–5)
  ├── cognitive_score  (1–5)
  ├── social_score     (1–5)
  └── integration_score (1–5)
         |
         | _avg_ipi_gain_from_session_obs()
         |   → normalize each score: (score - 1) / 4 * 100
         |   → weighted sum with IPI weights
         |   → current_ipi = weighted average over available dimensions
         |   → ipi_gain = current_ipi - baseline_ipi (from BaselineAssessment)
         v
  avg_ipi_gain (mean over all participants with gains)
         |
         v
  _compute_sroi_breakdown()
  ├── sessions        (count of Session records in period)
  ├── avg_duration_h  (from Session.duration_minutes / 60)
  ├── pct_high_risk   (from PeriodicAssessment.risk_level == 'high')
  ├── pct_integration_gain (from PeriodicAssessment integration scores vs baseline)
  │
  ├── _effective_sessions_for_value()  → sessions_effective
  │       └── applies log1p saturation above 4 sess/participant/month
  │
  ├── family_tutoring_value   = sessions_eff * avg_h * €28 * correction
  ├── academic_ipi_value      = n_p * (gain/25) * €65 * months * dose * correction
  ├── exclusion_risk_reduction = n_high_risk * €2800 * (months/12) * dose * correction
  ├── integration_value       = n_p * pct_integ * €1200 * dose * correction
  └── program_delivery_value  = sessions_eff * avg_h * €18 * 0.35 * correction
         |
         v
  total_social_value_eur = sum of all 5 components
         |
  program_cost_eur = n_p * months * €45 + sessions_eff * €5
         |
         v
  SROI ratio = total_social_value_eur / program_cost_eur
```

### Fallback Logic for IPI Gain

The service layer (`program_sroi_metrics.py`) applies a two-tier data source strategy:

1. **Primary:** `PeriodicAssessment.ipi_score` for participants with formal assessments in the period.
2. **Fallback:** `SessionObservation` scores (inline IPI computation) — used when fewer than 30% of participants have periodic assessments. The fallback is preferred if it covers more participants.

This is critical for simulated data scenarios (e.g., data generated by the simulation module) where `SessionObservation` records exist but `PeriodicAssessment` records may be absent.

---

## 9. Monte Carlo Uncertainty Model

**File:** `app/algorithms/monte_carlo_sroi.py`

The Monte Carlo engine quantifies uncertainty in the SROI ratio by running 5,000 iterations (default) with stochastically sampled inputs.

### Sampled Variables

| Variable             | Distribution                                                |
|----------------------|-------------------------------------------------------------|
| avg_ipi_gain         | Gaussian(mean, SE = sd / sqrt(n_participants)), clipped 0–100 |
| proxy values         | Triangular(0.85×, mode=1.0×, 1.15×) for each proxy        |
| deadweight           | Beta(mode=0.15, concentration=25)                          |
| attribution          | Beta(mode=0.90, concentration=25)                          |
| drop_off_year1       | Triangular(0.02, mode=0.10, 0.18)                          |
| sessions             | Triangular(0.85×, mode=1.0×, 1.15×) of central sessions   |
| pct_integration_gain | Triangular(0.8×, mode=1.0×, 1.2×)                         |
| pct_high_risk        | Triangular(0.85×, mode=1.0×, 1.15×)                       |

Cost is recalculated per iteration using `_program_operating_cost()` with the sampled session count, ensuring cost and benefit uncertainty move together.

### Output

- `mean`, `median`, `p05`, `p25`, `p75`, `p95`: distribution statistics
- `prob_above_1`, `prob_above_2`: P(SROI > 1×) and P(SROI > 2×)
- `distribution_bins`: 30-bin histogram from p01 to p99
- `se_mean`: standard deviation of the SROI sample distribution

---

## 10. Audit Notes

### Verified Correct

1. **IPI weights sum to 1.0** — 0.35 + 0.25 + 0.25 + 0.15 = 1.00. Confirmed.

2. **IPI normalization formula** — `(score - 1) / 4 * 100` correctly maps 1→0 and 5→100. Used identically in `ipi.py` and in the inline IPI computation in `program_sroi_metrics.py` (`_avg_ipi_gain_from_session_obs`).

3. **`calculate_ipi()` returns dict with "ipi" key** — confirmed on line 97 of `ipi.py`.

4. **`DimensionScores` fields match usage** — the `DimensionScores` dataclass defines 11 indicator fields. All 11 are consumed in `calculate_ipi()`. The `_avg_ipi_gain_from_session_obs()` function in `program_sroi_metrics.py` uses a simplified 4-score composite (one per dimension) from `SessionObservation` — this is a separate code path that does not use `DimensionScores`.

5. **academic_ipi_value IS included in total** — `_outcomes_from_breakdown()` includes it in `family_total = family + academic_ipi`, and this total is included in the SROI numerator.

6. **Saturation applied symmetrically** — `_effective_sessions_for_value()` is called in both `_session_dose_metrics()` (numerator) and `_program_operating_cost()` (denominator). Both use the same function from the same module.

7. **n_participants = active in period** — `period_operating_cost_eur()` and `load_program_period_metrics()` both count `COUNT(DISTINCT participant_id)` from `SessionObservation` joined to sessions within the period.

8. **NGO correction multiplier** — (1 − 0.15) × 0.90 × (1 − 0.10) = 0.85 × 0.90 × 0.90 = 0.6885. This is applied per component in `_apply_corrections()`.

9. **SROI stabilization range** — for a typical program (20 participants, 6 months, 20 sessions/participant = 2,400 sessions total, avg_ipi_gain ≈ 10 points): baseline = 480; effective ≈ 480 + 480 * log1p(4) ≈ 1,254; cost ≈ 20*6*45 + 1,254*5 = 5,400 + 6,270 = €11,670. Benefits ≈ in the range €35,000–45,000 → SROI ≈ 3.0–3.9×. This is within the documented 3–5× range.

### Issues and Inconsistencies Found

#### Issue 1: Legacy constant OPERATING_COST_PER_SESSION_EUR (€15) vs actual MARGINAL_COST_PER_SESSION_EUR (€5)

`OPERATING_COST_PER_SESSION_EUR = 15.0` is defined and exported from `program_sroi_metrics.py`. It is referenced in the `model_explanation.input_cash` text string in `build_ngo_sroi_calculator()` in `sroi_engine.py`. The actual cost formula uses `MARGINAL_COST_PER_SESSION_EUR = 5.0`.

**Impact:** No numerical calculation is affected. The human-readable explanation text in the NGO calculator output will display €15/session for total cost (e.g., "480 sessions × €15 = ...") while the actual cost model uses €5/session. This could mislead a non-developer reading the breakdown.

**Recommendation:** Update the `model_explanation.input_cash` format string to use `MARGINAL_COST_PER_SESSION_EUR` (€5), or clearly label €15 as an older reference rate.

#### Issue 2: `build_sroi_formula_explanation()` uses `marginal_cost_per_session_eur=15.0` as default

In `sroi_engine.py`, `build_sroi_formula_explanation()` has a default parameter `marginal_cost_per_session_eur: float = 15.0`. When called from `calculate_sroi()`, the value is read from `extra.get("marginal_cost_per_session_eur", 15.0)` — also defaulting to 15.0. 

The actual cost model in `_program_operating_cost()` uses €5. This means the formula explanation shown to users will report a variable cost of `sessions_eff × €15` while the SROI was computed using `sessions_eff × €5`, making the denominator explanation appear 3× larger than reality.

**Impact:** The SROI ratio itself is correct (denominator uses €5 via `_program_operating_cost()`). The formula explanation text is misleading for the variable cost component.

**Recommendation:** Pass `marginal_cost_per_session_eur=MARGINAL_COST_PER_SESSION_EUR` (€5) through the call chain from `load_program_sroi_metrics()` / `load_program_period_metrics()` to `calculate_sroi()` / `build_sroi_formula_explanation()`.

#### Issue 3: `load_program_sroi_metrics()` uses all baseline participants, not period-active ones

In `load_program_sroi_metrics()` (the non-period variant), `n_participants` is set as:
```python
n_participants = max(n_with_baseline, len(per_participant_gains), 1)
```

This uses `n_with_baseline` — the total number of participants who have a `BaselineAssessment`, regardless of whether they attended sessions in any particular period. This is appropriate for a full-program lifetime view, but it may overstate n_participants for programs that have grown over time, since early cohorts will have baselines but may no longer be active.

In contrast, `load_program_period_metrics()` correctly uses `n_active_in_period` (from session observations). This asymmetry is documented in the code with a comment, but users of the two functions may receive different n_participants for logically similar queries.

**Impact:** For stable programs, this has minimal effect. For programs with historical dropout, it may inflate the cost denominator (more participants → more fixed cost) while IPI gain is only computed from participants with assessments.

#### Issue 4: `pct_integration_gain` from PeriodicAssessment compares raw scores (1–5 scale), not normalized IPI

In `_risk_and_integration_metrics()`, integration gain is assessed by comparing `language_fluency` and `cultural_adaptation` raw scores (1–5) from `PeriodicAssessment` against `BaselineAssessment`. The comparison is direct: `recent_integ > bl_integ`. This is correct for sign-detection (did score increase?) but uses raw means, not normalized 0–100 values.

**Impact:** `pct_integration_gain` is a fraction (0.0–1.0), not an IPI-scale value. It is used correctly as a fraction in `integration_raw = n_participants * pct_integration_gain * €1,200`. No error, but the interpretation is: "fraction of participants who showed any improvement in integration scores," not "average magnitude of integration improvement."

---

## 11. Known Limitations and Assumptions

### Methodological

1. **Proxy values are point estimates.** The €65/month academic improvement, €2,800/year exclusion risk, and €1,200/person integration values are calibrated for the Catalan context circa 2023. They should be reviewed annually and updated to match evolving market rates (tutoring costs) and policy costs (social services).

2. **IPI gain divisor of 25.** The `academic_raw` formula divides `avg_ipi_gain` by 25.0 to normalize it to the proxy unit. This implies a 25-point IPI gain is the reference unit of "one month of academic improvement worth €65." There is no published calibration for this specific ratio — it is a modeling choice that should be validated against longitudinal outcome data.

3. **35% factor on delivery value.** `program_delivery_value` uses `* 0.35` to avoid double-counting with `family_tutoring_value`. This is a reasonable deduplication heuristic but is not formally calibrated.

4. **Drop-off applies to year 1 only.** The drop-off correction models impact decay but only for the first year. For multi-year program evaluations, additional annual drop-off factors would be needed.

5. **Attribution of 90% is high.** For community programs where participants may receive multiple interventions simultaneously (school support, social services, family support), 90% attribution is optimistic. The sensitivity analysis at 75% attribution provides a more conservative benchmark.

### Technical

6. **IPI from SessionObservation is a 4-score composite.** The fallback IPI computation in `_avg_ipi_gain_from_session_obs()` uses one aggregate score per dimension (e.g., `academic_score`), while the full `calculate_ipi()` function in `ipi.py` uses 11 individual indicator scores. The aggregate scores on `SessionObservation` are presumably pre-computed averages of their respective indicators. If they are not computed consistently, IPI values from the two paths may diverge.

7. **`program_months` from date range uses 30.44-day month.** This is correct for average calendar months but introduces rounding artifacts for short periods (e.g., a 31-day period rounds to 1 month, same as a 15-day period).

8. **n_sessions = 0 edge case defaults to avg_duration_h = 1.5.** If a program has no sessions, all time-based benefits (family_tutoring_value, program_delivery_value) are zero because `sessions_effective = 0`. The fallback only affects diagnostic display, not the SROI ratio.

9. **No multi-currency support.** All monetary values are in EUR. The system does not support multi-currency programs.

10. **Monte Carlo uses a fixed seed (42) by default.** Results are deterministic unless the seed is changed. For production uncertainty reporting, consider accepting a random seed or documenting that results are reproducible by design.
