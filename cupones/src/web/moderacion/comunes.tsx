import type { ReactNode } from "react";
import { useApi } from "../hooks";
import { Field } from "../ui";

export function CampaignSelect({ value, onChange, label = "Campaña", all = "Todas" }: { value: string; onChange(v: string): void; label?: string; all?: string | null }) {
  const { data } = useApi<{ campaigns: { id: string; name: string }[] }>("/api/analytics/campaigns");
  return (
    <Field label={label}>
      {(a) => (
        <select {...a} value={value} onChange={(e) => onChange(e.target.value)}>
          {all !== null && <option value="">{all}</option>}
          {data?.campaigns.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}

export function WorkerSelect({ value, onChange }: { value: string; onChange(v: string): void }) {
  const { data } = useApi<{ workers: { id: string; name: string }[] }>("/api/admin/workers");
  return (
    <Field label="Trabajador">
      {(a) => (
        <select {...a} value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">Todos</option>
          {data?.workers.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}

export function DateRange({ from, to, onFrom, onTo }: { from: string; to: string; onFrom(v: string): void; onTo(v: string): void }) {
  return (
    <>
      <Field label="Desde">{(a) => <input {...a} type="date" value={from} max={to || undefined} onChange={(e) => onFrom(e.target.value)} />}</Field>
      <Field label="Hasta">{(a) => <input {...a} type="date" value={to} min={from || undefined} onChange={(e) => onTo(e.target.value)} />}</Field>
    </>
  );
}

/** Tabla que en celular se apila como tarjetas (cada celda lleva su etiqueta). */
export function DataGrid({ head, children }: { head: { label: string; num?: boolean }[]; children: ReactNode }) {
  return (
    <div className="table-wrap">
      <table className="data stack">
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h.label} className={h.num ? "num" : ""}>
                {h.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}


