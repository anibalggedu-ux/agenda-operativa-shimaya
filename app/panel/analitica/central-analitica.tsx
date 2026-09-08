"use client";

import { useEffect, useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import {
  obtenerReportesPorDia,
  obtenerRankingTiendas,
  obtenerDesempenoPorPersona,
  obtenerTendenciaAsistencia,
  obtenerRankingTardanzas,
  type ReportesPorDia,
  type RankingTienda,
  type DesempenoPersona,
  type TendenciaAsistencia,
  type RankingTardanza,
} from "./actions";
import { hoyPeru, sumarDias, formatearFechaLegible } from "@/lib/fechas";

const COLOR_EJE = "#64748b";
const COLOR_GRILLA = "#1e293b";

function horaDecimalATexto(valor: number): string {
  const h = Math.floor(valor);
  const m = Math.round((valor - h) * 60);
  return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0");
}

function TarjetaVacia({ children }: { children: React.ReactNode }) {
  return <p className="text-slate-500 text-sm italic py-6 text-center">{children}</p>;
}

export default function CentralAnalitica() {
  const [desde, setDesde] = useState<string>(sumarDias(hoyPeru(), -30));
  const [hasta, setHasta] = useState<string>(hoyPeru());
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [reportesPorDia, setReportesPorDia] = useState<ReportesPorDia[]>([]);
  const [rankingTiendas, setRankingTiendas] = useState<RankingTienda[]>([]);
  const [desempeno, setDesempeno] = useState<DesempenoPersona[]>([]);
  const [tendenciaAsistencia, setTendenciaAsistencia] = useState<TendenciaAsistencia[]>([]);
  const [rankingTardanzas, setRankingTardanzas] = useState<RankingTardanza[]>([]);

  useEffect(() => {
    setCargando(true);
    setError(null);
    Promise.all([
      obtenerReportesPorDia(desde, hasta),
      obtenerRankingTiendas(desde, hasta),
      obtenerDesempenoPorPersona(desde, hasta),
      obtenerTendenciaAsistencia(desde, hasta),
      obtenerRankingTardanzas(desde, hasta),
    ])
      .then(([rpd, rt, dp, ta, rta]) => {
        setReportesPorDia(rpd);
        setRankingTiendas(rt);
        setDesempeno(dp);
        setTendenciaAsistencia(ta);
        setRankingTardanzas(rta);
      })
      .catch((e) => setError(e.message || "Error al cargar la Central Analítica."))
      .finally(() => setCargando(false));
  }, [desde, hasta]);

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row gap-3 bg-[#0f111a] border border-slate-800 rounded-2xl p-4">
        <div className="flex-1">
          <label className="block text-slate-400 text-[10px] uppercase font-bold mb-1">
            Desde
          </label>
          <input
            type="date"
            value={desde}
            max={hasta}
            onChange={(e) => setDesde(e.target.value)}
            className="w-full p-2.5 bg-[#0d1117] border border-slate-800 rounded-xl text-white text-sm outline-none focus:border-cyan-500"
          />
        </div>
        <div className="flex-1">
          <label className="block text-slate-400 text-[10px] uppercase font-bold mb-1">
            Hasta
          </label>
          <input
            type="date"
            value={hasta}
            min={desde}
            max={hoyPeru()}
            onChange={(e) => setHasta(e.target.value)}
            className="w-full p-2.5 bg-[#0d1117] border border-slate-800 rounded-xl text-white text-sm outline-none focus:border-cyan-500"
          />
        </div>
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}
      {cargando && <p className="text-slate-500 text-sm animate-pulse">Cargando datos...</p>}

      {!cargando && !error && (
        <>
          <section className="bg-[#0f111a] border border-slate-800 rounded-2xl p-5">
            <h3 className="text-xs font-black tracking-widest text-slate-300 mb-4">
              📈 REPORTES POR DÍA
            </h3>
            {reportesPorDia.length === 0 ? (
              <TarjetaVacia>No hay reportes en este rango de fechas.</TarjetaVacia>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={reportesPorDia}>
                  <CartesianGrid strokeDasharray="3 3" stroke={COLOR_GRILLA} />
                  <XAxis
                    dataKey="fecha"
                    stroke={COLOR_EJE}
                    tick={{ fontSize: 10 }}
                    tickFormatter={(v) => v.slice(5)}
                  />
                  <YAxis stroke={COLOR_EJE} tick={{ fontSize: 10 }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ background: "#0d1117", border: "1px solid #1e293b" }}
                    labelFormatter={(v) => formatearFechaLegible(String(v))}
                  />
                  <Bar dataKey="cantidad" name="Reportes" fill="#22d3ee" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </section>

          <section className="bg-[#0f111a] border border-slate-800 rounded-2xl p-5">
            <h3 className="text-xs font-black tracking-widest text-slate-300 mb-4">
              🏬 RANKING DE TIENDAS MÁS VISITADAS
            </h3>
            {rankingTiendas.length === 0 ? (
              <TarjetaVacia>No hay visitas registradas en este rango de fechas.</TarjetaVacia>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(240, rankingTiendas.length * 36)}>
                <BarChart data={rankingTiendas} layout="vertical" margin={{ left: 24 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={COLOR_GRILLA} />
                  <XAxis type="number" stroke={COLOR_EJE} tick={{ fontSize: 10 }} allowDecimals={false} />
                  <YAxis
                    type="category"
                    dataKey="tiendaNombre"
                    stroke={COLOR_EJE}
                    tick={{ fontSize: 10 }}
                    width={120}
                  />
                  <Tooltip contentStyle={{ background: "#0d1117", border: "1px solid #1e293b" }} />
                  <Bar dataKey="visitas" name="Visitas" fill="#a78bfa" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </section>

          <section className="bg-[#0f111a] border border-slate-800 rounded-2xl p-5">
            <h3 className="text-xs font-black tracking-widest text-slate-300 mb-4">
              👤 DESEMPEÑO POR PERSONA (REPORTES ENVIADOS)
            </h3>
            {desempeno.length === 0 ? (
              <TarjetaVacia>No hay reportes en este rango de fechas.</TarjetaVacia>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(240, desempeno.length * 36)}>
                <BarChart data={desempeno} layout="vertical" margin={{ left: 24 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={COLOR_GRILLA} />
                  <XAxis type="number" stroke={COLOR_EJE} tick={{ fontSize: 10 }} allowDecimals={false} />
                  <YAxis
                    type="category"
                    dataKey="nombre"
                    stroke={COLOR_EJE}
                    tick={{ fontSize: 10 }}
                    width={120}
                  />
                  <Tooltip contentStyle={{ background: "#0d1117", border: "1px solid #1e293b" }} />
                  <Bar dataKey="reportes" name="Reportes" fill="#4ade80" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </section>

          <section className="bg-[#0f111a] border border-slate-800 rounded-2xl p-5">
            <h3 className="text-xs font-black tracking-widest text-slate-300 mb-4">
              🕒 TENDENCIA DE HORA DE INGRESO (PROMEDIO DIARIO)
            </h3>
            {tendenciaAsistencia.length === 0 ? (
              <TarjetaVacia>No hay marcas de asistencia en este rango de fechas.</TarjetaVacia>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={tendenciaAsistencia}>
                  <CartesianGrid strokeDasharray="3 3" stroke={COLOR_GRILLA} />
                  <XAxis
                    dataKey="fecha"
                    stroke={COLOR_EJE}
                    tick={{ fontSize: 10 }}
                    tickFormatter={(v) => v.slice(5)}
                  />
                  <YAxis
                    stroke={COLOR_EJE}
                    tick={{ fontSize: 10 }}
                    tickFormatter={(v) => horaDecimalATexto(v)}
                    domain={["dataMin - 1", "dataMax + 1"]}
                  />
                  <Tooltip
                    contentStyle={{ background: "#0d1117", border: "1px solid #1e293b" }}
                    labelFormatter={(v) => formatearFechaLegible(String(v))}
                    formatter={(v) => [horaDecimalATexto(Number(v)), "Hora promedio"]}
                  />
                  <Line
                    type="monotone"
                    dataKey="horaPromedioIngreso"
                    name="Hora promedio"
                    stroke="#fbbf24"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </section>

          <section className="bg-[#0f111a] border border-slate-800 rounded-2xl p-5">
            <h3 className="text-xs font-black tracking-widest text-slate-300 mb-4">
              🚨 RANKING DE TARDANZAS
            </h3>
            <p className="text-slate-500 text-[11px] mb-4">
              Capacitador: tardanza después de las 11:00am · Supervisor: tardanza después de las 12:00pm
            </p>
            {rankingTardanzas.length === 0 ? (
              <TarjetaVacia>No hay tardanzas registradas en este rango de fechas.</TarjetaVacia>
            ) : (
              <div className="space-y-2">
                {rankingTardanzas.map((r, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between bg-red-950/20 border border-red-500/30 rounded-xl p-3"
                  >
                    <div>
                      <p className="text-white font-bold text-sm">{r.nombre}</p>
                      <p className="text-slate-500 text-[11px] uppercase">{r.rol}</p>
                    </div>
                    <span className="text-red-400 font-black text-sm">
                      {r.tardanzas} tardanza{r.tardanzas === 1 ? "" : "s"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
