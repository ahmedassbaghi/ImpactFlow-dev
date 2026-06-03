import { useMutation } from "@tanstack/react-query";
import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { login } from "../api/auth";
import { demoSeed, fetchHealth } from "../api/health";
import AuthBrandHeader from "../components/auth/AuthBrandHeader";
import AuthScreenLayout from "../components/auth/AuthScreenLayout";
import { DEMO_PROFILES, getRoleRedirect } from "../auth/demoProfiles";
import { useAuthStore } from "../stores/authStore";

function loginErrorMessage(err: unknown): string {
  const detail = (err as { response?: { data?: { detail?: string }; status?: number } })?.response;
  if (detail?.status === 403) {
    return "El teu compte encara no està actiu. Un coordinador l'ha d'aprovar.";
  }
  return "Credencials incorrectes. Torna-ho a intentar.";
}

export default function LoginPage() {
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [demoMode, setDemoMode] = useState(false);
  const [demoLoading, setDemoLoading] = useState<string | null>(null);
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);

  useEffect(() => {
    fetchHealth()
      .then((h) => setDemoMode(h.demo_mode))
      .catch(() => setDemoMode(false));
  }, []);

  const mutation = useMutation({
    mutationFn: (creds: { login: string; password: string }) => login(creds.login, creds.password),
    onSuccess: (data) => {
      setAuth({
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        role: data.role as any,
        userId: data.user_id,
      });
      navigate(getRoleRedirect(data.role));
    },
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    mutation.mutate({ login: loginId, password });
  };

  const onDemoAccess = async (profile: (typeof DEMO_PROFILES)[number]) => {
    setDemoLoading(profile.role);
    try {
      await demoSeed();
    } catch {
      /* seed may already exist */
    }
    mutation.mutate({ login: profile.email, password: profile.password });
    setDemoLoading(null);
  };

  return (
    <AuthScreenLayout>
      <div className="auth-body">
        <AuthBrandHeader />

        <div className="auth-form-panel">
          <form onSubmit={onSubmit} className="auth-form" aria-label="Iniciar sessió">
            <div className="auth-field">
              <label htmlFor="login-id">Email o nom d&apos;usuari</label>
              <input
                id="login-id"
                type="text"
                name="login"
                autoComplete="username"
                placeholder="email o usuari"
                value={loginId}
                onChange={(e) => setLoginId(e.target.value)}
                required
                minLength={3}
              />
            </div>
            <div className="auth-field">
              <label htmlFor="login-password">Contrasenya</label>
              <input
                id="login-password"
                type="password"
                name="password"
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            {mutation.isError && (
              <p className="auth-error" role="alert">
                {loginErrorMessage(mutation.error)}
              </p>
            )}

            <button
              type="submit"
              className="auth-submit"
              disabled={mutation.isPending || loginId.trim().length < 3 || !password}
            >
              {mutation.isPending ? "Entrant…" : "Entrar"}
            </button>
          </form>

          {demoMode && (
            <section className="auth-demo-section" aria-labelledby="demo-access-heading">
              <h2 id="demo-access-heading">Accés demo</h2>
              <p className="auth-demo-hint">Carrega dades de prova i entra amb un rol de demostració.</p>
              <div className="auth-demo-buttons">
                {DEMO_PROFILES.map((profile) => (
                  <button
                    key={profile.role}
                    type="button"
                    className="auth-demo-btn"
                    disabled={!!demoLoading || mutation.isPending}
                    onClick={() => onDemoAccess(profile)}
                  >
                    {demoLoading === profile.role ? "Entrant…" : profile.label}
                  </button>
                ))}
              </div>
            </section>
          )}

          <p className="auth-footer">
            No tens compte? <Link to="/register">Registra&apos;t</Link>
          </p>
        </div>
      </div>
    </AuthScreenLayout>
  );
}
