import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuthStore } from "../../stores/authStore";

export function AppShell({ children }: { children: React.ReactNode }) {
  const role = useAuthStore((s) => s.role);
  const userId = useAuthStore((s) => s.userId);
  const clear = useAuthStore((s) => s.clear);
  const navigate = useNavigate();
  const location = useLocation();

  const logout = () => {
    clear();
    navigate("/login");
  };

  const links =
    role === "professional"
      ? [
          { to: "/professional/session-logger", label: "Registro de sesión" },
          { to: "/coordinator/micro-goals", label: "Microobjetivos" },
          { to: "/coordinator/participants", label: "Participantes" },
        ]
      : role === "admin"
        ? [
            { to: "/coordinator/dashboard", label: "Dashboard" },
            { to: "/coordinator/reports", label: "Informes" },
            { to: "/coordinator/micro-goals", label: "Microobjetivos" },
            { to: "/coordinator/participants", label: "Participantes" },
            { to: "/professional/session-logger", label: "Quick Session Logger" },
          ]
        : role === "coordinator"
          ? [
              { to: "/coordinator/dashboard", label: "Dashboard" },
              { to: "/coordinator/reports", label: "Informes" },
              { to: "/coordinator/micro-goals", label: "Microobjetivos" },
              { to: "/coordinator/participants", label: "Participantes" },
              { to: "/professional/session-logger", label: "Quick Session Logger" },
            ]
          : role === "donor" || role === "viewer"
            ? [
                { to: "/donor/impact-portal", label: "Portal donante" },
              ]
            : [
                { to: "/donor/impact-portal", label: "Portal donante" },
              ]
      ;

  const quickActions =
    role === "professional"
      ? [
          { to: "/professional/session-logger", label: "Registrar sesión", primary: true },
          { to: "/coordinator/participants", label: "Ver participantes" },
          { to: "/coordinator/participants", label: "Seguimiento de participantes" },
        ]
      : role === "admin" || role === "coordinator"
        ? [
            { to: "/professional/session-logger", label: "Registrar sesión", primary: true },
            { to: "/coordinator/micro-goals", label: "Microobjetivos" },
            { to: "/coordinator/participants", label: "Gestión participantes" },
            { to: "/coordinator/dashboard", label: "Dashboard" },
          ]
        : [
            { to: "/donor/impact-portal", label: "Portal donante", primary: true },
            { to: "/donor/impact-portal", label: "Portal donante" },
          ];

  const roadmapItems = [
    { title: "Gestión avanzada de usuarios", detail: "Permisos granulares, trazabilidad y flujos de aprobación." },
    { title: "Planificación operativa", detail: "Calendario de sesiones, capacidad y carga de profesionales." },
    { title: "Portal de financiación", detail: "Objetivos de impacto, reporting externo y seguimiento de compromisos." },
  ];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">ImpactFlow</div>
        <p className="sidebar-subtitle">De l'activitat a l'impacte</p>
        <div className="sidebar-quick">
          <div className="muted" style={{ color: "#cbd5e1" }}>
            Acceso clave
          </div>
          <Link
            to={quickActions[0].to}
            className={`sidebar-link sidebar-link-quick ${location.pathname === quickActions[0].to ? "active" : ""}`}
          >
            {quickActions[0].label}
          </Link>
        </div>
        <nav className="sidebar-nav">
          {links.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={`sidebar-link ${location.pathname === item.to ? "active" : ""}`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="sidebar-roadmap">
          <div className="sidebar-roadmap-title">Por implementar</div>
          <div className="sidebar-roadmap-list">
            {roadmapItems.map((item) => (
              <div key={item.title} className="sidebar-roadmap-item">
                <strong>{item.title}</strong>
                <span>{item.detail}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="sidebar-footer">
          <div className="muted" style={{ color: "#94a3b8" }}>
            Rol: {role ?? "invitado"} · Usuario: {userId ?? "-"}
          </div>
          <button onClick={logout}>Cerrar sesión</button>
        </div>
      </aside>
      <div className="shell-content">
        <div className="container">
          <main>{children}</main>
        </div>
      </div>
    </div>
  );
}
