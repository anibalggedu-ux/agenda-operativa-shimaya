import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { ApiClientError, errorMessage } from "../api";
import { HOME, useAuth } from "../auth";
import { useApi } from "../hooks";
import { Banner, Field, Logo, Mascot, Spinner } from "../ui";

const waitMessage = (err: unknown) =>
  err instanceof ApiClientError && err.status === 429
    ? `Demasiados intentos. Espera ${Math.ceil(Number(err.body.retryAfterSeconds ?? 60) / 60)} min e intenta de nuevo.`
    : errorMessage(err);

export function Login() {
  const { user } = useAuth();
  const [mode, setMode] = useState<"tienda" | "admin">("tienda");

  if (user) return <Navigate to={HOME[user.role]} replace />;

  return (
    <main className="page narrow">
      <div className="hero pop">
        <Logo size={96} className="login-logo" />
        <Mascot />
        <div>
          <h1>Shimaya Cupones</h1>
          <p className="muted">{mode === "tienda" ? "Elige tu tienda e ingresa el PIN." : "Ingresa con tu cuenta de trabajo."}</p>
        </div>
      </div>
      <div className="tabs" role="tablist" aria-label="Tipo de acceso">
        <button role="tab" aria-selected={mode === "tienda"} onClick={() => setMode("tienda")}>
          Líder de tienda
        </button>
        <button role="tab" aria-selected={mode === "admin"} onClick={() => setMode("admin")}>
          Administración
        </button>
      </div>
      {mode === "tienda" ? <PinForm /> : <AdminForm />}
    </main>
  );
}

function PinForm() {
  const { loginPin } = useAuth();
  const stores = useApi<{ stores: { id: string; name: string }[] }>("/api/auth/tiendas");
  const [storeId, setStoreId] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await loginPin(storeId, pin.trim());
    } catch (err) {
      setError(waitMessage(err));
      setPin("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card" onSubmit={submit}>
      {error && (
        <Banner tone="bad" icon="⚠">
          {error}
        </Banner>
      )}
      {stores.error && (
        <Banner tone="bad" icon="⚠">
          No pudimos cargar las tiendas. Revisa tu conexión y recarga la página.
        </Banner>
      )}
      <Field label="Tienda">
        {(a) => (
          <select {...a} required value={storeId} onChange={(e) => setStoreId(e.target.value)} disabled={!stores.data}>
            <option value="">{stores.data ? "Elige tu tienda" : "Cargando…"}</option>
            {stores.data?.stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        )}
      </Field>
      <Field label="PIN de la tienda" hint="6 números">
        {(a) => (
          <input
            {...a}
            type="password"
            inputMode="numeric"
            autoComplete="off"
            pattern="\d{6}"
            maxLength={6}
            required
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
          />
        )}
      </Field>
      <button className="block" type="submit" disabled={busy || !storeId || pin.length !== 6}>
        {busy ? <Spinner /> : null}
        {busy ? "Ingresando…" : "Ingresar"}
      </button>
      <p className="muted small">¿No sabes tu PIN o no funciona? Pídele al moderador uno nuevo.</p>
    </form>
  );
}

function AdminForm() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await login(email.trim(), password);
    } catch (err) {
      setError(waitMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
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
      <p className="muted small">¿Sin cuenta o con problemas para entrar? Pide ayuda al moderador. No hay registro público.</p>
    </form>
  );
}
