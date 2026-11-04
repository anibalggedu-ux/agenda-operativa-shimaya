import { useState } from "react";
import type { CouponState } from "../../shared/types";
import { useApi } from "../hooks";
import { Banner, num, pct } from "../ui";
import { Analytics } from "./Analytics";
import { Campanas, Cupones } from "../moderacion/catalogo";
import { Importar } from "../moderacion/Importar";
import { Auditoria, Canjes, Clientes } from "../moderacion/listados";
import { Tiendas } from "../moderacion/tiendas";

const TABS = [
  { id: "resumen", label: "Resumen" },
  { id: "estadisticas", label: "Estadísticas" },
  { id: "canjes", label: "Canjes" },
  { id: "campanas", label: "Campañas" },
  { id: "cupones", label: "Cupones" },
  { id: "importar", label: "Importar CSV" },
  { id: "tiendas", label: "Tiendas y PIN" },
  { id: "clientes", label: "Clientes" },
  { id: "auditoria", label: "Auditoría" },
] as const;
type TabId = (typeof TABS)[number]["id"];

export function Moderacion() {
  const [tab, setTab] = useState<TabId>("resumen");
  return (
    <main className="page">
      <div className="tabs" role="tablist" aria-label="Secciones del panel">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === "resumen" && <Resumen go={setTab} />}
      {tab === "estadisticas" && <Analytics />}
      {tab === "canjes" && <Canjes />}
      {tab === "campanas" && <Campanas />}
      {tab === "cupones" && <Cupones />}
      {tab === "importar" && <Importar />}
      {tab === "tiendas" && <Tiendas />}
      {tab === "clientes" && <Clientes />}
      {tab === "auditoria" && <Auditoria />}
    </main>
  );
}

function Resumen({ go }: { go(t: TabId): void }) {
  const q = useApi<{
    inventory: Record<CouponState, number> & { issued: number; redemptionRate: number | null };
    redemptionsToday: number;
    redemptionsLast7Days: number;
    consentedContacts: number;
  }>("/api/admin/overview");
  if (q.error) return <Banner tone="bad" icon="⚠">{q.error}</Banner>;
  if (!q.data) return <p role="status">Cargando resumen…</p>;
  const d = q.data;
  const kpi = (v: string, l: string) => (
    <div className="kpi">
      <div className="v">{v}</div>
      <div className="l">{l}</div>
    </div>
  );
  return (
    <>
      <h2>Resumen general</h2>
      <div className="grid kpis">
        {kpi(num(d.redemptionsToday), "Canjes de hoy (Lima)")}
        {kpi(num(d.redemptionsLast7Days), "Canjes, últimos 7 días")}
        {kpi(num(d.inventory.issued), "Cupones emitidos")}
        {kpi(num(d.inventory.available), "Disponibles")}
        {kpi(pct(d.inventory.redemptionRate), "Tasa de canje")}
        {kpi(num(d.consentedContacts), "Clientes que autorizaron promociones")}
      </div>
      <div className="card">
        <p>Para ver gráficos y comparar campañas, abre <button className="ghost" onClick={() => go("estadisticas")}>Estadísticas</button>. Para crear cupones, <button className="ghost" onClick={() => go("importar")}>importa un CSV</button> o <button className="ghost" onClick={() => go("cupones")}>crea uno suelto</button>.</p>
      </div>
    </>
  );
}
