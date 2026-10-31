import { useState } from "react";
import type { CouponState } from "../../shared/types";
import { CampaignBars, HourBars, LineChart, StateDonut } from "../charts";
import { fillDays, useApi } from "../hooks";
import { qs } from "../api";
import { Banner, Empty, Field, num, pct } from "../ui";

interface Report {
  filters: { from: string | null; to: string | null; campaignId: string | null };
  inventory: Record<CouponState, number> & { issued: number; redemptionRate: number | null };
  redemptionsInRange: number;
  byDay: { date: string; count: number }[];
  byWeek: { weekStart: string; count: number }[];
  byMonth: { month: string; count: number }[];
  byHour: { hour: number; count: number }[];
  byCampaign: { campaignId: string; name: string; issued: number; redeemed: number; redemptionRate: number | null }[];
}

type Grain = "day" | "week" | "month";

function Kpi({ label, value, help }: { label: string; value: string; help: string }) {
  return (
    <div className="kpi">
      <div className="v">{value}</div>
      <div className="l">{label}</div>
      <details>
        <summary>¿Qué mide?</summary>
        {help}
      </details>
    </div>
  );
}

/** Solo estadísticas agregadas. Este componente nunca recibe datos personales (la API no los envía). */
export function Analytics() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [campaignId, setCampaignId] = useState("");
  const [grain, setGrain] = useState<Grain>("day");
  const camps = useApi<{ campaigns: { id: string; name: string }[] }>("/api/analytics/campaigns");
  const { data: r, error, loading } = useApi<Report>(`/api/analytics/report${qs({ from, to, campaignId })}`);

  const series =
    r &&
    (grain === "day"
      ? fillDays(r.byDay)
      : grain === "week"
        ? r.byWeek.map((w) => ({ label: `Sem. ${w.weekStart}`, value: w.count }))
        : r.byMonth.map((m) => ({ label: m.month, value: m.count })));
  const inv = r?.inventory;

  return (
    <div>
      <section className="card" aria-label="Filtros">
        <div className="row">
          <Field label="Desde">{(a) => <input {...a} type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />}</Field>
          <Field label="Hasta">{(a) => <input {...a} type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />}</Field>
          <Field label="Campaña">
            {(a) => (
              <select {...a} value={campaignId} onChange={(e) => setCampaignId(e.target.value)}>
                <option value="">Todas</option>
                {camps.data?.campaigns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
          {(from || to || campaignId) && (
            <button
              className="secondary"
              onClick={() => {
                setFrom("");
                setTo("");
                setCampaignId("");
              }}
            >
              Quitar filtros
            </button>
          )}
        </div>
        <p className="muted small">Las fechas son días en hora de Lima, ambos extremos incluidos. Sin fechas se considera todo el período.</p>
      </section>

      {error && (
        <Banner tone="bad" icon="⚠">
          {error}
        </Banner>
      )}
      {loading && !r && <p role="status">Cargando estadísticas…</p>}

      {r && inv && (
        <>
          <h2>Cupones</h2>
          <div className="grid kpis" aria-busy={loading}>
            <Kpi label="Cupones emitidos" value={num(inv.issued)} help="Cupones creados dentro del filtro (por fecha de creación y campaña). Es el total de las categorías de estado y el denominador de la tasa." />
            <Kpi label="Cupones canjeados" value={num(inv.redeemed)} help="De los emitidos del filtro, cuántos ya fueron canjeados (aunque el canje ocurriera después del rango de fechas)." />
            <Kpi label="Tasa de canje" value={pct(inv.redemptionRate)} help="Canjeados ÷ emitidos del filtro. El denominador incluye TODOS los emitidos, también vencidos y anulados. Sin cupones emitidos se muestra “—”." />
            <Kpi label="Disponibles" value={num(inv.available)} help="No canjeados, no anulados, campaña activa y dentro de su vigencia hoy." />
            <Kpi label="Vencidos" value={num(inv.expired)} help="No canjeados ni anulados cuya campaña ya terminó." />
            <Kpi label="Anulados" value={num(inv.voided)} help="Anulados por un moderador. Un cupón anulado cuenta solo aquí, aunque su campaña haya vencido." />
            <Kpi label="Campaña no disponible" value={num(inv.unavailable)} help="No canjeados ni anulados, vigentes por fecha, pero con campaña inactiva o que aún no empieza." />
          </div>

          {inv.issued === 0 && r.redemptionsInRange === 0 ? (
            <div className="card">
              <Empty mascot>No hay cupones ni canjes con estos filtros. Prueba ampliando las fechas o eligiendo otra campaña.</Empty>
            </div>
          ) : (
            <>
              <div className="grid two">
                <section className="card">
                  <h3>Distribución por estado</h3>
                  <StateDonut counts={inv} total={inv.issued} />
                  <p className="muted small">Las categorías no se superponen: suman exactamente los cupones emitidos.</p>
                </section>
                <section className="card">
                  <h3>Comparación entre campañas</h3>
                  {r.byCampaign.length ? <CampaignBars rows={r.byCampaign} /> : <Empty>Sin campañas con cupones en este filtro.</Empty>}
                </section>
              </div>

              <h2>Canjes</h2>
              <section className="card">
                <div className="spread">
                  <h3>
                    Canjes por fecha <span className="muted">· {num(r.redemptionsInRange)} en el período</span>
                  </h3>
                  <div className="tabs" role="tablist" aria-label="Agrupar por">
                    {(["day", "week", "month"] as Grain[]).map((g) => (
                      <button key={g} role="tab" aria-selected={grain === g} onClick={() => setGrain(g)}>
                        {g === "day" ? "Día" : g === "week" ? "Semana" : "Mes"}
                      </button>
                    ))}
                  </div>
                </div>
                {series && series.length > 0 ? (
                  <LineChart points={series} summary={`Canjes por ${grain === "day" ? "día" : grain === "week" ? "semana" : "mes"}: ${series.length} puntos, ${num(r.redemptionsInRange)} canjes en total.`} />
                ) : (
                  <Empty>No hubo canjes en este período.</Empty>
                )}
              </section>
              <section className="card">
                <h3>Distribución de canjes por hora</h3>
                <HourBars hours={r.byHour} />
              </section>
            </>
          )}

          <section className="card">
            <h3>Cómo leer estos números</h3>
            <ul>
              <li>
                <strong>Cupones</strong> (emitidos, estados, tasa): se filtran por <em>fecha de creación del cupón</em> y campaña.
              </li>
              <li>
                <strong>Canjes</strong> (gráfico por fecha, por hora): se filtran por <em>fecha del canje</em> y campaña.
              </li>
              <li>Horas, días, semanas (lunes a domingo) y meses se calculan en hora de Lima.</li>
              <li>Estado de un cupón, por prioridad: canjeado → anulado → vencido → campaña no disponible → disponible.</li>
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
