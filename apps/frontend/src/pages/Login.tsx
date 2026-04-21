import { useMutation } from "@tanstack/react-query";
import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { login } from "../api/auth";
import { useAuthStore } from "../stores/authStore";

const INSTANT_DEMO_USER = {
  email: "admin@impactflow.dev",
  password: "admin123",
};

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);

  const mutation = useMutation({
    mutationFn: (credentials: { email: string; password: string }) => login(credentials.email, credentials.password),
    onSuccess: (data) => {
      setAuth({
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        role: data.role as any,
        userId: data.user_id,
      });
      if (data.role === "professional") navigate("/professional/session-logger");
      else if (data.role === "coordinator" || data.role === "admin") navigate("/coordinator/dashboard");
      else navigate("/donor/impact-portal");
    },
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    mutation.mutate({ email, password });
  };

  const onInstantLogin = () => {
    setEmail(INSTANT_DEMO_USER.email);
    setPassword(INSTANT_DEMO_USER.password);
    mutation.mutate(INSTANT_DEMO_USER);
  };

  return (
    <div className="container" style={{ maxWidth: 960, marginTop: "8vh" }}>
      <div className="grid grid-2">
        <div className="card">
          <h1>ImpactFlow</h1>
          <p className="muted">
            Plataforma para convertir observaciones de sesión en evidencia de impacto atribuible.
          </p>
          <div className="grid">
            <div className="card" style={{ background: "#fcfcff" }}>
              <strong>Profesional</strong>
              <div className="muted">Registra sesiones rápidas y notas cualitativas.</div>
            </div>
            <div className="card" style={{ background: "#fcfcff" }}>
              <strong>Coordinador</strong>
              <div className="muted">Gestiona participantes, usuarios, roles, planes e informes.</div>
            </div>
            <div className="card" style={{ background: "#fcfcff" }}>
              <strong>Donante</strong>
              <div className="muted">Visualiza impacto agregado de forma transparente.</div>
            </div>
          </div>
        </div>
        <form className="card" onSubmit={onSubmit}>
          <h2>Iniciar sesión</h2>
          <p className="muted">Demo: admin@impactflow.dev / admin123</p>
          <label>
            Email
            <input value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label style={{ marginTop: "0.75rem", display: "block" }}>
            Password
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          <button style={{ marginTop: "1rem", width: "100%" }} type="submit">
            {mutation.isPending ? "Entrando..." : "Entrar"}
          </button>
          <button
            style={{ marginTop: "0.65rem", width: "100%" }}
            className="btn-secondary"
            type="button"
            onClick={onInstantLogin}
            disabled={mutation.isPending}
          >
            Login instantáneo (demo)
          </button>
          {mutation.isError && <p style={{ color: "#dc2626" }}>Credenciales inválidas</p>}
        </form>
      </div>
    </div>
  );
}
