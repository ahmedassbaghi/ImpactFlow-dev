import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Activity, ArrowRight, BarChart3, LayoutDashboard, Target, TrendingUp, Users, Zap } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuthStore } from "../stores/authStore";
import { getCoordinatorDashboard } from "../api/dashboard";
import { listPrograms } from "../api/programs";

const CARD_VARIANTS = {
  hidden: { opacity: 0, y: 16 },
  visible: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.07, duration: 0.35, ease: "easeOut" } }),
};

function StatCard({ icon: Icon, label, value, color, i }: {
  icon: React.ElementType; label: string; value: string | number; color: string; i: number;
}) {
  return (
    <motion.div className="card overview-stat-card" variants={CARD_VARIANTS} custom={i} initial="hidden" animate="visible">
      <div className="overview-stat-icon" style={{ background: color + "18", color }}>
        <Icon size={18} strokeWidth={2} />
      </div>
      <div className="overview-stat-value">{value}</div>
      <div className="overview-stat-label">{label}</div>
    </motion.div>
  );
}

function ActionCard({ to, icon: Icon, title, desc, primary, i }: {
  to: string; icon: React.ElementType; title: string; desc: string; primary?: boolean; i: number;
}) {
  return (
    <motion.div variants={CARD_VARIANTS} custom={i} initial="hidden" animate="visible">
      <Link
        to={to}
        className={`card overview-action-card ${primary ? "overview-action-card--primary" : ""}`}
      >
        <div className="overview-action-icon">
          <Icon size={20} strokeWidth={2} />
        </div>
        <div className="overview-action-body">
          <div className="overview-action-title">{title}</div>
          <div className="overview-action-desc">{desc}</div>
        </div>
        <ArrowRight size={16} className="overview-action-arrow" />
      </Link>
    </motion.div>
  );
}

export default function OverviewPage() {
  const role = useAuthStore((s) => s.role) ?? "viewer";

  const { data: dashboard } = useQuery({
    queryKey: ["coordinator-dashboard"],
    queryFn: () => getCoordinatorDashboard(),
    enabled: role === "coordinator" || role === "admin",
  });

  const { data: programs = [] } = useQuery({
    queryKey: ["programs"],
    queryFn: () => listPrograms(),
    enabled: role !== "donor" && role !== "viewer",
  });

  const stats =
    role === "coordinator" || role === "admin"
      ? [
          { icon: Users,     label: "Participants actius",  value: dashboard?.total_participants ?? "—",  color: "var(--brand-500)" },
          { icon: TrendingUp,label: "IPI mitjà",            value: dashboard?.avg_ipi != null ? dashboard.avg_ipi.toFixed(1) : "—", color: "#10b981" },
          { icon: Activity,  label: "Sessions (periode)",   value: dashboard?.total_sessions ?? "—",      color: "#f59e0b" },
          { icon: Target,    label: "Risc alt",             value: dashboard?.high_risk_count ?? "—",     color: "#ef4444" },
        ]
      : role === "professional"
      ? [
          { icon: Users,  label: "Participants",   value: "—", color: "var(--brand-500)" },
          { icon: Zap,    label: "Sessions avui",  value: "—", color: "#10b981" },
          { icon: Target, label: "Programes",      value: programs.length, color: "#f59e0b" },
          { icon: BarChart3, label: "IPI global",  value: "—", color: "#8b5cf6" },
        ]
      : [];

  const actions =
    role === "coordinator" || role === "admin"
      ? [
          { to: "/coordinator/dashboard",   icon: LayoutDashboard, title: "Dashboard",           desc: "Mètriques del programa i anàlisi estadística",  primary: true },
          { to: "/coordinator/participants",icon: Users,           title: "Participants",         desc: "Gestiona i segueix el progrés individual" },
          { to: "/professional/session-logger", icon: Zap,        title: "Registrar sessió",     desc: "Afegeix observacions de sessió ràpidament" },
          { to: "/coordinator/reports",     icon: BarChart3,       title: "Informes",             desc: "Genera informes trimestrals per a donants" },
        ]
      : role === "professional"
      ? [
          { to: "/professional/session-logger", icon: Zap,         title: "Registrar sessió",  desc: "Afegeix observacions ràpidament", primary: true },
          { to: "/coordinator/participants",    icon: Users,        title: "Participants",      desc: "Consulta perfils i evolució" },
          { to: "/coordinator/micro-goals",     icon: Target,       title: "Micro-objectius",   desc: "Gestiona objectius individuals" },
        ]
      : [
          { to: "/donor/impact-portal", icon: BarChart3, title: "Portal d'impacte", desc: "Veure l'evidència d'impacte agregada", primary: true },
        ];

  return (
    <div className="grid" style={{ gap: "1.5rem" }}>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 style={{ margin: 0, fontSize: "1.4rem", fontWeight: 800, color: "var(--text-primary)" }}>
            Resum operatiu
          </h1>
          <p style={{ margin: "0.25rem 0 0", fontSize: "0.875rem", color: "var(--text-muted)" }}>
            Benvingut/da · {programs.length > 0 ? `${programs.length} programa${programs.length > 1 ? "s" : ""} actiu${programs.length > 1 ? "s" : ""}` : "Sense programes actius"}
          </p>
        </div>
        <span className="chip" style={{ fontSize: "0.78rem" }}>
          {role}
        </span>
      </div>

      {/* Stats */}
      {stats.length > 0 && (
        <div className="grid grid-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px,1fr))" }}>
          {stats.map((s, i) => (
            <StatCard key={s.label} {...s} i={i} />
          ))}
        </div>
      )}

      {/* Actions */}
      <div>
        <h3 style={{ margin: "0 0 0.75rem", fontSize: "0.85rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)" }}>
          Accions ràpides
        </h3>
        <div className="grid" style={{ gap: "0.5rem" }}>
          {actions.map((a, i) => (
            <ActionCard key={a.to} {...a} i={i + stats.length} />
          ))}
        </div>
      </div>

      {/* How it works */}
      <div className="card" style={{ padding: "1.5rem" }}>
        <h3 style={{ margin: "0 0 1rem", fontSize: "1rem", fontWeight: 700 }}>Com funciona ImpactFlow</h3>
        <div className="grid grid-3">
          {[
            { step: "01", title: "Registra activitat", text: "El professional registra observacions de sessió amb evidència quantitativa i qualitativa." },
            { step: "02", title: "ImpactFlow calcula", text: "El sistema calcula IPI, risc i tendència per detectar millora o retrocés de forma objectiva." },
            { step: "03", title: "Coordina i informa", text: "La coordinació prioritza casos, gestiona l'equip i genera informes per a subvencions i donants." },
          ].map((item) => (
            <div key={item.step} style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
              <span style={{ fontSize: "0.7rem", fontWeight: 800, color: "var(--brand-500)", letterSpacing: "0.1em" }}>
                PAS {item.step}
              </span>
              <strong style={{ fontSize: "0.9rem", color: "var(--text-primary)" }}>{item.title}</strong>
              <p className="muted" style={{ margin: 0 }}>{item.text}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

