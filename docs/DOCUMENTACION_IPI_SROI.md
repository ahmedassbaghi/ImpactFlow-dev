# ImpactFlow — Documentació tècnica: IPI i SROI

Referència actualitzada del motor de càlcul (backend). Codi font principal:

| Àrea | Fitxer |
|------|--------|
| IPI base | `apps/backend/app/algorithms/ipi.py` |
| Corba d'aprenentatge | `apps/backend/app/algorithms/learning_curve.py` |
| Sessió → IPI | `apps/backend/app/utils/participant_metrics.py` |
| Risc | `apps/backend/app/algorithms/risk_engine.py` |
| SROI | `apps/backend/app/algorithms/sroi_engine.py` |
| Mètriques programa | `apps/backend/app/services/program_sroi_metrics.py` |
| API sessió | `apps/backend/app/main.py` → `POST /api/v1/sessions` |
| UI registre | `apps/frontend/src/components/sessions/QuickSessionLogger.tsx` |

---

## 1. Índex de Progrés Integral (IPI)

### 1.1 Escala i dimensions

- Cada indicador es puntua **1–5** (estrelles a la UI).
- **Quatre dimensions** amb pesos per defecte (`DEFAULT_WEIGHTS` a `ipi.py`):

| Dimensió | Pes | Indicadors (camps BD) |
|----------|-----|------------------------|
| Acadèmica | 35% | `reading_level`, `math_level`, `comprehension_level` |
| Cognitiva | 25% | `attention_level`, `memory_level`, `autonomy_level` |
| Social | 25% | `peer_interaction`, `group_work`, `emotional_regulation` |
| Integració | 15% | `language_fluency`, `cultural_adaptation` |

### 1.2 Fórmula base (`calculate_ipi`)

Per a cada dimensió amb dades:

1. Mitjana dels indicadors no nuls → valor **1–5**.
2. Normalització a **0–100**: `(valor − 1) / 4 × 100`.
3. **IPI** = mitjana ponderada de les dimensions disponibles. Si falta una dimensió, es **renormalitzen** els pesos entre les que queden.
4. **`completeness`** = fracció d'indicadors (11) amb valor informat.

```text
IPI = Σ (pes_dim_normalitzat × score_dim_0_100)
```

### 1.3 Tipus d'avaluació

| Tipus | Taula / etiqueta | Ús |
|-------|------------------|-----|
| **Baseline** | `BaselineAssessment` | Entrada al programa → `ipi_baseline` |
| **Trimestral / seguiment** | `PeriodicAssessment`, `period_label` amb «avaluacio» o «seguiment» | Avaluació formal |
| **Sessió (auto)** | `PeriodicAssessment`, `period_label = session_auto` | Derivada del registre de sessió |
| **Simulació** | `period_label = simulation` | Dades de demo |

**Selecció canònica:** si hi ha diverses files el **mateix dia**, es conserva una sola (`pick_best_periodic` / `resolve_periodic_timeline`):

1. Avaluació trimestral / seguiment (màxima prioritat)
2. Simulació o etiqueta amb data variada (indicadors no plans)
3. Altres etiquetes
4. `session_auto` amb punts plans (mínima prioritat — sovint incomplets)

Això evita que un IPI baix de `session_auto` (2,2,2,2) amagui una avaluació rica del mateix dia.

---

## 2. Registre de sessió → IPI

Flux: `POST /api/v1/sessions` → per cada observació amb senyal → `upsert_periodic_from_observation`.

### 2.1 Camps de la sessió

| Camp | Model | Efecte |
|------|--------|--------|
| `session_date`, `session_time` | `Session` | Data/hora de la sessió |
| `duration_minutes` | `Session` | SROI (hores, cost) |
| `program_id`, `session_type` | `Session` | Context |
| `notes` | `Session` | NLP → resum i sentiment (no altera IPI directament) |

### 2.2 Observació per participant

| Camp | Efecte en IPI |
|------|----------------|
| `academic_score` … `integration_score` (1–5) | Mapeig directe a les 4 dimensions |
| `goal_progress[]` (GAS −2…+2 per microobjectiu) | Inferència per dimensió si falta score explícit |
| `verbal_participation` (0–3) | Proxy social si no hi ha social ni GAS social |
| `time_on_task_pct` (0–100) | Proxy cognitiu |
| `attendance_status` | `absent_*` → **no es crea** `PeriodicAssessment` |
| `volunteer_progress_sense` | Multiplicador suau (vegeu §2.6) |
| `arrival_mood` / `departure_mood` / `mood_indicator` | Motor de risc |
| `flag_alert` | Puja lleugerament el risc |

**Mínim per generar IPI de sessió:** almenys **2 dimensions** amb senyal, **o** només `volunteer_progress_sense` si ja existeix IPI anterior.

### 2.3 Mapeig observació → `DimensionScores`

En sessió, cada dimensió explícita omple **tots** els indicadors d'aquesta dimensió amb el mateix enter (p. ex. `academic_score=4` → reading, math, comprehension = 4).

### 2.4 Pipeline de càlcul (ordre fix)

```text
1. merged[dim] = explícit OR inferit (GAS / verbal / time_on_task)
2. raw_ipi = calculate_ipi(DimensionScores(merged))
3. apply_progressive_session_ipi(raw, merged, prev_pa, baseline, session_index)
4. apply_volunteer_sense_bonus (×0.8 | ×1.0 | ×1.2)
5. Persistir PeriodicAssessment (upsert mateix participant + program + data)
6. calculate_risk_score(...) → risk_score, risk_level
```

#### Pas 3 — Guia per dimensions (`apply_progressive_session_ipi`)

- Compara nivells 1–5 actuals amb l'avaluació canònica anterior.
- Calcula un **desplaçament ponderat** per dimensió → `suggested_delta` (cap **±6** punts IPI per sessió).
- Barreja `raw_ipi` amb `prev_ipi + suggested_delta` (pesos 55/45 o 40/60 segons si les 4 dimensions són explícites).

#### Pas 3b — Corba d'aprenentatge (`apply_learning_curve_ipi`)

Model amb **rendiments decreixents** (no límit lineal únic fins a 100):

- **Asímptota personal** `M = min(88, baseline + 38)`.
- **Trajectòria ideal** a la sessió `n`:
  ```text
  P(n) = M − (M − baseline) × e^(−0.09 × n)
  ```
  (`n` = nombre d'avaluacions canòniques anteriors + 1).

- Cada sessió:
  - `delta = 0.45×(P(n) − prev) + 0.22×(observed − prev)`
  - Si `delta > 0`: saturació prop de `M` — com a màxim **12%** del «headroom» `(M − prev)` per sessió; factor `(1 − e^(−headroom/22))`.
  - Si `delta < 0`: màxim **−6** punts.
  - Resultat clampat a `[baseline − 15, M]`.

**Conseqüència:** amb observacions «perfectes» repetides, **10 sessions** des de baseline ~40 acaben ~**65–75**, no 100.

#### Pas 4 — Sensació del voluntari (`volunteer_progress_sense`)

| Valor | Multiplicador |
|-------|----------------|
| `progressed` | ×1.2 |
| `similar` | ×1.0 |
| `step_back` | ×0.8 |

S'aplica **després** de la corba, i torna a respectar cap **±6** respecte l'IPI anterior i el sostre `M`.

**UI (mode voluntari):** obligatori si assistència `present` o `late`. No es mostren puntuacions de la sessió anterior.

### 2.5 Microobjectius individuals (GAS)

- `goal_progress`: mitjana del progrés GAS (−2…+2) per dimensió del microobjectiu.
- Conversió: `score_1_5 = clamp(round(3 + mean_GAS), 1, 5)`.
- **Límit de contribució:** els microobjectius només omplen dimensions sense score explícit; el pipeline complet (corba + caps) evita salts bruscos només per GAS.

### 2.6 Risc (`risk_engine`)

Entrades des de registres reals (30 dies):

- Taxes d'assistència actual i anterior
- `ipi_delta` vs baseline
- Dies des de l'última sessió present
- Mood (departure > arrival > legacy)
- `flag_alert` → +10% del gap fins a risc 1.0

---

## 3. Evolució i dashboards

- **Guany vs entrada:** `current_ipi − baseline_ipi` (darrera avaluació canònica).
- **Dashboard professional:** només alumnes **assignats** i **inscrits** al programa seleccionat.
- **Tendència:** una fila canònica per participant i data; mitjana del grup per data.

---

## 4. SROI (Social Return on Investment)

Metodologia: **SROI Network Standard (2012)**. Proxies: INE 2023, Fundació Jaume Bofill, SERES (context Catalunya).

### 4.1 Fórmula principal

```text
SROI = Beneficis mesurats (€) ÷ Cost operatiu en efectiu (€)
```

- **El voluntariat no va al denominador** (hores són recurs aportat; valor informatiu €18/h).
- **Denominador** = cost en caixa del programa (coordinació, espai, materials per sessió).

### 4.2 Entrades des de registres (`load_program_period_metrics`)

| Paràmetre | Font |
|-----------|------|
| `n_participants` | Participants amb baseline al programa |
| `n_sessions` | Compte de `Session` al període |
| `avg_duration_h` | Mitjana `duration_minutes` / 60 |
| `program_duration_months` | Dies del període ÷ 30.44 |
| `avg_ipi_gain` | Mitjana `(ipi_actual − baseline)` per participant |
| `pct_high_risk` | % amb `risk_level = high` a la darrera periódica del període |
| `pct_integration_gain` | % amb millora integració (llengua + cultura) vs baseline |
| `operating_cost_eur` | Model fix + variable (§4.3) |

Si hi ha poques `PeriodicAssessment` (<30% participants), `avg_ipi_gain` es recalcula des de la **darrera observació de sessió** (4 scores).

### 4.3 Cost operatiu (denominador)

```text
sessions_efectives = saturació_log(sessions_registrades)   # vegeu §4.4
cost_fix = n_participants × mesos × 45 €/participant/mes
cost_var = sessions_efectives × 15 €/sessió
program_cost_eur = cost_fix + cost_var
```

Constants: `MONTHLY_FIXED_COST_PER_PARTICIPANT_EUR = 45`, `MARGINAL_COST_PER_SESSION_EUR = 15`.

### 4.4 Dosi de sessions (saturació)

Intensitat esperada: **4 sessions / participant / mes**.

```text
baseline_sessions = n_participants × mesos × 4

Si sessions_registrades ≤ baseline:
    sessions_efectives = sessions_registrades
Si no:
    extra = sessions_registrades − baseline
    sessions_efectives = baseline + baseline × ln(1 + extra/baseline)
```

`dose_ratio = sessions_efectives / baseline` (clamp outcomes 0.25–2.0).

Això reflecteix **rendiments decreixents**: moltes sessions extra aporten menys valor marginal (alineat amb la corba d'IPI).

### 4.5 Components del numerador (abans de correccions)

Proxies per defecte (`_DEFAULT_PROXIES`):

| Clau | Valor | Ús |
|------|-------|-----|
| `private_tutoring_eur_per_hour` | 28 €/h | Estalvi famílies |
| `academic_improvement_eur_per_participant_month` | 65 € | Component IPI acadèmic |
| `exclusion_risk_eur_per_participant_year` | 2800 € | Exclusió evitada |
| `integration_eur_per_participant` | 1200 € | Integració |
| `attendance_eur_per_hour` | 18 €/h | Suport grupal (35% al numerador) |

Càlculs bruts (`_compute_sroi_breakdown`):

```text
total_hours = sessions_efectives × avg_duration_h
n_high_risk_avoided = round(n_participants × pct_high_risk × (avg_ipi_gain / 100))

family_raw = total_hours × 28

academic_raw = n_participants × (avg_ipi_gain / 25) × 65 × mesos × dose_outcomes_multiplier

exclusion_raw = n_high_risk_avoided × 2800 × (mesos / 12) × dose_outcomes_multiplier

integration_raw = n_participants × pct_integration_gain × 1200 × dose_outcomes_multiplier

delivery_raw = total_hours × 18 × 0.35
```

### 4.6 Correccions SROI (ONG)

Cada component brut es multiplica per:

```text
valor_ajustat = brut × (1 − deadweight) × attribution × (1 − drop_off)
```

Valors NGO (`_NGO_CORRECTION_FACTORS`):

| Factor | Valor | Significat |
|--------|-------|------------|
| deadweight | 15% | Part del canvi que hauria passat igual |
| attribution | 90% | Part atribuïble al programa |
| drop_off_year1 | 10% | Pèrdua d'efecte al cap d'un any |

**Multiplicador combinat ≈ 0.769** (×0.77 del valor brut).

### 4.7 Numerador final (outcomes)

| Clau UI | Origen breakdown |
|---------|------------------|
| `family_tutoring_savings` | `family_tutoring_value` + `academic_ipi_value` |
| `public_services_saved` | `exclusion_risk_reduction` |
| `integration_gains` | `integration_value` |
| `program_delivery_value` | `program_delivery_value` (35% hores × 18€) |

```text
outcomes_eur = family + public + integration + delivery
sroi_ratio = outcomes_eur / program_cost_eur
```

### 4.8 Sensibilitat

Escenaris `conservative` / `central` / `optimistic` varien deadweight, attribution i drop-off (`_SENSITIVITY`).

### 4.9 API i UI

- Coordinador: `GET /api/v1/analytics/sroi?period_start&period_end&program_id`
- Explicació visual: `formula_explanation` al resultat de `calculate_sroi` / `build_ngo_sroi_calculator`
- Components React: `SROIFormulaExplainer`, `SROIBreakdown`, `SROIOutcomesBreakdown`

### 4.10 Calculadora donant / ONG

`build_ngo_sroi_calculator`:

- **Aportació €:** beneficis × (`aportació / cost_operatiu`).
- **Hores voluntariat:** beneficis × (`hores_unit / hores_totals`).

---

## 5. Diagrama de flux complet

```text
                    REGISTRE SESSIÓ
                          │
          ┌───────────────┼───────────────┐
          ▼               ▼               ▼
    Session          Observation    Attendance
          │               │
          │               ├─► calculate_ipi → raw_ipi
          │               ├─► apply_progressive_session_ipi
          │               ├─► apply_learning_curve_ipi
          │               ├─► volunteer_progress_sense (×0.8–1.2)
          │               └─► PeriodicAssessment (session_auto)
          │                       │
          │                       └─► risk_engine
          ▼
    duration, dates ───────────────► load_program_period_metrics
                                          │
                    avg_ipi_gain, sessions, pct_high_risk, cost
                                          ▼
                                   calculate_sroi
                                          │
                                          ▼
                              ratio, outcomes €, statement
```

---

## 6. Simulació de dades

Motor: `data_simulation_service.run_session_simulation`.

- Etiqueta `simulation` (no dates com a text).
- Mateixa corba d'aprenentatge i `apply_progressive_session_ipi`.
- Mode additiu: dates **després** de l'última avaluació (evita duplicats).
- Opció `clear_existing_sessions`: esborra sessions i periódiques del pool.
- `dedupe_periodic`: elimina duplicats mateix dia (conserva fila canònica).

---

## 7. Constants per ajustar (tuning)

| Constant | Fitxer | Efecte |
|----------|--------|--------|
| `CURVE_K` (0.09) | `learning_curve.py` | Velocitat aproximació a M |
| `ASYMPTOTE_GAIN_ABOVE_BASELINE` (38) | `learning_curve.py` | Rang màxim sobre baseline |
| `MAX_SESSION_AUTO_IPI_DELTA` (6) | `participant_metrics.py` | Cap lineal per sessió |
| `VOLUNTEER_PROGRESS_MULTIPLIER` | `participant_metrics.py` | Sensació voluntari |
| `_EXPECTED_SESSIONS_PER_PARTICIPANT_MONTH` (4) | `sroi_engine.py` | Dosi esperada |
| `_NGO_CORRECTION_FACTORS` | `sroi_engine.py` | Correccions SROI |

---

## 8. Referències

- SROI Network (2012) — Social Return on Investment Guide
- Pusic M. et al. — Learning curves in health professions education (asímptota i rendiments decreixents)
- Proxies econòmics: INE 2023, Fundació Jaume Bofill, SERES

---

*Document generat a partir del codi del repositori ImpactFlow. Actualitza aquest fitxer quan es modifiquin `learning_curve.py`, `participant_metrics.py` o `sroi_engine.py`.*
