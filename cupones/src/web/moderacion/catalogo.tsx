import { useEffect, useState, type FormEvent } from "react";
import { formatLima, limaDayEndExclusiveIso, limaDayStartIso, limaYmd, limaYmdOfInclusiveEnd } from "../../shared/time";
import { STATE_ORDER, STATE_SHORT, type CouponState } from "../../shared/types";
import { ApiClientError, api, errorMessage } from "../api";
import { useApi } from "../hooks";
import { Banner, Dialog, Empty, Field, Pager, Spinner, StateBadge, num } from "../ui";
import { CampaignSelect, DataGrid } from "./comunes";

interface Campaign {
  id: string;
  name: string;
  description: string;
  benefit: string;
  startsAt: string;
  endsAt: string;
  status: "active" | "inactive";
  codeLength: number;
  coupons: number;
  redeemed: number;
}

const emptyForm = { name: "", description: "", benefit: "", start: "", end: "", status: "active", codeLength: "8" };

export function Campanas() {
  const list = useApi<{ campaigns: Campaign[] }>("/api/admin/campaigns");
  const [editing, setEditing] = useState<Campaign | "new" | null>(null);
  return (
    <section className="card">
      <div className="spread">
        <h2>Campañas</h2>
        <button onClick={() => setEditing("new")}>Nueva campaña</button>
      </div>
      {list.error && <Banner tone="bad" icon="⚠">{list.error}</Banner>}
      {list.data && list.data.campaigns.length === 0 && <Empty mascot>Aún no hay campañas. Crea la primera para poder emitir cupones.</Empty>}
      {list.data && list.data.campaigns.length > 0 && (
        <DataGrid head={[{ label: "Campaña" }, { label: "Beneficio" }, { label: "Vigencia (Lima)" }, { label: "Estado" }, { label: "Código" }, { label: "Cupones", num: true }, { label: "" }]}>
          {list.data.campaigns.map((c) => (
            <tr key={c.id}>
              <td data-label="Campaña"><strong>{c.name}</strong></td>
              <td data-label="Beneficio">{c.benefit}</td>
              <td data-label="Vigencia (Lima)" className="small">{formatLima(c.startsAt)} → {formatLima(new Date(Date.parse(c.endsAt) - 1).toISOString())}</td>
              <td data-label="Estado">{c.status === "active" ? <span className="badge ok"><span aria-hidden="true">✔</span> Activa</span> : <span className="badge off"><span aria-hidden="true">○</span> Inactiva</span>}</td>
              <td data-label="Código">{c.codeLength} dígitos</td>
              <td data-label="Cupones" className="num">{num(c.redeemed)} / {num(c.coupons)}</td>
              <td><button className="secondary small" onClick={() => setEditing(c)}>Editar</button></td>
            </tr>
          ))}
        </DataGrid>
      )}
      {editing && <CampaignDialog campaign={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); list.reload(); }} />}
    </section>
  );
}

function CampaignDialog({ campaign, onClose, onSaved }: { campaign: Campaign | null; onClose(): void; onSaved(): void }) {
  const [f, setF] = useState(
    campaign
      ? { name: campaign.name, description: campaign.description, benefit: campaign.benefit, start: limaYmd(campaign.startsAt), end: limaYmdOfInclusiveEnd(campaign.endsAt), status: campaign.status, codeLength: String(campaign.codeLength) }
      : emptyForm,
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [fail, setFail] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const startsAt = limaDayStartIso(f.start);
    const endsAt = limaDayEndExclusiveIso(f.end);
    const next: Record<string, string> = {};
    if (!startsAt) next.startsAt = "Elige la fecha de inicio.";
    if (!endsAt) next.endsAt = "Elige la fecha de fin.";
    if (startsAt && endsAt && endsAt <= startsAt) next.endsAt = "La fecha de fin debe ser igual o posterior al inicio.";
    setErrors(next);
    setFail(null);
    if (Object.keys(next).length) return;
    setBusy(true);
    try {
      const body = { name: f.name, description: f.description, benefit: f.benefit, startsAt, endsAt, status: f.status, codeLength: Number(f.codeLength) };
      await api(campaign ? "PATCH" : "POST", campaign ? `/api/admin/campaigns/${campaign.id}` : "/api/admin/campaigns", { body });
      onSaved();
    } catch (err) {
      if (err instanceof ApiClientError && Object.keys(err.fieldErrors).length) setErrors(err.fieldErrors);
      else setFail(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog title={campaign ? "Editar campaña" : "Nueva campaña"} onClose={onClose}>
      <form onSubmit={submit} noValidate>
        {fail && <Banner tone="bad" icon="⚠">{fail}</Banner>}
        <Field label="Nombre" error={errors.name}>{(a) => <input {...a} type="text" maxLength={80} value={f.name} onChange={set("name")} required />}</Field>
        <Field label="Beneficio" hint="Lo que recibe el cliente. Ej.: Una porción de gyoza" error={errors.benefit}>{(a) => <input {...a} type="text" maxLength={200} value={f.benefit} onChange={set("benefit")} required />}</Field>
        <Field label="Descripción" error={errors.description}>{(a) => <input {...a} type="text" maxLength={500} value={f.description} onChange={set("description")} />}</Field>
        <div className="grid two">
          <Field label="Inicio (hora de Lima)" error={errors.startsAt}>{(a) => <input {...a} type="date" value={f.start} onChange={set("start")} required />}</Field>
          <Field label="Último día de vigencia" hint="Vale todo ese día, hasta las 23:59 de Lima" error={errors.endsAt}>{(a) => <input {...a} type="date" value={f.end} onChange={set("end")} required />}</Field>
        </div>
        <div className="grid two">
          <Field label="Estado" hint="Una campaña inactiva no permite canjes">
            {(a) => (
              <select {...a} value={f.status} onChange={set("status")}>
                <option value="active">Activa</option>
                <option value="inactive">Inactiva</option>
              </select>
            )}
          </Field>
          <Field label="Dígitos del código" hint="De 4 a 16. No se puede cambiar si ya hay cupones." error={errors.codeLength}>
            {(a) => <input {...a} type="number" inputMode="numeric" min={4} max={16} value={f.codeLength} onChange={set("codeLength")} required />}
          </Field>
        </div>
        <div className="actions inline">
          <button type="submit" disabled={busy}>{busy && <Spinner />} Guardar</button>
          <button type="button" className="secondary" onClick={onClose}>Cancelar</button>
        </div>
      </form>
    </Dialog>
  );
}

// --- Cupones --------------------------------------------------------------------------------------------
interface CouponRow {
  id: string;
  code: string;
  campaign: string;
  state: CouponState;
  createdAt: string;
  voidReason: string | null;
  redeemedAt: string | null;
}

export function Cupones() {
  const [f, setF] = useState({ campaignId: "", state: "", code: "" });
  const [page, setPage] = useState(1);
  const [voiding, setVoiding] = useState<CouponRow | null>(null);
  const [creating, setCreating] = useState(false);
  const body = { ...(f.campaignId ? { campaignId: f.campaignId } : {}), ...(f.state ? { state: f.state } : {}), ...(f.code ? { code: f.code } : {}), page, pageSize: 20 };
  const list = useSearch(body);
  return (
    <section className="card">
      <div className="spread">
        <h2>Cupones</h2>
        <button onClick={() => setCreating(true)}>Crear cupón</button>
      </div>
      <div className="row">
        <CampaignSelect value={f.campaignId} onChange={(v) => { setF({ ...f, campaignId: v }); setPage(1); }} />
        <Field label="Estado">
          {(a) => (
            <select {...a} value={f.state} onChange={(e) => { setF({ ...f, state: e.target.value }); setPage(1); }}>
              <option value="">Todos</option>
              {STATE_ORDER.map((s) => <option key={s} value={s}>{STATE_SHORT[s]}</option>)}
            </select>
          )}
        </Field>
        <Field label="Código (empieza con)" hint="Se envía en el cuerpo de la petición, nunca en la URL">
          {(a) => <input {...a} type="text" inputMode="numeric" pattern="[0-9]*" maxLength={16} value={f.code} onChange={(e) => { setF({ ...f, code: e.target.value.replace(/\D/g, "") }); setPage(1); }} />}
        </Field>
      </div>
      {list.error && <Banner tone="bad" icon="⚠">{list.error}</Banner>}
      {!list.data && !list.error && <p role="status"><Spinner /> Cargando…</p>}
      {list.data && (list.data.items.length === 0 ? <Empty mascot>No hay cupones con estos filtros.</Empty> : (
        <>
          <DataGrid head={[{ label: "Código" }, { label: "Campaña" }, { label: "Estado" }, { label: "Creado (Lima)" }, { label: "Notas" }, { label: "" }]}>
            {list.data.items.map((c) => (
              <tr key={c.id}>
                <td data-label="Código" className="mono">{c.code}</td>
                <td data-label="Campaña">{c.campaign}</td>
                <td data-label="Estado"><StateBadge state={c.state} /></td>
                <td data-label="Creado (Lima)" className="small">{formatLima(c.createdAt)}</td>
                <td data-label="Notas" className="small">{c.redeemedAt ? `Canjeado ${formatLima(c.redeemedAt)}` : c.voidReason ? `Motivo: ${c.voidReason}` : "—"}</td>
                <td>{c.state !== "redeemed" && c.state !== "voided" && <button className="secondary small" onClick={() => setVoiding(c)}>Anular</button>}</td>
              </tr>
            ))}
          </DataGrid>
          <Pager page={list.data.page} pageSize={list.data.pageSize} total={list.data.total} onPage={setPage} />
        </>
      ))}
      {voiding && <VoidDialog coupon={voiding} onClose={() => setVoiding(null)} onDone={() => { setVoiding(null); list.reload(); }} />}
      {creating && <CreateDialog onClose={() => setCreating(false)} onDone={() => { setCreating(false); list.reload(); }} />}
    </section>
  );
}

/** Búsqueda por POST (el código no va en la URL). */
function useSearch(body: object) {
  const [data, setData] = useState<{ items: CouponRow[]; total: number; page: number; pageSize: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const key = JSON.stringify(body);
  useEffect(() => {
    let cancelled = false;
    setError(null);
    api<{ items: CouponRow[]; total: number; page: number; pageSize: number }>("POST", "/api/admin/coupons/search", { body: JSON.parse(key) })
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && setError(errorMessage(e)));
    return () => {
      cancelled = true;
    };
  }, [key, tick]);
  return { data, error, reload: () => setTick((t) => t + 1) };
}

function VoidDialog({ coupon, onClose, onDone }: { coupon: CouponRow; onClose(): void; onDone(): void }) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await api("POST", `/api/admin/coupons/${coupon.id}/void`, { body: { reason } });
      onDone();
    } catch (err) {
      setError(err instanceof ApiClientError && err.fieldErrors.reason ? err.fieldErrors.reason : errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog title="Anular cupón" onClose={onClose}>
      <form onSubmit={submit}>
        <p>Vas a anular el cupón <strong className="mono">{coupon.code}</strong>. Un cupón anulado no se puede canjear y esta acción no se puede deshacer.</p>
        {error && <Banner tone="bad" icon="⚠">{error}</Banner>}
        <Field label="Motivo de la anulación" hint="Obligatorio. No escribas datos personales de clientes.">
          {(a) => <input {...a} type="text" maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} required autoFocus />}
        </Field>
        <div className="actions inline">
          <button type="submit" className="danger" disabled={busy || reason.trim().length < 3}>{busy && <Spinner />} Anular cupón</button>
          <button type="button" className="secondary" onClick={onClose}>Cancelar</button>
        </div>
      </form>
    </Dialog>
  );
}

function CreateDialog({ onClose, onDone }: { onClose(): void; onDone(): void }) {
  const [campaignId, setCampaignId] = useState("");
  const [code, setCode] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [fail, setFail] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setErrors({});
    setFail(null);
    try {
      await api("POST", "/api/admin/coupons", { body: { campaignId, code } });
      onDone();
    } catch (err) {
      if (err instanceof ApiClientError && Object.keys(err.fieldErrors).length) setErrors(err.fieldErrors);
      else setFail(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog title="Crear cupón" onClose={onClose}>
      <form onSubmit={submit} noValidate>
        {fail && <Banner tone="bad" icon="⚠">{fail}</Banner>}
        <CampaignSelect value={campaignId} onChange={setCampaignId} label="Campaña" all="Elige una campaña" />
        <Field label="Código" hint="Solo números, con la longitud de la campaña. Conserva los ceros iniciales." error={errors.code}>
          {(a) => <input {...a} className="code-input" type="text" inputMode="numeric" pattern="[0-9]*" maxLength={16} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />}
        </Field>
        <div className="actions inline">
          <button type="submit" disabled={busy || !campaignId || !code}>{busy && <Spinner />} Crear</button>
          <button type="button" className="secondary" onClick={onClose}>Cancelar</button>
        </div>
      </form>
    </Dialog>
  );
}

