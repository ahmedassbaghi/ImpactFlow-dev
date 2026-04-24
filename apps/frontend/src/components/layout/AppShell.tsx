import {
  BarChart3,
  BookOpen,
  ChevronRight,
  FileText,
  Heart,
  LayoutDashboard,
  LogOut,
  Target,
  Users,
  Zap,
  Settings,
} from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuthStore } from "../../stores/authStore";

const ROLE_META: Record<string, { label: string; color: string; bg: string }> = {
  admin:        { label: "Admin",        color: "#7c3aed", bg: "#ede9fe" },
  coordinator:  { label: "Coordinadora", color: "#2563eb", bg: "#dbeafe" },
  professional: { label: "Professional", color: "#059669", bg: "#d1fae5" },
  donor:        { label: "Donant",       color: "#d97706", bg: "#fef3c7" },
  viewer:       { label: "Visitant",     color: "#64748b", bg: "#f1f5f9" },
};

const NAV_LINKS: Record<string, { to: string; label: string; icon: React.ElementType }[]> = {
  professional: [
    { to: "/professional/session-logger", label: "Registre de sessió",  icon: Zap },
    { to: "/coordinator/participants",    label: "Participants",         icon: Users },
    { to: "/coordinator/micro-goals",     label: "Micro-objectius",      icon: Target },
  ],
  coordinator: [
    { to: "/coordinator/dashboard",   label: "Dashboard",           icon: LayoutDashboard },
    { to: "/coordinator/participants",label: "Participants",         icon: Users },
    { to: "/coordinator/micro-goals", label: "Micro-objectius",     icon: Target },
    { to: "/coordinator/reports",     label: "Informes",            icon: FileText },
    { to: "/coordinator/users",       label: "Usuaris i rols",      icon: Settings },
    { to: "/professional/session-logger", label: "Registre ràpid", icon: Zap },
  ],
  admin: [
    { to: "/coordinator/dashboard",   label: "Dashboard",           icon: LayoutDashboard },
    { to: "/coordinator/participants",label: "Participants",         icon: Users },
    { to: "/coordinator/micro-goals", label: "Micro-objectius",     icon: Target },
    { to: "/coordinator/reports",     label: "Informes",            icon: FileText },
    { to: "/coordinator/users",       label: "Usuaris i rols",      icon: Settings },
    { to: "/professional/session-logger", label: "Registre ràpid", icon: Zap },
    { to: "/admin/control-center",    label: "Control d'admin",     icon: BookOpen },
  ],
  donor: [
    { to: "/donor/impact-portal", label: "Portal d'impacte", icon: Heart },
  ],
  viewer: [
    { to: "/donor/impact-portal", label: "Portal d'impacte", icon: Heart },
  ],
};

const PRIMARY_ACTION: Record<string, { to: string; label: string }> = {
  professional: { to: "/professional/session-logger", label: "Registrar sessió" },
  coordinator:  { to: "/professional/session-logger", label: "Registrar sessió" },
  admin:        { to: "/professional/session-logger", label: "Registrar sessió" },
  donor:        { to: "/donor/impact-portal",         label: "Veure impacte" },
  viewer:       { to: "/donor/impact-portal",         label: "Veure impacte" },
};

export function AppShell({ children }: { children: React.ReactNode }) {
  const role    = useAuthStore((s) => s.role) ?? "viewer";
  const userId  = useAuthStore((s) => s.userId);
  const clear   = useAuthStore((s) => s.clear);
  const navigate   = useNavigate();
  const location   = useLocation();

  const logout = () => { clear(); navigate("/login"); };

  const links       = NAV_LINKS[role]      ?? NAV_LINKS.viewer;
  const primary     = PRIMARY_ACTION[role] ?? PRIMARY_ACTION.viewer;
  const roleMeta    = ROLE_META[role]      ?? ROLE_META.viewer;

  // Build a readable page title from current route
  const PAGE_TITLES: Record<string, string> = {
    "/coordinator/dashboard":        "Dashboard",
    "/coordinator/participants":     "Participants",
    "/coordinator/reports":          "Informes",
    "/coordinator/micro-goals":      "Micro-objectius",
    "/coordinator/users":            "Usuaris i rols",
    "/professional/session-logger":  "Registre de sessió",
    "/donor/impact-portal":          "Portal d'impacte",
    "/admin/control-center":         "Control centre",
    "/overview":                     "Resum",
    "/settings/plans":               "Plans",
  };
  const basePath    = "/" + location.pathname.split("/").slice(1, 3).join("/");
  const pageTitle   = PAGE_TITLES[basePath] ?? PAGE_TITLES[location.pathname] ?? "ImpactFlow";

  return (
    <div className="app-shell">
      {/* ── Sidebar ── */}
      <aside className="sidebar">
        {/* Logo */}
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon">
            <BarChart3 size={18} strokeWidth={2.5} />
          </div>
          <div>
            <div className="brand">ImpactFlow</div>
            <div className="sidebar-subtitle">De l'activitat a l'impacte</div>
          </div>
        </div>

        {/* Role badge */}
        <div
          className="sidebar-role-badge"
          style={{ background: roleMeta.bg, color: roleMeta.color }}
        >
          {roleMeta.label}
        </div>

        {/* Primary CTA */}
        <Link
          to={primary.to}
          className="sidebar-cta"
        >
          <Zap size={15} strokeWidth={2.5} />
          {primary.label}
        </Link>

        {/* Nav */}
        <nav className="sidebar-nav">
          {links.map(({ to, label, icon: Icon }) => {
            const isActive = location.pathname === to || location.pathname.startsWith(to + "/");
            return (
              <Link
                key={to}
                to={to}
                className={`sidebar-link ${isActive ? "active" : ""}`}
              >
                <Icon size={16} strokeWidth={2} className="sidebar-link-icon" />
                <span>{label}</span>
                {isActive && <ChevronRight size={14} className="sidebar-link-chevron" />}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="sidebar-footer">
          <div className="sidebar-footer-user">
            <div className="sidebar-footer-avatar">
              {(userId ?? "?")[0]?.toUpperCase()}
            </div>
            <div className="sidebar-footer-info">
              <span className="sidebar-footer-role">{roleMeta.label}</span>
              <span className="sidebar-footer-id">ID {userId?.slice(0, 8) ?? "—"}</span>
            </div>
          </div>
          <button className="sidebar-logout-btn" onClick={logout} title="Tancar sessió">
            <LogOut size={15} strokeWidth={2} />
            Sortir
          </button>
        </div>
      </aside>

      {/* ── Content ── */}
      <div className="shell-content">
        {/* Topbar */}
        <header className="shell-topbar">
          <div className="shell-topbar-title">{pageTitle}</div>
          <div className="shell-topbar-right">
            <Link to="/donor/impact-portal" className="shell-topbar-portal-link">
              Portal donant
            </Link>
          </div>
        </header>

        {/* Page */}
        <div className="container">
          <main>{children}</main>
        </div>
      </div>
    </div>
  );
}
