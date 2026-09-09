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
    return <p className="text-marca-tenue text-sm animate-pulse">Cargando anuncios...</p>;
  }

  if (error) {
    return <p className="text-marca-rojoclaro text-sm">{error}</p>;
  }

  return (
    <div className="bg-marca-superficie border border-marca-rojo/25 rounded-[3px] p-5 space-y-3">
      <h3 className="text-xs font-black tracking-widest text-marca-tenue">ANUNCIOS</h3>

      {cumpleanos.length > 0 && (
        <div className="space-y-2">
          {cumpleanos.map((c, i) => (
            <div
              key={i}
              className="bg-marca-rojo/10 border border-marca-rojo/35 rounded-[3px] p-3 flex items-center justify-between"
            >
              <div>
                <p className="text-marca-textofuerte font-semibold text-sm">🎂 {c.usuarioNombre}</p>
                <p className="text-marca-tenue text-[11px] uppercase">{c.rol}</p>
              </div>
              <p className="text-marca-rojoclaro text-xs font-black text-right">
                {textoDiasFaltantes(c.diasFaltantes)}
                <br />
                <span className="text-marca-tenue font-normal capitalize">
                  {formatearFechaLegible(c.fecha)}
                </span>
              </p>
            </div>
          ))}
        </div>
      )}

      {anuncios.length === 0 ? (
        <p className="text-marca-tenue text-sm italic">No hay anuncios publicados todavía.</p>
      ) : (
        <div className="space-y-2">
          {anuncios.map((c) => (
            <div key={c.id} className="bg-marca-fondo border border-marca-borde rounded-[3px] p-4">
              <p className="text-marca-rojoclaro text-[10px] font-black uppercase tracking-widest">
                {c.tipo}
              </p>
              <p className="text-marca-texto text-sm mt-1">{c.mensaje}</p>
              {c.fechaEvento && (
                <p className="text-marca-textofuerte text-[11px] font-bold mt-2">
                  📅 Evento: {formatearFechaLegible(c.fechaEvento)}
                </p>
              )}
              {c.ubicacion && (
                <a
                  href={`https://www.google.com/maps?q=${encodeURIComponent(c.ubicacion)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block text-marca-tenue hover:text-marca-textofuerte underline text-[11px] font-bold mt-1"
                >
                  📍 {c.ubicacion} — Ver en Maps
                </a>
              )}
              <p className="text-marca-tenue text-[11px] capitalize mt-2">
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
