"use client";

import { useEffect, useState } from "react";
import {
  obtenerAsistenciaGeneral,
  obtenerRankingTiendasCompleto,
  obtenerVisitasTienda,
  type AsistenciaGeneral,
  type RankingTiendasCompleto,
  type RankingTiendaCompleto,
  type VisitaTiendaDetalle,
} from "./actions";
import { formatearFechaLegible, formatearHora, hoyPeru, sumarDias } from "@/lib/fechas";

function SelectorFechas({
  desde,
  hasta,
  onDesde,
  onHasta,
}: {
  desde: string;
  hasta: string;
  onDesde: (v: string) => void;
  onHasta: (v: string) => void;
}) {
  return (
    <div className="flex flex-col sm:flex-row gap-3">
      <div className="flex-1">
        <label className="block text-slate-400 text-[10px] uppercase font-bold mb-1">Desde</label>
        <input
          type="date"
          value={desde}
          max={hasta}
          onChange={(e) => onDesde(e.target.value)}
          className="w-full p-2.5 bg-[#0d1117] border border-slate-800 rounded-xl text-white text-sm outline-none focus:border-red-500"
        />
      </div>
      <div className="flex-1">
        <label className="block text-slate-400 text-[10px] uppercase font-bold mb-1">Hasta</label>
        <input
          type="date"
          value={hasta}
          min={desde}
          onChange={(e) => onHasta(e.target.value)}
          className="w-full p-2.5 bg-[#0d1117] border border-slate-800 rounded-xl text-white text-sm outline-none focus:border-red-500"
        />
      </div>
    </div>
  );
}

function Marcacion({ hora, ubicacion }: { hora: string | null; ubicacion: string | null }) {
  if (!hora) return <span className="text-slate-600">—</span>;
  if (!ubicacion) return <span>{formatearHora(hora)}</span>;
  return (
    <a
      href={ubicacion}
      target="_blank"
      rel="noopener noreferrer"
      className="text-cyan-400 hover:text-cyan-300 underline font-bold"
    >
      {formatearHora(hora)}
    </a>
  );
}

function CuadroRanking({
  titulo,
  filas,
  offset,
  tiendaSeleccionada,
  onSeleccionar,
  vacio,
}: {
  titulo: string;
  filas: RankingTiendaCompleto[];
  offset: number;
  tiendaSeleccionada: string | null;
  onSeleccionar: (id: string) => void;
  vacio: string;
}) {
  return (
    <div className="bg-[#0f111a] border border-slate-800 rounded-2xl p-4">
      <h4 className="text-xs font-black tracking-widest text-slate-300 mb-3">
        {titulo} ({filas.length})
      </h4>
      {filas.length === 0 ? (
        <p className="text-slate-500 text-sm italic">{vacio}</p>
      ) : (
        <div className="space-y-1.5 max-h-80 overflow-y-auto pr-1">
          {filas.map((f, i) => (
            <button
              key={f.tiendaId}
              onClick={() => onSeleccionar(f.tiendaId)}
              className={`w-full flex items-center justify-between text-left rounded-lg px-3 py-2 transition ${
                tiendaSeleccionada === f.tiendaId
                  ? "bg-red-950/30 border border-red-500"
                  : "bg-[#0d1117] border border-slate-800 hover:border-slate-600"
              }`}
            >
              <span className="text-sm text-white truncate">
                <span className="text-slate-600 font-black mr-2">{offset + i + 1}.</span>
                {f.tiendaNombre}
              </span>
              {f.visitas > 0 && (
                <span className="text-yellow-400 font-black text-xs shrink-0 ml-2">
                  {f.visitas}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function HistorialMonitoreo() {
  const [desde, setDesde] = useState(sumarDias(hoyPeru(), -30));
  const [hasta, setHasta] = useState(hoyPeru());

  const [asistencia, setAsistencia] = useState<AsistenciaGeneral[]>([]);
  const [ranking, setRanking] = useState<RankingTiendasCompleto | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [tiendaId, setTiendaId] = useState<string | null>(null);
  const [tiendaNombreSel, setTiendaNombreSel] = useState<string>("");
  const [visitasTienda, setVisitasTienda] = useState<VisitaTiendaDetalle[] | null>(null);
  const [cargandoTienda, setCargandoTienda] = useState(false);

  useEffect(() => {
    setCargando(true);
    setError(null);
    Promise.all([obtenerAsistenciaGeneral(desde, hasta), obtenerRankingTiendasCompleto(desde, hasta)])
      .then(([a, r]) => {
        setAsistencia(a);
        setRanking(r);
      })
      .catch((e) => setError(e.message || "Error al cargar el monitoreo operativo."))
      .finally(() => setCargando(false));
  }, [desde, hasta]);

  function handleSeleccionarTienda(id: string, nombre: string) {
    setTiendaId(id);
    setTiendaNombreSel(nombre);
    setCargandoTienda(true);
    obtenerVisitasTienda(id, desde, hasta)
      .then(setVisitasTienda)
      .catch(() => setVisitasTienda(null))
      .finally(() => setCargandoTienda(false));
  }

  return (
    <div className="space-y-6">
      <div className="bg-[#0f111a] border border-slate-800 rounded-2xl p-4">
        <SelectorFechas desde={desde} hasta={hasta} onDesde={setDesde} onHasta={setHasta} />
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}
      {cargando && <p className="text-slate-500 text-sm animate-pulse">Cargando monitoreo operativo...</p>}

      {!cargando && !error && (
        <>
          <div>
            <h3 className="text-xs font-black tracking-widest text-slate-300 mb-3">
              REGISTROS DE ASISTENCIA ({asistencia.length})
            </h3>
            {asistencia.length === 0 ? (
              <p className="text-slate-500 text-sm italic">Sin marcaciones en este rango de fechas.</p>
            ) : (
              <div className="space-y-1.5 max-h-96 overflow-y-auto pr-1">
                {asistencia.map((a, i) => (
                  <div
                    key={i}
                    className={`flex items-center justify-between rounded-xl p-3 border gap-3 ${
                      a.tarde ? "border-red-600/50 bg-red-950/20" : "border-slate-800 bg-[#0f111a]"
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="text-white font-bold text-sm truncate">{a.usuarioNombre}</p>
                      <p className="text-slate-500 text-[11px] uppercase">{a.rol}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-slate-400 text-[11px] capitalize">
                        {formatearFechaLegible(a.fecha)}
                      </p>
                      <p className={`text-xs font-bold ${a.tarde ? "text-red-400" : "text-slate-200"}`}>
                        Ingreso: <Marcacion hora={a.horaIngreso} ubicacion={a.ubicacionIngreso} />
                        {a.tarde ? " (TARDE)" : ""} · Salida:{" "}
                        <Marcacion hora={a.horaSalida} ubicacion={a.ubicacionSalida} />
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {ranking && (
            <div>
              <h3 className="text-xs font-black tracking-widest text-slate-300 mb-3">
                RANKING DE TIENDAS VISITADAS
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <CuadroRanking
                  titulo="🥇 TOP 20"
                  filas={ranking.top20}
                  offset={0}
                  tiendaSeleccionada={tiendaId}
                  onSeleccionar={(id) => {
                    const t = ranking.top20.find((r) => r.tiendaId === id);
                    if (t) handleSeleccionarTienda(id, t.tiendaNombre);
                  }}
                  vacio="Sin visitas registradas en este rango."
                />
                <CuadroRanking
                  titulo="DESDE EL PUESTO 21"
                  filas={ranking.resto}
                  offset={20}
                  tiendaSeleccionada={tiendaId}
                  onSeleccionar={(id) => {
                    const t = ranking.resto.find((r) => r.tiendaId === id);
                    if (t) handleSeleccionarTienda(id, t.tiendaNombre);
                  }}
                  vacio="No hay más tiendas visitadas."
                />
                <CuadroRanking
                  titulo="🚫 SIN VISITAS"
                  filas={ranking.sinVisitas}
                  offset={0}
                  tiendaSeleccionada={tiendaId}
                  onSeleccionar={(id) => {
                    const t = ranking.sinVisitas.find((r) => r.tiendaId === id);
                    if (t) handleSeleccionarTienda(id, t.tiendaNombre);
                  }}
                  vacio="Todas las tiendas recibieron al menos una visita."
                />
              </div>
            </div>
          )}

          {tiendaId && (
            <div className="bg-[#0f111a] border-2 border-cyan-500/30 rounded-2xl p-4">
              <h4 className="text-xs font-black tracking-widest text-slate-300 mb-3">
                VISITAS A {tiendaNombreSel.toUpperCase()}
              </h4>
              {cargandoTienda ? (
                <p className="text-slate-500 text-sm animate-pulse">Cargando...</p>
              ) : !visitasTienda || visitasTienda.length === 0 ? (
                <p className="text-slate-500 text-sm italic">
                  Sin visitas registradas en este rango de fechas.
                </p>
              ) : (
                <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                  {visitasTienda.map((v, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between bg-[#0d1117] border border-slate-800 rounded-lg px-3 py-2"
                    >
                      <span className="text-white text-sm">
                        {v.usuarioNombre}
                        {!v.tieneObservacion && (
                          <span className="text-slate-500 text-[10px] font-normal ml-2">
                            (sin observación)
                          </span>
                        )}
                      </span>
                      <span className="text-slate-500 text-[11px] capitalize">
                        {formatearFechaLegible(v.fecha)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
