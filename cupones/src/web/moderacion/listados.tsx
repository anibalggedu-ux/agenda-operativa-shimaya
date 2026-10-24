import { useState } from "react";
import { formatLima } from "../../shared/time";
import { qs } from "../api";
import { useApi } from "../hooks";
import { Banner, Empty, Field, Pager, Spinner } from "../ui";
import { CampaignSelect, DataGrid, DateRange, WorkerSelect } from "./comunes";

interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

function Result<T>({ q, children }: { q: ReturnType<typeof useApi<Page<T>>>; children: (p: Page<T>) => React.ReactNode }) {
  if (q.error) return <Banner tone="bad" icon="⚠">{q.error}</Banner>;
  if (!q.data) return <p role="status" aria-busy="true"><Spinner /> Cargando…</p>;
  return <>{children(q.data)}</>;
}

// --- Historial de canjes ---------------------------------------------------------------------------
interface RedemptionRow {
  id: string;
  redeemedAt: string;
  code: string;
  campaign: string;
  worker: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  email: string | null;
  consentedAt: string | null;
}

export function Canjes() {
  const [f, setF] = useState({ from: "", to: "", campaignId: "", workerId: "", contact: "" });
  const [page, setPage] = useState(1);
  const upd = (k: keyof typeof f) => (v: string) => {
    setF((p) => ({ ...p, [k]: v }));
    setPage(1);
  };
  const q = useApi<Page<RedemptionRow>>(`/api/admin/redemptions${qs({ ...f, page, pageSize: 20 })}`);
  return (
    <section className="card">
      <h2>Historial de canjes</h2>
      <div className="row">
        <DateRange from={f.from} to={f.to} onFrom={upd("from")} onTo={upd("to")} />
        <CampaignSelect value={f.campaignId} onChange={upd("campaignId")} />
        <WorkerSelect value={f.workerId} onChange={upd("workerId")} />
        <Field label="Datos del cliente">
          {(a) => (
            <select {...a} value={f.contact} onChange={(e) => upd("contact")(e.target.value)}>
              <option value="">Todos</option>
              <option value="con">Con datos de contacto</option>
              <option value="sin">Sin datos de contacto</option>
            </select>
          )}
        </Field>
      </div>
      <Result q={q}>
        {(d) =>
          d.items.length === 0 ? (
            <Empty mascot>No hay canjes con estos filtros.</Empty>
          ) : (
            <>
              <DataGrid head={[{ label: "Fecha (Lima)" }, { label: "Código" }, { label: "Campaña" }, { label: "Trabajador" }, { label: "Cliente" }]}>
                {d.items.map((r) => (
                  <tr key={r.id}>
                    <td data-label="Fecha (Lima)" className="nowrap">{formatLima(r.redeemedAt)}</td>
                    <td data-label="Código" className="mono">{r.code}</td>
                    <td data-label="Campaña">{r.campaign}</td>
                    <td data-label="Trabajador">{r.worker}</td>
                    <td data-label="Cliente">
                      {r.consentedAt ? [[r.firstName, r.lastName].filter(Boolean).join(" "), r.phone, r.email].filter(Boolean).join(" · ") : <span className="muted">Sin datos</span>}
                    </td>
                  </tr>
                ))}
              </DataGrid>
              <Pager page={d.page} pageSize={d.pageSize} total={d.total} onPage={setPage} />
            </>
          )
        }
      </Result>
    </section>
  );
}

// --- Clientes que autorizaron promociones ----------------------------------------------------------------
interface ClientRow {
  id: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  email: string | null;
  consentedAt: string;
  consentVersion: string;
  campaign: string;
  worker: string;
}

export function Clientes() {
  const [f, setF] = useState({ from: "", to: "", campaignId: "", workerId: "" });
  const [page, setPage] = useState(1);
  const upd = (k: keyof typeof f) => (v: string) => {
    setF((p) => ({ ...p, [k]: v }));
    setPage(1);
  };
  const q = useApi<Page<ClientRow>>(`/api/admin/clients${qs({ ...f, page, pageSize: 20 })}`);
  return (
    <section className="card">
      <h2>Clientes que autorizaron promociones</h2>
      <p className="muted small">Solo aparecen clientes con consentimiento explícito. Cada registro conserva fecha y versión del texto aceptado. Esta pantalla no tiene exportación.</p>
      <div className="row">
        <DateRange from={f.from} to={f.to} onFrom={upd("from")} onTo={upd("to")} />
        <CampaignSelect value={f.campaignId} onChange={upd("campaignId")} />
        <WorkerSelect value={f.workerId} onChange={upd("workerId")} />
      </div>
      <Result q={q}>
        {(d) =>
          d.items.length === 0 ? (
            <Empty mascot>Todavía no hay clientes que hayan autorizado promociones con estos filtros.</Empty>
          ) : (
            <>
              <DataGrid head={[{ label: "Cliente" }, { label: "Teléfono" }, { label: "Correo" }, { label: "Consentimiento (Lima)" }, { label: "Campaña" }, { label: "Registró" }]}>
                {d.items.map((c) => (
                  <tr key={c.id}>
                    <td data-label="Cliente">{[c.firstName, c.lastName].filter(Boolean).join(" ") || <span className="muted">Sin nombre</span>}</td>
                    <td data-label="Teléfono">{c.phone ?? "—"}</td>
                    <td data-label="Correo">{c.email ?? "—"}</td>
                    <td data-label="Consentimiento (Lima)">
                      {formatLima(c.consentedAt)} <span className="muted small">· texto {c.consentVersion}</span>
                    </td>
                    <td data-label="Campaña">{c.campaign}</td>
                    <td data-label="Registró">{c.worker}</td>
                  </tr>
                ))}
              </DataGrid>
              <Pager page={d.page} pageSize={d.pageSize} total={d.total} onPage={setPage} />
            </>
          )
        }
      </Result>
    </section>
  );
}

// --- Auditoría ------------------------------------------------------------------------------------------------
interface AuditRow {
  id: number;
  at: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  actor: string | null;
  details: Record<string, unknown> | null;
}

const ACTION_LABEL: Record<string, string> = {
  login_success: "Inicio de sesión",
  login_failed: "Inicio de sesión fallido",
  login_rate_limited: "Inicios de sesión bloqueados por exceso de intentos",
  logout: "Cierre de sesión",
  coupon_redeemed: "Cupón canjeado",
  coupon_created: "Cupón creado",
  coupon_voided: "Cupón anulado",
  contact_registered: "Contacto registrado con consentimiento",
  campaign_created: "Campaña creada",
  campaign_updated: "Campaña editada",
  import_completed: "Importación completada",
  import_rejected: "Importación rechazada",
  access_denied: "Acceso denegado por rol",
  code_guessing_blocked: "Bloqueo por intentos de adivinar códigos",
};

export function Auditoria() {
  const [f, setF] = useState({ from: "", to: "", action: "" });
  const [page, setPage] = useState(1);
  const upd = (k: keyof typeof f) => (v: string) => {
    setF((p) => ({ ...p, [k]: v }));
    setPage(1);
  };
  const actions = useApi<{ actions: string[] }>("/api/admin/audit/actions");
  const q = useApi<Page<AuditRow>>(`/api/admin/audit${qs({ ...f, page, pageSize: 25 })}`);
  return (
    <section className="card">
      <h2>Auditoría</h2>
      <p className="muted small">Bitácora de solo lectura: no se puede editar ni borrar. No guarda contraseñas, tokens, códigos de cupón ni datos personales.</p>
      <div className="row">
        <DateRange from={f.from} to={f.to} onFrom={upd("from")} onTo={upd("to")} />
        <Field label="Operación">
          {(a) => (
            <select {...a} value={f.action} onChange={(e) => upd("action")(e.target.value)}>
              <option value="">Todas</option>
              {actions.data?.actions.map((x) => (
                <option key={x} value={x}>
                  {ACTION_LABEL[x] ?? x}
                </option>
              ))}
            </select>
          )}
        </Field>
      </div>
      <Result q={q}>
        {(d) =>
          d.items.length === 0 ? (
            <Empty>No hay registros con estos filtros.</Empty>
          ) : (
            <>
              <DataGrid head={[{ label: "Fecha (Lima)" }, { label: "Operación" }, { label: "Quién" }, { label: "Sobre" }, { label: "Detalle" }]}>
                {d.items.map((r) => (
                  <tr key={r.id}>
                    <td data-label="Fecha (Lima)" className="nowrap">{formatLima(r.at)}</td>
                    <td data-label="Operación">{ACTION_LABEL[r.action] ?? r.action}</td>
                    <td data-label="Quién">{r.actor ?? <span className="muted">—</span>}</td>
                    <td data-label="Sobre" className="small">{r.entityType ? `${r.entityType} ${r.entityId?.slice(0, 8) ?? ""}` : "—"}</td>
                    <td data-label="Detalle" className="small">{r.details ? Object.entries(r.details).map(([k, v]) => `${k}: ${String(v)}`).join(" · ") : "—"}</td>
                  </tr>
                ))}
              </DataGrid>
              <Pager page={d.page} pageSize={d.pageSize} total={d.total} onPage={setPage} />
            </>
          )
        }
      </Result>
    </section>
  );
}
