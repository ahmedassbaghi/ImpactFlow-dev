import { useMutation } from "@tanstack/react-query";
import { ChevronDown, Zap } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { fetchHealth } from "../../api/health";
import { useNavigate } from "react-router-dom";
import { login } from "../../api/auth";
import { DEMO_PROFILES, getRoleRedirect } from "../../auth/demoProfiles";
import { useAuthStore } from "../../stores/authStore";

export default function QuickAccessCorner() {
  const [demoEnabled, setDemoEnabled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    fetchHealth()
      .then((h) => setDemoEnabled(h.demo_mode))
      .catch(() => setDemoEnabled(false));
  }, []);

  if (!demoEnabled) return null;
  const [activeRole, setActiveRole] = useState<string | null>(null);
  const menuId = useId();
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
    onError: () => setActiveRole(null),
  });

  const onDemo = (profile: (typeof DEMO_PROFILES)[number]) => {
    setActiveRole(profile.role);
    mutation.mutate({ email: profile.email, password: profile.password });
  };

  return (
    <div className="auth-quick-corner">
      <button
        type="button"
        className="auth-quick-trigger"
        aria-expanded={open}
        aria-controls={menuId}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
      >
        <Zap size={16} aria-hidden />
        <span>Demo</span>
        <ChevronDown size={14} aria-hidden className={open ? "auth-quick-chevron--open" : ""} />
      </button>
      {open && (
        <ul id={menuId} className="auth-quick-menu" role="menu">
          {DEMO_PROFILES.map((profile) => {
            const Icon = profile.icon;
            const loading = mutation.isPending && activeRole === profile.role;
            return (
              <li key={profile.role} role="none">
                <button
                  type="button"
                  role="menuitem"
                  className="auth-quick-item"
                  disabled={mutation.isPending}
                  onClick={() => onDemo(profile)}
                >
                  <span className="auth-quick-icon" style={{ color: profile.color }}>
                    <Icon size={16} aria-hidden />
                  </span>
                  <span>{loading ? "Entrant…" : profile.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
