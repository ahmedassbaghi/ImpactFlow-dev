import { useAuthStore } from "../stores/authStore";
import { Link } from "react-router-dom";

const items = [
  {
    title: "1) Registra actividad",
    text: "El profesional registra observaciones de sesión con evidencia cuantitativa y cualitativa.",
  },
  {
    title: "2) ImpactFlow calcula",
    text: "El sistema calcula IPI, riesgo y tendencia para detectar mejora o retroceso de forma objetiva.",
  },
  {
    title: "3) Coordina y reporta",
    text: "Coordinación prioriza casos, gestiona equipos y genera informes listos para subvenciones y donantes.",
  },
];

export default function OverviewPage() {
  const role = useAuthStore((s) => s.role);
  const keyActions =
    role === "professional"
      ? [
          { to: "/professional/session-logger", label: "Registrar sesión ahora", primary: true },
          { to: "/coordinator/participants", label: "Abrir participantes" },
        ]
      : role === "coordinator" || role === "admin"
        ? [
            { to: "/professional/session-logger", label: "Registrar sesión", primary: true },
            { to: "/coordinator/dashboard", label: "Ver dashboard" },
            { to: "/coordinator/participants", label: "Gestionar participantes" },
          ]
        : [{ to: "/donor/impact-portal", label: "Ver impacto agregado", primary: true }];

  return (
    <div className="grid">
      <div className="page-header">
        <h1 style={{ margin: 0 }}>Resumen operativo</h1>
        <span className="chip">Rol activo: {role ?? "sin rol"}</span>
      </div>
      <div className="card">
        <h3>Funciones clave</h3>
        <div className="quick-actions-row">
          {keyActions.map((action) => (
            <Link key={action.to} to={action.to} className={action.primary ? "btn-quick-primary" : "btn-secondary"}>
              {action.label}
            </Link>
          ))}
        </div>
      </div>
      <div className="card">
        <h3>Qué hace ImpactFlow</h3>
        <p className="muted">
          Convierte observaciones cotidianas en evidencia atribuible de impacto social y educativo.
        </p>
      </div>
      <div className="grid grid-3">
        {items.map((item) => (
          <div className="card" key={item.title}>
            <h3>{item.title}</h3>
            <p className="muted">{item.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
