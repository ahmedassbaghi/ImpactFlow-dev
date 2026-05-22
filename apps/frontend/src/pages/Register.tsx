import { useMutation } from "@tanstack/react-query";
import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { register } from "../api/auth";
import AuthBrandHeader from "../components/auth/AuthBrandHeader";
import AuthScreenLayout from "../components/auth/AuthScreenLayout";
import {
  PASSWORD_HINT,
  PASSWORD_MIN_LENGTH,
  validatePasswordLoose,
} from "../utils/passwordValidation";
import { validateUsername } from "../utils/usernameValidation";

function registerErrorMessage(err: unknown): string {
  const res = (err as { response?: { data?: { detail?: string }; status?: number } })?.response;
  if (res?.status === 404) {
    return "El servei de registre no està disponible. Reinicia el backend (port 8012) i torna-ho a provar.";
  }
  if (res?.status === 409 && typeof res.data?.detail === "string") {
    return res.data.detail;
  }
  if (res?.status === 422) {
    return "Revisa les dades del formulari.";
  }
  return "No s'ha pogut crear el compte. Torna-ho a intentar.";
}

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [usernameTouched, setUsernameTouched] = useState(false);
  const [done, setDone] = useState(false);
  const navigate = useNavigate();

  const passwordError = passwordTouched ? validatePasswordLoose(password) : null;
  const usernameError = usernameTouched ? validateUsername(username) : null;
  const formValid =
    !!email &&
    fullName.trim().length >= 2 &&
    !usernameError &&
    username.trim().length >= 3 &&
    !passwordError &&
    password.length >= PASSWORD_MIN_LENGTH;

  const mutation = useMutation({
    mutationFn: () => {
      const pwErr = validatePasswordLoose(password);
      const userErr = validateUsername(username);
      if (pwErr || userErr) {
        return Promise.reject(new Error(pwErr ?? userErr ?? "Dades invàlides"));
      }
      return register({
        email,
        full_name: fullName,
        username: username.trim().toLowerCase(),
        password,
      });
    },
    onSuccess: () => setDone(true),
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setPasswordTouched(true);
    setUsernameTouched(true);
    const pwErr = validatePasswordLoose(password);
    const userErr = validateUsername(username);
    if (pwErr || userErr) return;
    mutation.mutate();
  };

  return (
    <AuthScreenLayout>
      <div className="auth-body">
        <AuthBrandHeader />

        <div className="auth-form-panel">
          {done ? (
            <>
              <p className="auth-success" role="status">
                Compte creat. Queda en espera: un coordinador l&apos;activarà i t&apos;assignarà el rol abans que
                puguis entrar.
              </p>
              <button type="button" className="auth-submit" onClick={() => navigate("/login")}>
                Anar a iniciar sessió
              </button>
            </>
          ) : (
            <form onSubmit={onSubmit} className="auth-form" aria-label="Registre" noValidate>
              <div className="auth-field">
                <label htmlFor="reg-email">Email</label>
                <input
                  id="reg-email"
                  type="email"
                  name="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="auth-field">
                <label htmlFor="reg-name">Nom complet</label>
                <input
                  id="reg-name"
                  type="text"
                  name="name"
                  autoComplete="name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  minLength={2}
                />
              </div>
              <div className="auth-field">
                <label htmlFor="reg-username">Nom d&apos;usuari</label>
                <input
                  id="reg-username"
                  type="text"
                  name="username"
                  autoComplete="username"
                  placeholder="ex: maria.garcia"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  onBlur={() => setUsernameTouched(true)}
                  required
                  minLength={3}
                  aria-invalid={!!usernameError}
                  aria-describedby={usernameError ? "reg-username-hint" : undefined}
                />
                {usernameError && (
                  <p id="reg-username-hint" className="auth-field-hint auth-field-hint--error" role="alert">
                    {usernameError}
                  </p>
                )}
              </div>
              <div className="auth-field">
                <label htmlFor="reg-password">Contrasenya</label>
                <input
                  id="reg-password"
                  type="password"
                  name="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onBlur={() => setPasswordTouched(true)}
                  required
                  minLength={PASSWORD_MIN_LENGTH}
                  aria-invalid={!!passwordError}
                  aria-describedby="reg-password-hint"
                />
                <p
                  id="reg-password-hint"
                  className={`auth-field-hint ${passwordError ? "auth-field-hint--error" : ""}`}
                  role={passwordError ? "alert" : undefined}
                >
                  {passwordError ?? PASSWORD_HINT}
                </p>
              </div>

              {mutation.isError && (
                <p className="auth-error" role="alert">
                  {mutation.error instanceof Error &&
                  !("response" in (mutation.error as object))
                    ? mutation.error.message
                    : registerErrorMessage(mutation.error)}
                </p>
              )}

              <button
                type="submit"
                className="auth-submit"
                disabled={mutation.isPending || !formValid}
              >
                {mutation.isPending ? "Creant…" : "Registrar-me"}
              </button>
            </form>
          )}

          <p className="auth-footer">
            Ja tens compte? <Link to="/login">Inicia sessió</Link>
          </p>
        </div>
      </div>
    </AuthScreenLayout>
  );
}
