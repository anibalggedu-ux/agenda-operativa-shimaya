import { useState, type ChangeEvent } from "react";
import { formatLima } from "../../shared/time";
import { ApiClientError, api, errorMessage, qs } from "../api";
import { useApi } from "../hooks";
import { Banner, Dialog, Field, Pager, Spinner, num } from "../ui";
import { CampaignSelect, DataGrid } from "./comunes";

interface Summary {
  total: number;
  valid: number;
  invalid: number;
  errors: { rowNumber: number; code: string; error: string }[];
  errorsTruncated: boolean;
}

type Mode = "todo_o_nada" | "parcial";

export function Importar() {
  const [campaignId, setCampaignId] = useState("");
  const [csv, setCsv] = useState("");
  const [mode, setMode] = useState<Mode>("todo_o_nada");
  const [preview, setPreview] = useState<Summary | null>(null);
  const [result, setResult] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [busy, setBusy] = useState<"preview" | "confirm" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [errorsOf, setErrorsOf] = useState<string | null>(null);
  const history = useApi<{ items: { id: string; createdAt: string; mode: string; total: number; imported: number; rejected: number; campaign: string; uploadedBy: string }[]; total: number; page: number; pageSize: number }>(
    `/api/admin/imports${qs({ page, pageSize: 5 })}`,
  );

  const invalidate = () => {
    setPreview(null);
    setResult(null);
    setError(null);
  };

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    // Se lee como TEXTO: los códigos nunca pasan por un número, así los ceros iniciales se conservan.
    setCsv(await file.text());
    invalidate();
  }

  async function run(kind: "preview" | "confirm") {
    if (busy) return;
    setBusy(kind);
    setError(null);
    setResult(null);
    try {
      if (kind === "preview") {
        setPreview(await api<Summary>("POST", "/api/admin/imports/preview", { body: { campaignId, csv, mode } }));
      } else {
        const r = await api<Summary & { imported: number }>("POST", "/api/admin/imports/confirm", { body: { campaignId, csv, mode } });
        setResult({ tone: "ok", text: `Importación completada: ${num(r.imported)} cupones creados${r.invalid ? ` y ${num(r.invalid)} filas rechazadas (quedaron registradas)` : ""}.` });
        setPreview(null);
        setCsv("");
        history.reload();
      }
    } catch (err) {
      if (err instanceof ApiClientError && err.code === "import_rejected") {
        setResult({ tone: "bad", text: "El archivo tiene errores y, en modo “todo o nada”, no se importó ningún cupón. Corrige las filas indicadas y vuelve a intentar." });
        setPreview(err.body as unknown as Summary);
        history.reload();
      } else setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  const ready = campaignId && csv.trim().length > 0;
  return (
    <>
      <section className="card">
        <h2>Importar cupones desde CSV</h2>
        <p className="muted small">Una columna con los códigos (con o sin encabezado “codigo”); se aceptan , ; o tabulación. Máximo 2000 filas por archivo. Si usas Excel, formatea la columna como <strong>Texto</strong> para no perder los ceros iniciales: aquí no se rellenan solos.</p>
        <CampaignSelect value={campaignId} onChange={(v) => { setCampaignId(v); invalidate(); }} all="Elige una campaña" />
        <Field label="Archivo CSV">{(a) => <input {...a} type="file" accept=".csv,text/csv,text/plain" onChange={onFile} />}</Field>
        <Field label="…o pega los códigos" hint="Uno por línea">
          {(a) => <textarea {...a} spellCheck={false} value={csv} onChange={(e) => { setCsv(e.target.value); invalidate(); }} />}
        </Field>
        <fieldset className="card">
          <legend>¿Qué pasa si hay filas con error?</legend>
          <label className="check"><input type="radio" name="modo" checked={mode === "todo_o_nada"} onChange={() => { setMode("todo_o_nada"); invalidate(); }} /><span><strong>Todo o nada (recomendado):</strong> si una sola fila falla, no se crea ningún cupón. Los errores quedan registrados.</span></label>
          <label className="check"><input type="radio" name="modo" checked={mode === "parcial"} onChange={() => { setMode("parcial"); invalidate(); }} /><span><strong>Parcial:</strong> se importan las filas válidas y se rechazan las demás. Los errores quedan registrados.</span></label>
        </fieldset>
        <p className="muted small">Nunca se sobrescriben cupones existentes: un código repetido se rechaza.</p>
        {error && <Banner tone="bad" icon="⚠">{error}</Banner>}
        {result && <Banner tone={result.tone} icon={result.tone === "ok" ? "✔" : "✖"}>{result.text}</Banner>}
        <div className="actions inline">
          <button className="secondary" disabled={!ready || busy !== null} onClick={() => run("preview")}>{busy === "preview" && <Spinner />} Vista previa</button>
          <button disabled={!ready || !preview || busy !== null || preview.valid === 0 || (mode === "todo_o_nada" && preview.invalid > 0)} onClick={() => run("confirm")}>{busy === "confirm" && <Spinner />} Confirmar importación</button>
        </div>
      </section>

      {preview && (
        <section className="card" aria-live="polite">
          <h3>Vista previa (aún no se guardó nada)</h3>
          <div className="grid kpis">
            <div className="kpi"><div className="v">{num(preview.total)}</div><div className="l">Filas leídas</div></div>
            <div className="kpi"><div className="v">{num(preview.valid)}</div><div className="l">✔ Válidas</div></div>
            <div className="kpi"><div className="v">{num(preview.invalid)}</div><div className="l">✖ Con error</div></div>
          </div>
          {preview.invalid > 0 && (
            <>
              <h3>Filas con error</h3>
              <DataGrid head={[{ label: "Fila", num: true }, { label: "Código" }, { label: "Motivo" }]}>
                {preview.errors.map((e) => (
                  <tr key={e.rowNumber}><td data-label="Fila" className="num">{e.rowNumber}</td><td data-label="Código" className="mono">{e.code || "—"}</td><td data-label="Motivo">{e.error}</td></tr>
                ))}
              </DataGrid>
              {preview.errorsTruncated && <p className="muted small">Se muestran las primeras 100 filas con error.</p>}
            </>
          )}
        </section>
      )}

      <section className="card">
        <h3>Importaciones anteriores</h3>
        {history.data && history.data.items.length === 0 && <p className="muted">Todavía no hay importaciones.</p>}
        {history.data && history.data.items.length > 0 && (
          <>
            <DataGrid head={[{ label: "Fecha (Lima)" }, { label: "Campaña" }, { label: "Modo" }, { label: "Filas", num: true }, { label: "Importadas", num: true }, { label: "Rechazadas", num: true }, { label: "" }]}>
              {history.data.items.map((b) => (
                <tr key={b.id}>
                  <td data-label="Fecha (Lima)" className="nowrap">{formatLima(b.createdAt)}</td>
                  <td data-label="Campaña">{b.campaign}</td>
                  <td data-label="Modo">{b.mode === "parcial" ? "Parcial" : "Todo o nada"}</td>
                  <td data-label="Filas" className="num">{num(b.total)}</td>
                  <td data-label="Importadas" className="num">{num(b.imported)}</td>
                  <td data-label="Rechazadas" className="num">{num(b.rejected)}</td>
                  <td>{b.rejected > 0 && <button className="secondary small" onClick={() => setErrorsOf(b.id)}>Ver errores</button>}</td>
                </tr>
              ))}
            </DataGrid>
            <Pager page={history.data.page} pageSize={history.data.pageSize} total={history.data.total} onPage={setPage} />
          </>
        )}
      </section>
      {errorsOf && <ErrorsDialog id={errorsOf} onClose={() => setErrorsOf(null)} />}
    </>
  );
}

function ErrorsDialog({ id, onClose }: { id: string; onClose(): void }) {
  const q = useApi<{ errors: { rowNumber: number; code: string | null; message: string }[] }>(`/api/admin/imports/${id}/errors`);
  return (
    <Dialog title="Errores de la importación" onClose={onClose}>
      {q.error && <Banner tone="bad" icon="⚠">{q.error}</Banner>}
      {q.data && (
        <DataGrid head={[{ label: "Fila", num: true }, { label: "Código" }, { label: "Motivo" }]}>
          {q.data.errors.map((e) => (
            <tr key={e.rowNumber}><td data-label="Fila" className="num">{e.rowNumber}</td><td data-label="Código" className="mono">{e.code || "—"}</td><td data-label="Motivo">{e.message}</td></tr>
          ))}
        </DataGrid>
      )}
      <p className="muted small">Se registran hasta 200 errores por importación.</p>
      <button className="block secondary" onClick={onClose}>Cerrar</button>
    </Dialog>
  );
}
