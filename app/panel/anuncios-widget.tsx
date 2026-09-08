"use client";

import { useEffect, useState } from "react";
import { obtenerAnunciosRecientes, type ComunicadoPublico } from "./anuncios-actions";
import { formatearFechaLegible } from "@/lib/fechas";

export default function AnunciosWidget() {
  const [anuncios, setAnuncios] = useState<ComunicadoPublico[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    obtenerAnunciosRecientes()
      .then(setAnuncios)
      .catch((e) => setError(e.message || "Error al cargar anuncios."))
      .finally(() => setCargando(false));
  }, []);

  if (cargando) {
    return <p className="text-slate-500 text-sm animate-pulse">Cargando anuncios...</p>;
  }

  if (error) {
    return <p className="text-red-400 text-sm">{error}</p>;
  }

  return (
    <div className="bg-[#0f111a] border-2 border-slate-700/60 rounded-2xl p-5 space-y-3">
      <h3 className="text-xs font-black tracking-widest text-slate-300">📢 ANUNCIOS</h3>

      {anuncios.length === 0 ? (
        <p className="text-slate-500 text-sm italic">No hay anuncios publicados todavía.</p>
      ) : (
        <div className="space-y-2">
          {anuncios.map((c) => (
            <div key={c.id} className="bg-[#0d1117] border border-slate-800 rounded-xl p-4">
              <p className="text-red-400 text-[10px] font-black uppercase tracking-widest">
                {c.tipo}
              </p>
              <p className="text-white text-sm mt-1">{c.mensaje}</p>
              <p className="text-slate-500 text-[11px] capitalize mt-2">
                {formatearFechaLegible(c.fecha)}
                {c.autor ? " · " + c.autor : ""}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
