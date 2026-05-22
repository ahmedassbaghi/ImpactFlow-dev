import {
  Atom,
  BarChart3,
  BookOpen,
  Building2,
  Command,
  FileText,
  FlaskConical,
  FolderKanban,
  Heart,
  History,
  LayoutDashboard,
  LogOut,
  Moon,
  Settings,
  Sun,
  Target,
  Users,
  Zap,
} from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuthStore } from "../../stores/authStore";
import { useThemeStore } from "../../stores/themeStore";
import { QuickLoggerFAB } from "../sessions/QuickLoggerFAB";
import { CommandPalette } from "../common/CommandPalette";
import { NotificationBell } from "../common/NotificationBell";
import { PageTransition } from "../common/PageTransition";
import { avatarStyle, avatarInitial } from "../../utils/hueAvatar";

const ROLE_META: Record<string, { label: string; color: string; bg: string }> = {
  admin:        { label: "Admin",        color: "#c45a08", bg: "#fff4eb" },
  coordinator:  { label: "Coordinadora", color: "#c45a08", bg: "#fff4eb" },
  professional: { label: "Voluntari/a", color: "#059669", bg: "#d1fae5" },
  donor:        { label: "Donant",       color: "#d97706", bg: "#fef3c7" },
  viewer:       { label: "Visitant",     color: "#64748b", bg: "#f1f5f9" },
};

const NAV_LINKS: Record<string, { to: string; label: string; icon: React.ElementType }[]> = {
  professional: [
    { to: "/professional/session-logger", label: "Registre",         icon: Zap },
    { to: "/coordinator/sessions",        label: "Historial",        icon: History },
    { to: "/coordinator/participants",    label: "Alumnes",          icon: Users },
    { to: "/voluntari/progress",          label: "Progrés",          icon: BarChart3 },
  ],
  coordinator: [
    { to: "/coordinator/dashboard",          label: "Dashboard",          icon: LayoutDashboard },
    { to: "/coordinator/participants",       label: "Alumnes",             icon: Users },
    { to: "/coordinator/schools",            label: "Escoles",             icon: Building2 },
    { to: "/coordinator/programs",           label: "Programes",           icon: FolderKanban },
    { to: "/coordinator/sessions",          label: "Historial",           icon: History },
    { to: "/coordinator/simulation",        label: "Simulació",           icon: FlaskConical },
    { to: "/coordinator/micro-goals",        label: "Micro-objectius",     icon: Target },
    { to: "/professional/session-logger",    label: "Registre",            icon: Zap },
    { to: "/coordinator/advanced",           label: "Anàlisi avançada",   icon: Atom },
    { to: "/coordinator/reports",            label: "Informes",            icon: FileText },
    { to: "/coordinator/users",              label: "Usuaris",             icon: Settings },
    { to: "/coordinator/gestio",             label: "Gestió",              icon: Settings },
    { to: "/coordinator/landing",            label: "Web",                 icon: BookOpen },
  ],
  admin: [
    { to: "/coordinator/dashboard",          label: "Dashboard",          icon: LayoutDashboard },
    { to: "/coordinator/participants",       label: "Alumnes",             icon: Users },
    { to: "/coordinator/schools",            label: "Escoles",             icon: Building2 },
    { to: "/coordinator/programs",           label: "Programes",           icon: FolderKanban },
    { to: "/coordinator/sessions",          label: "Historial",           icon: History },
    { to: "/coordinator/simulation",        label: "Simulació",           icon: FlaskConical },
    { to: "/coordinator/micro-goals",        label: "Micro-objectius",     icon: Target },
    { to: "/professional/session-logger",    label: "Registre",            icon: Zap },
    { to: "/coordinator/advanced",           label: "Anàlisi avançada",   icon: Atom },
    { to: "/coordinator/reports",            label: "Informes",            icon: FileText },
    { to: "/coordinator/users",              label: "Usuaris",             icon: Settings },
    { to: "/coordinator/gestio",             label: "Gestió",              icon: Settings },
    { to: "/coordinator/landing",            label: "Web",                 icon: BookOpen },
    { to: "/admin/control-center",           label: "Admin",               icon: BookOpen },
  ],
  donor: [
    { to: "/donor/impact-portal", label: "Portal d'impacte", icon: Heart },
  ],
  viewer: [
    { to: "/donor/impact-portal", label: "Portal d'impacte", icon: Heart },
  ],
};

export function AppShell({ children }: { children: React.ReactNode }) {
  const role   = useAuthStore((s) => s.role)   ?? "viewer";
  const userId = useAuthStore((s) => s.userId);
  const clear  = useAuthStore((s) => s.clear);
  const navigate  = useNavigate();
  const location  = useLocation();
  const theme  = useThemeStore((s) => s.theme);
  const toggleTheme = useThemeStore((s) => s.toggle);

  const logout = () => { clear(); navigate("/login"); };

  const links    = NAV_LINKS[role]  ?? NAV_LINKS.viewer;
  const roleMeta = ROLE_META[role]  ?? ROLE_META.viewer;
  const avatarKey = userId ?? role;
  const isCoordinatorShell = role === "coordinator" || role === "admin";

  return (
    <div className={`app-shell${isCoordinatorShell ? " app-shell--coordinator" : ""}`}>
      {/* ── Top navigation ── */}
      <header className="topnav">
        {/* Brand */}
        <Link to="/" className="topnav-brand">
          <div className="topnav-brand-icon">
            <BarChart3 size={16} strokeWidth={2.5} />
          </div>
          <span className="topnav-brand-name">ImpactFlow</span>
        </Link>

        {/* Nav links */}
        <nav className="topnav-nav">
          {links.map(({ to, label, icon: Icon }) => {
            const isActive = location.pathname === to || location.pathname.startsWith(to + "/");
            return (
              <Link
                key={to}
                to={to}
                className={`topnav-link${isActive ? " active" : ""}`}
              >
                <Icon size={14} strokeWidth={2} />
                {label}
              </Link>
            );
          })}
        </nav>

        {/* Right side */}
        <div className="topnav-right">
          {/* Command palette opener */}
          <button
            className="topnav-cmd"
            onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true }))}
            title="Command palette (Ctrl+K)"
          >
            <Command size={13} strokeWidth={2.2} />
            <span className="topnav-cmd-text">Cerca…</span>
            <kbd className="topnav-cmd-kbd">⌘K</kbd>
          </button>

          {/* Theme toggle */}
          <button
            className="topnav-icon-btn"
            onClick={toggleTheme}
            title={theme === "dark" ? "Mode clar" : "Mode fosc"}
            aria-label="Canviar tema"
          >
            {theme === "dark" ? <Sun size={15} strokeWidth={2} /> : <Moon size={15} strokeWidth={2} />}
          </button>

          {/* Notifications */}
          <NotificationBell />

          {/* Role badge */}
          <span
            className="topnav-role-badge"
            style={{ background: roleMeta.bg, color: roleMeta.color }}
          >
            {roleMeta.label}
          </span>

          {/* Avatar (hue-based) */}
          <div
            className="topnav-avatar"
            style={avatarStyle(avatarKey)}
            title={`ID ${userId?.slice(0, 8) ?? "—"}`}
          >
            {avatarInitial(userId ?? role)}
          </div>

          <button className="topnav-logout" onClick={logout} title="Tancar sessió">
            <LogOut size={14} strokeWidth={2} />
            <span>Sortir</span>
          </button>
        </div>
      </header>

      {/* ── Page content ── */}
      <div className="shell-content">
        <div className="container">
          <main>
            <PageTransition>{children}</PageTransition>
          </main>
        </div>
      </div>

      {/* ── Floating quick-logger ── */}
      <QuickLoggerFAB />

      {/* ── Command Palette ── */}
      <CommandPalette />
    </div>
  );
}
