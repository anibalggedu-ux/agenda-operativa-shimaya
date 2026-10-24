import { useRef, useState } from "react";
import { formatLimaDate } from "../../shared/time";
import { STATE_LABELS, type CouponState, type LookupResult } from "../../shared/types";
import { ApiClientError, NetworkError, api, errorMessage } from "../api";
import { ContactForm, type ContactOutcome } from "../ContactForm";
import { Banner, Field, Mascot, Spinner, stateIcon, stateTone } from "../ui";

interface Redemption {
  replayed: boolean;
  redemption: { id: string; redeemedAt: string; campaign: string; benefit: string };
}

function newKey(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

export function Validar() {
  const [code, setCode] = useState("");
  const [lookup, setLookup] = useState<LookupResult | null>(null);
  const [busy, setBusy] = useState<"lookup" | "confirm" | null>(null);
  const [error, setError] = useState<{ message: string; retry?: "lookup" | "confirm" } | null>(null);
  const [done, setDone] = useState<Redemption | null>(null);
  const [outcome, setOutcome] = useState<ContactOutcome | null>(null);
  // La clave de reintento se crea al mostrar "Cupón disponible" y se reutiliza en cada reintento del
  // MISMO canje: si la red se corta a medias, el servidor reconoce el reintento y no duplica.
  const idemKey = useRef<string | null>(null);
  const inFlight = useRef(false);

  function reset() {
    setCode("");
    setLookup(null);
    setError(null);
    setDone(null);
    setOutcome(null);
    idemKey.current = null;
  }

  async function consult(e?: { preventDefault(): void }) {
    e?.preventDefault();
    if (inFlight.current) return;
    if (!/^\d{4,16}$/.test(code)) {
      setError({ message: "El código debe tener solo números (entre 4 y 16 dígitos)." });
      return;
    }
    inFlight.current = true;
    setBusy("lookup");
    setError(null);
    setLookup(null);
    try {
      const r = await api<LookupResult>("POST", "/api/validador/coupons/lookup", { body: { code } });
      setLookup(r);
      idemKey.current = r.state === "available" ? newKey() : null;
    } catch (err) {
      setError({ message: errorMessage(err), retry: err instanceof NetworkError ? "lookup" : undefined });
    } finally {
      inFlight.current = false;
      setBusy(null);
    }
  }

  async function confirmRedemption() {
    if (inFlight.current || !idemKey.current) return;
    inFlight.current = true;
    setBusy("confirm");
    setError(null);
    try {
      const r = await api<Redemption>("POST", "/api/validador/redemptions", { body: { code }, headers: { "idempotency-key": idemKey.current } });
      setDone(r);
    } catch (err) {
      if (err instanceof ApiClientError && (err.status === 409 || err.status === 404)) {
        // Otro trabajador se adelantó, o el cupón cambió: se muestra el estado real.
        const state = (err.body.state as LookupResult["state"]) ?? "not_found";
        setLookup({ state, message: STATE_LABELS[state], coupon: lookup?.coupon });
        idemKey.current = null;
      } else if (err instanceof NetworkError) {
        setError({
          message: "No pudimos confirmar por falta de conexión. Reintenta: si el canje sí se registró, verás el mismo resultado y no se cobrará dos veces.",
          retry: "confirm",
        });
      } else setError({ message: errorMessage(err) });
    } finally {
      inFlight.current = false;
      setBusy(null);
    }
  }

  // --- Canje hecho ---
  if (done) {
    return (
      <main className="page narrow">
        <div className="card pop">
          <Banner tone="ok" icon="✔">
            Cupón canjeado correctamente
          </Banner>
          <div className="mascot-inline">
            <Mascot />
            <div>
              <p>
                <strong>{done.redemption.benefit}</strong>
              </p>
              <p className="muted small">{done.redemption.campaign}</p>
              {done.replayed && <p className="muted small">Este canje ya estaba registrado; no se duplicó.</p>}
            </div>
          </div>
          {outcome === "saved" && <p>Datos guardados. ¡Gracias!</p>}
          {outcome === "skipped" && <p className="muted">Seguimos sin registrar datos del cliente.</p>}
          {outcome && (
            <button className="block" onClick={reset}>
              Validar otro cupón
            </button>
          )}
        </div>
        {!outcome && <ContactForm redemptionId={done.redemption.id} onFinish={setOutcome} />}
      </main>
    );
  }

  const state = lookup?.state;
  const known = state && state !== "not_found" ? (state as CouponState) : null;

  return (
    <main className="page narrow">
      <form className="card" onSubmit={consult} noValidate>
        <h1>Validar cupón</h1>
        <Field label="Código del cupón" hint="Solo números. Conserva los ceros del inicio." error={error && !error.retry && !lookup ? error.message : undefined}>
          {(a) => (
            <input
              {...a}
              className="code-input"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="search"
              maxLength={16}
              autoFocus
              value={code}
              onChange={(e) => {
                setCode(e.target.value.replace(/\D/g, ""));
                setLookup(null);
                setError(null);
                idemKey.current = null;
              }}
            />
          )}
        </Field>
        <button className="block" type="submit" disabled={busy !== null || code.length === 0}>
          {busy === "lookup" ? <Spinner /> : null}
          {busy === "lookup" ? "Consultando…" : "Consultar cupón"}
        </button>
      </form>

      {error && (lookup || error.retry) && (
        <Banner tone="bad" icon="⚠">
          {error.message}
          {error.retry && (
            <div className="actions">
              <button className="secondary" onClick={() => (error.retry === "confirm" ? confirmRedemption() : consult())} disabled={busy !== null}>
                Reintentar
              </button>
            </div>
          )}
        </Banner>
      )}

      {lookup && (
        <section className="card pop" aria-live="polite">
          {known ? (
            <Banner tone={stateTone(known)} icon={stateIcon(known)}>
              {STATE_LABELS[known]}
            </Banner>
          ) : (
            <>
              <Banner tone="off" icon="?">
                {STATE_LABELS.not_found}
              </Banner>
              <p className="muted">Revisa que el código esté completo y vuelve a intentar.</p>
            </>
          )}

          {lookup.coupon && (
            <dl className="facts">
              <dt>Campaña</dt>
              <dd>{lookup.coupon.campaign}</dd>
              <dt>Beneficio</dt>
              <dd>{lookup.coupon.benefit}</dd>
              <dt>Vigencia</dt>
              <dd>
                {formatLimaDate(lookup.coupon.validFrom)} al {formatLimaDate(new Date(Date.parse(lookup.coupon.validUntil) - 1).toISOString())}
              </dd>
            </dl>
          )}

          <div className="actions">
            {state === "available" && (
              <button className="block" onClick={confirmRedemption} disabled={busy !== null}>
                {busy === "confirm" ? <Spinner /> : null}
                {busy === "confirm" ? "Confirmando…" : "Confirmar canje"}
              </button>
            )}
            <button className={state === "available" ? "secondary block" : "block"} onClick={reset} disabled={busy !== null}>
              Validar otro cupón
            </button>
          </div>
        </section>
      )}

      {!lookup && !error && (
        <div className="mascot-inline muted">
          <Mascot />
          <p>¡Hola! Ingresa el código del cupón del cliente y consulta si está disponible.</p>
        </div>
      )}
    </main>
  );
}
