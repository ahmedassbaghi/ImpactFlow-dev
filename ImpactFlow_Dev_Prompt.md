# 🚀 IMPACTFLOW — PROMPT DE DESARROLLO COMPLETO

> **Versión:** 1.0 | **Audiencia:** AI Coding Assistant / Dev Team  
> **Objetivo:** Construir ImpactFlow, una plataforma SaaS de medición de impacto social para ONG y entidades educativas.  
> **Tagline del producto:** *"De l'activitat a l'impacte" — Convertimos observaciones cotidianas en evidencia de impacto atribuible.*

---

## 0. CONTEXTO DEL PRODUCTO

ImpactFlow resuelve un problema crítico del Tercer Sector: las organizaciones sociales y educativas **pueden observar** el cambio en las personas que atienden, pero **no pueden demostrarlo** de manera objetiva, comparable y atribuible a sus programas. Esto les impide justificar subvenciones, captar donantes y escalar su impacto.

### Usuarios del sistema (3 roles)

| Rol | Perfil | Necesidad principal |
|-----|--------|---------------------|
| **Profesional / Voluntario** | Educador, monitor, voluntario | Registrar observaciones rápidas post-sesión sin burocracia |
| **Coordinador / Dirección** | Director de entidad, coordinador de proyectos | Dashboard con métricas agregadas, generación automática de informes para subvenciones |
| **Donante** | Financiador privado, fundación, donante individual | Ver el impacto tangible de su contribución en tiempo real |

---

## 1. STACK TECNOLÓGICO

### Backend
- **Framework:** FastAPI (Python 3.11+)
- **ORM:** SQLAlchemy 2.0 con soporte async
- **Base de datos:** SQLite (archivo local `impactflow.db`) vía `aiosqlite`
- **Migraciones:** Alembic
- **Autenticación:** JWT con `python-jose` + `passlib[bcrypt]`
- **Validación:** Pydantic v2
- **IA / NLP:** `openai` SDK (GPT-4o-mini para interpretación de texto cualitativo) con fallback a `transformers` (modelo `cardiffnlp/twitter-xlm-roberta-base-sentiment`) para uso offline
- **Tareas asíncronas:** `asyncio` nativo + `APScheduler` para cálculos batch nocturnos
- **Testing:** `pytest` + `pytest-asyncio` + `httpx`
- **Servidor:** `uvicorn` con reload en dev

### Frontend
- **Framework:** React 18 + Vite 5 + TypeScript (strict mode)
- **Estilos:** Tailwind CSS v3 + shadcn/ui (componentes base)
- **Iconos:** Lucide React
- **Routing:** React Router v6 (rutas protegidas por rol)
- **Estado global:** Zustand (stores separados por dominio)
- **Data fetching:** TanStack Query v5 (caché, invalidación, optimistic updates)
- **Gráficos:** Recharts (dashboards) + D3.js (gráfico de evolución longitudinal personalizado)
- **Formularios:** React Hook Form + Zod (validación isomorfa con el backend)
- **Animaciones:** Framer Motion (transiciones de página, animaciones de métricas)
- **Exportación PDF:** `react-pdf` / `@react-pdf/renderer`
- **Testing:** Vitest + React Testing Library

### Infraestructura / Dev
- **Monorepo:** estructura `apps/backend` + `apps/frontend` con `Makefile` raíz
- **Variables de entorno:** `.env` con `python-dotenv` (backend) y Vite env vars (frontend)
- **Linting:** Ruff (backend) + ESLint + Prettier (frontend)
- **Tipado compartido:** Genera tipos TypeScript automáticamente desde OpenAPI con `openapi-typescript`

---

## 2. ARQUITECTURA DE LA BASE DE DATOS (SQLite)

Diseño normalizado, optimizado para consultas longitudinales y cálculo del IPI.

```sql
-- ============================================================
-- ENTIDADES ORGANIZATIVAS
-- ============================================================

CREATE TABLE organizations (
    id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    name        TEXT NOT NULL,
    slug        TEXT UNIQUE NOT NULL,
    logo_url    TEXT,
    plan        TEXT NOT NULL DEFAULT 'free' CHECK(plan IN ('free','starter','pro','enterprise')),
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE centers (
    id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    address         TEXT,
    city            TEXT,
    postal_code     TEXT,
    active          BOOLEAN DEFAULT TRUE,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE programs (
    id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    center_id       TEXT REFERENCES centers(id),
    name            TEXT NOT NULL,
    description     TEXT,
    program_type    TEXT NOT NULL CHECK(program_type IN (
                        'academic_support','speech_therapy','theater',
                        'music','sports','mentoring','social_integration','other'
                    )),
    start_date      DATE NOT NULL,
    end_date        DATE,
    active          BOOLEAN DEFAULT TRUE,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- USUARIOS Y ROLES
-- ============================================================

CREATE TABLE users (
    id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    email           TEXT UNIQUE NOT NULL,
    hashed_password TEXT NOT NULL,
    full_name       TEXT NOT NULL,
    role            TEXT NOT NULL CHECK(role IN ('admin','coordinator','professional','donor','viewer')),
    avatar_url      TEXT,
    phone           TEXT,
    is_active       BOOLEAN DEFAULT TRUE,
    last_login_at   DATETIME,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE user_program_assignments (
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    program_id TEXT NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
    assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, program_id)
);

-- ============================================================
-- PARTICIPANTES (ALUMNOS / BENEFICIARIOS)
-- ============================================================

CREATE TABLE participants (
    id                  TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    organization_id     TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    center_id           TEXT REFERENCES centers(id),
    -- Datos básicos (anonimizables — solo nombre de pila + código)
    code                TEXT UNIQUE NOT NULL,          -- ej: "NRN-2024-001"
    first_name          TEXT NOT NULL,
    birth_year          INTEGER,
    gender              TEXT CHECK(gender IN ('M','F','NB','unknown')) DEFAULT 'unknown',
    nationality         TEXT,
    language_at_home    TEXT,
    -- Situación en el programa
    enrollment_date     DATE NOT NULL,
    exit_date           DATE,
    exit_reason         TEXT CHECK(exit_reason IN ('graduated','dropout','transfer','other')),
    cohort_label        TEXT,                          -- ej: "2024-Q1", para comparación entre cohortes
    -- Flags
    is_control_group    BOOLEAN DEFAULT FALSE,         -- Para estudios con grupo de control
    consent_given       BOOLEAN DEFAULT FALSE,
    active              BOOLEAN DEFAULT TRUE,
    created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE participant_program_enrollments (
    id             TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    participant_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
    program_id     TEXT NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
    enrolled_at    DATE NOT NULL,
    status         TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','completed','dropped')),
    UNIQUE(participant_id, program_id)
);

-- ============================================================
-- EVALUACIONES INICIALES (BASELINE)
-- ============================================================
-- Al entrar al programa se registra el punto de partida en cada dimensión.
-- Esto es crítico para calcular mejora RELATIVA (no comparación con estándares externos).

CREATE TABLE baseline_assessments (
    id                  TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    participant_id      TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
    program_id          TEXT NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
    assessed_by         TEXT NOT NULL REFERENCES users(id),
    assessment_date     DATE NOT NULL,
    -- Dimensión 1: Académica
    reading_level       INTEGER CHECK(reading_level BETWEEN 1 AND 5),      -- 1=muy bajo, 5=nivel esperado
    math_level          INTEGER CHECK(math_level BETWEEN 1 AND 5),
    comprehension_level INTEGER CHECK(comprehension_level BETWEEN 1 AND 5),
    -- Dimensión 2: Cognitiva
    attention_level     INTEGER CHECK(attention_level BETWEEN 1 AND 5),
    memory_level        INTEGER CHECK(memory_level BETWEEN 1 AND 5),
    autonomy_level      INTEGER CHECK(autonomy_level BETWEEN 1 AND 5),
    -- Dimensión 3: Social
    peer_interaction    INTEGER CHECK(peer_interaction BETWEEN 1 AND 5),
    group_work          INTEGER CHECK(group_work BETWEEN 1 AND 5),
    emotional_regulation INTEGER CHECK(emotional_regulation BETWEEN 1 AND 5),
    -- Dimensión 4: Integración
    language_fluency    INTEGER CHECK(language_fluency BETWEEN 1 AND 5),
    cultural_adaptation INTEGER CHECK(cultural_adaptation BETWEEN 1 AND 5),
    -- IPI calculado en baseline (snapshot inicial)
    ipi_baseline        REAL,
    notes               TEXT,
    UNIQUE(participant_id, program_id)
);

-- ============================================================
-- SESIONES Y REGISTROS DIARIOS (CAPTURA NATURAL)
-- ============================================================

CREATE TABLE sessions (
    id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    program_id      TEXT NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
    professional_id TEXT NOT NULL REFERENCES users(id),
    session_date    DATE NOT NULL,
    session_type    TEXT NOT NULL CHECK(session_type IN (
                        'individual','group','evaluation','family_meeting','other'
                    )),
    duration_minutes INTEGER,
    notes           TEXT,                -- Texto libre del profesional
    notes_ai_summary TEXT,               -- Resumen generado por IA
    notes_sentiment  REAL,               -- Score -1 a 1 generado por NLP
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE session_participants (
    session_id     TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    participant_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
    attended       BOOLEAN DEFAULT TRUE,
    PRIMARY KEY(session_id, participant_id)
);

-- Observaciones por dimensión post-sesión (formulario 1-5 estrellas)
CREATE TABLE session_observations (
    id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    session_id      TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    participant_id  TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
    -- Puntuaciones rápidas (escala 1-5)
    academic_score  INTEGER CHECK(academic_score BETWEEN 1 AND 5),
    cognitive_score INTEGER CHECK(cognitive_score BETWEEN 1 AND 5),
    social_score    INTEGER CHECK(social_score BETWEEN 1 AND 5),
    integration_score INTEGER CHECK(integration_score BETWEEN 1 AND 5),
    -- Texto libre (interpretado por IA)
    qualitative_note TEXT,
    qualitative_note_parsed_tags TEXT,   -- JSON: ["focus","reading","improvement"]
    -- Micro-objetivos completados en esta sesión
    micro_goals_completed TEXT,          -- JSON array de IDs de objetivos completados
    mood_indicator  TEXT CHECK(mood_indicator IN ('very_low','low','neutral','good','excellent')),
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(session_id, participant_id)
);

-- ============================================================
-- MICRO-OBJETIVOS PERSONALIZADOS (GAMIFICACIÓN)
-- ============================================================

CREATE TABLE micro_goals (
    id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    participant_id  TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
    program_id      TEXT NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
    created_by      TEXT NOT NULL REFERENCES users(id),
    title           TEXT NOT NULL,                     -- "Leer 10 minutos seguidos"
    description     TEXT,
    dimension       TEXT NOT NULL CHECK(dimension IN ('academic','cognitive','social','integration')),
    difficulty      INTEGER CHECK(difficulty BETWEEN 1 AND 3) DEFAULT 1,   -- 1=fácil, 3=difícil
    points          INTEGER NOT NULL DEFAULT 10,
    target_date     DATE,
    is_template     BOOLEAN DEFAULT FALSE,             -- Si es True, puede reutilizarse para otros participantes
    active          BOOLEAN DEFAULT TRUE,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE micro_goal_completions (
    id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    micro_goal_id   TEXT NOT NULL REFERENCES micro_goals(id) ON DELETE CASCADE,
    session_id      TEXT REFERENCES sessions(id),
    completed_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    verified_by     TEXT REFERENCES users(id),
    note            TEXT
);

-- ============================================================
-- EVALUACIONES PERIÓDICAS (TRIMESTRAL / MENSUAL)
-- ============================================================

CREATE TABLE periodic_assessments (
    id                  TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    participant_id      TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
    program_id          TEXT NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
    assessed_by         TEXT NOT NULL REFERENCES users(id),
    assessment_date     DATE NOT NULL,
    period_label        TEXT NOT NULL,              -- "Q1-2024", "M3-2024"
    -- Mismas dimensiones que baseline
    reading_level       INTEGER CHECK(reading_level BETWEEN 1 AND 5),
    math_level          INTEGER CHECK(math_level BETWEEN 1 AND 5),
    comprehension_level INTEGER CHECK(comprehension_level BETWEEN 1 AND 5),
    attention_level     INTEGER CHECK(attention_level BETWEEN 1 AND 5),
    memory_level        INTEGER CHECK(memory_level BETWEEN 1 AND 5),
    autonomy_level      INTEGER CHECK(autonomy_level BETWEEN 1 AND 5),
    peer_interaction    INTEGER CHECK(peer_interaction BETWEEN 1 AND 5),
    group_work          INTEGER CHECK(group_work BETWEEN 1 AND 5),
    emotional_regulation INTEGER CHECK(emotional_regulation BETWEEN 1 AND 5),
    language_fluency    INTEGER CHECK(language_fluency BETWEEN 1 AND 5),
    cultural_adaptation INTEGER CHECK(cultural_adaptation BETWEEN 1 AND 5),
    -- IPI calculado (ver algoritmo)
    ipi_score           REAL NOT NULL,
    ipi_delta_vs_baseline REAL,        -- % mejora relativa vs. evaluación inicial
    ipi_delta_vs_previous REAL,        -- % mejora relativa vs. evaluación anterior
    -- Predicción del modelo
    predicted_next_ipi  REAL,
    risk_score          REAL,          -- 0-1: riesgo de abandono
    risk_level          TEXT CHECK(risk_level IN ('low','medium','high')),
    notes               TEXT,
    created_at          DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- ASISTENCIA
-- ============================================================

CREATE TABLE attendance_records (
    id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    participant_id  TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
    program_id      TEXT NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
    session_id      TEXT REFERENCES sessions(id),
    date            DATE NOT NULL,
    status          TEXT NOT NULL CHECK(status IN ('present','absent_justified','absent_unjustified','late')),
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- INFORMES GENERADOS
-- ============================================================

CREATE TABLE reports (
    id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    program_id      TEXT REFERENCES programs(id),
    created_by      TEXT NOT NULL REFERENCES users(id),
    report_type     TEXT NOT NULL CHECK(report_type IN (
                        'quarterly','annual','grant_justification',
                        'donor_impact','participant_profile','cohort_comparison'
                    )),
    period_start    DATE NOT NULL,
    period_end      DATE NOT NULL,
    title           TEXT NOT NULL,
    content_json    TEXT NOT NULL,     -- JSON con estructura del informe
    pdf_path        TEXT,              -- Ruta al PDF generado
    status          TEXT DEFAULT 'generating' CHECK(status IN ('generating','ready','error')),
    generated_at    DATETIME,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- DONANTES Y TRANSPARENCIA
-- ============================================================

CREATE TABLE donors (
    id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    email           TEXT,
    donor_type      TEXT CHECK(donor_type IN ('individual','foundation','company','public')) DEFAULT 'individual',
    anonymous       BOOLEAN DEFAULT FALSE,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE donations (
    id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    donor_id        TEXT NOT NULL REFERENCES donors(id) ON DELETE CASCADE,
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    program_id      TEXT REFERENCES programs(id),
    amount_eur      REAL NOT NULL,
    donation_date   DATE NOT NULL,
    donation_type   TEXT CHECK(donation_type IN ('one_time','monthly','annual','rounding')) DEFAULT 'one_time',
    notes           TEXT,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- ÍNDICES CRÍTICOS PARA RENDIMIENTO
-- ============================================================

CREATE INDEX idx_session_observations_participant ON session_observations(participant_id);
CREATE INDEX idx_periodic_assessments_participant ON periodic_assessments(participant_id, assessment_date);
CREATE INDEX idx_periodic_assessments_program ON periodic_assessments(program_id, assessment_date);
CREATE INDEX idx_attendance_participant ON attendance_records(participant_id, date);
CREATE INDEX idx_micro_goal_completions_goal ON micro_goal_completions(micro_goal_id);
CREATE INDEX idx_participants_organization ON participants(organization_id, active);
CREATE INDEX idx_sessions_program_date ON sessions(program_id, session_date);
```

---

## 3. ALGORITMOS CENTRALES

### 3.1 Índice de Progreso Integral (IPI)

El IPI es un score compuesto de 0-100 que mide el desarrollo del participante en 4 dimensiones con pesos configurables.

```python
# backend/app/algorithms/ipi.py

from dataclasses import dataclass
from typing import Optional
import math

# Pesos por defecto (configurables por organización)
DEFAULT_WEIGHTS = {
    "academic":    0.35,   # Lectura, matemáticas, comprensión
    "cognitive":   0.25,   # Atención, memoria, autonomía
    "social":      0.25,   # Interacción, trabajo en grupo, regulación emocional
    "integration": 0.15,   # Fluidez idioma, adaptación cultural
}

@dataclass
class DimensionScores:
    # Académica (3 indicadores, escala 1-5)
    reading_level:          Optional[int] = None
    math_level:             Optional[int] = None
    comprehension_level:    Optional[int] = None
    # Cognitiva
    attention_level:        Optional[int] = None
    memory_level:           Optional[int] = None
    autonomy_level:         Optional[int] = None
    # Social
    peer_interaction:       Optional[int] = None
    group_work:             Optional[int] = None
    emotional_regulation:   Optional[int] = None
    # Integración
    language_fluency:       Optional[int] = None
    cultural_adaptation:    Optional[int] = None

def _dimension_avg(values: list[Optional[int]]) -> Optional[float]:
    """Calcula la media ignorando valores nulos. Retorna None si no hay datos."""
    valid = [v for v in values if v is not None]
    if not valid:
        return None
    return sum(valid) / len(valid)

def _normalize_to_100(value: float, min_val: float = 1.0, max_val: float = 5.0) -> float:
    """Normaliza una puntuación 1-5 a escala 0-100."""
    return ((value - min_val) / (max_val - min_val)) * 100

def calculate_ipi(
    scores: DimensionScores,
    weights: dict[str, float] = DEFAULT_WEIGHTS
) -> dict:
    """
    Calcula el IPI y los sub-scores por dimensión.
    
    Returns:
        {
          "ipi": 72.4,
          "dimensions": {
            "academic": 78.3,
            "cognitive": 65.0,
            "social": 70.0,
            "integration": 60.0
          },
          "completeness": 0.91  # % de indicadores con datos
        }
    """
    dim_scores = {
        "academic": _dimension_avg([
            scores.reading_level,
            scores.math_level,
            scores.comprehension_level
        ]),
        "cognitive": _dimension_avg([
            scores.attention_level,
            scores.memory_level,
            scores.autonomy_level
        ]),
        "social": _dimension_avg([
            scores.peer_interaction,
            scores.group_work,
            scores.emotional_regulation
        ]),
        "integration": _dimension_avg([
            scores.language_fluency,
            scores.cultural_adaptation
        ]),
    }
    
    # Normalizar dimensiones a 0-100
    normalized = {
        dim: _normalize_to_100(score) if score is not None else None
        for dim, score in dim_scores.items()
    }
    
    # Calcular IPI ponderado solo con dimensiones disponibles
    available = {d: s for d, s in normalized.items() if s is not None}
    
    if not available:
        return {"ipi": None, "dimensions": normalized, "completeness": 0.0}
    
    # Renormalizar pesos si hay dimensiones faltantes
    total_weight = sum(weights[d] for d in available)
    ipi = sum(
        (weights[d] / total_weight) * score
        for d, score in available.items()
    )
    
    # Completeness: % de indicadores con datos
    all_values = [
        scores.reading_level, scores.math_level, scores.comprehension_level,
        scores.attention_level, scores.memory_level, scores.autonomy_level,
        scores.peer_interaction, scores.group_work, scores.emotional_regulation,
        scores.language_fluency, scores.cultural_adaptation
    ]
    completeness = sum(1 for v in all_values if v is not None) / len(all_values)
    
    return {
        "ipi": round(ipi, 1),
        "dimensions": {k: round(v, 1) if v is not None else None for k, v in normalized.items()},
        "completeness": round(completeness, 2)
    }

def calculate_relative_improvement(
    baseline_ipi: float,
    current_ipi: float
) -> dict:
    """
    Calcula la mejora relativa respecto al punto de partida.
    Medimos progreso individual, no comparación injusta con estándares externos.
    """
    if baseline_ipi == 0:
        return {"absolute_delta": current_ipi, "relative_delta_pct": None}
    
    absolute_delta = current_ipi - baseline_ipi
    relative_delta_pct = (absolute_delta / baseline_ipi) * 100
    
    return {
        "absolute_delta": round(absolute_delta, 1),
        "relative_delta_pct": round(relative_delta_pct, 1),
        "trajectory": "improving" if relative_delta_pct > 5 else 
                      "stable" if relative_delta_pct >= -5 else "declining"
    }
```

### 3.2 Motor de Riesgo de Abandono (Risk Score)

```python
# backend/app/algorithms/risk_engine.py

from datetime import date, timedelta
from typing import Optional
import statistics

def calculate_risk_score(
    attendance_rate_last_30d: float,      # 0.0 - 1.0
    attendance_rate_prev_30d: float,      # 0.0 - 1.0
    ipi_delta_last_period: Optional[float],  # % cambio último período
    days_since_last_session: int,
    micro_goals_completion_rate: float,    # 0.0 - 1.0
    num_unjustified_absences_last_30d: int,
    avg_mood_last_5_sessions: Optional[float],  # 1-5
    weeks_in_program: int
) -> dict:
    """
    Modelo heurístico de riesgo de abandono (0 = sin riesgo, 1 = riesgo máximo).
    
    Factores de riesgo (con sus pesos):
    - Caída de asistencia reciente (comparando períodos)
    - Estancamiento o retroceso en IPI
    - Falta de participación en micro-objetivos
    - Ausencias injustificadas acumuladas
    - Estado emocional bajo en sesiones recientes
    - Tiempo sin sesión reciente
    """
    scores = []
    
    # 1. Factor asistencia (peso 0.30)
    attendance_drop = attendance_rate_prev_30d - attendance_rate_last_30d
    attendance_risk = min(1.0, max(0.0, 
        (1 - attendance_rate_last_30d) * 0.5 + max(0, attendance_drop) * 1.5
    ))
    scores.append(("attendance", attendance_risk, 0.30))
    
    # 2. Factor IPI / progreso (peso 0.25)
    if ipi_delta_last_period is not None:
        if ipi_delta_last_period < -10:
            ipi_risk = 0.9
        elif ipi_delta_last_period < -5:
            ipi_risk = 0.6
        elif ipi_delta_last_period < 2:
            ipi_risk = 0.3    # Estancamiento
        else:
            ipi_risk = 0.0
    else:
        ipi_risk = 0.2        # Sin datos, riesgo neutro
    scores.append(("ipi_progress", ipi_risk, 0.25))
    
    # 3. Factor micro-objetivos (peso 0.15)
    goals_risk = max(0.0, (0.4 - micro_goals_completion_rate) * 2)
    goals_risk = min(1.0, goals_risk)
    scores.append(("micro_goals", goals_risk, 0.15))
    
    # 4. Factor ausencias injustificadas (peso 0.15)
    absence_risk = min(1.0, num_unjustified_absences_last_30d * 0.25)
    scores.append(("absences", absence_risk, 0.15))
    
    # 5. Factor estado emocional (peso 0.10)
    if avg_mood_last_5_sessions is not None:
        mood_risk = max(0.0, (3.0 - avg_mood_last_5_sessions) / 2.0)
    else:
        mood_risk = 0.15
    scores.append(("mood", mood_risk, 0.10))
    
    # 6. Factor inactividad reciente (peso 0.05)
    if days_since_last_session > 21:
        inactivity_risk = min(1.0, (days_since_last_session - 14) / 30)
    else:
        inactivity_risk = 0.0
    scores.append(("inactivity", inactivity_risk, 0.05))
    
    # Score ponderado final
    total_risk = sum(s * w for _, s, w in scores)
    total_risk = round(min(1.0, max(0.0, total_risk)), 3)
    
    # Clasificación
    if total_risk < 0.25:
        risk_level = "low"
    elif total_risk < 0.55:
        risk_level = "medium"
    else:
        risk_level = "high"
    
    # Factores contribuyentes (para explicabilidad — mostrar al coordinador)
    contributing_factors = [
        factor for factor, score, _ in scores if score > 0.4
    ]
    
    return {
        "risk_score": total_risk,
        "risk_level": risk_level,
        "contributing_factors": contributing_factors,
        "breakdown": {factor: round(s, 2) for factor, s, _ in scores}
    }
```

### 3.3 Predicción de IPI (Modelo Longitudinal)

```python
# backend/app/algorithms/predictor.py

from typing import Optional
import statistics

def predict_next_ipi(
    historical_ipis: list[float],       # Lista de IPIs ordenados cronológicamente
    historical_dates: list[date],        # Fechas correspondientes
    weeks_ahead: int = 12               # Semanas a predecir (un trimestre)
) -> dict:
    """
    Predicción simple del IPI futuro basada en tendencia lineal ponderada.
    Los modelos complejos (LSTM, Prophet) son mejoras futuras.
    
    Para un MVP: regresión lineal con ponderación temporal (más peso a datos recientes).
    """
    n = len(historical_ipis)
    
    if n < 2:
        return {
            "predicted_ipi": historical_ipis[-1] if historical_ipis else None,
            "confidence": "low",
            "trend": "insufficient_data"
        }
    
    # Pesos exponenciales (más peso a observaciones recientes)
    weights = [0.5 ** (n - 1 - i) for i in range(n)]
    w_sum = sum(weights)
    weights = [w / w_sum for w in weights]
    
    # Media ponderada y tendencia
    weighted_mean = sum(v * w for v, w in zip(historical_ipis, weights))
    
    # Calcular tendencia como pendiente ponderada de los últimos n puntos
    if n >= 3:
        # Regresión lineal simple (mínimos cuadrados)
        x = list(range(n))
        x_mean = sum(x) / n
        y_mean = sum(historical_ipis) / n
        
        numerator = sum((xi - x_mean) * (yi - y_mean) for xi, yi in zip(x, historical_ipis))
        denominator = sum((xi - x_mean) ** 2 for xi in x)
        
        slope = numerator / denominator if denominator != 0 else 0
        intercept = y_mean - slope * x_mean
        
        # Proyectar hacia adelante
        # Asumiendo períodos de evaluación ~12 semanas
        periods_ahead = weeks_ahead / 12
        predicted_ipi = intercept + slope * (n + periods_ahead - 1)
        
        # Limitar entre 0 y 100
        predicted_ipi = max(0.0, min(100.0, predicted_ipi))
    else:
        # Con solo 2 puntos, extrapolar
        slope = historical_ipis[-1] - historical_ipis[-2]
        predicted_ipi = historical_ipis[-1] + slope * 0.8  # Factor de regresión a la media
        predicted_ipi = max(0.0, min(100.0, predicted_ipi))
    
    # Desviación estándar como proxy de confianza
    if n >= 3:
        std = statistics.stdev(historical_ipis)
        confidence = "high" if std < 5 else "medium" if std < 12 else "low"
    else:
        confidence = "low"
    
    # Tendencia
    recent_slope = historical_ipis[-1] - historical_ipis[0]
    trend = "improving" if recent_slope > 3 else "stable" if recent_slope >= -3 else "declining"
    
    return {
        "predicted_ipi": round(predicted_ipi, 1),
        "confidence": confidence,
        "trend": trend,
        "slope_per_period": round(slope, 2) if n >= 3 else None,
        "historical_std": round(statistics.stdev(historical_ipis), 2) if n >= 3 else None
    }
```

### 3.4 Intérprete de Notas Cualitativas (IA)

```python
# backend/app/services/nlp_service.py

import json
import re
from typing import Optional
from openai import AsyncOpenAI

client = AsyncOpenAI()

SYSTEM_PROMPT = """
Eres un asistente experto en evaluación de impacto social y educativo.
Tu tarea es analizar notas cualitativas escritas por educadores/voluntarios
sobre sesiones con niños en programas sociales.

Dado un fragmento de texto libre, extrae:
1. sentiment_score: número entre -1.0 (muy negativo) y 1.0 (muy positivo)
2. dimension_signals: objeto con puntuaciones sugeridas (1-5) para cada dimensión
   basadas en lo que se describe. Omite dimensiones no mencionadas.
3. tags: lista de hasta 5 etiquetas relevantes en español/catalán
4. summary: una frase resumen en catalán (máx. 80 chars)
5. flags: lista de alertas si las hay (ej: "possible_risk", "family_issue", "exceptional_progress")

IMPORTANTE: Responde ÚNICAMENTE con JSON válido. Sin explicaciones adicionales.
Sin texto antes o después del JSON.
"""

async def parse_qualitative_note(
    note_text: str,
    participant_context: Optional[dict] = None
) -> dict:
    """
    Interpreta una nota cualitativa del profesional y extrae señales estructuradas.
    
    Ejemplo de input:
        "Avui en Bilal ha llegit molt bé, ha estat molt concentrat i ha participat
         en les activitats de grup. Sembla més animat que la setmana passada."
    
    Ejemplo de output:
        {
          "sentiment_score": 0.85,
          "dimension_signals": {
            "academic": 4,
            "cognitive": 4,
            "social": 4
          },
          "tags": ["lectura", "concentración", "participación", "mejora anímica"],
          "summary": "Sessió molt positiva: lectura, concentració i participació grupal",
          "flags": []
        }
    """
    context_str = ""
    if participant_context:
        context_str = f"\nContexto del participante: {json.dumps(participant_context, ensure_ascii=False)}"
    
    try:
        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            temperature=0.1,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": f"Nota del educador: {note_text}{context_str}"}
            ]
        )
        
        result = json.loads(response.choices[0].message.content)
        
        # Validar y sanitizar output
        return {
            "sentiment_score": float(result.get("sentiment_score", 0)),
            "dimension_signals": {
                k: max(1, min(5, int(v)))
                for k, v in result.get("dimension_signals", {}).items()
                if k in ["academic", "cognitive", "social", "integration"]
            },
            "tags": result.get("tags", [])[:5],
            "summary": result.get("summary", "")[:80],
            "flags": [f for f in result.get("flags", []) if isinstance(f, str)]
        }
    except Exception as e:
        # Fallback: análisis básico sin IA
        return {
            "sentiment_score": _simple_sentiment(note_text),
            "dimension_signals": {},
            "tags": _extract_keywords(note_text),
            "summary": note_text[:80],
            "flags": []
        }

def _simple_sentiment(text: str) -> float:
    """Análisis de sentimiento basado en palabras clave (fallback offline)."""
    positive = ["bé", "molt bé", "excel·lent", "progrés", "millora", "concentrat", 
                "positiu", "participat", "animat", "bien", "excelente", "mejora"]
    negative = ["difícil", "cost", "absent", "problemes", "trist", "bloqueig",
                "problema", "ausente", "difícil", "bloqueado"]
    
    text_lower = text.lower()
    pos = sum(1 for w in positive if w in text_lower)
    neg = sum(1 for w in negative if w in text_lower)
    
    if pos + neg == 0:
        return 0.0
    return (pos - neg) / (pos + neg)

def _extract_keywords(text: str) -> list[str]:
    """Extrae palabras clave básicas (fallback offline)."""
    stopwords = {"ha", "en", "de", "la", "el", "les", "els", "un", "una", "i", "a",
                 "que", "per", "amb", "molt", "més", "se", "es", "este", "esta"}
    words = re.findall(r'\b\w{4,}\b', text.lower())
    return list(dict.fromkeys(w for w in words if w not in stopwords))[:5]
```

### 3.5 Generación Automática de Informes

```python
# backend/app/services/report_generator.py

async def generate_quarterly_report(
    program_id: str,
    period_start: date,
    period_end: date,
    db: AsyncSession
) -> dict:
    """
    Genera el JSON estructurado de un informe trimestral.
    Incluye todos los datos necesarios para renderizar el PDF en el frontend.
    """
    
    # 1. Métricas agregadas del programa
    program_metrics = await _get_program_metrics(program_id, period_start, period_end, db)
    
    # 2. Evolución media del IPI del período
    ipi_evolution = await _get_ipi_evolution(program_id, period_start, period_end, db)
    
    # 3. Participantes con mayor mejora (top 3 — anonimizados)
    top_improvers = await _get_top_improvers(program_id, period_start, period_end, db)
    
    # 4. Distribución de riesgo actual
    risk_distribution = await _get_risk_distribution(program_id, db)
    
    # 5. Micro-objetivos completados
    goals_summary = await _get_goals_summary(program_id, period_start, period_end, db)
    
    # 6. Comparación con período anterior
    prev_start = period_start - timedelta(days=90)
    comparison = await _compare_periods(program_id, prev_start, period_start, period_end, db)
    
    # 7. Generación de narrativa con IA
    narrative = await _generate_narrative_summary(
        program_metrics, ipi_evolution, comparison
    )
    
    return {
        "metadata": {
            "program_id": program_id,
            "period_start": period_start.isoformat(),
            "period_end": period_end.isoformat(),
            "generated_at": datetime.now().isoformat()
        },
        "headline_metrics": program_metrics,
        "ipi_evolution": ipi_evolution,
        "top_improvers": top_improvers,
        "risk_distribution": risk_distribution,
        "goals_summary": goals_summary,
        "period_comparison": comparison,
        "narrative": narrative,
        "key_statements": [
            f"El {program_metrics['improvement_pct']}% dels participants milloren el seu IPI en més d'un 20%",
            f"Promig de {goals_summary['avg_monthly_completions']} micro-assoliments mensuals per participant",
            f"Tassa de retenció del {program_metrics['retention_rate']}%"
        ]
    }
```

---

## 4. ESTRUCTURA DEL BACKEND (FastAPI)

```
apps/backend/
├── app/
│   ├── main.py                    # App FastAPI, CORS, middleware
│   ├── config.py                  # Settings con pydantic-settings
│   ├── database.py                # Engine SQLite async, get_db dependency
│   ├── models/                    # SQLAlchemy ORM models
│   │   ├── organization.py
│   │   ├── user.py
│   │   ├── participant.py
│   │   ├── session.py
│   │   ├── assessment.py
│   │   └── report.py
│   ├── schemas/                   # Pydantic v2 schemas (request/response)
│   │   ├── auth.py
│   │   ├── participant.py
│   │   ├── session.py
│   │   ├── assessment.py
│   │   ├── dashboard.py
│   │   └── report.py
│   ├── routers/                   # Endpoints organizados por dominio
│   │   ├── auth.py                # POST /auth/login, POST /auth/refresh
│   │   ├── organizations.py       # CRUD organizaciones
│   │   ├── programs.py            # CRUD programas
│   │   ├── participants.py        # CRUD participantes + endpoints de evolución
│   │   ├── sessions.py            # Registro de sesiones y observaciones
│   │   ├── assessments.py         # Evaluaciones baseline y periódicas
│   │   ├── micro_goals.py         # CRUD micro-objetivos y completados
│   │   ├── dashboard.py           # Endpoints de métricas agregadas
│   │   ├── reports.py             # Generación y descarga de informes
│   │   └── analytics.py           # Análisis avanzados, comparación de cohortes
│   ├── algorithms/
│   │   ├── ipi.py                 # Cálculo IPI (ver sección 3.1)
│   │   ├── risk_engine.py         # Risk score (ver sección 3.2)
│   │   └── predictor.py           # Predicción longitudinal (ver sección 3.3)
│   ├── services/
│   │   ├── nlp_service.py         # Interpretación cualitativa con IA (ver 3.4)
│   │   ├── report_generator.py    # Generación de informes (ver 3.5)
│   │   └── scheduler.py           # Cálculos batch (recalcular IPI/risk nocturnos)
│   └── utils/
│       ├── auth.py                # JWT helpers
│       ├── deps.py                # FastAPI dependencies (current_user, etc.)
│       └── pagination.py          # Cursor-based pagination helper
├── alembic/                       # Migraciones
├── tests/
│   ├── test_ipi.py
│   ├── test_risk_engine.py
│   └── test_api/
├── .env.example
├── pyproject.toml
└── Makefile
```

### Endpoints clave

```
# Autenticación
POST   /api/v1/auth/login
POST   /api/v1/auth/refresh
POST   /api/v1/auth/logout

# Dashboard (por rol)
GET    /api/v1/dashboard/professional          # Vista profesional: mis participantes
GET    /api/v1/dashboard/coordinator           # Vista coordinador: métricas del programa
GET    /api/v1/dashboard/donor/{org_slug}      # Vista donante: impacto público

# Participantes
GET    /api/v1/participants                    # Lista con filtros
POST   /api/v1/participants                    # Crear
GET    /api/v1/participants/{id}/evolution     # Evolución IPI longitudinal
GET    /api/v1/participants/{id}/risk          # Risk score actualizado
POST   /api/v1/participants/{id}/baseline      # Crear evaluación inicial

# Sesiones
POST   /api/v1/sessions                        # Crear sesión + observaciones
GET    /api/v1/sessions/{id}
PATCH  /api/v1/sessions/{id}/observations      # Actualizar observaciones post-sesión

# Evaluaciones
POST   /api/v1/assessments/periodic            # Evaluación trimestral
GET    /api/v1/assessments/cohort-comparison   # Comparar cohortes

# Micro-objetivos
GET    /api/v1/micro-goals/templates           # Plantillas predefinidas
POST   /api/v1/micro-goals
POST   /api/v1/micro-goals/{id}/complete       # Marcar como completado

# Informes
POST   /api/v1/reports/generate                # Generar informe (async)
GET    /api/v1/reports/{id}/status             # Polling del estado
GET    /api/v1/reports/{id}/download           # Descargar PDF

# Analytics
GET    /api/v1/analytics/ipi-distribution      # Distribución de IPI del programa
GET    /api/v1/analytics/trend                 # Tendencia agregada
GET    /api/v1/analytics/impact-statement      # Genera frase de impacto para donantes

# NLP (interno)
POST   /api/v1/nlp/parse-note                  # Interpretar nota cualitativa
```

---

## 5. ESTRUCTURA DEL FRONTEND (React + Vite)

```
apps/frontend/
├── src/
│   ├── main.tsx
│   ├── App.tsx                           # Router principal con rutas protegidas
│   ├── types/                            # Tipos TypeScript (generados desde OpenAPI)
│   ├── api/                              # Clientes de API con TanStack Query
│   │   ├── client.ts                     # Axios instance con interceptors JWT
│   │   ├── auth.ts
│   │   ├── participants.ts
│   │   ├── sessions.ts
│   │   ├── assessments.ts
│   │   ├── dashboard.ts
│   │   └── reports.ts
│   ├── stores/                           # Zustand stores
│   │   ├── authStore.ts                  # user, token, role
│   │   ├── uiStore.ts                    # sidebar open/close, notifications
│   │   └── sessionStore.ts              # sesión activa en curso
│   ├── hooks/                            # Custom hooks
│   │   ├── useCurrentUser.ts
│   │   ├── useParticipantEvolution.ts
│   │   ├── useRealTimeRisk.ts
│   │   └── useReportGeneration.ts
│   ├── components/
│   │   ├── ui/                           # shadcn/ui base components
│   │   ├── layout/
│   │   │   ├── AppShell.tsx              # Layout principal con sidebar
│   │   │   ├── Sidebar.tsx               # Navegación adaptada al rol
│   │   │   ├── TopBar.tsx
│   │   │   └── NotificationCenter.tsx
│   │   ├── charts/
│   │   │   ├── IPIRadarChart.tsx          # Gráfico radar de las 4 dimensiones
│   │   │   ├── IPIEvolutionLine.tsx       # Línea temporal del IPI (D3.js)
│   │   │   ├── CohortComparison.tsx       # Comparación entre cohortes
│   │   │   ├── RiskDistributionDonut.tsx  # Distribución de riesgo
│   │   │   └── DimensionProgressBar.tsx
│   │   ├── participants/
│   │   │   ├── ParticipantCard.tsx        # Tarjeta con IPI y badge de riesgo
│   │   │   ├── ParticipantProfile.tsx     # Perfil completo con evolución
│   │   │   ├── BaselineForm.tsx           # Formulario de evaluación inicial
│   │   │   └── RiskBadge.tsx              # Badge LOW/MEDIUM/HIGH con color
│   │   ├── sessions/
│   │   │   ├── QuickSessionLogger.tsx     # Formulario rápido post-sesión (UX prioridad #1)
│   │   │   ├── StarRatingInput.tsx        # Input 1-5 estrellas por dimensión
│   │   │   ├── QualitativeNoteInput.tsx   # Textarea con análisis IA en tiempo real
│   │   │   └── MicroGoalChecklist.tsx     # Lista de objetivos a marcar
│   │   ├── dashboard/
│   │   │   ├── MetricCard.tsx             # Tarjeta de métrica individual
│   │   │   ├── ImpactStatement.tsx        # Frase de impacto generada por IA
│   │   │   ├── AlertsFeed.tsx             # Feed de alertas de riesgo
│   │   │   └── ProgramOverview.tsx
│   │   ├── reports/
│   │   │   ├── ReportGenerator.tsx        # UI para configurar y lanzar informe
│   │   │   ├── ReportPreview.tsx          # Vista previa del informe
│   │   │   └── PDFTemplate.tsx            # Template @react-pdf/renderer
│   │   └── donor/
│   │       ├── DonorImpactView.tsx        # Vista pública para donantes
│   │       └── BeforeAfterCard.tsx        # Componente "Before & After Effect"
│   ├── pages/
│   │   ├── Login.tsx
│   │   ├── professional/
│   │   │   ├── MyStudents.tsx             # Lista de participantes asignados
│   │   │   ├── SessionLogger.tsx          # Registrar sesión del día
│   │   │   └── ParticipantDetail.tsx
│   │   ├── coordinator/
│   │   │   ├── ProgramDashboard.tsx       # Dashboard principal coordinador
│   │   │   ├── CenterAnalysis.tsx         # Análisis por centro
│   │   │   ├── ParticipantList.tsx
│   │   │   ├── Alerts.tsx                 # Gestión de alertas de riesgo
│   │   │   └── Reports.tsx
│   │   └── donor/
│   │       └── ImpactPortal.tsx           # Portal público de impacto
│   └── utils/
│       ├── formatters.ts                   # Formateo de números, fechas, %
│       ├── ipiColors.ts                    # Colores semánticos para niveles de IPI
│       └── riskColors.ts                   # Colores para niveles de riesgo
├── tailwind.config.ts
├── vite.config.ts
└── tsconfig.json
```

---

## 6. DISEÑO DE UI/UX — ESPECIFICACIONES DETALLADAS

### Paleta de colores del producto

```css
/* Colores semánticos de ImpactFlow */
--color-brand-primary:    #4F46E5;   /* Índigo — acción principal */
--color-brand-secondary:  #6D28D9;   /* Violeta */
--color-risk-low:         #059669;   /* Verde — riesgo bajo */
--color-risk-medium:      #D97706;   /* Ámbar — riesgo medio */
--color-risk-high:        #DC2626;   /* Rojo — riesgo alto */
--color-dim-academic:     #3B82F6;   /* Azul — dimensión académica */
--color-dim-cognitive:    #8B5CF6;   /* Violeta — cognitiva */
--color-dim-social:       #10B981;   /* Verde — social */
--color-dim-integration:  #F59E0B;   /* Ámbar — integración */
```

### Pantalla 1: Quick Session Logger (prioridad UX máxima)

Esta pantalla es la más usada del sistema. Debe completarse en menos de **90 segundos**.

```
FLUJO:
1. El profesional abre la app al terminar una sesión
2. Selecciona participante(s) de la sesión (chips con avatar inicial)
3. Para cada participante:
   a. 4 bloques de estrellas (1-5): Académico | Cognitivo | Social | Integración
   b. Textarea opcional: "¿Algo destacable?" (debajo, en pequeño)
   c. Micro-objetivos del día: checkboxes simples
   d. Mood indicator: 5 emojis/iconos rápidos
4. Botón "Guardar sesión" — animación de confirmación satisfactoria

REGLAS DE DISEÑO:
- Sin campos obligatorios excepto al menos 1 dimensión puntuada
- Las estrellas deben ser táctiles (mín. 44px touch target)
- La nota cualitativa se analiza con IA en background (no bloquea el guardado)
- Guardar debe ser instantáneo (optimistic update)
- Feedback visual de guardado: checkmark animado + "Sessió guardada ✓"
```

### Pantalla 2: Dashboard Coordinador

Layout de 3 columnas en desktop, 1 columna en móvil:

```
COLUMNA IZQUIERDA (1/4):
- Métricas headline: Participants actius | IPI Promig | Risc Alt | Objectives/mes
- Botón "Generar informe trimestral"
- Feed d'alertes (participantes en riesgo — con nombre, riesgo y CTA)

COLUMNA CENTRAL (1/2):
- Gráfico de evolución IPI del programa (línea temporal — 12 meses)
  Con selector de dimensión: Todo | Acadèmic | Cognitiu | Social | Integració
- Gráfico de distribución de riesgo (donut): Baix / Mitjà / Alt
- "Progress by Center": barras comparativas por centro

COLUMNA DERECHA (1/4):
- Top 5 participantes con mayor progreso este trimestre
- Próximas evaluaciones pendientes
- Impact Score global del programa (número grande estilo OKR)
```

### Pantalla 3: Perfil del Participante

```
HEADER:
- Avatar con iniciales + código anonimizado (ej: "NRN-2024-001")
- Semanas en el programa | Último IPI | Trend (↑↓→)
- Risk Badge: LOW / MEDIUM / HIGH

TABS:
1. "Evolució" — Gráfico de línea D3.js del IPI histórico
   - Línea discontinua para predicción futura (shadowing)
   - Puntos de evaluación marcados
   - Tooltip en hover: fecha, IPI, % mejora vs. baseline
   - Radar chart con las 4 dimensiones (snapshot actual vs. baseline)

2. "Sessions" — Timeline de sesiones recientes
   - Cada sesión: fecha, profesional, puntuaciones, nota + análisis IA
   - Tags de la nota: chips de colores

3. "Micro-objectius" — Lista de objetivos agrupados por dimensión
   - Completados: tachados con fecha
   - Pendientes: con checkbox y fecha objetivo
   - Estadística: X/Y completados este mes

4. "Alertes" — Historial de alertas y intervenciones
```

### Pantalla 4: Portal de Donantes

```
URL pública: /impact/{org-slug}

HERO:
- "Your Impact, Visualized." + subtítulo
- 3 métricas hero: Nens atesos | Hores de reforç | Millora acadèmica mitjana

SECCIÓN "Before & After":
- Barra de progreso animada: Baseline (M0) → Actual (M6)
- Texto generado por IA: "El nostre programa millora la integració social un 40% en 6 mesos"

SECCIÓN "Success Stories" (anonimizadas):
- Tarjeta estilo "Mateo no podia llegir cap frase quan va arribar. 
  Avui és el primer en alçar la mà a l'hora del conte."
- Métrica: +120% Academic Growth
- Botón: "Augmenta el meu impacte →"

FOOTER:
- Sellos de transparencia: Fundació Lealtad "Dona amb confiança", DUP
```

---

## 7. FEATURES DETALLADAS POR MÓDULO

### Módulo A: Registro de Sesiones

- **Formulario post-sesión rápido** (<90 segundos): selección de participante, 4 escalas 1-5, nota libre opcional, micro-objetivos, mood indicator
- **Análisis IA de nota en background**: llama a `POST /api/v1/nlp/parse-note` → muestra tags extraídos al guardar (no bloquea)
- **Validación suave**: si el profesional no puntúa ninguna dimensión, muestra tooltip "¿Seguro que no quieres añadir ninguna puntuación?" (no es error duro)
- **Historial de sesiones**: timeline visual con mini-sparkline del IPI del día
- **Registro de asistencia**: integrado en el formulario de sesión (presente/ausente/tarde)

### Módulo B: Evaluaciones y Baseline

- **Wizard de evaluación inicial** (5 pasos): datos del participante → dimensión académica → dimensión cognitiva → dimensión social → resumen + IPI calculado en tiempo real
- **Evaluación periódica automatizada**: el sistema recuerda al coordinador cuando toca evaluar (cada 90 días por defecto)
- **Test comparativo**: muestra side-by-side baseline vs. evaluación actual vs. predicción
- **Exportar evaluación**: botón de descarga PDF con gráfico radar

### Módulo C: Dashboard y Analytics

- **Filtros globales**: por programa, centro, período (últimos 30d / 90d / 6m / 1a / personalizado), dimensión
- **Impact Score**: métrica compuesta del programa visible en grande (72.4 / 100)
- **Comparación de cohortes**: overlay de múltiples cohortes en el mismo gráfico de evolución
- **Heatmap de asistencia**: calendario tipo GitHub contribution graph
- **Distribución de IPI**: histograma de participantes por rango de IPI
- **Exportar datos**: CSV con todos los datos del período filtrado

### Módulo D: Sistema de Alertas

- **Alertas automáticas** (calculadas cada 24h por el scheduler):
  - Riesgo de abandono alto → notificación al coordinador con factores explicados
  - Participante sin sesión en >21 días
  - IPI en caída en 2 evaluaciones consecutivas
  - Micro-objetivo pendiente >30 días sin progreso
- **Panel de alertas**: filtro por gravedad, estado (nueva/vista/resuelta), participante
- **Acción rápida**: "Marcar como revisada" + campo de nota de intervención
- **Historial de alertas resueltas**: para justificar en subvenciones (% alumnos recuperados tras intervención)

### Módulo E: Generación de Informes

- **Tipos de informe**:
  - Informe trimestral (para subvenciones)
  - Informe anual para donantes
  - Perfil de evolución individual (anonimizado)
  - Comparación de cohortes
  - Resumen ejecutivo (2 páginas máximo)

- **Generación**: backend calcula métricas + genera narrativa con GPT-4o-mini → PDF renderizado con `react-pdf`

- **Plantilla PDF**: branding de la organización, gráficos exportados como SVG, frases de impacto generadas, sello de Fundació Lealtad

- **Personalización**: el coordinador puede editar la narrativa antes de descargar

### Módulo F: Gamificación (Micro-objetivos)

- **Plantillas de objetivos predefinidas** por dimensión y nivel:
  - Académica: "Llegir 10 minuts seguits", "Resoldre 5 problemes sense ajuda"
  - Cognitiva: "Completar una tasca sense interrupcions de 20 min"
  - Social: "Participar almenys 1 cop en activitat de grup"
  - Integración: "Explicar una cosa del seu país en català"
- **Asignación masiva**: aplicar plantilla a todos los participantes de un programa
- **Puntos**: cada objetivo tiene puntos (1-3 dificultad × 10 pts = 10/20/30 pts)
- **Vista del participante** (para mostrar en sesión, en pantalla del profesional): progreso visual con puntos acumulados
- **Analytics de objetivos**: % completados por dimensión, por mes, por participante

---

## 8. SEGURIDAD Y PRIVACIDAD

```python
# Consideraciones críticas de privacidad (datos de menores)

# 1. ANONIMIZACIÓN: Los participantes se identifican solo por código (NRN-2024-001)
#    Los nombres de pila se almacenan pero se ocultan en dashboards y exportaciones
#    por defecto. Solo el profesional asignado ve el nombre completo.

# 2. GDPR: 
#    - Campo consent_given en participants
#    - Endpoint DELETE /participants/{id}/data para borrado completo
#    - Logs de acceso a datos sensibles (audit trail)

# 3. AUTENTICACIÓN:
#    - JWT access tokens (15 min expiry) + refresh tokens (7 días)
#    - Rate limiting en endpoints de login (5 intentos, luego lockout 15 min)
#    - Refresh token rotation

# 4. AUTORIZACIÓN (row-level security):
#    - Los profesionales solo ven sus participantes asignados
#    - Los coordinadores ven toda su organización
#    - Los donantes ven solo métricas agregadas (sin datos individuales)

# 5. CIFRADO:
#    - Contraseñas: bcrypt con cost factor 12
#    - SQLite: habilitar SQLCipher para cifrado en reposo (opcional)
```

---

## 9. SEED DATA Y DEMO

Crear un script `scripts/seed_demo.py` que genere:

- 1 organización demo: "Narinan" con 3 centros
- 4 usuarios: admin, 2 coordinadores, 3 profesionales, 1 donante
- 2 programas: "Reforç escolar" + "Teatre Social"
- 50 participantes con distribución realista:
  - 30% grupo de control (`is_control_group=True`)
  - Nacionalidades: 40% Marruecos, 20% Pakistán, 15% Cataluña, 25% otros
  - Edades: 6-14 años
- Baseline assessments para todos
- 3 meses de sesiones históricas (simuladas)
- Evaluaciones periódicas con evolución realista (tendencia positiva del 70% de participantes)
- 15-20 participantes con riesgo calculado (5 alto, 8 medio, resto bajo)
- Micro-objetivos asignados y con completados parciales

La demo debe mostrar el "Before & After Effect" de forma impactante:
- IPI promedio en baseline: 38.5
- IPI promedio actual (M6): 56.2 → mejora del +46% relativo

---

## 10. COMANDOS Y CONFIGURACIÓN

### Makefile raíz

```makefile
.PHONY: install dev migrate seed test lint

install:
	cd apps/backend && pip install -e ".[dev]"
	cd apps/frontend && npm install

dev:
	make -j2 dev-backend dev-frontend

dev-backend:
	cd apps/backend && uvicorn app.main:app --reload --port 8000

dev-frontend:
	cd apps/frontend && npm run dev

migrate:
	cd apps/backend && alembic upgrade head

seed:
	cd apps/backend && python scripts/seed_demo.py

test:
	cd apps/backend && pytest --cov=app tests/
	cd apps/frontend && npm run test

lint:
	cd apps/backend && ruff check . && ruff format --check .
	cd apps/frontend && npm run lint

generate-types:
	cd apps/frontend && npx openapi-typescript http://localhost:8000/openapi.json -o src/types/api.ts
```

### Variables de entorno (.env)

```bash
# Backend
DATABASE_URL=sqlite+aiosqlite:///./impactflow.db
SECRET_KEY=your-super-secret-jwt-key-change-in-production
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=15
REFRESH_TOKEN_EXPIRE_DAYS=7
OPENAI_API_KEY=sk-...    # Opcional: si no está, usa fallback offline
ENVIRONMENT=development

# Frontend (Vite)
VITE_API_BASE_URL=http://localhost:8000/api/v1
```

---

## 11. CRITERIOS DE CALIDAD Y PERFORMANCE

- **Tiempo de carga inicial** (frontend): < 2 segundos (con code splitting por ruta)
- **Quick Session Logger**: guardar en < 500ms (optimistic update + background sync)
- **Cálculo de IPI**: < 50ms (es local, sin red)
- **Generación de informe**: < 30 segundos (mostrar progress bar con polling)
- **Dashboard principal**: < 1 segundo (métricas cacheadas en TanStack Query, 5 min TTL)
- **Tests de algoritmos IPI y Risk Engine**: cobertura > 90%
- **Responsive**: funcional en móvil (el profesional registra desde el teléfono)

---

## 12. ORDEN DE IMPLEMENTACIÓN SUGERIDO

```
FASE 1 — Core MVP (3-4 semanas):
  ✓ Setup monorepo, DB, migraciones, auth JWT
  ✓ CRUD participantes + baseline assessment
  ✓ Algoritmo IPI (con tests)
  ✓ Quick Session Logger (pantalla más importante)
  ✓ Dashboard coordinador básico

FASE 2 — Analytics (2 semanas):
  ✓ Algoritmo Risk Score
  ✓ Predictor longitudinal
  ✓ Gráficos de evolución (D3.js)
  ✓ Panel de alertas

FASE 3 — IA y Reportes (2 semanas):
  ✓ NLP Service (interpretación notas)
  ✓ Generación automática de informes
  ✓ Exportación PDF

FASE 4 — Gamificación + Portal Donantes (1 semana):
  ✓ Módulo micro-objetivos
  ✓ Portal público de donantes
  ✓ Seed data demo

FASE 5 — Polish (1 semana):
  ✓ Animaciones Framer Motion
  ✓ Notificaciones push (APScheduler)
  ✓ Tests E2E
  ✓ Optimizaciones de rendimiento
```

---

*ImpactFlow — "Fem visible el canvi que abans era invisible."*
*Prompt versión 1.0 — Ahmed Assbaghi, Oriol Ribas, Ivan Rodríguez, Francisco Ruiz*
