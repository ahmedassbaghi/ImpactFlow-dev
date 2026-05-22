# Prompt de contexto — ImpactFlow (enfoque en registro y mejora del onboarding)

Copia y pega este bloque en un asistente de diseño/UX o desarrollo cuando quieras iterar la pantalla de registro u otras áreas de la app.

---

## Contexto de la aplicación

**ImpactFlow** es una plataforma de medición de impacto social para entidades educativas y de integración (demo: **Fundación Narinan**, Cataluña). Convierte la actividad diaria (sesiones con menores) en evidencia cuantificable para coordinación, informes y donantes.

### Stack
- **Frontend:** React 18, Vite, TypeScript, React Router, TanStack Query, Zustand, Recharts, Framer Motion, Lucide icons, Nunito.
- **Backend:** FastAPI, SQLAlchemy async, SQLite (dev), JWT, Pydantic.
- **Monorepo:** `apps/frontend`, `apps/backend`. API bajo `/api/v1`.

### Roles
| Rol | Interfaz | Uso principal |
|-----|----------|----------------|
| `coordinator` / `admin` | Escritorio (`AppShell`, tema naranja Narinan) | Dashboard, alumnos, programas, usuarios, informes, SROI |
| `professional` | Móvil (`MobileShell`, tema Narinan claro) | Registro de sesiones, observaciones IPI, seguimiento |
| `donor` / `viewer` | Portal impacto | Métricas agregadas, calculadora SROI (sin jerga técnica) |
| `pending` | Sin acceso | Usuario recién registrado, en espera de activación |

### Conceptos clave
- **IPI (Índex de Progrés Integral):** 0–100, cuatro dimensiones (académico, cognitivo, social, integración).
- **Sesiones:** registro por voluntario con asistencia, puntuaciones, notas cualitativas y etiquetas rápidas.
- **SROI:** valor social vs inversión operativa; coste del período = sesiones registradas × 10 €/sesión (no sueldo de voluntarios).
- **Multi-tenant:** usuarios pertenecen a una `Organization` (slug `narinan` en demo).

### Rutas de autenticación (frontend)
- `/login` — fondo naranja Narinan, logo, email **o** nombre de usuario + contraseña. Acceso rápido demo (esquina).
- `/register` — mismo estilo; formulario de alta pública.

### Flujo de registro actual (implementado)

**Pantalla (`Register.tsx`):**
- Campos: email, nombre completo, nombre de usuario (3+ caracteres, `[a-zA-Z0-9._]`), contraseña (mín. 4 caracteres, requisitos flojos).
- Validación en cliente con mensajes en catalán.
- Tras éxito: mensaje de que el cuenta queda **en espera**; enlace a login.

**API `POST /api/v1/auth/register`:**
- Body: `email`, `full_name`, `username`, `password`, `organization_slug` (default `narinan`).
- Crea `User` con `role: "pending"`, `is_active: false`.
- Errores 409 si email o username duplicados.

**Activación (coordinador → Usuaris):**
- Lista de cuentas pendientes.
- Coordinador elige rol (`coordinator` o `professional`) y pulsa «Activar compte».
- `PATCH /api/v1/users/{id}/activate` → `is_active: true`, rol asignado.

**Login:**
- `POST /api/v1/auth/login` con campo `login` (email o username).
- 403 si `pending` o inactivo.

### Identidad visual auth
- Degradado/mesh naranja oscuro (`#c45a08`–`#6e3204`), sin tarjeta blanca.
- Logo Narinan centrado, pastilla «ImpactFlow · De l'activitat a l'evidència».
- Pie: «Made with ♥ love by ImpactFlow».
- Botón Demo (esquina) con perfiles lucide: coordinadora, voluntario, donante.

### Otras áreas relacionadas con “registro”
- **Registro de sesiones** (`QuickSessionLogger`): distinto del registro de usuarios; etiquetas rápidas con iconos Lucide (no emojis) para insertar frases en la nota de observación.
- **Crear usuario por coordinador:** formulario en `UsersRolesPage` (activo de inmediato, rol elegido por coordinador).

---

## Objetivo de esta iteración

**Mejorar la pantalla de registro de usuario** (`/register`) para que sea más completa, clara y alineada con Narinan/ImpactFlow, sin romper el flujo de activación por coordinador.

### Estado actual (limitaciones)
- Formulario mínimo (4 campos + submit).
- Sin pasos/wizard, sin confirmación de contraseña, sin aceptación de términos/privacidad.
- Sin indicador de fortaleza de contraseña (solo mínimo 4 caracteres).
- Sin verificación de email.
- Sin elección de rol (correcto: lo asigna el coordinador).
- Sin contexto de “qué es ImpactFlow” más allá del header de marca.
- Idioma: catalán en UI; organización fija `narinan`.

### Direcciones a explorar (el product owner quiere explorar formas de hacerlo más completo)

1. **UX / contenido**
   - Pasos: (1) datos personales, (2) credenciales, (3) resumen / éxito.
   - Texto breve: qué pasa después del registro (activación por coordinador, plazo estimado).
   - Enlace claro a login si ya tiene cuenta.

2. **Campos opcionales futuros**
   - Teléfono, idioma preferido, centro/escuela de referencia (solo informativo).
   - Confirmar contraseña.
   - Checkbox “He llegit la política de privacitat” (COGA / RGPD).

3. **Validación y feedback**
   - Comprobar disponibilidad de username en tiempo real (debounce → API).
   - Mensajes de error accesibles (`aria-live`, contraste WCAG 2.1 AA).
   - Mantener requisitos de contraseña **flojos** (sin exigir símbolos).

4. **Backend (si se amplía)**
   - Campos extra en `User` o tabla `registration_requests`.
   - Email de notificación al coordinador cuando hay un `pending` nuevo.
   - Rate limiting en `/auth/register`.

5. **Coherencia visual**
   - Misma línea que login (naranja, Nunito, sin caja blanca).
   - Desktop-first en coordinador; registro puede seguir mobile-friendly pero no es shell móvil.

### Restricciones que NO deben cambiar sin decisión explícita
- El usuario registrado debe seguir en `pending` + `is_active: false` hasta activación.
- Solo coordinador/admin activa y asigna rol (`coordinator` | `professional`).
- No auto-login tras registro.

### Archivos relevantes
```
apps/frontend/src/pages/Register.tsx
apps/frontend/src/pages/Login.tsx
apps/frontend/src/components/auth/AuthScreenLayout.tsx
apps/frontend/src/components/auth/AuthBrandHeader.tsx
apps/frontend/src/styles/auth-mobile.css
apps/frontend/src/api/auth.ts
apps/frontend/src/utils/passwordValidation.ts
apps/frontend/src/utils/usernameValidation.ts
apps/backend/app/routes/auth.py
apps/backend/app/schemas/api.py (RegisterRequest)
apps/frontend/src/pages/coordinator/UsersRolesPage.tsx
DOCUMENTACION_IMPACTFLOW.md
```

### Credenciales demo (solo desarrollo)
- Coordinador: `coord1@impactflow.dev` / `coord123`
- Voluntario: `prof1@impactflow.dev` / `prof123`
- Donante: `donor@impactflow.dev` / `donor123`

---

## Tarea para el asistente

Propón y/o implementa mejoras concretas para la pantalla de registro: wireframe o código, priorizando claridad, accesibilidad y el flujo pending → activación por coordinador. Indica qué requiere cambios solo de frontend vs backend. El product owner quiere **explorar** varias opciones antes de cerrar el diseño final.
