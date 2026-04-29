# ImpactFlow

Plataforma de mesura d'impacte social per a programes educatius i d'integració. Captura sessions, calcula l'**Índex de Progrés Integral (IPI)**, detecta participants en risc, i genera evidència estadística (Cohen's d, Wilcoxon, Bootstrap CI), retorn social de la inversió (SROI) i un portal de donants amb informe d'impacte.

---

## Stack

| Capa     | Tecnologia |
|----------|------------|
| Backend  | Python 3.11+, FastAPI, SQLAlchemy, SQLite (dev), SciPy/NumPy |
| Frontend | React 18, TypeScript, Vite 5, Zustand, React Query, Framer Motion |
| Tests    | pytest (backend), tsc strict (frontend) |

---

## Requisits previs

- **Node.js** ≥ 18 i **npm** ≥ 9
- **Python** ≥ 3.11
- **Git**

Comprova:

```bash
node --version
python --version
git --version
```

---

## Primera execució en un dispositiu nou

### 1. Clona el repositori

```bash
git clone https://github.com/ahmedassbaghi/ImpactFlow-dev.git
cd ImpactFlow-dev
```

### 2. Backend — instal·la dependències

```bash
cd apps/backend
python -m venv .venv
# Windows
.venv\Scripts\activate
# macOS / Linux
source .venv/bin/activate

pip install -r requirements.txt
# o si uses pyproject:
# pip install -e .
```

> Dependències clau: `fastapi`, `uvicorn`, `sqlalchemy`, `pydantic`, `scipy`, `numpy`.

### 3. Frontend — instal·la dependències

Des de l'arrel del projecte:

```bash
cd apps/frontend
npm install
```

### 4. Configura les variables d'entorn del frontend

Crea un fitxer `apps/frontend/.env` amb:

```env
VITE_API_BASE_URL=http://localhost:8012/api/v1
```

> Si canvies el port del backend, actualitza aquest valor.

### 5. (Opcional) Pobla la base de dades amb dades de prova

```bash
cd apps/backend
python scripts/add_varied_records.py
```

Això crea organitzacions, programes, participants, sessions i avaluacions amb variabilitat realista per provar la UI.

---

## Engegar l'aplicació

### Opció A — Script ràpid (Windows)

Des de l'arrel del repositori:

```bat
start.bat
```

Obre dues finestres: backend (port `8012`) i frontend (port `5173`). Mata processos previs en aquests ports automàticament.

### Opció B — Manual (dues terminals)

**Terminal 1 — Backend**

```bash
cd apps/backend
python run_local_backend.py
```

Per defecte arrenca a `http://127.0.0.1:8012`. Per canviar-ho:

```bash
# Windows (cmd)
set IMPACTFLOW_BACKEND_PORT=9000 && python run_local_backend.py
# Windows (PowerShell)
$env:IMPACTFLOW_BACKEND_PORT="9000"; python run_local_backend.py
# macOS / Linux
IMPACTFLOW_BACKEND_PORT=9000 python run_local_backend.py
```

**Terminal 2 — Frontend**

```bash
cd apps/frontend
npm run dev
```

Vite obre a `http://localhost:5173`.

### Comprovació ràpida

```bash
curl http://127.0.0.1:8012/api/v1/health
# {"status":"ok",...}
```

Obre `http://localhost:5173` al navegador.

---

## Comptes de prova

Si has carregat dades de prova amb `add_varied_records.py`:

| Rol           | Email                          |
|---------------|--------------------------------|
| Coordinator   | `coord@narinaan.org`           |
| Professional  | `prof1@narinaan.org`           |
| Donor         | `donor@narinaan.org`           |

(El sistema dev utilitza autenticació simulada; consulta `app/main.py` per als usuaris seedeats.)

---

## Estructura del repositori

```
ImpactFlow-dev/
├── apps/
│   ├── backend/             # FastAPI + algoritmes
│   │   ├── app/
│   │   │   ├── algorithms/  # IPI, SROI, dose-response, causal inference
│   │   │   ├── analytics/   # reliability, anomaly detection
│   │   │   ├── main.py      # endpoints + WebSocket
│   │   │   └── models/      # SQLAlchemy schemas
│   │   ├── scripts/         # seeders i utilitats
│   │   └── run_local_backend.py
│   └── frontend/            # React + Vite
│       ├── src/
│       │   ├── api/         # clients HTTP
│       │   ├── components/  # UI (analytics, sessions, common, layout)
│       │   ├── pages/       # rutes per rol (coordinator, professional, donor)
│       │   ├── stores/      # Zustand (toast, theme)
│       │   └── styles/      # CSS modular
│       └── .env             # configuració local
└── start.bat / start.ps1    # llançament ràpid Windows
```

---

## Funcionalitats clau

- **Registre de sessions** amb tres modes d'entrada:
  - Estrelles clàssiques (1-5 per dimensió)
  - **Outcomes Star** (Triangle Consulting, ancoratges descriptius per nivell)
  - **Live Reactions** (estil ClassDojo, comportaments observats en directe)
- **Motor analític**: IPI, Cohen's d, test de Wilcoxon, Bootstrap CI 95%, fiabilitat inter-avaluador (ICC)
- **SROI** (estàndard SROI Network) amb proxies calibrats al context català
- **Portal del donant** amb mètriques hero animades i informe d'evidència
- **Alertes en temps real** via WebSocket
- **Tema clar/fosc**, paleta de comandes (`Ctrl+K`), notificacions, transicions de pàgina

---

## Troubleshooting

| Problema | Solució |
|----------|---------|
| `port 8012 in use` | Mata el procés: `npx kill-port 8012` o `Get-NetTCPConnection -LocalPort 8012 \| Stop-Process -Id $_.OwningProcess -Force` |
| Frontend mostra dades velles | Borra cache del navegador (Ctrl+Shift+R), comprova `apps/frontend/.env` |
| `ModuleNotFoundError: scipy` | Activa el venv i `pip install scipy numpy` |
| WebSocket alertes no connecta | Verifica que `VITE_API_BASE_URL` apunta al port real del backend |
| `cors error` al frontend | El backend ja inclou CORS obert en mode dev; revisa que arrenques `run_local_backend.py` i no un altre script |

---

## Tests

```bash
# Backend
cd apps/backend
pytest -q

# Frontend (typecheck)
cd apps/frontend
npx tsc --noEmit
```

---

## Llicència

Projecte intern de la Fundació Narinaan. Contacta amb l'equip per a qualsevol ús extern.
