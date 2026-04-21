import { Link } from "react-router-dom";

type FeatureItem = {
  name: string;
  description: string;
  status: "disponible" | "parcial" | "pendiente";
  route?: string;
  note?: string;
};

const features: { section: string; items: FeatureItem[] }[] = [
  {
    section: "Nucleo del producto",
    items: [
      {
        name: "Quick Session Logger",
        description: "Captura observaciones post-sesion para convertir actividad diaria en evidencia medible.",
        status: "disponible",
        route: "/professional/session-logger",
      },
      {
        name: "Participantes",
        description: "Alta y visualizacion de participantes con datos clave y trazabilidad del seguimiento.",
        status: "disponible",
        route: "/coordinator/participants",
      },
      {
        name: "Dashboard coordinador",
        description: "Muestra metricas de programa (activos, IPI medio y riesgo alto) para toma de decisiones.",
        status: "disponible",
        route: "/coordinator/dashboard",
      },
      {
        name: "Portal donantes",
        description: "Vista agregada y publica para comunicar impacto sin exponer datos sensibles.",
        status: "disponible",
        route: "/donor/impact-portal",
      },
    ],
  },
  {
    section: "Gobierno y gestion",
    items: [
      {
        name: "Usuarios y roles",
        description: "Gestiona altas de usuarios y asignacion de rol para operar por permisos.",
        status: "disponible",
        route: "/coordinator/users",
      },
      {
        name: "Planes y configuracion",
        description: "Permite ver y cambiar plan de organizacion para control de alcance funcional.",
        status: "disponible",
        route: "/settings/plans",
      },
      {
        name: "Resumen operativo",
        description: "Explica el modelo completo de valor para alinear equipo y stakeholders.",
        status: "disponible",
        route: "/overview",
      },
    ],
  },
  {
    section: "Motor de impacto y analitica",
    items: [
      {
        name: "IPI (Indice de Progreso Integral)",
        description: "Calcula progreso compuesto por dimensiones academica, cognitiva, social e integracion.",
        status: "disponible",
        note: "Activo en backend al registrar evaluaciones periodicas.",
      },
      {
        name: "Risk score de abandono",
        description: "Prioriza casos segun factores de asistencia, evolucion y estado reciente.",
        status: "disponible",
        note: "Activo en backend en evaluaciones periodicas.",
      },
      {
        name: "Prediccion longitudinal",
        description: "Proyecta tendencia de IPI para anticipar intervenciones tempranas.",
        status: "disponible",
        note: "Activo en backend para endpoint de evolucion.",
      },
      {
        name: "Alertas operativas",
        description: "Panel accionable para riesgo alto, inactividad y caidas de progreso.",
        status: "parcial",
        note: "Motor backend disponible; panel visual avanzado pendiente.",
      },
    ],
  },
  {
    section: "Automatizacion e informes",
    items: [
      {
        name: "Generacion de informes",
        description: "Construye informe trimestral con narrativa y metricas para subvenciones.",
        status: "disponible",
        route: "/coordinator/dashboard",
        note: "Se lanza desde el dashboard con Program ID.",
      },
      {
        name: "NLP de notas cualitativas",
        description: "Interpreta texto libre para extraer sentimiento, tags y resumen operativo.",
        status: "disponible",
        note: "Usa IA si hay API key; fallback offline sin bloqueo.",
      },
      {
        name: "Export PDF avanzado",
        description: "Presentacion final de informe editable para entrega institucional.",
        status: "pendiente",
      },
      {
        name: "Comparacion de cohortes visual",
        description: "Compara grupos de intervencion/control para reforzar atribucion de impacto.",
        status: "parcial",
        note: "Endpoint backend disponible; visualizacion avanzada pendiente.",
      },
    ],
  },
];

export default function AdminControlCenterPage() {
  return (
    <div className="grid">
      <div className="page-header">
        <h1 style={{ margin: 0 }}>Centro de Control Admin</h1>
        <span className="chip">Vista global de desarrollo</span>
      </div>

      <div className="card">
        <h3>Problema origen y respuesta</h3>
        <p className="muted">
          Problema origen: las entidades observan cambio, pero no pueden demostrar impacto atribuible de forma objetiva.
        </p>
        <p className="muted">
          Respuesta ImpactFlow: capturamos evidencia de sesion, calculamos IPI/riesgo, y lo convertimos en decisiones
          operativas e informes para coordinacion y donantes.
        </p>
      </div>

      {features.map((group) => (
        <div className="card" key={group.section}>
          <h3>{group.section}</h3>
          <div className="grid grid-2">
            {group.items.map((item) => (
              <div className="card feature-card" key={item.name}>
                <div className="feature-card-header">
                  <strong>{item.name}</strong>
                  <span className={`status-badge ${item.status}`}>{item.status}</span>
                </div>
                <p className="muted">{item.description}</p>
                {item.note && <p className="muted">Nota: {item.note}</p>}
                {item.route ? (
                  <Link className="btn-secondary" to={item.route}>
                    Abrir modulo
                  </Link>
                ) : (
                  <span className="muted">Sin pantalla directa en esta iteracion.</span>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
