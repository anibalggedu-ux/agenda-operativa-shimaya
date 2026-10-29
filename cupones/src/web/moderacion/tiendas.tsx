import { useState, type FormEvent } from "react";
import { formatLima } from "../../shared/time";
import { api, errorMessage } from "../api";
import { useApi } from "../hooks";
import { Banner, Dialog, Empty, Field, Spinner, num } from "../ui";
import { DataGrid } from "./comunes";

interface Store {
  id: string;
  name: string;
  active: boolean;
  pinUpdatedAt: string;
  lastLoginAt: string | null;
  redemptions: number;
}
interface Issued {
  id: string;
  name: string;
  pin: string;
}

/** Descarga la lista de PIN como CSV (los PIN solo existen en pantalla en este momento). */
function downloadCsv(rows: Issued[]) {
  const csv = ["tienda,pin", ...rows.map((r) => `"${r.name.replace(/"/g, '""')}",${r.pin}`)].join("\n");
  const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "pines-tiendas.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export function Tiendas() {
  const list = useApi<{ stores: Store[] }>("/api/admin/stores");
  const [adding, setAdding] = useState(false);
  const [issued, setIssued] = useState<Issued[] | null>(null);
  const [fail, setFail] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function resetPin(s: Store) {
    if (!window.confirm(`¿Generar un PIN nuevo para ${s.name}? El PIN anterior dejará de servir y se cerrarán sus sesiones.`)) return;
    setBusyId(s.id);
    setFail(null);
    try {
      const r = await api<{ pin: string }>("POST", `/api/admin/stores/${s.id}/reset-pin`, { body: {} });
      setIssued([{ id: s.id, name: s.name, pin: r.pin }]);
      list.reload();
    } catch (err) {
      setFail(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  async function setActive(s: Store, active: boolean) {
    if (!active && !window.confirm(`¿Desactivar ${s.name}? Perderá el acceso de inmediato.`)) return;
    setBusyId(s.id);
    setFail(null);
    try {
      await api("POST", `/api/admin/stores/${s.id}/active`, { body: { active } });
      list.reload();
    } catch (err) {
      setFail(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="card">
      <div className="spread">
        <h2>Tiendas y PIN</h2>
        <button onClick={() => setAdding(true)}>Agregar tiendas</button>
      </div>
      <p className="muted">Cada tienda entra al validador con su propio PIN de 6 números. El PIN se muestra una sola vez al crearlo; si se pierde, genera uno nuevo.</p>
      {fail && <Banner tone="bad" icon="⚠">{fail}</Banner>}
      {list.error && <Banner tone="bad" icon="⚠">{list.error}</Banner>}
      {list.data && list.data.stores.length === 0 && <Empty mascot>Aún no hay tiendas. Agrégalas para entregarles su PIN.</Empty>}
      {list.data && list.data.stores.length > 0 && (
        <DataGrid head={[{ label: "Tienda" }, { label: "Estado" }, { label: "PIN cambiado" }, { label: "Último ingreso" }, { label: "Canjes", num: true }, { label: "" }]}>
          {list.data.stores.map((s) => (
            <tr key={s.id}>
              <td data-label="Tienda"><strong>{s.name}</strong></td>
              <td data-label="Estado">{s.active ? <span className="badge ok"><span aria-hidden="true">✔</span> Activa</span> : <span className="badge off"><span aria-hidden="true">○</span> Desactivada</span>}</td>
              <td data-label="PIN cambiado" className="small">{formatLima(s.pinUpdatedAt)}</td>
              <td data-label="Último ingreso" className="small">{s.lastLoginAt ? formatLima(s.lastLoginAt) : "Nunca"}</td>
              <td data-label="Canjes" className="num">{num(s.redemptions)}</td>
              <td>
                <div className="actions inline">
                  <button className="secondary small" disabled={busyId === s.id} onClick={() => resetPin(s)}>PIN nuevo</button>
                  <button className="secondary small" disabled={busyId === s.id} onClick={() => setActive(s, !s.active)}>{s.active ? "Desactivar" : "Activar"}</button>
                </div>
              </td>
            </tr>
          ))}
        </DataGrid>
      )}
      {adding && <AddDialog onClose={() => setAdding(false)} onCreated={(rows) => { setAdding(false); setIssued(rows); list.reload(); }} />}
      {issued && <IssuedDialog rows={issued} onClose={() => setIssued(null)} />}
    </section>
  );
}

function AddDialog({ onClose, onCreated }: { onClose(): void; onCreated(rows: Issued[]): void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [fail, setFail] = useState<string | null>(null);
  const [skipped, setSkipped] = useState<string[]>([]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setFail(null);
    try {
      const names = text.split("\n").map((n) => n.trim()).filter(Boolean);
      const r = await api<{ created: Issued[]; skipped: string[] }>("POST", "/api/admin/stores", { body: { names } });
      if (r.created.length === 0) {
        setSkipped(r.skipped);
        setFail("Todas esas tiendas ya existen.");
      } else onCreated(r.created);
    } catch (err) {
      setFail(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog title="Agregar tiendas" onClose={onClose}>
      <form onSubmit={submit} noValidate>
        {fail && <Banner tone="bad" icon="⚠">{fail}{skipped.length > 0 && <> ({skipped.join(", ")})</>}</Banner>}
        <Field label="Nombres de las tiendas" hint="Una por línea. Hasta 50 por vez.">
          {(a) => <textarea {...a} rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder={"Tienda Miraflores\nTienda San Isidro"} />}
        </Field>
        <div className="actions inline">
          <button type="submit" disabled={busy || !text.trim()}>{busy && <Spinner />} Crear y generar PIN</button>
          <button type="button" className="secondary" onClick={onClose}>Cancelar</button>
        </div>
      </form>
    </Dialog>
  );
}

function IssuedDialog({ rows, onClose }: { rows: Issued[]; onClose(): void }) {
  return (
    <Dialog title={rows.length === 1 ? "PIN de la tienda" : "PIN de las tiendas"} onClose={onClose}>
      <Banner tone="warn" icon="⚠" live={false}>
        Anota o descarga estos PIN <strong>ahora</strong>: por seguridad no se vuelven a mostrar. Entrégalos a cada líder por un canal privado.
      </Banner>
      <DataGrid head={[{ label: "Tienda" }, { label: "PIN" }]}>
        {rows.map((r) => (
          <tr key={r.id}>
            <td data-label="Tienda">{r.name}</td>
            <td data-label="PIN"><strong style={{ fontSize: "1.25em", letterSpacing: "0.15em" }}>{r.pin}</strong></td>
          </tr>
        ))}
      </DataGrid>
      <div className="actions inline">
        <button onClick={() => downloadCsv(rows)}>Descargar CSV</button>
        <button className="secondary" onClick={onClose}>Listo, ya los anoté</button>
      </div>
    </Dialog>
  );
}
