"use client";

import { useEffect, useState } from "react";
import { obtenerMisMarcaciones, type MiMarcacion } from "./actions";
import { formatearFechaLegible, formatearHora, hoyPeru, sumarDias } from "@/lib/fechas";

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

export default function MisMarcaciones() {
  const [desde, setDesde] = useState(sumarDias(hoyPeru(), -30));
  const [hasta, setHasta] = useState(hoyPeru());
  const [marcaciones, setMarcaciones] = useState<MiMarcacion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setCargando(true);
    setError(null);
    obtenerMisMarcaciones(desde, hasta)
      .then(setMarcaciones)
      .catch((e) => setError(e.message || "Error al cargar tus marcaciones."))
      .finally(() => setCargando(false));
  }, [desde, hasta]);

  return (
    <div className="bg-[#0f111a] border-2 border-slate-700/60 rounded-2xl p-5 space-y-4">
      <h3 className="text-xs font-black tracking-widest text-slate-300">
        📍 MIS MARCACIONES GPS
      </h3>
      <p className="text-slate-500 text-[11px]">
        Toca una hora para verificar la ubicación exacta en Google Maps.
      </p>

      <div className="flex flex-col sm:flex-row gap-3">
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
      {cargando ? (
        <p className="text-slate-500 text-sm animate-pulse">Cargando marcaciones...</p>
      ) : marcaciones.length === 0 ? (
        <p className="text-slate-500 text-sm italic">Sin marcaciones en este rango de fechas.</p>
      ) : (
        <div className="space-y-1.5 max-h-96 overflow-y-auto pr-1">
          {marcaciones.map((m, i) => (
            <div
              key={i}
              className="flex items-center justify-between bg-[#0d1117] border border-slate-800 rounded-xl p-3"
            >
              <p className="text-slate-400 text-[11px] capitalize">
                {formatearFechaLegible(m.fecha)}
              </p>
              <p className="text-xs font-bold text-slate-200">
                Ingreso: <Marcacion hora={m.horaIngreso} ubicacion={m.ubicacionIngreso} /> · Salida:{" "}
                <Marcacion hora={m.horaSalida} ubicacion={m.ubicacionSalida} />
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
