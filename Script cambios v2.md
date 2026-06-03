

# ImpactFlow — Especificación de cambios para producción v2.0

> **Propósito:** Este documento es una especificación exhaustiva y accionable para
una IA de desarrollo.
> Contiene TODOS los cambios necesarios para llevar ImpactFlow desde su estado
actual de desarrollo
> a un despliegue en producción funcional, incluyendo tres grandes features
nuevas.
## >
> **Contexto:** La IA que ejecute estos cambios tendrá acceso al documento
DOCUMENTACION_IMPACTFLOW.md
> (arquitectura completa del proyecto) y a este script. No necesita más contexto.
## >
> **Estado actual del proyecto:** Desarrollo local funcional con SQLite,
AUTH_BYPASS=true,
> datos demo via seed, portal donante con multi-programa, logger voluntario con
secciones visuales.

## ---

## Tabla de contenidos

- [Resumen ejecutivo de cambios](#1-resumen-ejecutivo)
- [FEATURE 1 — Años escolares](#2-feature-1-años-escolares)
- [FEATURE 2 — Curso/nivel del alumno](#3-feature-2-cursonivel-del-alumno)
- [FEATURE 3 — Importación JSON estructurada](#4-feature-3-importación-json)
- [Cambios para producción — Backend](#5-producción-backend)
- [Cambios para producción — Frontend](#6-producción-frontend)
- [Cambios para producción — Base de datos](#7-producción-base-de-datos)
- [Cambios para producción — Despliegue](#8-producción-despliegue)
- [Cambios visuales ya realizados a preservar](#9-cambios-visuales-realizados)
- [Tests mínimos requeridos](#10-tests)
- [Orden de implementación recomendado](#11-orden-implementación)
- [Anexo A — Tabla de progresión de niveles](#anexo-a)
- [Anexo B — Formato JSON de importación](#anexo-b)
- [Anexo C — Checklist pre-despliegue](#anexo-c)

## ---

## 1. Resumen ejecutivo

### Tres features nuevas
- **Años escolares:** Modelo `academic_years` con filtro global por defecto al año
actual.

Toda la app (sesiones, assessments, enrollments, dashboards) opera en contexto
de un año escolar.
Estadísticas agregadas muestran todos los años.

- **Curso/nivel del alumno:** Historial de nivel escolar por año con promoción
automática
y override manual. Niveles: I3–I5, 1r–6è Primària, 1r–4t ESO, 1r–2n Batxillerat.

- **Importación JSON:** Módulo para coordinadores que permite importar alumnos,
voluntarios/profesores
y relaciones (asignaciones profesor↔alumno↔programa↔año) con preview por
secciones antes de confirmar.
Incluye sección de formato visible con ejemplo JSON.

### Cambios de producción
- AUTH_BYPASS desactivado
- SECRET_KEY real
- SQLite → PostgreSQL
- CORS restringido
- Variables de entorno de producción
- WebSocket desactivado temporalmente
- Demo mode como botón en login (no seed automático)
- Despliegue: Vercel (frontend) + Render (backend) + Neon (Postgres)

### Cambios visuales ya hechos (PRESERVAR, no modificar)
- Portal donante: skeletons loading, unidades en "pts", debounce SROI, selector
multi-programa,
endpoint SROI donante, endpoint programas público
- Logger voluntario: sin tabs Llista/Registrar, secciones visuales (Context, Data,
## Assistència,
Estat d'ànim, Puntuació, Observacions, Micro-objectius), mood buttons con texto
visible,
nota general inline, topbar oculta en volunteerMode
- Filtros voluntario: grid responsive programa+escola arriba, buscar abajo
- Corrección SROI engine: attendance_value sin doble multiplicación de
participantes

## ---

## 2. FEATURE 1 — Años escolares

### 2.1 Modelo de datos

#### Nueva tabla: `academic_years`


## ```python
class AcademicYear(Base):
## __tablename__ = "academic_years"

id = Column(String, primary_key=True, default=lambda: str(uuid4()))
organization_id = Column(String, ForeignKey("organizations.id"), nullable=False)
title = Column(String, nullable=False)           # "2025/2026"
start_date = Column(Date, nullable=False)         # 2025-09-01
end_date = Column(Date, nullable=False)           # 2026-06-30
is_current = Column(Boolean, default=False)       # Solo uno por org puede ser
## True
active = Column(Boolean, default=True)
created_at = Column(DateTime, default=func.now())

# Unique constraint: (organization_id, title)
## ```

#### Campos nuevos en tablas existentes

Añadir `academic_year_id` (FK a `academic_years.id`, nullable en migración, NOT
NULL para datos nuevos) a:

## - `sessions`
## - `baseline_assessments`
## - `periodic_assessments`
## - `program_enrollments`
## - `attendance_records`
## - `reports`

**NO añadir a `programs`** — los programas son atemporales. La relación
programa↔año
se establece a través de `program_enrollments` y `sessions`.

### 2.2 Lógica de sugerencia de título

Al crear un nuevo año escolar, el backend debe sugerir el título automáticamente:

## ```
Si mes actual >= 9 (septiembre):
sugerir "{año_actual}/{año_actual + 1}"
Si mes actual >= 1 y mes actual <= 6 (enero-junio):
sugerir "{año_actual - 1}/{año_actual}"
Si mes actual >= 7 y mes actual <= 8 (julio-agosto):

sugerir "{año_actual}/{año_actual + 1}"
## ```

Fechas sugeridas:
- `start_date`: 1 de septiembre del primer año
- `end_date`: 30 de junio del segundo año

### 2.3 Regla de `is_current`

- Solo un año por organización puede tener `is_current = True`
- Al marcar uno como actual, desmarcar los demás
- Al crear el primero, marcarlo como actual automáticamente

### 2.4 Filtro global por año escolar

## #### Backend
- Todos los endpoints que listen sesiones, assessments, enrollments, participantes
activos,
dashboards, analytics deben aceptar un parámetro opcional `academic_year_id`
- Si no se pasa, usar el año con `is_current = True` de la organización del usuario
- Excepción: los endpoints de analytics agregados (dashboard coordinador, donor
dashboard,
intervention-effect, etc.) deben agregar datos de TODOS los años cuando se pida
explícitamente
o cuando se acceda desde la sección de estadísticas globales

## #### Frontend
- Añadir un selector de año escolar en el `AppShell` (coordinador/admin) — visible
pero discreto,
por ejemplo en la topbar o sidebar
- Por defecto seleccionado el año actual
- Al cambiar el año, todas las queries deben refrescarse con el nuevo
## `academic_year_id`
- En `MobileShell` (voluntario), NO mostrar selector — usar siempre el año actual
- En portal donante, agregar todos los años (comportamiento actual)

### 2.5 Endpoints nuevos

## ```
GET    /api/v1/academic-years                    — Listar años de la org (auth:
coordinador, admin)
POST   /api/v1/academic-years                    — Crear año (auth: coordinador, admin)
PATCH  /api/v1/academic-years/{id}               — Actualizar (título, fechas, is_current)
DELETE /api/v1/academic-years/{id}               — Desactivar (soft delete)

GET    /api/v1/academic-years/suggest            — Sugerir título y fechas para nuevo
año
POST   /api/v1/academic-years/{id}/set-current   — Marcar como actual
## ```

### 2.6 Página frontend: `AcademicYearsPage`

## Ruta: `/coordinator/academic-years`
Roles: coordinator, admin

## #### Contenido:
- Lista de años escolares con badges "Actual" / "Passat" / "Futur"
- Botón "Crear nou any escolar" con formulario:
- Título (pre-rellenado con sugerencia)
- Data inici (pre-rellenada)
- Data fi (pre-rellenada)
- Checkbox "Marcar com a any actual"
- Editar año existente
- Marcar como actual
- Sección "Alumnes d'aquest any" — lista de participantes inscritos en ese año con
su nivel
- Sección "Estadístiques globals" — link a analytics agregados de todos los años

### 2.7 Migración de datos existentes

- Al arrancar por primera vez con el nuevo modelo:
- Crear un año escolar por defecto basado en la fecha actual
- Marcar como `is_current = True`
- Asignar `academic_year_id` del año creado a todos los registros existentes que
tengan el campo NULL
- Esto se ejecuta en `migrate_v2.py` o equivalente

## ---

## 3. FEATURE 2 — Curso/nivel del alumno

### 3.1 Tabla de niveles disponibles

NO crear tabla dinámica. Usar constante en backend:

## ```python
## GRADE_LEVELS = [
{"key": "I3", "label": "I3 (Infantil 3 anys)", "order": 1, "stage": "infantil"},
{"key": "I4", "label": "I4 (Infantil 4 anys)", "order": 2, "stage": "infantil"},

{"key": "I5", "label": "I5 (Infantil 5 anys)", "order": 3, "stage": "infantil"},
{"key": "1P", "label": "1r Primària", "order": 4, "stage": "primaria"},
{"key": "2P", "label": "2n Primària", "order": 5, "stage": "primaria"},
{"key": "3P", "label": "3r Primària", "order": 6, "stage": "primaria"},
{"key": "4P", "label": "4t Primària", "order": 7, "stage": "primaria"},
{"key": "5P", "label": "5è Primària", "order": 8, "stage": "primaria"},
{"key": "6P", "label": "6è Primària", "order": 9, "stage": "primaria"},
{"key": "1E", "label": "1r ESO", "order": 10, "stage": "eso"},
{"key": "2E", "label": "2n ESO", "order": 11, "stage": "eso"},
{"key": "3E", "label": "3r ESO", "order": 12, "stage": "eso"},
{"key": "4E", "label": "4t ESO", "order": 13, "stage": "eso"},
{"key": "1B", "label": "1r Batxillerat", "order": 14, "stage": "batxillerat"},
{"key": "2B", "label": "2n Batxillerat", "order": 15, "stage": "batxillerat"},
## ]

## GRADE_PROGRESSION = {
## "I3": "I4", "I4": "I5", "I5": "1P",
## "1P": "2P", "2P": "3P", "3P": "4P", "4P": "5P", "5P": "6P", "6P": "1E",
## "1E": "2E", "2E": "3E", "3E": "4E", "4E": "1B",
"1B": "2B", "2B": None,  # Fin de la progresión
## }
## ```

### 3.2 Modelo de datos

#### Nueva tabla: `participant_grade_history`

## ```python
class ParticipantGradeHistory(Base):
## __tablename__ = "participant_grade_history"

id = Column(String, primary_key=True, default=lambda: str(uuid4()))
participant_id = Column(String, ForeignKey("participants.id"), nullable=False)
academic_year_id = Column(String, ForeignKey("academic_years.id"),
nullable=False)
grade_key = Column(String, nullable=False)         # "1E", "2P", etc.
grade_label = Column(String, nullable=False)        # "1r ESO"
status = Column(String, default="enrolled")         # enrolled / promoted / repeated /
advanced / withdrawn
created_at = Column(DateTime, default=func.now())
notes = Column(Text, nullable=True)

# Unique constraint: (participant_id, academic_year_id)
## ```


#### Campo nuevo en `participants`

## ```python
current_grade_key = Column(String, nullable=True)    # Cache del nivel actual, ej:
## "1E"
current_grade_label = Column(String, nullable=True)  # Cache del label actual, ej:
"1r ESO"
## ```

### 3.3 Promoción automática

#### Endpoint: `POST /api/v1/academic-years/{id}/promote-students`

## Lógica:
- Obtener el año escolar anterior (por `start_date` descendente, el segundo)
- Para cada alumno con `ParticipantGradeHistory` en el año anterior:
a. Buscar su `grade_key` del año anterior
b. Buscar el siguiente nivel en `GRADE_PROGRESSION`
c. Si existe siguiente nivel:
- Crear `ParticipantGradeHistory` para el nuevo año con el siguiente nivel
- Actualizar `current_grade_key` y `current_grade_label` en `participants`
- Marcar status = "promoted"
d. Si no existe siguiente (fin de progresión):
- No crear registro
- Marcar en respuesta como "sense nivell següent"
- Devolver preview antes de ejecutar:
- Alumnos que promocionan
- Alumnos sin nivel anterior
- Alumnos ya registrados en el año destino (skip)

#### Endpoint: `PATCH /api/v1/participant-grade-history/{id}`

Permite override manual:
- Cambiar `grade_key` y `grade_label`
- Cambiar `status` a "repeated" o "advanced"
- Actualizar el cache en `participants`

### 3.4 Endpoints nuevos

## ```
GET    /api/v1/grade-levels                                    — Lista constante de niveles
## (público)

GET    /api/v1/academic-years/{id}/students                    — Alumnos del año con su
nivel
POST   /api/v1/academic-years/{id}/promote-students            — Preview + ejecutar
promoción
GET    /api/v1/participants/{id}/grade-history                  — Historial de niveles de un
alumno
POST   /api/v1/participant-grade-history                       — Asignar nivel manualmente
PATCH  /api/v1/participant-grade-history/{id}                  — Editar nivel/status
## ```

### 3.5 Cambios en endpoints existentes

- `GET /api/v1/participants` — incluir `current_grade_key` y `current_grade_label` en
la respuesta
- `POST /api/v1/participants` — aceptar `grade_key` opcional; si se proporciona,
crear
`ParticipantGradeHistory` para el año actual
- `GET /api/v1/participants/{id}` — incluir grade info

## ### 3.6 Frontend

#### En `ParticipantsPage`
- Mostrar columna/campo "Curs" con el `current_grade_label`
- En el formulario de crear participante, añadir selector de nivel (dropdown con
## GRADE_LEVELS)

#### En `AcademicYearsPage`
- Tab/sección "Promoció d'alumnes":
- Botón "Promocionar alumnes al nou any"
- Preview con tabla: alumno | nivell actual | nivell proposat | acció
- Opciones por alumno: acceptar / repeteix / avança / salta
- Botón "Aplicar promoció"
- Tab/sección "Alumnes i nivells":
- Tabla de alumnos del año seleccionado con su nivel
- Editar nivel inline o con modal

#### En `ParticipantProfile`
- Sección "Historial acadèmic":
- Lista: any | nivell | status
- Editar nivel del año actual

## ---

## 4. FEATURE 3 — Importación JSON


### 4.1 Formato JSON

Ver Anexo B para el formato completo con ejemplos.

### 4.2 Modelo de datos

#### Nueva tabla: `import_logs`

## ```python
class ImportLog(Base):
## __tablename__ = "import_logs"

id = Column(String, primary_key=True, default=lambda: str(uuid4()))
organization_id = Column(String, ForeignKey("organizations.id"), nullable=False)
imported_by = Column(String, ForeignKey("users.id"), nullable=False)
imported_at = Column(DateTime, default=func.now())
source_filename = Column(String, nullable=True)
summary_json = Column(Text, nullable=False)        # JSON con resumen de lo
importado
status = Column(String, default="completed")        # completed / partial / failed
raw_input_hash = Column(String, nullable=True)      # Para detectar
reimportaciones
## ```

#### Nueva tabla: `teaching_assignments`

## ```python
class TeachingAssignment(Base):
## __tablename__ = "teaching_assignments"

id = Column(String, primary_key=True, default=lambda: str(uuid4()))
user_id = Column(String, ForeignKey("users.id"), nullable=False)
participant_id = Column(String, ForeignKey("participants.id"), nullable=False)
program_id = Column(String, ForeignKey("programs.id"), nullable=False)
academic_year_id = Column(String, ForeignKey("academic_years.id"),
nullable=False)
school_id = Column(String, ForeignKey("schools.id"), nullable=True)
active = Column(Boolean, default=True)
source = Column(String, default="manual")            # manual / import_json
created_at = Column(DateTime, default=func.now())

# Unique constraint: (user_id, participant_id, program_id, academic_year_id)
## ```


**IMPORTANTE:** Esta tabla convive con `user_participant_assignments` existente.
`user_participant_assignments` se sigue usando para el scope profesional del
volunteerMode.
Al crear un `TeachingAssignment`, TAMBIÉN crear/actualizar el
`UserParticipantAssignment`
correspondiente para que el scope profesional siga funcionando.

## ### 4.3 Endpoints

## ```
POST   /api/v1/imports/validate     — Validar JSON, devolver errores
POST   /api/v1/imports/preview      — Devolver resumen por secciones de lo que se
creará
POST   /api/v1/imports/commit       — Ejecutar importación
GET    /api/v1/imports/history       — Historial de importaciones
GET    /api/v1/imports/format        — Devolver el formato JSON esperado con
ejemplo
## ```

Todos auth: coordinator, admin.

### 4.4 Lógica de importación

#### Orden de procesamiento (ESTRICTO)

- **Años escolares** — crear si no existen (match por `title` + `organization_id`)
- **Programas** — crear si no existen (match por `name` + `organization_id`)
- **Escuelas** — crear si no existen (match por `name` o `abbreviation` +
## `organization_id`)
- **Profesores/voluntarios** — crear usuarios con rol `professional` (match por
## `email`)
- Si email ya existe → ERROR, no actualizar
- Generar contraseña temporal y devolverla en el resumen
- **Alumnos** — crear participantes (match por `code`)
- Si code ya existe → ERROR, no actualizar
- Crear `ParticipantGradeHistory` si se incluye `grade_key`
- Crear `ProgramEnrollment` si se incluye `program`
- **Relaciones** — crear `TeachingAssignment` + `UserParticipantAssignment`
- Match profesor por `email`
- Match alumno por `code`
- Match programa por `name`
- Match año por `title`
- Si la relación ya existe → SKIP silencioso


#### Validación previa (endpoint `/validate`)

## Comprobar:
- JSON válido sintácticamente
- Claves reconocidas en cada sección
- No hay duplicados DENTRO del JSON:
- emails de profesores duplicados
- códigos de alumnos duplicados
- relaciones duplicadas
- Referencias internas coherentes:
- relaciones referencian profesores/alumnos que están en el JSON o ya existen en
## BD
- años referenciados existen en el JSON o en BD
- programas referenciados existen en el JSON o en BD
- escuelas referenciadas existen en el JSON o en BD

Devolver lista de errores con línea/sección/campo.

## #### Preview (endpoint `/preview`)

## Devolver:
## ```json
## {
## "academic_years": { "new": 1, "existing": 0 },
## "programs": { "new": 0, "existing": 2 },
## "schools": { "new": 1, "existing": 2 },
## "teachers": { "new": 3, "existing": 0 },
## "students": { "new": 15, "existing": 0 },
## "relationships": { "new": 22, "skipped": 0 },
## "errors": [],
"warnings": ["L'escola 'Escola Nova' no existeix i es crearà automàticament."]
## }
## ```

### 4.5 Página frontend: `DataImportPage`

## Ruta: `/coordinator/import`
Roles: coordinator, admin

#### Layout por pasos:

**Paso 1 — Format i entrada**
- Sección "Format esperat" con:

- Descripción del formato
- JSON de ejemplo completo (collapsible/expandible)
- Botón "Copiar exemple"
- Nota: "Pots generar aquest JSON amb una IA a partir d'un Excel"
- Textarea grande para pegar JSON
- O botón "Pujar fitxer .json"

**Paso 2 — Validació**
- Botón "Validar"
- Lista de errores si los hay (con sección y campo)
- Lista de warnings
- Si OK → botón "Continuar"

**Paso 3 — Previsualització**
- Bloques visuales separados:
-  Anys escolars: X nous
-  Programes: X nous, Y existents
-  Escoles: X noves, Y existents
- ࠅ Professors/voluntaris: X nous (con tabla: nom, email, contrasenya temporal)
-  Alumnes: X nous (con tabla: codi, nom, escola, curs)
-  Relacions: X noves (con tabla: professor → alumne → programa → any)

**Paso 4 — Importar**
- Botón "Importar tot"
- Progress visual
- Resultado final:
- ✅ Importació completada
- Resumen de lo creado
- Contraseñas temporales de profesores nuevos (descargar como CSV)
- Errores si los hubo

### 4.6 Sección de formato visible

En el Paso 1 de la página de importación, mostrar permanentemente una sección
"Format del JSON" con:

- Título: "Format esperat del fitxer JSON"
- Subtítulo: "Pots copiar aquest exemple i adaptar-lo amb les teves dades."
- JSON de ejemplo formateado y con syntax highlighting (usar <pre> + CSS)
- Botón "Copiar al portapapers"
- Notas explicativas:
- "Tots els camps marcats amb * són obligatoris"
- "Els codis d'alumne han de ser únics"
- "Els emails de professors han de ser únics"

- "Les escoles es creen automàticament si no existeixen"

Ver Anexo B para el JSON de ejemplo exacto.

## ---

## ## 5. Producción — Backend

## ### 5.1 AUTH_BYPASS

## En `app/config.py`:
- Cambiar default de `AUTH_BYPASS` a `false`
- En `app/utils/deps.py`: cuando `AUTH_BYPASS=false`, el middleware DEBE:
- Rechazar requests sin token válido (401)
- Aplicar `require_roles` estrictamente
- No usar "primer usuario" como fallback

## ### 5.2 SECRET_KEY

- Generar una clave segura de al menos 64 caracteres
- Configurar via variable de entorno `SECRET_KEY`
- NO tener fallback en código — si no está configurada, la app no debe arrancar

## ### 5.3 CORS

En `main.py`, cambiar:
## ```python
## # ANTES
allow_origins=["*"]

## # DESPUÉS
allow_origins=os.environ.get("CORS_ORIGINS", "http://localhost:5173").split(",")
## ```

Variable de entorno `CORS_ORIGINS`:
## - Dev: `http://localhost:5173`
## - Prod: `https://tu-frontend.vercel.app`

### 5.4 WebSocket

Desactivar temporalmente el endpoint WebSocket en producción:
- Envolver en condicional `if settings.WEBSOCKET_ENABLED:`
- Default `WEBSOCKET_ENABLED=false`
- En frontend, `NotificationBell.tsx` debe comprobar si WS está disponible

y no intentar conectar si no lo está (catch silencioso)

### 5.5 Demo mode

- NO ejecutar seed automáticamente en producción
- Añadir endpoint: `POST /api/v1/demo/seed` (auth: admin only, + flag
## `DEMO_MODE_ENABLED`)
- En `Login.tsx`, si el backend devuelve que demo está habilitado, mostrar botón
"Accés demo" que ejecute el seed y luego loguee como coordinador
- Variable de entorno: `DEMO_MODE_ENABLED=false` por defecto

### 5.6 Variables de entorno producción

## ```
DATABASE_URL=postgresql+asyncpg://user:pass@host:5432/impactflow
SECRET_KEY=<clave-segura-64-chars>
AUTH_BYPASS=false
ENVIRONMENT=production
API_PREFIX=/api/v1
CORS_ORIGINS=https://impactflow.vercel.app
WEBSOCKET_ENABLED=false
DEMO_MODE_ENABLED=false
OPENAI_API_KEY=<opcional>
## IMPACTFLOW_BACKEND_PORT=8012
## ```

### 5.7 Dependencias nuevas

Añadir a `pyproject.toml`:
- `asyncpg` — driver async para PostgreSQL
- `psycopg2-binary` — alternativa si hace falta sync

### 5.8 Endpoint health mejorado

## ```python
## @app.get("/api/v1/health")
async def health():
# Comprobar conexión a BD
try:
async with engine.connect() as conn:
await conn.execute(text("SELECT 1"))
db_ok = True
except Exception:
db_ok = False


return {
"status": "healthy" if db_ok else "degraded",
"database": "ok" if db_ok else "error",
"environment": settings.ENVIRONMENT,
"websocket": settings.WEBSOCKET_ENABLED,
"demo_mode": settings.DEMO_MODE_ENABLED,
## }
## ```

## ---

## ## 6. Producción — Frontend

### 6.1 Variables de entorno

## ```
VITE_API_BASE_URL=/api/v1
## ```

En Vercel, configurar el rewrite/proxy para que `/api/v1/*` apunte al backend en
## Render.

### 6.2 Fallback de apiBase

Buscar TODOS los archivos que tengan fallback a `localhost:8012` o
## `localhost:8013`
y eliminar el fallback. Usar siempre `VITE_API_BASE_URL`.

Archivos conocidos afectados:
- `src/pages/donor/ImpactPortal.tsx`
## - `src/api/client.ts`

### 6.3 Demo mode en Login

En `Login.tsx`:
- Hacer fetch a `/api/v1/health` al montar
- Si respuesta incluye `demo_mode: true`, mostrar sección "Accés demo" con
botones
de coordinador/voluntari/donant
- Si `demo_mode: false`, ocultar la sección completamente
- Los botones de demo deben:
- Llamar a `POST /api/v1/demo/seed` (si no hay datos)
- Hacer login con credenciales demo


### 6.4 Selector de año escolar

En `AppShell.tsx` (coordinador/admin):
- Añadir un selector discreto en la topbar
- Query: `GET /api/v1/academic-years`
- Por defecto seleccionado el que tenga `is_current: true`
- Al cambiar, guardar en un store Zustand `academicYearStore`
- Todas las queries que necesiten año deben leer de este store

En `MobileShell.tsx` (voluntario):
- NO mostrar selector
- Usar siempre el año actual (obtenerlo de `/api/v1/academic-years` filtrando
## `is_current`)

### 6.5 Nuevas páginas

- `AcademicYearsPage` → `/coordinator/academic-years`
- `DataImportPage` → `/coordinator/import`

Añadir a las rutas en `App.tsx` con roles coordinator, admin.

## ### 6.6 Navegación

Añadir en el menú lateral / topbar del coordinador:
- "Anys escolars" → `/coordinator/academic-years`
- "Importar dades" → `/coordinator/import`

### 6.7 Import Target sin usar

Eliminar `Target` del import de lucide-react en `QuickSessionLogger.tsx`
(está importado pero no se usa).

## ---

## 7. Producción — Base de datos

### 7.1 Migración SQLite → PostgreSQL

- Cambiar `DATABASE_URL` a PostgreSQL
- Asegurar que `create_all` funciona con PostgreSQL
- Revisar `migrate_v2.py` para compatibilidad con PostgreSQL:
- SQLite usa `ALTER TABLE ADD COLUMN IF NOT EXISTS` de forma diferente
- PostgreSQL necesita `DO $$ ... END $$;` o similar


### 7.2 Nuevas tablas en `models/core.py`

## Añadir:
- `AcademicYear`
- `ParticipantGradeHistory`
- `TeachingAssignment`
- `ImportLog`

### 7.3 Migración de campos nuevos

En `migrate_v2.py` o nuevo archivo `migrate_v3.py`:
- Añadir columna `academic_year_id` a las 6 tablas listadas en 2.1
- Añadir columnas `current_grade_key` y `current_grade_label` a `participants`
- Crear tablas nuevas
- Crear año escolar por defecto y asignar a registros existentes

### 7.4 Índices recomendados

## ```sql
CREATE INDEX idx_sessions_academic_year ON sessions(academic_year_id);
CREATE INDEX idx_periodic_assessments_academic_year ON
periodic_assessments(academic_year_id);
CREATE INDEX idx_program_enrollments_academic_year ON
program_enrollments(academic_year_id);
CREATE INDEX idx_participant_grade_history_year ON
participant_grade_history(academic_year_id);
CREATE INDEX idx_teaching_assignments_year ON
teaching_assignments(academic_year_id);
CREATE INDEX idx_teaching_assignments_user ON
teaching_assignments(user_id);
## ```

## ---

## ## 8. Producción — Despliegue

## ### 8.1 Frontend — Vercel

- Conectar repositorio a Vercel
- Build command: `cd apps/frontend && npm run build`
- Output directory: `apps/frontend/dist`
- Variables de entorno: `VITE_API_BASE_URL=/api/v1`
- Rewrite en `vercel.json`:

## ```json
## {
## "rewrites": [
## { "source": "/api/:path*", "destination":
## "https://impactflow-backend.onrender.com/api/:path*" }
## ]
## }
## ```

## ### 8.2 Backend — Render

- Crear Web Service en Render
- Build command: `pip install -r requirements.txt` (o `pip install .` si usa
pyproject.toml)
- Start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- Variables de entorno: todas las de sección 5.6
- Health check path: `/api/v1/health`

### 8.3 Base de datos — Neon

- Crear proyecto en Neon
- Crear base de datos `impactflow`
- Copiar `DATABASE_URL` con formato `postgresql+asyncpg://...`
- Configurar en Render como variable de entorno

## ### 8.4 Dominio

Usar subdominios de Vercel y Render:
## - Frontend: `impactflow.vercel.app`
## - Backend: `impactflow-backend.onrender.com`

## ---

## 9. Cambios visuales ya realizados (PRESERVAR)

Los siguientes cambios ya están implementados en el código actual.
NO modificarlos ni revertirlos al implementar las features nuevas:

### Portal donante (`ImpactPortal.tsx`, `donor-ui.css`)
- HeroSkeleton con shimmer animation mientras carga
- Unidades "pts" en vez de "%" para IPI
- Debounce 500ms en inputs del simulador SROI
- Validación: no recalcular si coste < 100
- Selector multi-programa entre hero y contenido

- `apiBase` corregido a puerto 8012
- Endpoint `GET /dashboard/donor/{slug}/sroi` creado
- Endpoint `GET /organization/{slug}/programs/public` creado
- `getDonorDashboard` acepta `programId` opcional
- `getPublicPrograms` añadido a `dashboard.ts`
- Empty states con mensajes humanos en catalán
- `padding-bottom: 6rem` en `.donor-portal` para scroll completo

### Logger voluntario (`QuickSessionLogger.tsx`, `session-logger.css`,
## `voluntari-ui.css`)
- Tabs Llista/Registrar eliminados de `VolunteerSessionHub`
- Header cambiado a "Registre de sessió" con texto descriptivo
- Return condicional: si hay alumno activo, muestra formulario directamente
- Topbar técnica oculta en `volunteerMode`
- Secciones visuales en volunteerMode:
- Context (alumne, escola, programa)
- Data (con badge "Avui automàtic")
- Assistència (con título y bloque)
- Estat d'ànim (con título, bloque, y labels visibles bajo iconos)
- Puntuació (con selector de mode inline, grid 2x2 en desktop)
- Observacions (con nota general de sesión inline)
## - Micro-objectius
- Footer simplificado sin nota general en volunteerMode
- Mood buttons con clase `ql-mood-btn--labeled` y texto visible
- CSS volunteer sections con `ql-scoring--volunteer`, `ql-section-card`, etc.
- Filtros voluntario: grid responsive (programa+escola arriba, buscar abajo en
desktop)

### SROI engine (`sroi_engine.py`)
- `attendance_raw` ya NO multiplica por `n_participants` (corregido)
- Comentarios actualizados

## ---

## 10. Tests mínimos requeridos

### Backend — tests nuevos

## ```python
# tests/test_academic_years.py
- test_create_academic_year
- test_suggest_academic_year_title
- test_set_current_year
- test_only_one_current_per_org


# tests/test_grade_history.py
- test_create_participant_with_grade
- test_promote_students
- test_promote_repeated_student
- test_grade_progression_order

# tests/test_import_json.py
- test_validate_valid_json
- test_validate_duplicate_emails
- test_validate_duplicate_codes
- test_validate_missing_references
- test_preview_counts
- test_commit_creates_all_entities
- test_commit_existing_student_error
- test_commit_existing_teacher_error
- test_commit_creates_teaching_assignments
- test_commit_creates_user_participant_assignments

# tests/test_auth_production.py
- test_login_real_credentials
- test_reject_without_token
- test_reject_wrong_role
- test_bypass_disabled

# tests/test_sroi_corrected.py
- test_attendance_value_not_double_counted (ya existe, verificar)
## ```

### Frontend — verificaciones manuales mínimas

## ```
- [ ] Login real funciona
- [ ] Login demo funciona (si DEMO_MODE_ENABLED)
- [ ] Coordinador ve selector de año
- [ ] Voluntario NO ve selector de año
- [ ] Crear año escolar
- [ ] Promocionar alumnos
- [ ] Importar JSON válido
- [ ] Importar JSON con errores muestra errores
- [ ] Portal donante carga sin auth
- [ ] Logger voluntario muestra secciones
- [ ] SROI calcula correctamente
## ```


## ---

## 11. Orden de implementación recomendado

### Fase 1 — Modelo base (backend)
- Crear tablas nuevas en `models/core.py`
- Crear `migrate_v3.py` con migraciones
- Implementar endpoints de academic years
- Implementar grade levels + grade history
- Tests de fase 1

### Fase 2 — Importación JSON (backend)
- Crear `teaching_assignments` model
- Implementar endpoints validate/preview/commit
- Implementar formato endpoint
- Tests de fase 2

### Fase 3 — Frontend features
- `AcademicYearsPage` con CRUD + promoción
- `DataImportPage` con wizard de importación
- Selector de año en AppShell
- Grade info en participantes
- Navegación actualizada

## ### Fase 4 — Producción
## 15. AUTH_BYPASS + SECRET_KEY + CORS
- PostgreSQL config
- WebSocket desactivado
- Demo mode
- Health check mejorado
## 20. Despliegue Vercel + Render + Neon

## ### Fase 5 — Verificación
## 21. Tests
- Checklist pre-despliegue (Anexo C)
- Pruebas manuales completas
- Go live

## ---

## Anexo A — Tabla de progresión de niveles

## ```

## I3 → I4 → I5 → 1r Primària → 2n Primària → 3r Primària →
4t Primària → 5è Primària → 6è Primària → 1r ESO → 2n ESO →
3r ESO → 4t ESO → 1r Batxillerat → 2n Batxillerat → (fin)
## ```

## ---

## Anexo B — Formato JSON de importación

## ```json
## {
## "academic_years": [
## {
## "title": "2025/2026",
## "start_date": "2025-09-01",
## "end_date": "2026-06-30"
## }
## ],
## "programs": [
## {
"name": "Reforç escolar",
"description": "Sessions de suport acadèmic setmanals",
## "program_type": "education"
## }
## ],
## "schools": [
## {
"name": "Escola Sant Francesc",
"abbreviation": "ESF"
## }
## ],
## "teachers": [
## {
## "email": "anna.serra@example.com",
"full_name": "Anna Serra",
## "role": "professional"
## }
## ],
## "students": [
## {
"code": "ESF-2025-001",
"first_name": "Youssef",
"school_abbreviation": "ESF",
"grade_key": "1E",

## "birth_year": 2012,
"gender": "M",
"nationality": "Marroc",
## "academic_year": "2025/2026",
"program": "Reforç escolar"
## }
## ],
## "relationships": [
## {
## "teacher_email": "anna.serra@example.com",
"student_code": "ESF-2025-001",
"program": "Reforç escolar",
## "academic_year": "2025/2026"
## }
## ]
## }
## ```

### Notas sobre el formato

- `academic_years`, `programs`, `schools` son opcionales — si se omiten, deben
existir ya en la BD
para que las referencias de students/relationships funcionen
- `teachers[].role` siempre debe ser `"professional"` (se ignora cualquier otro valor)
- `students[].school_abbreviation` debe coincidir con una escuela existente o incluida
en `schools[]`
- `students[].grade_key` debe ser uno de los valores válidos (I3, I4, I5, 1P–6P,
## 1E–4E, 1B–2B)
- `students[].academic_year` y `students[].program` son opcionales — si se incluyen,
el alumno
se inscribe automáticamente
- `relationships[]` — todas las referencias deben resolverse (error si no)

## ---

## Anexo C — Checklist pre-despliegue

## ### Backend
- [ ] AUTH_BYPASS=false configurado
- [ ] SECRET_KEY real configurada (≥64 chars)
- [ ] DATABASE_URL apunta a PostgreSQL
- [ ] CORS_ORIGINS configurado con dominio real
- [ ] WEBSOCKET_ENABLED=false
- [ ] DEMO_MODE_ENABLED=false (o true si es demo)

- [ ] Health check responde OK con BD conectada
- [ ] Login funciona con credenciales reales
- [ ] Crear sesión funciona
- [ ] Analytics básicos funcionan
- [ ] Endpoints donor públicos funcionan sin auth
- [ ] Import JSON funciona end-to-end

## ### Frontend
- [ ] VITE_API_BASE_URL configurado
- [ ] No hay fallbacks a localhost
- [ ] Login funciona
- [ ] Rol voluntario funciona completo
- [ ] Rol coordinador funciona completo
- [ ] Portal donante funciona sin login
- [ ] Selector de año escolar funciona
- [ ] Importación JSON funciona
- [ ] Responsive: móvil OK
- [ ] Responsive: tablet OK
- [ ] Responsive: desktop OK

## ### Datos
- [ ] No hay usuarios demo con contraseñas conocidas en producción
- [ ] No hay datos personales reales de menores expuestos públicamente
- [ ] Portal donante solo muestra datos agregados/anonimizados

## ### Infraestructura
- [ ] Vercel desplegado y accesible
- [ ] Render desplegado y accesible
- [ ] Neon conectado y funcionando
- [ ] Rewrite Vercel → Render funciona
- [ ] HTTPS en todos los endpoints
## ```
