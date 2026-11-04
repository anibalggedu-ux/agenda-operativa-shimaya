import { useState, type FormEvent } from "react";
import { CONSENT_DEFAULT_CHECKED, CONSENT_TEXT, CONSENT_TEXT_VERSION } from "../shared/consent";
import { emailSchema, phoneSchema } from "../shared/validation";
import { ApiClientError, NetworkError, api } from "./api";
import { Banner, Field, Spinner } from "./ui";

export type ContactOutcome = "saved" | "skipped";

/**
 * Registro OPCIONAL de datos de contacto, posterior e independiente del canje.
 * - El consentimiento parte desmarcado (CONSENT_DEFAULT_CHECKED = false).
 * - Escribir teléfono o correo NO equivale a aceptar: sin casilla marcada no se envía nada.
 * - Solo se validan los campos que tienen contenido.
 * - Si falla el guardado, el canje ya está hecho: se puede reintentar u omitir.
 */
export function ContactForm({ redemptionId, onFinish }: { redemptionId: string; onFinish(outcome: ContactOutcome): void }) {
  const [v, setV] = useState({ firstName: "", lastName: "", phone: "", email: "" });
  const [consent, setConsent] = useState<boolean>(CONSENT_DEFAULT_CHECKED);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV((p) => ({ ...p, [k]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setFailure(null);
    const next: Record<string, string> = {};
    if (v.phone.trim() && !phoneSchema.safeParse(v.phone.trim()).success) next.phone = "Ingresa un teléfono válido (solo números, de 7 a 15 dígitos).";
    if (v.email.trim() && !emailSchema.safeParse(v.email.trim()).success) next.email = "Ingresa un correo válido.";
    if (!v.phone.trim() && !v.email.trim()) next.contact = "Ingresa al menos un teléfono o un correo.";
    if (!consent) next.consent = "Marca la casilla de consentimiento para guardar los datos, o elige “Omitir y continuar”.";
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setBusy(true);
    try {
      await api("POST", `/api/validador/redemptions/${redemptionId}/contact`, {
        body: { ...v, consent, consentTextVersion: CONSENT_TEXT_VERSION },
      });
      onFinish("saved");
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 422) setErrors(err.fieldErrors);
      else if (err instanceof NetworkError) setFailure("No hay conexión. El canje ya quedó registrado. Puedes reintentar guardar los datos u omitir.");
      else setFailure(err instanceof ApiClientError ? err.message : "No pudimos guardar los datos. El canje ya quedó registrado.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card pop" onSubmit={submit} noValidate aria-labelledby="contacto-titulo">
      <h2 id="contacto-titulo">¿El cliente desea recibir próximas promociones?</h2>
      <p className="muted">Es opcional y no afecta el canje, que ya está hecho. Si el cliente acepta, usaremos sus datos solo para avisarle de próximas promociones de Shimaya Ramen.</p>

      {failure && (
        <Banner tone="warn" icon="⚠">
          {failure}
        </Banner>
      )}

      <div className="grid two">
        <Field label="Nombre" error={errors.firstName}>
          {(a) => <input {...a} type="text" autoComplete="off" maxLength={80} value={v.firstName} onChange={set("firstName")} />}
        </Field>
        <Field label="Apellido" error={errors.lastName}>
          {(a) => <input {...a} type="text" autoComplete="off" maxLength={80} value={v.lastName} onChange={set("lastName")} />}
        </Field>
        <Field label="Teléfono" hint="Con uno de los dos medios basta" error={errors.phone}>
          {(a) => <input {...a} type="tel" inputMode="tel" autoComplete="off" maxLength={24} value={v.phone} onChange={set("phone")} />}
        </Field>
        <Field label="Correo electrónico" error={errors.email}>
          {(a) => <input {...a} type="email" inputMode="email" autoComplete="off" maxLength={254} value={v.email} onChange={set("email")} />}
        </Field>
      </div>
      {errors.contact && <div className="field-error">{errors.contact}</div>}

      <label className="check">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} aria-describedby={errors.consent ? "consent-error" : undefined} />
        <span>{CONSENT_TEXT}</span>
      </label>
      {errors.consent && (
        <div className="field-error" id="consent-error">
          {errors.consent}
        </div>
      )}

      <div className="actions inline">
        <button type="submit" disabled={busy}>
          {busy ? <Spinner /> : null}
          {busy ? "Guardando…" : failure ? "Reintentar guardar" : "Guardar y continuar"}
        </button>
        <button type="button" className="secondary" disabled={busy} onClick={() => onFinish("skipped")}>
          Omitir y continuar
        </button>
      </div>
    </form>
  );
}
