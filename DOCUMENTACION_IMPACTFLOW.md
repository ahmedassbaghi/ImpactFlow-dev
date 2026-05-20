# ImpactFlow — Documentación técnica y funcional completa

> **Versión del documento:** generada a partir del estado del repositorio `ImpactFlow-dev`  
> **Propósito:** referencia exhaustiva de módulos, funcionalidades, arquitectura, API, algoritmos y flujos de usuario.

---

## Tabla de contenidos

1. [Visión general](#1-visión-general)
2. [Arquitectura del sistema](#2-arquitectura-del-sistema)
3. [Stack tecnológico](#3-stack-tecnológico)
4. [Estructura del repositorio](#4-estructura-del-repositorio)
5. [Modelo de dominio y base de datos](#5-modelo-de-dominio-y-base-de-datos)
6. [Índice de Progreso Integral (IPI)](#6-índice-de-progreso-integral-ipi)
7. [Motor de algoritmos y analítica](#7-motor-de-algoritmos-y-analítica)
8. [API REST — catálogo completo de endpoints](#8-api-rest--catálogo-completo-de-endpoints)
9. [Autenticación, roles y control de acceso](#9-autenticación-roles-y-control-de-acceso)
10. [Flujos de negocio principales](#10-flujos-de-negocio-principales)
11. [Frontend — arquitectura y rutas](#11-frontend--arquitectura-y-rutas)
12. [Frontend — páginas por rol](#12-frontend--páginas-por-rol)
13. [Frontend — módulos API cliente](#13-frontend--módulos-api-cliente)
14. [Frontend — componentes clave](#14-frontend--componentes-clave)
15. [Frontend — estado global y estilos](#15-frontend--estado-global-y-estilos)
16. [WebSocket y alertas en tiempo real](#16-websocket-y-alertas-en-tiempo-real)
17. [Configuración, variables de entorno y ejecución local](#17-configuración-variables-de-entorno-y-ejecución-local)
18. [Scripts, seed y datos de demostración](#18-scripts-seed-y-datos-de-demostración)
19. [Pruebas y calidad](#19-pruebas-y-calidad)
20. [Limitaciones conocidas y deuda técnica](#20-limitaciones-conocidas-y-deuda-técnica)
21. [Índice de archivos por carpeta](#21-índice-de-archivos-por-carpeta)

---

## 1. Visión general

**ImpactFlow** es una plataforma de medición de impacto social orientada a programas educativos y de integración (contexto Fundación Narinaan / Cataluña). Permite:

- **Capturar evidencia** de intervención (sesiones, observaciones por participante, asistencia, notas cualitativas).
- **Calcular el IPI** (Índex de Progrés Integral): índice 0–100 agregado en cuatro dimensiones.
- **Detectar riesgo** y probabilidad de abandono por participante.
- **Predecir evolución** del IPI con intervalos de confianza y simulación Monte Carlo.
- **Segmentar perfiles** (clustering K-means) y recomendar micro-objectius.
- **Generar evidencia estadística** para coordinación y donantes: Cohen's d, Wilcoxon, bootstrap CI, ICC, SROI, análisis de cohortes, dosis-respuesta, anomalías en trayectorias.
- **Portal del donante** público con métricas de impacto y calculadora SROI.
- **Experiencia móvil** para voluntarios/profesionales y **escritorio** para coordinadores/administradores.

### Roles de usuario

| Rol (`User.role`) | Interfaz principal | Capacidades resumidas |
|-------------------|-------------------|------------------------|
| `admin` | `AppShell` (escritorio) | Todo lo de coordinador + centro de control admin |
| `coordinator` | `AppShell` (escritorio) | Gestión org: programas, escuelas, usuarios, informes, analítica avanzada |
| `professional` | `MobileShell` (móvil) | Registro de sesiones, seguimiento, historial y perfil de **alumnos asignados** |
| `donor` | `MobileShell` (móvil) | Portal de impacto (sin login obligatorio en la ruta pública) |
| `viewer` | `MobileShell` | Igual que donante en navegación |

### Organización demo

- **Nombre:** Narinan  
- **Slug:** `narinan` (usado en portal donante y landing pública)  
- **Plan por defecto en seed:** `pro`

---

## 2. Arquitectura del sistema

```
┌─────────────────────────────────────────────────────────────────┐
│                        Navegador (cliente)                       │
│  React 18 + Vite + React Router + TanStack Query + Zustand       │
│  ┌──────────────────┐  ┌──────────────────┐  ┌───────────────┐ │
│  │ AppShell         │  │ MobileShell      │  │ ImpactPortal  │ │
│  │ coord / admin    │  │ prof / donor     │  │ (público)     │ │
│  └────────┬─────────┘  └────────┬─────────┘  └───────┬───────┘ │
└───────────┼─────────────────────┼────────────────────┼─────────┘
            │ HTTP/WS             │                    │
            ▼                     ▼                    ▼
┌─────────────────────────────────────────────────────────────────┐
│              FastAPI (`apps/backend/app/main.py`)                │
│  Prefix: `/api/v1`                                               │
│  ┌─────────────┐ ┌──────────────┐ ┌─────────────────────────┐ │
│  │ Auth JWT    │ │ CRUD dominio │ │ Algoritmos + analytics    │ │
│  └─────────────┘ └──────────────┘ └─────────────────────────┘ │
│  ┌─────────────┐ ┌──────────────┐ ┌─────────────────────────┐ │
│  │ NLP notes   │ │ Report gen   │ │ WebSocket alertas         │ │
│  └─────────────┘ └──────────────┘ └─────────────────────────┘ │
└────────────────────────────┬────────────────────────────────────┘
                             │ SQLAlchemy async
                             ▼
                    ┌─────────────────┐
                    │ SQLite (dev)    │
                    │ impactflow.db   │
                    └─────────────────┘
```

### Principios arquitectónicos

- **Monorepo** con `apps/backend` y `apps/frontend` independientes.
- **API-first:** el frontend consume REST JSON; no hay SSR.
- **Multi-tenant por organización:** casi todas las consultas filtran por `current_user.organization_id`.
- **Scope profesional:** el rol `professional` solo ve participantes en `user_participant_assignments` y sesiones propias o con observaciones de sus asignados.
- **Evidencia → métricas:** las observaciones de sesión pueden **actualizar automáticamente** una `PeriodicAssessment` del mismo día (`upsert_periodic_from_observation`).

---

## 3. Stack tecnológico

### Backend (`apps/backend`)

| Componente | Tecnología |
|------------|------------|
| Runtime | Python 3.11+ |
| Framework HTTP | FastAPI |
| Servidor ASGI | Uvicorn |
| ORM | SQLAlchemy 2.0 (modo async) |
| BD desarrollo | SQLite + `aiosqlite` |
| Validación | Pydantic v2 (`app/schemas/api.py`) |
| Auth | JWT (`python-jose`), contraseñas `passlib` (pbkdf2_sha256) |
| Ciencia de datos | NumPy, SciPy |
| NLP opcional | OpenAI GPT-4o-mini (`OPENAI_API_KEY`) |

### Frontend (`apps/frontend`)

| Componente | Tecnología |
|------------|------------|
| UI | React 18 + TypeScript |
| Build | Vite 5 |
| Routing | React Router 6 |
| Datos servidor | TanStack React Query v5 |
| Estado cliente | Zustand |
| HTTP | Axios |
| Gráficos | Recharts |
| Animación | Framer Motion |
| Iconos | Lucide React |
| Formularios | React Hook Form + Zod (donde aplica) |
| Estilos | CSS global modular (sin Tailwind) |

---

## 4. Estructura del repositorio

```
ImpactFlow-dev/
├── DOCUMENTACION_IMPACTFLOW.md    ← este archivo
├── README.md
├── Makefile
├── start.bat / start.ps1
├── ImpactFlow_Dev_Prompt.md
├── apps/
│   ├── backend/
│   │   ├── app/
│   │   │   ├── main.py              # ~2600 líneas: todos los endpoints
│   │   │   ├── config.py
│   │   │   ├── database.py
│   │   │   ├── algorithms/          # IPI, riesgo, predicción, SROI, etc.
│   │   │   ├── analytics/           # cohortes, anomalías, ICC
│   │   │   ├── migrations/migrate_v2.py
│   │   │   ├── models/core.py       # modelos SQLAlchemy canónicos
│   │   │   ├── routes/schools_and_assignments.py
│   │   │   ├── schemas/api.py
│   │   │   ├── services/            # NLP, informes, analytics sesión
│   │   │   └── utils/               # auth, access_control, métricas
│   │   ├── scripts/                 # seed, backfill, batería de pruebas
│   │   ├── tests/
│   │   ├── impactflow.db
│   │   ├── run_local_backend.py
│   │   └── pyproject.toml
│   └── frontend/
│       ├── src/
│       │   ├── App.tsx
│       │   ├── main.tsx
│       │   ├── api/                 # clientes HTTP por dominio
│       │   ├── pages/               # pantallas por rol
│       │   ├── components/          # UI reutilizable
│       │   ├── stores/
│       │   ├── hooks/
│       │   ├── utils/
│       │   └── styles/
│       ├── public/
│       ├── vite.config.ts
│       └── package.json
```

---

## 5. Modelo de dominio y base de datos

**Fuente canónica:** `apps/backend/app/models/core.py`  
**Migración imperativa:** `apps/backend/app/migrations/migrate_v2.py` (no Alembic activo en runtime; `create_all` + migrate_v2 al arranque).

### Entidades principales

#### `organizations`

| Campo | Descripción |
|-------|-------------|
| `id`, `name`, `slug` | Identidad y URL pública (`slug` único) |
| `plan` | Tier: free / starter / pro / enterprise |
| `participant_code_pattern` | Patrón de código, ej. `{abbr}-{year}-{seq:03}` |
| `landing_content` | JSON de secciones para landing donante |

#### `schools`

Centros educativos de la organización. `abbreviation` única por org (ej. `ESF`, `IMO`, `ELC`).

#### `users`

| Campo | Descripción |
|-------|-------------|
| `email` | Único global |
| `role` | admin / coordinator / professional / donor |
| `organization_id` | FK |
| `hashed_password` | pbkdf2_sha256 |

#### `programs`

Programas de intervención (`program_type`, fechas, `active`).

#### `participants` (alumnos/participantes)

| Campo | Descripción |
|-------|-------------|
| `code` | Único (generado por patrón org + escuela) |
| `first_name`, `birth_year`, `gender`, `nationality` |
| `school_id` | FK obligatoria |
| `enrollment_date`, `consent_given`, `is_control_group`, `active` |

#### `program_enrollments`

Inscripción participante ↔ programa. Restricción única `(program_id, participant_id)`.

#### `user_participant_assignments`

Asignación voluntario/profesional ↔ participante. Base del **scope profesional**.

#### `baseline_assessments`

Evaluación inicial con **11 indicadores** (escala 1–5) → `ipi_baseline`. Una por `(participant_id, program_id)`.

Indicadores agrupados:

- **Académico:** lectura, matemáticas, comprensión  
- **Cognitivo:** atención, memoria, autonomía  
- **Social:** interacción pares, trabajo en grupo, regulación emocional  
- **Integración:** fluidez lingüística, adaptación cultural  

#### `periodic_assessments`

Evaluaciones periódicas (M3, M6, `session_auto`, follow-up, etc.) con mismos 11 campos + `ipi_score`, `ipi_delta_vs_baseline`, `risk_score`, `risk_level`, `predicted_next_ipi`.

#### `sessions`

| Campo | Descripción |
|-------|-------------|
| `program_id`, `professional_id` | Contexto y autor |
| `session_date`, `session_type` | group / individual / assessment / workshop / follow_up |
| `duration_minutes`, `notes` | Metadatos |
| `notes_ai_summary`, `notes_sentiment` | NLP de notas de sesión |

#### `session_observations`

Una fila por participante en la sesión:

- Puntuaciones 1–5: `academic_score`, `cognitive_score`, `social_score`, `integration_score`
- `qualitative_note`, `mood_indicator`, `qualitative_note_parsed_tags`
- Único `(session_id, participant_id)`

#### `attendance_records`

Registro de asistencia ligado a sesión/programa/fecha.

#### Micro-objectius (dos niveles)

1. **`micro_goals` / `micro_goal_completions`** — por participante (modelo legacy en parte del código).
2. **`program_micro_goals` / `program_micro_goal_completions`** — por programa; usados en seed, completados desde `create_session`.

#### `reports`

Informes trimestrales generados (`content_json`, `status`, `report_type`).

### Diagrama relacional simplificado

```
Organization ─┬─ School ─── Participant ─┬─ ProgramEnrollment ─── Program
                │                         ├─ BaselineAssessment
                ├─ User                   ├─ PeriodicAssessment
                │    └─ UserParticipantAssignment
                └─ Program ─── Session ─── SessionObservation
                                    └─ AttendanceRecord
```

---

## 6. Índice de Progreso Integral (IPI)

**Implementación:** `apps/backend/app/algorithms/ipi.py`

### Dimensiones y pesos por defecto

| Dimensión | Peso | Indicadores (media 1–5) |
|-----------|------|-------------------------|
| Académico | 35% | lectura, matemáticas, comprensión |
| Cognitivo | 25% | atención, memoria, autonomía |
| Social | 25% | interacción, trabajo en grupo, regulación emocional |
| Integración | 15% | fluidez lingüística, adaptación cultural |

### Cálculo

1. Media por dimensión de sus indicadores (ignorando `null`).
2. Normalización lineal 1–5 → 0–100 por dimensión.
3. IPI = media ponderada de dimensiones disponibles; **renormalización de pesos** si falta alguna dimensión.
4. `completeness`: fracción de dimensiones con dato.

### Uso en la aplicación

- **Baseline:** `POST /participants/{id}/baseline` → guarda 11 niveles + `ipi_baseline`.
- **Sesión:** scores 1–5 por dimensión en observación → mapeo a indicadores (cada dimensión replica su valor en sus 3 o 2 campos) → `upsert_periodic_from_observation`.
- **Seguiment móvil:** `POST /assessments/follow-up` escala 0–10 convertida a IPI.
- **Evolución:** serie temporal de `periodic_assessments` en `GET /participants/{id}/evolution`.

### Mejora relativa

`calculate_relative_improvement(baseline_ipi, current_ipi)` — usado en dashboards e informes.

---

## 7. Motor de algoritmos y analítica

### 7.1 `risk_engine.py` — Motor de riesgo

Combina ~11 factores ponderados:

- Asistencia últimos 30 días vs periodo anterior  
- Delta IPI último periodo  
- Tasa de cumplimiento de micro-objectius  
- Ausencias injustificadas  
- Media de ánimo en últimas sesiones  
- Semanas en programa / inactividad  
- Tendencia y volatilidad de sesiones  
- Calidad de evidencia / engagement / sentimiento de notas  

**Salida:** `risk_score` (0–1), `risk_level`: `low` | `medium` | `high`, `contributing_factors[]`.

### 7.2 `predictor.py` — Predicción IPI

- `predict_next_ipi()` — media ponderada + regresión OLS sobre histórico.  
- `predict_ipi_with_uncertainty()` — IC bootstrap o paramétrico.  
- `probability_of_reaching_target()` — Monte Carlo para P(IPI ≥ objetivo).

Endpoint: `GET /participants/{id}/prediction-probabilistic`.

### 7.3 `dropout_model.py` — Abandono

Heurística tipo logística sobre bundle de features de `session_analytics_service`:

- `dropout_probability_30d`, `dropout_probability_60d`  
- `recommended_intervention` (texto)

Endpoint: `GET /analytics/dropout-probability/{participant_id}`.

### 7.4 `segmentation.py` — Perfiles K-means

Clustering en 4 dimensiones de baseline → etiquetas semánticas (ej. perfil académico débil, integración lenta) + `strategy` + `recommended_goals[]`.

Endpoint: `GET /participants/{id}/profile-cluster`.

### 7.5 `sroi_engine.py` + `monte_carlo_sroi.py`

**SROI Network 2012** adaptado a proxies catalanes:

- Valor social monetizado (educación, empleo, salud mental, cohesión social)  
- Ajustes: deadweight, attribution, drop-off  
- Escenarios de sensibilidad  

Endpoints: `GET /analytics/sroi`, `GET /analytics/sroi-monte-carlo`, `GET /dashboard/donor/{org_slug}/sroi`.

### 7.6 `effect_analysis.py` + `dimension_effects.py`

- Cohen's d dentro de sujetos (dz)  
- Wilcoxon, Mann-Whitney  
- Bootstrap CI 95%  
- Comparación con benchmarks Hattie (dimension_effects)

Endpoints: `GET /analytics/intervention-effect`, `GET /analytics/dimension-effects`.

### 7.7 `dose_response.py`

Curva Hill (n=1) sesiones/horas vs delta IPI; dosis óptima al 90% Vmax.

Endpoint: `GET /analytics/dose-response?dose_type=sessions|hours`.

### 7.8 `causal_inference.py`

Difference-in-differences + Welch + bootstrap — **implementado pero sin endpoint HTTP** (deuda técnica).

### 7.9 Módulos `analytics/`

| Archivo | Función |
|---------|---------|
| `cohort_analysis.py` | Trayectorias por cohorte de alta, retención 3/6/9/12 meses, velocidad por dimensión |
| `anomaly_detection.py` | Plateau, regresión, breakthrough por participante |
| `reliability.py` | ICC(2,1) fiabilidad inter-evaluador por dimensión |

### 7.10 Servicios auxiliares

| Archivo | Función |
|---------|---------|
| `session_analytics_service.py` | `build_participant_feature_bundle()` — agrega asistencia, mood, goals, sentimiento para riesgo/dropout |
| `nlp_service.py` | `parse_qualitative_note()` — GPT-4o-mini o fallback por keywords → summary, sentiment, tags |
| `report_generator.py` | Informe trimestral JSON + resumen calidad de sesiones |
| `participant_metrics.py` | Payload de evolución, upsert periódico desde sesión |

---

## 8. API REST — catálogo completo de endpoints

**Prefijo base:** `/api/v1` (configurable `API_PREFIX`)

### Salud y raíz

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| GET | `/` | No | Mensaje de bienvenida API |
| GET | `/api/v1/health` | No | Health check |

### Autenticación

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| POST | `/api/v1/auth/login` | No | Login email/password → `access_token`, `refresh_token`, `role`, `user_id` |

> **Nota:** No existe endpoint `/auth/refresh`; el refresh token se emite pero no se consume.

### Usuarios y organización

| Método | Ruta | Roles | Descripción |
|--------|------|-------|-------------|
| GET | `/api/v1/users` | admin, coordinator | Listar usuarios de la org |
| POST | `/api/v1/users` | admin, coordinator | Crear usuario |
| GET | `/api/v1/organizations/me/plan` | autenticado | Plan actual |
| PATCH | `/api/v1/organizations/me/plan` | admin, coordinator | Cambiar plan |
| GET | `/api/v1/organization/settings` | admin, coordinator | Patrón de código participante |
| PATCH | `/api/v1/organization/settings` | admin, coordinator | Actualizar patrón |
| GET | `/api/v1/organization/landing` | **Público** (`org_slug`) | Contenido landing JSON |
| PATCH | `/api/v1/organization/landing` | admin, coordinator | Editar landing |

### Escuelas y asignaciones (`routes/schools_and_assignments.py`)

| Método | Ruta | Roles | Descripción |
|--------|------|-------|-------------|
| GET | `/api/v1/schools` | autenticado | Listar escuelas + conteo participantes |
| POST | `/api/v1/schools` | admin, coordinator | Crear escuela |
| PATCH | `/api/v1/schools/{id}` | admin, coordinator | Actualizar |
| DELETE | `/api/v1/schools/{id}` | admin, coordinator | Borrar (si sin participantes) |
| GET | `/api/v1/schools/{id}/participants` | autenticado | Participantes de la escuela |
| GET | `/api/v1/users/{id}/participants` | admin, coordinator | Asignaciones de un usuario |
| PUT | `/api/v1/users/{id}/participants` | admin, coordinator | Reemplazar set de asignaciones |

### Programas

| Método | Ruta | Roles | Descripción |
|--------|------|-------|-------------|
| GET | `/api/v1/programs` | autenticado | Listar (`active_only`) |
| POST | `/api/v1/programs` | admin, coordinator | Crear |
| GET | `/api/v1/programs/{id}` | autenticado | Detalle |
| PUT | `/api/v1/programs/{id}` | admin, coordinator | Actualizar |
| DELETE | `/api/v1/programs/{id}` | admin, coordinator | Eliminar |

### Participantes

| Método | Ruta | Roles | Descripción |
|--------|------|-------|-------------|
| GET | `/api/v1/participants` | autenticado | Listar; `program_id`, `school_id`, `not_in_program`; **professional: solo asignados** |
| POST | `/api/v1/participants` | **admin, coordinator** | Crear (+ código auto, opcional enroll) |
| GET | `/api/v1/participants/{id}` | autenticado | Detalle (+ check asignación si professional) |
| PATCH | `/api/v1/participants/{id}` | admin, coordinator | Actualizar |
| POST | `/api/v1/participants/next-code` | admin, coordinator, professional | Vista previa siguiente código |
| GET | `/api/v1/participants/{id}/programs` | autenticado | Programas del participante |
| POST | `/api/v1/participants/{id}/baseline` | admin, coordinator, professional | Crear baseline + IPI |
| GET | `/api/v1/participants/{id}/evolution` | autenticado | Timeline IPI, dimensiones, predicción |
| GET | `/api/v1/participants/{id}/risk` | autenticado | Riesgo actual |
| GET | `/api/v1/participants/{id}/prediction-probabilistic` | autenticado | Predicción + IC + probabilidad objetivo |
| GET | `/api/v1/participants/{id}/profile-cluster` | autenticado | Perfil K-means |

### Inscripción en programas

| Método | Ruta | Roles | Descripción |
|--------|------|-------|-------------|
| GET | `/api/v1/programs/{id}/participants` | autenticado | Inscritos |
| POST | `/api/v1/programs/{id}/participants` | admin, coordinator, professional | Inscribir |
| DELETE | `/api/v1/programs/{id}/participants/{pid}` | admin, coordinator, professional | Baja |

### Sesiones

| Método | Ruta | Roles | Descripción |
|--------|------|-------|-------------|
| GET | `/api/v1/sessions` | autenticado | Listar; filtros; **incluye `participants[]` con nombre/código**; professional: filtrado |
| POST | `/api/v1/sessions` | admin, coordinator, professional | Crear sesión + observaciones + asistencia + goals + upsert periódico |
| GET | `/api/v1/sessions/{id}` | autenticado | Detalle sesión |
| GET | `/api/v1/sessions/{id}/observations` | autenticado | Observaciones |
| PATCH | `/api/v1/sessions/{id}/observations` | admin, coordinator, professional | Actualizar observaciones en bloque |

**Payload crear sesión (`SessionCreate`):**

```json
{
  "program_id": "uuid",
  "session_date": "2026-05-20",
  "session_type": "group",
  "duration_minutes": 45,
  "notes": "texto libre",
  "observations": [{
    "participant_id": "uuid",
    "academic_score": 4,
    "cognitive_score": 3,
    "social_score": 4,
    "integration_score": 3,
    "qualitative_note": "...",
    "mood_indicator": "good",
    "attendance_status": "present"
  }],
  "micro_goal_completions": [{ "goal_id": "uuid", "note": "..." }]
}
```

### Evaluaciones

| Método | Ruta | Roles | Descripción |
|--------|------|-------|-------------|
| POST | `/api/v1/assessments/periodic` | admin, coordinator, professional | Evaluación periódica completa (11 indicadores) |
| POST | `/api/v1/assessments/follow-up` | admin, coordinator, professional | Seguimiento móvil (4 dimensiones 0–10) |
| GET | `/api/v1/assessments/cohort-comparison` | autenticado | Comparación grupo control vs intervención |

### Dashboards

| Método | Ruta | Roles | Descripción |
|--------|------|-------|-------------|
| GET | `/api/v1/dashboard/professional` | professional, coordinator, admin | KPIs voluntario |
| GET | `/api/v1/dashboard/coordinator` | coordinator, admin | Dashboard org amplio |
| GET | `/api/v1/dashboard/donor/{org_slug}` | **Público** | Portal donante |
| GET | `/api/v1/dashboard/donor/{org_slug}/sroi` | **Público** | SROI donante |

### Micro-objectius

| Método | Ruta | Roles | Descripción |
|--------|------|-------|-------------|
| GET | `/api/v1/micro-goals/templates` | **Público** | Plantillas estáticas |
| GET | `/api/v1/micro-goals` | autenticado | Listar por programa |
| POST | `/api/v1/micro-goals` | professional, coordinator, admin | Crear |
| POST | `/api/v1/micro-goals/{id}/complete` | professional, coordinator, admin | Completar |

### Informes

| Método | Ruta | Roles | Descripción |
|--------|------|-------|-------------|
| POST | `/api/v1/reports/generate` | coordinator, admin | Generar informe trimestral |
| GET | `/api/v1/reports` | autenticado | Listar informes |
| GET | `/api/v1/reports/{id}/status` | autenticado | Estado |
| GET | `/api/v1/reports/{id}/download` | autenticado | Descargar JSON/contenido |

### Analítica (`/api/v1/analytics/*`)

| Endpoint | Descripción |
|----------|-------------|
| `ipi-distribution` | Histograma IPI por programa/periodo |
| `trend` | Tendencia mensual IPI |
| `impact-statement` | Narrativa de impacto |
| `session-quality` | KPIs calidad evidencia sesiones |
| `cost-effectiveness` | Coste por punto IPI |
| `intervention-effect` | Cohen's d, Wilcoxon, bootstrap |
| `dropout-probability/{participant_id}` | Abandono 30/60 días |
| `participant-segments` | Segmentación K-means cohorte |
| `cohort-trajectories` | Curvas por cohorte de alta |
| `cohort-retention` | Retención 3/6/9/12 meses |
| `dimension-velocity` | Velocidad mejora por dimensión |
| `sroi` | SROI autenticado |
| `sroi-monte-carlo` | Incertidumbre SROI |
| `inter-rater-reliability` | ICC por dimensión |
| `dimension-effects` | Cohen's dz por dimensión |
| `dose-response` | Curva dosis-respuesta |
| `trajectory-anomalies` | Anomalías en trayectoria |
| `evidence-export` | Paquete evidencia estilo OECD DAC |

### NLP

| Método | Ruta | Roles | Descripción |
|--------|------|-------|-------------|
| POST | `/api/v1/nlp/parse-note` | professional, coordinator, admin | Parsear nota cualitativa |

### WebSocket

| Ruta | Auth | Descripción |
|------|------|-------------|
| `WS /api/v1/ws/alerts/{organization_id}` | No | Poll alertas alto riesgo cada 30s |

---

## 9. Autenticación, roles y control de acceso

### Archivos

- `app/utils/auth.py` — hash y JWT  
- `app/utils/deps.py` — `get_current_user`, `require_roles`  
- `app/utils/access_control.py` — scope org y asignaciones  

### JWT

| Token | TTL por defecto | Claims |
|-------|-----------------|--------|
| Access | 15 min | `sub` (user id), `type=access`, `role`, `org_id` |
| Refresh | 7 días | `type=refresh` (sin endpoint de renovación) |

### `AUTH_BYPASS` (desarrollo)

Por defecto `AUTH_BYPASS=true` en `config.py`:

- Sin token o token inválido → se usa el **primer usuario** de la BD.  
- `require_roles` **no aplica** restricción de rol.  
- **Producción:** debe desactivarse y configurar `SECRET_KEY` seguro.

### Reglas de acceso profesional

```text
list_participants (professional) → solo IDs en user_participant_assignments
list_sessions (professional)     → professional_id = yo OR observación de asignado
get_participant / evolution      → assert_professional_assigned()
create_participant               → SOLO admin, coordinator (no professional)
```

Funciones clave en `access_control.py`:

- `get_org_program`, `get_org_participant`  
- `assert_professional_assigned`  
- `ensure_participant_access`  
- `assign_participant_to_professional` (auto-asignación al inscribir/crear en algunos flujos)

---

## 10. Flujos de negocio principales

### 10.1 Alta de participante (solo coordinación)

```
Coordinador → ParticipantsPage → POST /participants
  → valida escuela en org
  → genera código (participant_code_pattern + abreviatura escuela)
  → opcional: inscripción en programa
  → NO disponible para rol professional en UI ni API
```

### 10.2 Asignación voluntario ↔ alumno

```
Coordinador → UsersRolesPage → PUT /users/{id}/participants
  → reemplaza lista de participant_ids
Profesional solo ve participantes asignados en listados y perfiles
```

### 10.3 Registro de sesión (voluntario)

```
/professional/session-logger (VolunteerSessionHub)
  → pestaña Llista: filtrar programa/escuela, elegir alumno
  → pestaña Registrar: QuickSessionLogger (volunteerMode)
      → solo Estrelles + Estrella radial (OutcomesStar)
      → 4 dimensiones, mood, asistencia, notas, micro-goals programa
  → POST /sessions
      → NLP en notas sesión y cualitativas
      → AttendanceRecord por observación
      → upsert PeriodicAssessment (mismo día/programa)
  → invalida queries participant-evolution en frontend
```

### 10.4 Historial de sesiones

```
/coordinator/sessions
  → GET /sessions (orden session_date DESC, created_at DESC)
  → cada ítem incluye participants: [{ id, first_name, code }]
  → drawer: GET /sessions/{id}/observations
  → nombres resueltos desde participants de la sesión (no solo lista local)
```

### 10.5 Perfil de participante

```
/coordinator/participants/:id?program_id=...
  → GET /participants/{id}        → nombre, código, escuela (fuente principal UI)
  → GET /participants/{id}/evolution
  → GET /participants/{id}/risk (requiere program_id)
  → Tabs coordinador: Baseline | Evolució | Predicció | Anàlisi | Alertes
  → Tabs voluntario: solo Evolució + cabecera móvil con nombre real
```

### 10.6 Seguiment (evaluación follow-up móvil)

```
/voluntari/seguiment
  → modal por participante
  → POST /assessments/follow-up
```

### 10.7 Dashboard coordinador

```
/coordinator/dashboard
  → GET /dashboard/coordinator
  → gráficos: distribución IPI, tendencia, efecto intervención, calidad sesiones
  → generación informe → POST /reports/generate
```

### 10.8 Portal donante

```
/donor/impact-portal (sin ProtectedRoute obligatorio)
  → GET /dashboard/donor/narinan
  → GET /dashboard/donor/narinan/sroi
  → UI donor-ui.css, animaciones KPI
```

### 10.9 Pipeline evidencia → analítica

```text
Sesión/Observación → PeriodicAssessment (IPI, riesgo)
                  → Dashboards / Advanced analytics / Donor portal
                  → WebSocket si risk_level alto
```

---

## 11. Frontend — arquitectura y rutas

**Entrada:** `src/main.tsx` → `QueryClientProvider` + `BrowserRouter` + `App` + estilos globales.

### Guard de rutas (`App.tsx`)

`ProtectedRoute`:

1. Sin `accessToken` → `/login`  
2. Rol no permitido → `/donor/impact-portal`  
3. OK → `RoleLayout` (elige shell)

### `RoleLayout` (`MobileShell.tsx`)

| Roles | Shell |
|-------|-------|
| `coordinator`, `admin` | `AppShell` (escritorio) |
| `professional`, `donor`, `viewer` | `MobileShell` (móvil) |

### Ruta por defecto (`*`)

| Rol | Destino |
|-----|---------|
| `professional` | `/professional/session-logger` |
| `admin` | `/admin/control-center` |
| `coordinator` | `/coordinator/dashboard` |
| otro | `/donor/impact-portal` |

### Tabla completa de rutas

| Ruta | Componente | Roles permitidos |
|------|--------------|------------------|
| `/login` | `Login.tsx` | Público |
| `/voluntari/session-logger` | redirect → `/professional/session-logger` | — |
| `/admin/control-center` | `AdminControlCenter.tsx` | admin |
| `/overview` | `Overview.tsx` | todos los roles autenticados |
| `/professional/session-logger` | `SessionLogger.tsx` | professional, coordinator, admin |
| `/voluntari/progress` | `ProgressPage.tsx` | professional, coordinator, admin |
| `/voluntari/seguiment` | `SeguimentPage.tsx` | professional, coordinator, admin |
| `/coordinator/dashboard` | `ProgramDashboard.tsx` | coordinator, admin |
| `/coordinator/schools` | `SchoolsPage.tsx` | coordinator, admin |
| `/coordinator/gestio` | `GestioPage.tsx` | coordinator, admin |
| `/coordinator/landing` | `LandingEditorPage.tsx` | coordinator, admin |
| `/coordinator/reports` | `ReportsPage.tsx` | coordinator, admin |
| `/coordinator/micro-goals` | `MicroGoalsPage.tsx` | + professional |
| `/coordinator/participants` | `ParticipantsPage.tsx` | + professional |
| `/coordinator/participants/:id` | `ParticipantProfile.tsx` | + professional |
| `/coordinator/programs` | `ProgramsPage.tsx` | coordinator, admin |
| `/coordinator/sessions` | `SessionsHistoryPage.tsx` | + professional |
| `/coordinator/advanced` | `AdvancedAnalyticsPage.tsx` | coordinator, admin |
| `/coordinator/users` | `UsersRolesPage.tsx` | coordinator, admin |
| `/settings/plans` | `PlansPage.tsx` | coordinator, admin |
| `/donor/impact-portal` | `ImpactPortal.tsx` | Público (solo RoleLayout) |

### Navegación móvil voluntario (`VOLUNTEER_LINKS`)

1. **Registre** → `/professional/session-logger`  
2. **Historial** → `/coordinator/sessions`  
3. **Alumnes** → `/coordinator/participants`  
4. **Progrés** → `/voluntari/progress`  
5. **Seguiment** → `/voluntari/seguiment`  

---

## 12. Frontend — páginas por rol

### Login (`pages/Login.tsx`)

- Panel dividido; accesos demo: coordinador, voluntario, donante.  
- `POST /auth/login` → `authStore.setAuth` (localStorage).  
- Redirección por rol.

### Admin — `AdminControlCenter.tsx`

Catálogo estático de funcionalidades con enlaces a rutas (hub de administración).

### Coordinador — `pages/coordinator/`

| Página | Funcionalidad detallada |
|--------|-------------------------|
| `ProgramDashboard.tsx` | KPIs 365 días; gráficos IPI, tendencia, efecto intervención, calidad sesiones, cost-effectiveness; generar informe |
| `ParticipantsPage.tsx` | Lista con búsqueda/filtros; crear participante (modal); inscribir en programa; tabla escritorio / lista móvil voluntario **sin botones de alta** |
| `ParticipantProfile.tsx` | Perfil analítico completo; gráficos Recharts; gestión programas (solo coordinador); vista reducida voluntario |
| `ProgramsPage.tsx` | CRUD programas; enroll/unenroll participantes |
| `SchoolsPage.tsx` | CRUD escuelas; validación abreviatura; participantes por escuela |
| `SessionsHistoryPage.tsx` | Historial filtrable; tarjetas móvil con alumnos evaluados; drawer detalle observaciones |
| `MicroGoalsPage.tsx` | Objectius por dimensión; plantillas API |
| `ReportsPage.tsx` | Lista informes; modal `ReportInsightsModal` |
| `AdvancedAnalyticsPage.tsx` | Cohen's d, dosis-respuesta, SROI Monte Carlo, anomalías, ICC |
| `UsersRolesPage.tsx` | Crear usuarios; asignar participantes a profesionales |
| `GestioPage.tsx` | Patrón código participante con preview |
| `LandingEditorPage.tsx` | Editor JSON landing pública |
| `PlansPage.tsx` | Tier plan organización |

### Profesional / Voluntario

| Página | Funcionalidad |
|--------|---------------|
| `SessionLogger.tsx` | Si `professional` → `VolunteerSessionHub`; si coord/admin → `QuickSessionLogger` pantalla completa |
| `ProgressPage.tsx` | Dashboard `GET /dashboard/professional` |
| `SeguimentPage.tsx` | Formulario follow-up por participante |

### Donante — `ImpactPortal.tsx`

Portal impacto org `narinan`; SROI; distribución riesgo; efecto intervención; `donor-ui.css`.

---

## 13. Frontend — módulos API cliente

**Base:** `src/api/client.ts`

- `VITE_API_BASE_URL` (default en código: `http://localhost:8013/api/v1` — alinear con `.env` → `8012`)  
- Interceptor Bearer desde `authStore`  
- Toasts globales 401/403/5xx  
- Header `X-Silent: true` para silenciar errores  

| Módulo | Responsabilidad |
|--------|-----------------|
| `auth.ts` | Login |
| `participants.ts` | CRUD participantes, baseline, evolution, risk, prediction, cluster, enroll |
| `sessions.ts` | Crear/listar sesiones, observaciones; tipo `SessionListItem` con `participants[]` |
| `programs.ts` | CRUD programas |
| `schools.ts` | CRUD escuelas |
| `users.ts` | Usuarios y asignaciones |
| `microGoals.ts` | Micro-objectius |
| `assessments.ts` | Follow-up |
| `reports.ts` | Informes |
| `organization.ts` | Plan, settings, landing |
| `dashboard.ts` | Dashboards y analytics agregados |
| `advanced.ts` | Analytics avanzados |

---

## 14. Frontend — componentes clave

### Layout

| Componente | Descripción |
|------------|-------------|
| `AppShell.tsx` | Topnav escritorio, theme toggle, CommandPalette, NotificationBell, QuickLoggerFAB |
| `MobileShell.tsx` | Header móvil, bottom nav, `RoleLayout`, back en subpáginas |

### Sesiones (`components/sessions/`)

| Componente | Descripción |
|------------|-------------|
| `QuickSessionLogger.tsx` | Wizard ~1000 líneas: programa → participantes → puntuación; modos estrella/reacciones; `volunteerMode` simplifica UI |
| `QuickLoggerFAB.tsx` | FAB global; atajo Ctrl/Cmd+Shift+N |
| `OutcomesStar.tsx` | Estrella radial Journey of Change; etiquetas HTML 4 dimensiones |
| `LiveReactions.tsx` | Eventos comportamiento → scores |
| `inputModeData.ts` | Anclas, reacciones, derivación scores |

### Voluntari (`components/voluntari/`)

| Componente | Descripción |
|------------|-------------|
| `VolunteerSessionHub.tsx` | Pestañas Llista / Registrar |
| `VolunteerPageHeader.tsx` | Título, subtítulo, tornar |
| `VolunteerParticipantRow.tsx` | Fila alumno con badge escuela |
| `PremiumSelect` | Select estilizado filtros |
| `AddParticipantForm` | Formulario alta (solo coordinador en flujos actuales) |
| `EnrollParticipantForm` | Inscripción a programa |

### Analítica, SROI, informes, comunes

- `BootstrapCIBadge`, `EffectSizeCard`, `SignificanceIndicator`, `InterRaterReliabilityCard`  
- `SROIStatement`, `SROIBreakdown`  
- `ReportInsightsModal`  
- `CommandPalette`, `NotificationBell`, `ToastViewport`, `PageTransition`, `EmptyState`, `SkeletonTable`, `SchoolBadge`  

### Hooks

- `useLocalDraft.ts` — persistencia borrador en `localStorage` (sesiones, formularios)

---

## 15. Frontend — estado global y estilos

### Stores Zustand (`src/stores/`)

| Store | Persistencia | Contenido |
|-------|--------------|-----------|
| `authStore` | localStorage `if_*` | tokens, role, userId |
| `themeStore` | `if_theme_v1` | light/dark → `data-theme` en `<html>` |
| `toastStore` | memoria | cola notificaciones |

### Hojas de estilo (`src/styles/` + `styles.css`)

| Archivo | Alcance |
|---------|---------|
| `styles.css` | Variables design system, layout escritorio, tablas, login (~4400 líneas) |
| `voluntari-ui.css` | Tema móvil Narinan `#F58220`, `.vol-*` |
| `donor-ui.css` | Portal donante |
| `mobile-shell.css` | Shell móvil, bottom nav, safe-area |
| `session-logger.css` | Wizard `.ql-*` |
| `common-ui.css` | Dark mode, toasts, command palette |
| `modern-polish.css` | Animaciones, focus rings |
| `advanced-analytics.css` | Página analítica avanzada |

**Tipografía:** Nunito (Google Fonts).  
**Accesibilidad:** reglas workspace WCAG 2.1 AA (botones nativos, labels, focus visible).

---

## 16. WebSocket y alertas en tiempo real

**Componente:** `NotificationBell.tsx`  
**URL:** `ws(s)://{host}/api/v1/ws/alerts/{organization_id}`  

- Backend envía alertas de participantes con `risk_level` alto (poll 30s).  
- Click en alerta → navega a `/coordinator/participants/{participant_id}`.  

> Posible desalineación: WS referencia campos no presentes en modelo (`risk_factors` en PeriodicAssessment) — ver sección limitaciones.

---

## 17. Configuración, variables de entorno y ejecución local

### Backend (`apps/backend/.env.example`)

| Variable | Default | Descripción |
|----------|---------|-------------|
| `DATABASE_URL` | `sqlite+aiosqlite:///./impactflow.db` | URL async |
| `SECRET_KEY` | `change-me-in-production` | Firma JWT |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | 15 | TTL access |
| `REFRESH_TOKEN_EXPIRE_DAYS` | 7 | TTL refresh |
| `OPENAI_API_KEY` | — | NLP |
| `ENVIRONMENT` | development | SQL echo |
| `API_PREFIX` | `/api/v1` | Prefijo rutas |
| `AUTH_BYPASS` | true | Bypass auth dev |
| `IMPACTFLOW_BACKEND_PORT` | 8012 | Puerto `run_local_backend.py` |

**Arranque:**

```bash
cd apps/backend
python run_local_backend.py
# → http://127.0.0.1:8012
```

### Frontend (`apps/frontend/.env`)

```env
VITE_API_BASE_URL=/api/v1
```

**`vite.config.ts`:**

- Puerto **5173**, `host: true` (LAN)  
- Proxy `/api/v1` → `http://127.0.0.1:8012`  

**Arranque:**

```bash
cd apps/frontend
npm run dev
# → http://localhost:5173
# → red: http://{IP-LAN}:5173
```

### Windows rápido

`start.bat` en raíz — mata 8012/5173 y abre backend + frontend.

---

## 18. Scripts, seed y datos de demostración

### `scripts/seed_demo.py` (principal)

Crea org Narinan con:

- 5 usuarios, 3 escuelas, 2 programas, 50 participantes  
- Asignaciones: prof1 → 25, prof2 → 25  
- Baselines, periódicas M3/M6, ~96 sesiones, micro-goals  

**Credenciales:**

| Email | Password | Rol |
|-------|----------|-----|
| `admin@impactflow.dev` | `admin123` | admin |
| `coord1@impactflow.dev` | `coord123` | coordinator |
| `prof1@impactflow.dev` | `prof123` | professional |
| `prof2@impactflow.dev` | `prof123` | professional |
| `donor@impactflow.dev` | `donor123` | donor |

### Otros scripts

| Script | Uso |
|--------|-----|
| `add_varied_records.py` | Trayectorias variadas (mejora, meseta, regresión) |
| `backfill_enrollments.py` | Rellena `program_enrollments` en SQLite |
| `load_session_logger_battery.py` | Carga HTTP de batería de sesiones desde markdown |

---

## 19. Pruebas y calidad

```bash
# Backend
cd apps/backend && pytest -q
# tests/test_ipi.py, tests/test_risk_engine.py

# Frontend
cd apps/frontend && npx tsc --noEmit
cd apps/frontend && npm run lint
```

---

## 20. Limitaciones conocidas y deuda técnica

| Tema | Detalle |
|------|---------|
| Refresh token | Emitido sin endpoint de renovación |
| `AUTH_BYPASS` | Activado por defecto en dev |
| Puerto API frontend | Default código `8013` vs proxy/vite `8012` — usar `.env` consistente |
| `causal_inference` | Sin endpoint HTTP |
| Modelo legacy `organization.py` | No importado |
| WebSocket / `risk_factors` | Posible drift con modelo `PeriodicAssessment` |
| Makefile `dev-backend` | Puerto 8000 vs `run_local_backend.py` 8012 |
| Alembic en Makefile | Migraciones reales son `migrate_v2.py` imperativo |
| Donante | Rol `donor` usa endpoints públicos sin JWT dedicado |
| Crear participante | Restringido a coordinación en API; UI voluntario sin alta |

---

## 21. Índice de archivos por carpeta

### Backend — `apps/backend/app/`

```
algorithms/
  causal_inference.py      # DiD (sin endpoint)
  dimension_effects.py     # Cohen's dz + Hattie
  dose_response.py         # Curva Hill
  dropout_model.py         # Abandono 30/60d
  effect_analysis.py       # Cohen, Wilcoxon, bootstrap
  ipi.py                   # IPI core
  monte_carlo_sroi.py      # SROI MC
  predictor.py             # Predicción IPI
  risk_engine.py           # Motor riesgo
  segmentation.py          # K-means perfiles
  sroi_engine.py             # SROI estático

analytics/
  anomaly_detection.py
  cohort_analysis.py
  reliability.py

models/
  core.py                  # Todos los modelos activos
  organization.py          # LEGACY

routes/
  schools_and_assignments.py

schemas/
  api.py                   # Todos los DTO Pydantic

services/
  nlp_service.py
  report_generator.py
  session_analytics_service.py

utils/
  access_control.py
  auth.py
  deps.py
  participant_code.py
  participant_metrics.py
  participants.py

main.py                    # Aplicación FastAPI monolítica
config.py
database.py
migrations/migrate_v2.py
```

### Frontend — `apps/frontend/src/`

```
api/           # 12+ módulos HTTP
components/
  analytics/   common/   layout/   reports/
  sessions/    sroi/     voluntari/
hooks/         useLocalDraft.ts
pages/
  Login.tsx    Overview.tsx
  admin/       coordinator/ (14 páginas)
  donor/       professional/   voluntari/
stores/        authStore  themeStore  toastStore
styles/        7 CSS + styles.css en raíz src
App.tsx
main.tsx
```

---

## Apéndice A — Modos de entrada de evidencia en sesión

| Modo | Componente | Descripción |
|------|------------|-------------|
| Estrellas 1–5 | `OutcomesStar` / inputs clásicos | Puntuación directa por dimensión |
| Outcomes Star (radial) | `OutcomesStar.tsx` | Anclas Journey of Change; etiquetas en HTML |
| Live Reactions | `LiveReactions.tsx` | Tap comportamientos → deriva scores por dimensión |

En **modo voluntario** (`volunteerMode`): solo estrellas + estrella radial; sin pool multi-participante en el mismo flujo compacto.

---

## Apéndice B — Respuesta evolution (referencia)

`GET /api/v1/participants/{id}/evolution?program_id=...`

```json
{
  "participant_id": "...",
  "program_id": "...",
  "code": "ELC-2024-017",
  "first_name": "Nom",
  "school_abbreviation": "ELC",
  "baseline_ipi": 42.5,
  "current_ipi": 58.3,
  "history": [{ "date": "2026-01-15", "ipi_score": 45.0, "period_label": "M3", ... }],
  "dimensions_baseline": { "academic": 40, "cognitive": 35, "social": 50, "integration": 30 },
  "dimensions_current": { "academic": 55, ... },
  "weeks_in_program": 12,
  "trend": "improving",
  "prediction": { "predicted_ipi": 62, "trend": "improving" }
}
```

---

## Apéndice C — Glosario

| Término | Significado |
|---------|-------------|
| **IPI** | Índex de Progrés Integral (0–100) |
| **Participant / Alumne** | Beneficiario del programa |
| **Session** | Actividad registrada con observaciones |
| **Baseline** | Evaluación inicial de referencia |
| **Periodic** | Evaluación de seguimiento (incl. auto desde sesión) |
| **SROI** | Social Return on Investment |
| **ICC** | Intraclass Correlation Coefficient (fiabilidad) |
| **Cohen's d / dz** | Tamaño del efecto estadístico |
| **Professional** | Rol voluntario en UI (ruta `/professional/`, etiqueta «Voluntari») |

---

*Documento generado para extracción completa del conocimiento del proyecto ImpactFlow-dev. Para cambios en código, contrastar siempre con el repositorio fuente.*
