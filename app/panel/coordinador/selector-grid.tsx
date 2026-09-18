"use client";

import { AlertTriangle, Check, Ban } from "lucide-react";

export type OpcionGrid = {
  id: string;
  titulo: string;
  subtitulo?: string;
  destacado?: boolean;
  etiquetaDestacado?: string;
  // Distinto de "destacado" (verde, informativo): esto es una advertencia —
  // se pinta en ámbar y va antes que el verde para que no pase desapercibida
  // (ej. la persona tiene descanso fijo justo ese día).
  advertencia?: boolean;
  etiquetaAdvertencia?: string;
  // Más fuerte que "advertencia": la persona tiene vacaciones, permiso o
  // licencia vigente justo esa fecha — se pinta en fucsia y tiene prioridad
  // visual sobre todo lo demás, para que sea obvio que no se le debe asignar.
  noDisponible?: boolean;
  etiquetaNoDisponible?: string;
};

export default function SelectorGrid({
  opciones,
  seleccionadoId,
  onSeleccionar,
}: {
  opciones: OpcionGrid[];
  seleccionadoId: string | null;
  onSeleccionar: (id: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-72 overflow-y-auto pr-1">
      {opciones.map((o) => {
        const seleccionado = seleccionadoId === o.id;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onSeleccionar(o.id)}
            className={`text-left rounded-[3px] border-2 p-3 transition ${
              seleccionado
                ? "border-marca-rojo bg-marca-rojo/20 ring-2 ring-marca-rojo"
                : o.noDisponible
                  ? "border-fuchsia-500/70 bg-fuchsia-950/25 hover:brightness-125"
                  : o.advertencia
                    ? "border-amber-500/70 bg-amber-950/25 hover:brightness-125"
                    : o.destacado
                      ? "border-emerald-600/60 bg-emerald-950/20 hover:brightness-125"
                      : "border-marca-borde bg-marca-fondo hover:brightness-125"
            }`}
          >
            <p
              className={`font-bold text-sm truncate ${
                seleccionado
                  ? "text-marca-textofuerte"
                  : o.noDisponible
                    ? "text-fuchsia-300"
                    : o.advertencia
                      ? "text-amber-300"
                      : o.destacado
                        ? "text-emerald-300"
                        : "text-marca-texto"
              }`}
            >
              {o.titulo}
            </p>
            {o.subtitulo && (
              <p className="text-[10px] text-marca-tenue uppercase mt-0.5 truncate">{o.subtitulo}</p>
            )}
            {o.noDisponible && o.etiquetaNoDisponible && (
              <p className="flex items-center gap-1 text-[10px] text-fuchsia-400 font-bold mt-1">
                <Ban className="w-3 h-3" /> {o.etiquetaNoDisponible}
              </p>
            )}
            {!o.noDisponible && o.advertencia && o.etiquetaAdvertencia && (
              <p className="flex items-center gap-1 text-[10px] text-amber-400 font-bold mt-1">
                <AlertTriangle className="w-3 h-3" /> {o.etiquetaAdvertencia}
              </p>
            )}
            {!o.noDisponible && !o.advertencia && o.destacado && o.etiquetaDestacado && (
              <p className="flex items-center gap-1 text-[10px] text-emerald-400 font-bold mt-1">
                <Check className="w-3 h-3" /> {o.etiquetaDestacado}
              </p>
            )}
          </button>
        );
      })}
    </div>
  );
}
