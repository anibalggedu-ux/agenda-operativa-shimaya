"use client";

import { useEffect, useState } from "react";
import { obtenerEstadoPersonalHoy, type EstadoPersonalHoy } from "./actions";
import { formatearFechaLegible, hoyPeru } from "@/lib/fechas";

const ESTILOS: Record<
  NonNullable<EstadoPersonalHoy["estado"]>,
  { emoji: string; borde: string; fondo: string; texto: string; etiqueta: string }
> = {
  DESCANSO_SEMANAL: {
    emoji: "🟢",
    borde: "border-green-600/50",
    fondo: "bg-green-950/20",
    texto: "text-green-300",
    etiqueta: "Descansa hoy",
  },
  VACACIONES: {
    emoji: "🔵",
    borde: "border-cyan-600/50",
    fondo: "bg-cyan-950/20",
    texto: "text-cyan-300",
    etiqueta: "Vacaciones",
  },
  PERMISO: {
    emoji: "🟡",
    borde: "border-yellow-600/50",
    fondo: "bg-yellow-950/20",
    texto: "text-yellow-300",
    etiqueta: "Permiso",
  },
  DESCANSO_MEDICO: {
    emoji: "🔴",
    borde: "border-red-600/50",
    fondo: "bg-red-950/20",
    texto: "text-red-300",
    etiqueta: "Descanso médico",
  },
  MISION_ESPECIAL: {
    emoji: "🟣",
    borde: "border-purple-600/50",
    fondo: "bg-purple-950/20",
    texto: "text-purple-300",
    etiqueta: "Misión especial",
  },
};

export default function EstadoPersonalHoy() {
  const [filas, setFilas] = useState<EstadoPersonalHoy[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    obtenerEstadoPersonalHoy()
      .then(setFilas)
      .catch((e) => setError(e.message || "Error al cargar el estado del personal."))
      .finally(() => setCargando(false));
  }, []);

  if (cargando) {
    return <p className="text-slate-500 text-sm animate-pulse">Cargando estado del personal...</p>;
  }
  if (error) return <p className="text-red-400 text-sm">{error}</p>;

  const conNovedad = filas.filter((f) => f.estado);
  const disponibles = filas.filter((f) => !f.estado);

  return (
    <div>
      <h3 className="text-xs font-black tracking-widest text-slate-300 mb-1">
        ESTADO DEL PERSONAL HOY
      </h3>
      <p className="text-slate-500 text-[11px] capitalize mb-3">{formatearFechaLegible(hoyPeru())}</p>

      {conNovedad.length === 0 ? (
        <p className="text-slate-500 text-sm italic mb-3">
          Todo el personal está disponible hoy — sin descansos ni asignaciones especiales.
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
          {conNovedad.map((f) => {
            const estilo = ESTILOS[f.estado!];
            return (
              <div
                key={f.usuarioId}
                className={`flex items-center justify-between border rounded-xl p-3 ${estilo.borde} ${estilo.fondo}`}
              >
                <div className="min-w-0">
                  <p className="text-white font-bold text-sm truncate">{f.usuarioNombre}</p>
                  <p className="text-slate-500 text-[10px] uppercase">{f.rol}</p>
                </div>
                <span className={`text-[11px] font-black shrink-0 ml-2 ${estilo.texto}`}>
                  {estilo.emoji} {estilo.etiqueta}
                </span>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-slate-600 text-[11px]">
        {disponibles.length} de {filas.length} disponibles hoy sin novedad.
      </p>
    </div>
  );
}
