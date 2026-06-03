import {
  ArrowLeft,
  History,
  LogOut,
  TrendingUp,
  UserCheck,
  Users,
  Zap,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { listAcademicYears } from "../../api/academicYears";
import { useAuthStore } from "../../stores/authStore";
import { useAcademicYearStore } from "../../stores/academicYearStore";
import { PageTransition } from "../common/PageTransition";
import { QuickLoggerFAB } from "../sessions/QuickLoggerFAB";
import { AppShell as AppShellDesktop } from "./AppShell";
import ImpactFlowLogo from "../brand/ImpactFlowLogo";

const VOLUNTEER_LINKS = [
  { to: "/professional/session-logger", label: "Registre", icon: Zap, primary: true },
  { to: "/coordinator/sessions", label: "Historial", icon: History },
  { to: "/coordinator/participants", label: "Alumnes", icon: Users },
  { to: "/voluntari/progress", label: "Progrés", icon: TrendingUp },
  { to: "/voluntari/seguiment", label: "Avaluació", icon: UserCheck },
];

const VOL_ROOT_PATHS = [
  "/professional/session-logger",
  "/coordinator/sessions",
  "/coordinator/participants",
  "/voluntari/progress",
  "/voluntari/seguiment",
];

export function MobileShell({ children }: { children: React.ReactNode }) {
  const role = useAuthStore((s) => s.role) ?? "viewer";
  const clear = useAuthStore((s) => s.clear);
  const navigate = useNavigate();
  const location = useLocation();
  const isVolunteer = role === "professional";
  const isDonor = role === "donor" || role === "viewer";
  const setYears = useAcademicYearStore((s) => s.setYears);

  const { data: academicYears } = useQuery({
    queryKey: ["academic-years"],
    queryFn: listAcademicYears,
    enabled: isVolunteer,
  });

  useEffect(() => {
    if (academicYears?.length) setYears(academicYears);
  }, [academicYears, setYears]);

  const links = isVolunteer ? VOLUNTEER_LINKS : [];

  const homePath = isDonor ? "/donor/impact-portal" : "/professional/session-logger";

  const logout = () => {
    clear();
    navigate("/login");
  };

  const showBack = isVolunteer && !VOL_ROOT_PATHS.includes(location.pathname);

  return (
    <div
      className={`mobile-shell${isVolunteer ? " mobile-shell--volunteer" : ""}${isDonor ? " mobile-shell--donor" : ""}`}
    >
      <header className="mobile-shell-header">
        <div className="vol-app-header">
          <div className="vol-app-header-start">
            {showBack ? (
              <button
                type="button"
                className="vol-app-icon-btn"
                onClick={() => navigate(-1)}
                aria-label="Tornar enrere"
              >
                <ArrowLeft size={20} strokeWidth={2.5} />
              </button>
            ) : (
              <Link to={homePath} className="vol-app-brand" aria-label="ImpactFlow — Inici">
                <ImpactFlowLogo variant="icon" height={28} />
              </Link>
            )}
          </div>
          <div className="vol-app-header-end">
            <button
              type="button"
              className="vol-app-icon-btn vol-app-icon-btn--logout"
              onClick={logout}
              aria-label="Tancar sessió"
            >
              <LogOut size={20} strokeWidth={2.5} />
            </button>
          </div>
        </div>
      </header>

      <main
        className={`mobile-shell-main${isVolunteer ? " vol-ui" : ""}${isDonor ? " donor-ui" : ""}`}
      >
        <PageTransition>{children}</PageTransition>
      </main>

      {links.length > 0 && (
        <div className="vol-bottom-nav-wrap" aria-hidden={false}>
          <nav className="mobile-bottom-nav" aria-label="Navegació principal">
            {links.map((link) => {
              const { to, label, icon: Icon } = link;
              const primary = "primary" in link && link.primary;
              const active = location.pathname === to || location.pathname.startsWith(to + "/");
              return (
                <Link
                  key={to}
                  to={to}
                  className={`mobile-nav-link${active ? " active" : ""}${primary ? " mobile-nav-link--primary" : ""}`}
                  aria-current={active ? "page" : undefined}
                >
                  <span className={primary ? "mobile-nav-icon-wrap" : undefined}>
                    <Icon size={primary ? 22 : 20} strokeWidth={2} />
                  </span>
                  <span className="mobile-nav-label">{label}</span>
                </Link>
              );
            })}
          </nav>
        </div>
      )}
    </div>
  );
}

/** Coordinator / admin use desktop AppShell; others use mobile. */
export function RoleLayout({ children }: { children: React.ReactNode }) {
  const role = useAuthStore((s) => s.role);
  if (role === "coordinator" || role === "admin") {
    return <AppShellDesktop>{children}</AppShellDesktop>;
  }
  if (role === "professional" || role === "donor" || role === "viewer") {
    return <MobileShell>{children}</MobileShell>;
  }
  return <MobileShell>{children}</MobileShell>;
}
