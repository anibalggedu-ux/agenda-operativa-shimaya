"use client";

import { useEffect, useState } from "react";
import {
  obtenerTiendasBasicas,
  obtenerHistorialTiendaAnalitica,
  type TiendaBasicaAnalitica,
  type HistorialTiendaAnalitica,
} from "./actions";
import { formatearFechaLegible, hoyPeru, sumarDias } from "@/lib/fechas";
import { generarPdfHistorialTienda } from "@/lib/generar-pdf";

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
          className="w-full p-2.5 bg-[#0d1117] border border-slate-800 rounded-xl text-white text-sm outline-none focus:border-purple-500"
        />
      </div>
      <div className="flex-1">
        <label className="block text-slate-400 text-[10px] uppercase font-bold mb-1">Hasta</label>
        <input
          type="date"
          value={hasta}
          min={desde}
          onChange={(e) => onHasta(e.target.value)}
          className="w-full p-2.5 bg-[#0d1117] border border-slate-800 rounded-xl text-white text-sm outline-none focus:border-purple-500"
        />
      </div>
    </div>
  );
}

export default function ReporteTienda() {
  const [tiendas, setTiendas] = useState<TiendaBasicaAnalitica[]>([]);
  const [tiendaId, setTiendaId] = useState("");
  const [desde, setDesde] = useState(sumarDias(hoyPeru(), -30));
  const [hasta, setHasta] = useState(hoyPeru());
  const [historial, setHistorial] = useState<HistorialTiendaAnalitica | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    obtenerTiendasBasicas().then(setTiendas);
  }, []);

  useEffect(() => {
    if (!tiendaId) {
      setHistorial(null);
      return;
    }
    setCargando(true);
    setError(null);
    obtenerHistorialTiendaAnalitica(tiendaId, desde, hasta)
      .then(setHistorial)
      .catch((e) => setError(e.message || "Error al cargar el historial."))
      .finally(() => setCargando(false));
  }, [tiendaId, desde, hasta]);

  return (
    <div className="space-y-6">
      <div className="bg-[#0d1117] border border-slate-800 rounded-xl p-4 space-y-3">
        <div>
          <label className="block text-slate-400 text-[10px] uppercase font-bold mb-1">
            Tienda
          </label>
          <select
            value={tiendaId}
            onChange={(e) => setTiendaId(e.target.value)}
            className="w-full p-2.5 bg-[#07080c] border border-slate-800 rounded-xl text-white text-sm outline-none focus:border-purple-500"
          >
            <option value="">Selecciona una tienda...</option>
            {tiendas.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nombre}
              </option>
            ))}
          </select>
        </div>
        <SelectorFechas desde={desde} hasta={hasta} onDesde={setDesde} onHasta={setHasta} />
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}
      {cargando && <p className="text-slate-500 text-sm animate-pulse">Cargando historial...</p>}

      {!cargando && !tiendaId && (
        <p className="text-slate-500 text-sm italic">Selecciona una tienda para ver su historial.</p>
      )}

      {!cargando && historial && (
        <div className="space-y-5">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <p className="text-white font-black text-lg">{historial.tiendaNombre}</p>
              <p className="text-slate-500 text-xs">
                {historial.totalVisitas} visita(s) en el rango seleccionado
              </p>
            </div>
            <button
              onClick={() => generarPdfHistorialTienda({ ...historial, desde, hasta })}
              className="bg-yellow-600 hover:bg-yellow-500 text-white font-black py-2 px-4 rounded-lg text-[11px] tracking-widest uppercase transition"
            >
              📄 Descargar PDF
            </button>
          </div>

          <div>
            <h4 className="text-xs font-black tracking-widest text-slate-300 mb-2">
              COLABORADORES QUE VISITARON
            </h4>
            {historial.visitantes.length === 0 ? (
              <p className="text-slate-500 text-sm italic">Sin visitas registradas.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {historial.visitantes.map((v) => (
                  <span
                    key={v.usuarioNombre}
                    className="bg-[#07080c] border border-slate-800 rounded-full px-3 py-1.5 text-xs"
                  >
                    <span className="text-white font-bold">{v.usuarioNombre}</span>{" "}
                    <span className="text-slate-500">({v.rol})</span>{" "}
                    <span className="text-yellow-400 font-black">×{v.visitas}</span>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div>
            <h4 className="text-xs font-black tracking-widest text-slate-300 mb-2">
              OBSERVACIONES
            </h4>
            {historial.observaciones.length === 0 ? (
              <p className="text-slate-500 text-sm italic">Sin observaciones en este rango.</p>
            ) : (
              <div className="space-y-2">
                {historial.observaciones.map((o, i) => (
                  <div key={i} className="bg-[#0d1117] border border-slate-800 rounded-xl p-4">
                    <p className="text-white font-bold text-sm">
                      {o.usuarioNombre} <span className="text-slate-500 font-normal">({o.rol})</span>
                    </p>
                    <p className="text-slate-500 text-[11px] capitalize mt-1">
                      {formatearFechaLegible(o.fecha)}
                    </p>
                    <p className="text-slate-300 text-sm mt-2">{o.observacion}</p>
                    {o.actividad && (
                      <p className="text-slate-500 text-[12px] italic mt-1">
                        Actividad: {o.actividad}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
