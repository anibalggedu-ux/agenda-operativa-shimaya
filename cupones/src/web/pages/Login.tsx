import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { ApiClientError, errorMessage } from "../api";
import { HOME, useAuth } from "../auth";
import { Banner, Field, Logo, Mascot, Spinner } from "../ui";

export function Login() {
  const { user, login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={HOME[user.role]} replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await login(email.trim(), password);
    } catch (err) {
      setError(err instanceof ApiClientError && err.status === 429 ? `Demasiados intentos. Espera ${Math.ceil(Number(err.body.retryAfterSeconds ?? 60) / 60)} min e intenta de nuevo.` : errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page narrow">
      <div className="hero pop">
        <Logo size={96} className="login-logo" />
        <Mascot />
        <div>
          <h1>Shimaya Cupones</h1>
          <p className="muted">Ingresa con tu cuenta de trabajo.</p>
        </div>
      </div>
      <form className="card" onSubmit={submit}>
        {error && (
          <Banner tone="bad" icon="⚠">
            {error}
          </Banner>
        )}
        <Field label="Correo">{(a) => <input {...a} type="email" inputMode="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />}</Field>
        <Field label="Contraseña">{(a) => <input {...a} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />}</Field>
        <button className="block" type="submit" disabled={busy || !email || !password}>
          {busy ? <Spinner /> : null}
          {busy ? "Ingresando…" : "Ingresar"}
        </button>
        <p className="muted small">
          ¿Sin cuenta o con problemas para entrar? Pide ayuda al moderador. No hay registro público.
        </p>
      </form>
    </main>
  );
}
