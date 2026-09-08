"use client";

import { useEffect, useState } from "react";
import {
  obtenerAnunciosRecientes,
  obtenerProximosCumpleanos,
  type ComunicadoPublico,
  type ProximoCumpleanos,
} from "./anuncios-actions";
import { formatearFechaLegible } from "@/lib/fechas";

function textoDiasFaltantes(dias: number): string {
  if (dias === 0) return "¡Hoy!";
  if (dias === 1) return "Mañana";
  return `En ${dias} días`;
}

export default function AnunciosWidget() {
  const [anuncios, setAnuncios] = useState<ComunicadoPublico[]>([]);
  const [cumpleanos, setCumpleanos] = useState<ProximoCumpleanos[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([obtenerAnunciosRecientes(), obtenerProximosCumpleanos()])
      .then(([a, c]) => {
        setAnuncios(a);
        setCumpleanos(c);
      })
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

      {cumpleanos.length > 0 && (
        <div className="space-y-2">
          {cumpleanos.map((c, i) => (
            <div
              key={i}
              className="bg-pink-950/20 border border-pink-500/40 rounded-xl p-3 flex items-center justify-between"
            >
              <div>
                <p className="text-white font-bold text-sm">🎂 {c.usuarioNombre}</p>
                <p className="text-slate-500 text-[11px] uppercase">{c.rol}</p>
              </div>
              <p className="text-pink-300 text-xs font-black text-right">
                {textoDiasFaltantes(c.diasFaltantes)}
                <br />
                <span className="text-slate-500 font-normal capitalize">
                  {formatearFechaLegible(c.fecha)}
                </span>
              </p>
            </div>
          ))}
        </div>
      )}

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
              {c.fechaEvento && (
                <p className="text-cyan-400 text-[11px] font-bold mt-2">
                  📅 Evento: {formatearFechaLegible(c.fechaEvento)}
                </p>
              )}
              {c.ubicacion && (
                <a
                  href={`https://www.google.com/maps?q=${encodeURIComponent(c.ubicacion)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block text-cyan-400 hover:text-cyan-300 underline text-[11px] font-bold mt-1"
                >
                  📍 {c.ubicacion} — Ver en Maps
                </a>
              )}
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
