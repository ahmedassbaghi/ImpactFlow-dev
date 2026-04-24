import { useMutation } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { BarChart3, Building2, Eye, Lock, Mail, Shield, UserCheck, Users } from "lucide-react";
import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { login } from "../api/auth";
import { useAuthStore } from "../stores/authStore";

const DEMO_PROFILES = [
  {
    role: "coordinator",
    label: "Coordinadora",
    description: "Dashboard, informes, gestió d'equip i participants",
    email: "coord1@impactflow.dev",
    password: "coord123",
    icon: Users,
    color: "var(--brand-500)",
    bg: "var(--brand-100)",
  },
  {
    role: "professional",
    label: "Professional",
    description: "Registre de sessions, observacions i seguiment diari",
    email: "prof1@impactflow.dev",
    password: "prof123",
    icon: UserCheck,
    color: "#10b981",
    bg: "#d1fae5",
  },
  {
    role: "donor",
    label: "Donant",
    description: "Portal d'impacte, SROI i evidència agregada",
    email: "donor@impactflow.dev",
    password: "donor123",
    icon: Eye,
    color: "#f59e0b",
    bg: "#fef3c7",
  },
];

function getRoleRedirect(role: string) {
  if (role === "professional") return "/professional/session-logger";
  if (role === "coordinator" || role === "admin") return "/coordinator/dashboard";
  return "/donor/impact-portal";
}

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [activeProfile, setActiveProfile] = useState<string | null>(null);
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);

  const mutation = useMutation({
    mutationFn: (creds: { email: string; password: string }) => login(creds.email, creds.password),
    onSuccess: (data) => {
      setAuth({
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        role: data.role as any,
        userId: data.user_id,
      });
      navigate(getRoleRedirect(data.role));
    },
    onError: () => setActiveProfile(null),
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    mutation.mutate({ email, password });
  };

  const onProfileLogin = (profile: (typeof DEMO_PROFILES)[number]) => {
    setActiveProfile(profile.role);
    setEmail(profile.email);
    setPassword(profile.password);
    mutation.mutate({ email: profile.email, password: profile.password });
  };

  return (
    <div className="login-root">
      {/* Left — Brand panel */}
      <div className="login-brand">
        <div className="login-brand-inner">
          <div className="login-logo">
            <BarChart3 size={32} strokeWidth={2.5} />
            <span>ImpactFlow</span>
          </div>
          <h1 className="login-brand-title">
            De l'activitat<br />a l'evidència.
          </h1>
          <p className="login-brand-sub">
            Plataforma de mesura d'impacte social per a entitats educatives i d'integració.
          </p>

          <div className="login-features">
            <div className="login-feature">
              <Shield size={16} />
              <span>IPI — Índex de Progrés Integral</span>
            </div>
            <div className="login-feature">
              <BarChart3 size={16} />
              <span>SROI Network Standard (2012)</span>
            </div>
            <div className="login-feature">
              <Building2 size={16} />
              <span>Evidència per a subvencions i donants</span>
            </div>
          </div>

          <div className="login-org-badge">
            <span className="login-org-name">Narinan</span>
            <span className="login-org-plan">Pla Pro · Demo 2025</span>
          </div>
        </div>
      </div>

      {/* Right — Login form */}
      <div className="login-form-panel">
        <motion.div
          className="login-card"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
        >
          <div className="login-card-header">
            <h2 className="login-card-title">Benvingut/da</h2>
            <p className="login-card-sub">Accedeix al teu perfil o prova la demo</p>
          </div>

          {/* Demo profiles */}
          <div className="login-profiles-label">Accés ràpid per perfil</div>
          <div className="login-profiles">
            {DEMO_PROFILES.map((profile) => {
              const Icon = profile.icon;
              const isLoading = mutation.isPending && activeProfile === profile.role;
              return (
                <motion.button
                  key={profile.role}
                  type="button"
                  className={`login-profile-card ${activeProfile === profile.role ? "login-profile-card--active" : ""}`}
                  style={{ "--profile-color": profile.color, "--profile-bg": profile.bg } as React.CSSProperties}
                  onClick={() => onProfileLogin(profile)}
                  disabled={mutation.isPending}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <div className="login-profile-icon">
                    {isLoading ? (
                      <div className="login-spinner" />
                    ) : (
                      <Icon size={18} strokeWidth={2} />
                    )}
                  </div>
                  <div className="login-profile-text">
                    <span className="login-profile-label">{profile.label}</span>
                    <span className="login-profile-desc">{profile.description}</span>
                  </div>
                </motion.button>
              );
            })}
          </div>

          <div className="login-divider">
            <span>o inicia sessió manualment</span>
          </div>

          {/* Manual form */}
          <form onSubmit={onSubmit} className="login-form">
            <label className="login-field">
              <span className="login-field-label">
                <Mail size={13} /> Email
              </span>
              <input
                type="email"
                placeholder="email@organitzacio.cat"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </label>
            <label className="login-field" style={{ marginTop: "0.75rem" }}>
              <span className="login-field-label">
                <Lock size={13} /> Contrasenya
              </span>
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </label>

            {mutation.isError && (
              <p className="login-error">Credencials incorrectes. Torna-ho a intentar.</p>
            )}

            <button
              type="submit"
              className="login-submit-btn"
              disabled={mutation.isPending || !email || !password}
            >
              {mutation.isPending && !activeProfile ? "Entrant..." : "Entrar"}
            </button>
          </form>
        </motion.div>
      </div>
    </div>
  );
}
