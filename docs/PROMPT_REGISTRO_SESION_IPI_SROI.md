# Prompt — ImpactFlow: registro de sesiones, IPI y SROI

> **Documentación técnica completa (cálculos, bonus, curva de aprendizaje, SROI):**  
> ver [`DOCUMENTACION_IPI_SROI.md`](./DOCUMENTACION_IPI_SROI.md)

Este archivo es un **brief de producto** para explorar mejoras de UX. El comportamiento actual del motor está documentado en detalle en el enlace anterior.

---

## 1. Qué es ImpactFlow

Plataforma para ONGs y entidades educativas (demo: **Narinan**, Cataluña) que convierte la actividad diaria con menores en **evidencia de impacto** medible.

- **Voluntario/profesional (móvil):** registra sesiones, observaciones por alumno, asistencia, hora, sensación de progreso.
- **Coordinador (escritorio):** dashboard, analítica, usuarios, informes, SROI por período.
- **Donante:** portal de impacto y calculadora SROI en lenguaje llano.

**Stack:** React + Vite + FastAPI + SQLite. API `/api/v1`.

---

## 2. Resumen del modelo actual (2025)

### IPI desde sesión

1. Puntuaciones 1–5 por dimensión (o inferencia vía GAS / proxies).
2. `calculate_ipi` → IPI bruto 0–100.
3. Guía por delta de dimensiones vs sesión anterior (±6 pts máx.).
4. **Curva de aprendizaje** con asímptota personal `M ≈ min(88, baseline+38)` — no sube linealmente a 100.
5. Multiplicador voluntario: **×0.8 / ×1.0 / ×1.2** según sensación respecto última sesión.
6. Una fila canónica `PeriodicAssessment` por día (`session_auto`).

### SROI

- **Numerador:** ahorro familias + IPI + exclusión + integración + entrega grupal (con correcciones deadweight/attribution/drop-off).
- **Denominador:** coste operativo (45 €/participante/mes + 15 €/sesión efectiva).
- **Dosis:** saturación logarítmica si hay más de 4 sesiones/participante/mes.

---

## 3. Registro de sesión (QuickSessionLogger)

**Ruta:** `/professional/session-logger`  
**Componente:** `apps/frontend/src/components/sessions/QuickSessionLogger.tsx`

### Datos de sesión

| Campo | Uso |
|-------|-----|
| `program_id`, `session_date`, `session_time` | Contexto temporal |
| `session_type`, `duration_minutes` | Tipo y SROI |
| `notes` | NLP → resumen y sentimiento |

### Por participante

| Campo | Uso |
|-------|-----|
| `academic_score` … `integration_score` | IPI por dimensión |
| `volunteer_progress_sense` | `progressed` / `similar` / `step_back` → multiplicador |
| `attendance_status` | Ausencia → no IPI de sesión |
| `goal_progress` | GAS por microobjetivo |
| `verbal_participation`, `time_on_task_pct` | Proxies |

### Modos de entrada

Estrellas, Outcomes Star, reacciones en vivo (voluntario).

---

## 4. Objetivo de exploración (producto)

Mejorar el registro sin romper WCAG/COGA ni el flujo móvil.

### Preguntas abiertas

1. ¿Más indicadores en hitos trimestrales y 4 agregados en el día a día?
2. ¿Resumen pre-guardado del IPI estimado de la sesión?
3. ¿Derivar más parámetros SROI desde mood/asistencia en tiempo real?

### Archivos clave

```
apps/frontend/src/components/sessions/QuickSessionLogger.tsx
apps/backend/app/utils/participant_metrics.py
apps/backend/app/algorithms/learning_curve.py
apps/backend/app/algorithms/ipi.py
apps/backend/app/algorithms/sroi_engine.py
apps/backend/app/services/program_sroi_metrics.py
docs/DOCUMENTACION_IPI_SROI.md
```

---

## 5. Tarea para el asistente (diseño)

1. Resume el modelo (enlace a doc técnica).
2. Propón 3–5 mejoras al formulario de registro.
3. Indica impacto en IPI y SROI.
4. Prioriza por esfuerzo/impacto.
5. **No implementar** salvo petición explícita.
