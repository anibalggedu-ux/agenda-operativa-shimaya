"use client";

import { useEffect, useState } from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import {
  obtenerReportesPorDia,
  obtenerDesempenoPorPersona,
  obtenerRankingTardanzas,
  obtenerRankingPuntualidad,
  type ReportesPorDia,
  type DesempenoPersona,
  type RankingTardanza,
  type RankingPuntualidad,
} from "./actions";
import { obtenerVitrinaTrofeos, type FilaVitrina } from "../puntos-actions";
import { UMBRALES_MEDALLAS } from "@/lib/trofeos";
import { hoyPeru, sumarDias, formatearFechaLegible } from "@/lib/fechas";
import RankingTiendas from "./ranking-tiendas";
import TiendasTardanzas from "./tiendas-tardanzas";
import ReporteTienda from "./reporte-tienda";
import RankingPorRol from "./ranking-por-rol";

const COLOR_EJE = "#64748b";
const COLOR_GRILLA = "#1e293b";

function TarjetaVacia({ children }: { children: React.ReactNode }) {
  return <p className="text-slate-500 text-sm italic py-6 text-center">{children}</p>;
}

function FilaVitrinaPersona({ fila }: { fila: FilaVitrina }) {
  return (
    <div className="flex items-center justify-between bg-[#0d1117] border border-slate-800 rounded-xl p-3 gap-3">
      <p className="text-white font-bold text-sm truncate min-w-0">{fila.nombre}</p>
      <div className="flex items-center gap-3 shrink-0">
        <div className="flex items-center gap-2">
          {UMBRALES_MEDALLAS.map((u) =>
            fila.medallas[u.id] > 0 ? (
              <span key={u.id} className="text-xs font-bold text-slate-300 whitespace-nowrap">
                {u.emoji}×{fila.medallas[u.id]}
              </span>
            ) : null
          )}
        </div>
        <span className="text-yellow-400 font-black text-sm shrink-0">{fila.puntos} pts</span>
      </div>
    </div>
  );
}

function ColumnaVitrina({ titulo, filas }: { titulo: string; filas: FilaVitrina[] }) {
  return (
    <div className="bg-[#0d1117] border border-slate-800 rounded-xl p-4">
      <h4 className="text-xs font-black tracking-widest text-slate-300 mb-3">{titulo}</h4>
      {filas.length === 0 ? (
        <p className="text-slate-500 text-sm italic">Todavía no hay puntos acumulados.</p>
      ) : (
        <div className="space-y-2">
          {filas.map((fila) => (
            <FilaVitrinaPersona key={fila.usuarioId} fila={fila} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function CentralAnalitica() {
  const [desde, setDesde] = useState<string>(sumarDias(hoyPeru(), -30));
  const [hasta, setHasta] = useState<string>(hoyPeru());
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [reportesPorDia, setReportesPorDia] = useState<ReportesPorDia[]>([]);
  const [desempeno, setDesempeno] = useState<DesempenoPersona[]>([]);
  const [rankingTardanzas, setRankingTardanzas] = useState<RankingTardanza[]>([]);
  const [rankingPuntualidad, setRankingPuntualidad] = useState<RankingPuntualidad[]>([]);

  const [vitrina, setVitrina] = useState<FilaVitrina[]>([]);
  const [cargandoVitrina, setCargandoVitrina] = useState(true);
  const [errorVitrina, setErrorVitrina] = useState<string | null>(null);

  useEffect(() => {
    obtenerVitrinaTrofeos()
      .then(setVitrina)
      .catch((e) => setErrorVitrina(e.message || "Error al cargar la vitrina de trofeos."))
      .finally(() => setCargandoVitrina(false));
  }, []);

  useEffect(() => {
    setCargando(true);
    setError(null);
    Promise.all([
      obtenerReportesPorDia(desde, hasta),
      obtenerDesempenoPorPersona(desde, hasta),
      obtenerRankingTardanzas(desde, hasta),
      obtenerRankingPuntualidad(desde, hasta),
    ])
      .then(([rpd, dp, rta, rp]) => {
        setReportesPorDia(rpd);
        setDesempeno(dp);
        setRankingTardanzas(rta);
        setRankingPuntualidad(rp);
      })
      .catch((e) => setError(e.message || "Error al cargar la Central Analítica."))
      .finally(() => setCargando(false));
  }, [desde, hasta]);

  const vitrinaSupervisores = vitrina.filter((f) => f.rol === "supervisor");
  const vitrinaCapacitadores = vitrina.filter((f) => f.rol === "capacitador");

  const desempenoSupervisores = desempeno
    .filter((d) => d.rol === "supervisor")
    .map((d) => ({ nombre: d.nombre, valor: d.reportes }));
  const desempenoCapacitadores = desempeno
    .filter((d) => d.rol === "capacitador")
    .map((d) => ({ nombre: d.nombre, valor: d.reportes }));

  const puntualidadSupervisores = rankingPuntualidad
    .filter((r) => r.rol === "supervisor")
    .map((r) => ({ nombre: r.nombre, valor: r.cantidad }));
  const puntualidadCapacitadores = rankingPuntualidad
    .filter((r) => r.rol === "capacitador")
    .map((r) => ({ nombre: r.nombre, valor: r.cantidad }));

  return (
    <div className="space-y-8">
      <section className="bg-[#0f111a] border border-yellow-500/30 rounded-2xl p-5">
        <h3 className="text-xs font-black tracking-widest text-slate-300 mb-1">
          🏆 VITRINA DE TROFEOS
        </h3>
        <p className="text-slate-500 text-[11px] mb-4">
          Puntos acumulados de por vida — puntualidad (10 a 30 pts según cuánto antes marcó
          ingreso) + 10 pts por reporte enviado. 🥉 250 · 🥈 600 · 🥇 1200 · 🌟 2000
        </p>
        {cargandoVitrina ? (
          <p className="text-slate-500 text-sm animate-pulse">Cargando vitrina...</p>
        ) : errorVitrina ? (
          <p className="text-red-400 text-sm">{errorVitrina}</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ColumnaVitrina titulo="SUPERVISORES" filas={vitrinaSupervisores} />
            <ColumnaVitrina titulo="CAPACITADORES" filas={vitrinaCapacitadores} />
          </div>
        )}
      </section>

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
              🎯 RANKING DE ASISTENCIA PUNTUAL
            </h3>
            <p className="text-slate-500 text-[11px] mb-4">
              Cantidad de veces que marcó ingreso a tiempo — capacitador antes de las 11:00am,
              supervisor antes de las 12:00pm.
            </p>
            <RankingPorRol
              supervisores={puntualidadSupervisores}
              capacitadores={puntualidadCapacitadores}
              sufijo="puntual(es)"
              vacio="Sin marcaciones puntuales en este rango."
            />
          </section>

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
            <RankingTiendas desde={desde} hasta={hasta} />
          </section>

          <section className="bg-[#0f111a] border border-slate-800 rounded-2xl p-5">
            <h3 className="text-xs font-black tracking-widest text-slate-300 mb-4">
              👤 REPORTES ENVIADOS
            </h3>
            <RankingPorRol
              supervisores={desempenoSupervisores}
              capacitadores={desempenoCapacitadores}
              sufijo="reporte(s)"
              vacio="Sin reportes enviados en este rango."
            />
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

          <section className="bg-[#0f111a] border border-slate-800 rounded-2xl p-5">
            <h3 className="text-xs font-black tracking-widest text-slate-300 mb-1">
              🏪 TIENDAS POR TARDANZAS
            </h3>
            <p className="text-slate-500 text-[11px] mb-4">
              Toca el número de visitas o de colaboradores tarde para ver el detalle.
            </p>
            <TiendasTardanzas desde={desde} hasta={hasta} />
          </section>

          <section className="bg-[#0f111a] border border-slate-800 rounded-2xl p-5">
            <h3 className="text-xs font-black tracking-widest text-slate-300 mb-4">
              📄 REPORTE DE TIENDA
            </h3>
            <ReporteTienda />
          </section>
        </>
      )}
    </div>
  );
}
