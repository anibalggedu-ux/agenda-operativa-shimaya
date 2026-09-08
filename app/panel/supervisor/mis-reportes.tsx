"use client";

import { useEffect, useState } from "react";
import { obtenerMisReportesRecientes, type MiReporte } from "./actions";
import { formatearFechaLegible } from "@/lib/fechas";

export default function MisReportes() {
  const [reportes, setReportes] = useState<MiReporte[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    obtenerMisReportesRecientes()
      .then(setReportes)
      .catch((e) => setError(e.message || "Error al cargar tus reportes."))
      .finally(() => setCargando(false));
  }, []);

  if (cargando) {
    return <p className="text-slate-500 text-sm animate-pulse">Cargando tus reportes...</p>;
  }

  if (error) {
    return <p className="text-red-400 text-sm">{error}</p>;
  }

  return (
    <div className="bg-[#0f111a] border-2 border-slate-700/60 rounded-2xl p-5 space-y-3">
      <h3 className="text-xs font-black tracking-widest text-slate-300">
        🗂️ MIS REPORTES RECIENTES
      </h3>

      {reportes.length === 0 ? (
        <p className="text-slate-500 text-sm italic">Todavía no has enviado ningún reporte.</p>
      ) : (
        <div className="space-y-2">
          {reportes.map((r) => (
            <div key={r.id} className="bg-[#0d1117] border border-slate-800 rounded-xl p-4">
              <p className="text-white font-bold text-sm">{r.tiendaNombre}</p>
              <p className="text-slate-500 text-[11px] capitalize mt-1">
                {formatearFechaLegible(r.fecha)}
              </p>
              <p className="text-slate-300 text-sm mt-2">{r.observacion}</p>

              {r.respuesta && (
                <div className="mt-3 bg-cyan-950/20 border border-cyan-700/40 rounded-lg p-3">
                  <p className="text-cyan-400 text-[10px] font-black uppercase tracking-widest">
                    💬 Respuesta{r.respuestaPor ? " de " + r.respuestaPor : ""}
                  </p>
                  <p className="text-white text-sm mt-1">{r.respuesta}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
