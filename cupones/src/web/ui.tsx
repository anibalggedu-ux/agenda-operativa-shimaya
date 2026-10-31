import { useEffect, useId, useRef, type ReactNode } from "react";
import { STATE_SHORT, type CouponState } from "../shared/types";

/** Mascota Shimayito (recurso original, proporciones intactas: 720×885 ≈ 1301×1600). El ancho lo fija el contenedor. */
export function Mascot({ className = "" }: { className?: string }) {
  return (
    <div className={`mascot-frame ${className}`}>
      <img
        src="/brand/shimayito-playa.jpg"
        width={720}
        height={885}
        alt="Shimayito, la mascota de Shimaya Ramen, comiendo sushi en la playa"
        loading="lazy"
        decoding="async"
      />
    </div>
  );
}

export function Logo({ size = 44, className = "" }: { size?: number; className?: string }) {
  return <img className={className} src="/brand/logo-shimaya-ramen.jpg" width={size} height={size} alt="Shimaya Ramen" />;
}

export type Tone = "ok" | "done" | "warn" | "bad" | "off";
const STATE_TONE: Record<CouponState, { tone: Tone; icon: string }> = {
  available: { tone: "ok", icon: "✔" },
  redeemed: { tone: "done", icon: "◉" },
  expired: { tone: "warn", icon: "⌛" },
  voided: { tone: "bad", icon: "✖" },
  unavailable: { tone: "off", icon: "○" },
};
export const stateIcon = (s: CouponState) => STATE_TONE[s].icon;
export const stateTone = (s: CouponState) => STATE_TONE[s].tone;

/** Estado con icono Y texto: nunca se distingue solo por color. */
export function StateBadge({ state }: { state: CouponState }) {
  const t = STATE_TONE[state];
  return (
    <span className={`badge ${t.tone}`}>
      <span aria-hidden="true">{t.icon}</span>
      {STATE_SHORT[state]}
    </span>
  );
}

export function Banner({ tone, icon, children, live = true }: { tone: Tone; icon: string; children: ReactNode; live?: boolean }) {
  return (
    <div className={`banner ${tone}`} role={live ? (tone === "bad" ? "alert" : "status") : undefined}>
      <span className="ico" aria-hidden="true">
        {icon}
      </span>
      <div>{children}</div>
    </div>
  );
}

export function Spinner() {
  return <span className="spinner" aria-hidden="true" />;
}

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: (a: { id: string; "aria-invalid"?: boolean; "aria-describedby"?: string }) => ReactNode }) {
  const id = useId();
  const errId = `${id}-e`;
  return (
    <div className="field">
      <label htmlFor={id} className="field">
        {label}
        {hint && <span className="hint">{hint}</span>}
      </label>
      {children({ id, "aria-invalid": error ? true : undefined, "aria-describedby": error ? errId : undefined })}
      {error && (
        <div className="field-error" id={errId}>
          {error}
        </div>
      )}
    </div>
  );
}

export function Pager({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage(p: number): void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <nav className="pager" aria-label="Paginación">
      <button className="secondary small" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        ← Anterior
      </button>
      <span aria-live="polite">
        Página {page} de {pages} · {total} registro{total === 1 ? "" : "s"}
      </span>
      <button className="secondary small" disabled={page >= pages} onClick={() => onPage(page + 1)}>
        Siguiente →
      </button>
    </nav>
  );
}

export function Empty({ children, mascot = false }: { children: ReactNode; mascot?: boolean }) {
  return (
    <div className="empty">
      {mascot && <Mascot className="mascot-small" />}
      <p>{children}</p>
    </div>
  );
}

export function Dialog({ title, onClose, children }: { title: string; onClose(): void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

export const pct = (v: number | null) => (v === null ? "—" : `${(v * 100).toLocaleString("es-PE", { maximumFractionDigits: 1 })} %`);
export const num = (n: number) => n.toLocaleString("es-PE");
