"use client";

import { useEffect, useMemo, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import {
  obtenerTiendasClasificadas,
  enviarReporte,
  type TiendaClasificada,
  type ResultadoReporte,
} from "./actions";
import { formatearFechaLegible } from "@/lib/fechas";

const ESTILOS_URGENCIA: Record
  TiendaClasificada["urgencia"],
  { emoji: string; borde: string; fondo: string; texto: string; etiqueta: string }
> = {
  HOY: {
    emoji: "🟢",
    borde: "border-green-500",
    fondo: "bg-green-950/30",
    texto: "text-green-400",
    etiqueta: "HOY",
  },
  MANANA: {
    emoji: "🟡",
    borde: "border-yellow-500/60",
    fondo: "bg-yellow-950/20",
    texto: "text-yellow-400",
    etiqueta: "MAÑANA",
  },
  AYER: {
    emoji: "⚠️",
    borde: "border-slate-500/60",
    fondo: "bg-slate-800/30",
    texto: "text-slate-300",
    etiqueta: "AYER",
  },
  ANTES_DE_AYER: {
    emoji: "🚨",
    borde: "border-red-500",
    fondo: "bg-red-950/30",
    texto: "text-red-400",
    etiqueta: "ANTES DE AYER",
  },
};

const estadoInicialReporte: ResultadoReporte = {};

function BotonEnviar() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white font-black py-3 rounded-xl text-xs tracking-widest uppercase transition"
    >
      {pending ? "Enviando..." : "Enviar Reporte"}
    </button>
  );
}

export default function SelectorTiendas() {
  const [tiendas, setTiendas] = useState<TiendaClasificada[] | null>(null);
  const [diaDescanso, setDiaDescanso] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [seleccionada, setSeleccionada] = useState<TiendaClasificada | null>(null);

  const [estadoReporte, formAction] = useFormState(enviarReporte, estadoInicialReporte);

  useEffect(() => {
    obtenerTiendasClasificadas()
      .then(({ tiendas, diaDescansoFijo }) => {
        setTiendas(tiendas);
        setDiaDescanso(diaDescansoFijo);
        const deHoy = tiendas.filter((t) => t.urgencia === "HOY" && !t.yaReportado);
        if (deHoy.length === 1) setSeleccionada(deHoy[0]);
      })
      .catch((e) => setError(e.message || "Error al cargar tiendas."))
      .finally(() => setCargando(false));
  }, []);

  useEffect(() => {
    if (estadoReporte.exito && seleccionada) {
      setTiendas((prev) =>
        (prev ?? []).filter((t) => t.rutaActivaId !== seleccionada.rutaActivaId)
      );
      setSeleccionada(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estadoReporte.exito]);

  const grupos = useMemo(() => {
    if (!tiendas) return [];
    const orden: TiendaClasificada["urgencia"][] = [
      "ANTES_DE_AYER",
      "AYER",
      "HOY",
      "MANANA",
    ];
    return orden
      .map((u) => ({ urgencia: u, items: tiendas.filter((t) => t.urgencia === u) }))
      .filter((g) => g.items.length > 0);
  }, [tiendas]);

  if (cargando) {
    return <p className="text-slate-500 text-sm animate-pulse">Cargando tus tiendas asignadas...</p>;
  }

  if (error) {
    return <p className="text-red-400 text-sm">{error}</p>;
  }

  if (!tiendas || tiendas.length === 0) {
    return (
      <p className="text-slate-500 text-sm italic">
        No tienes tiendas asignadas pendientes por reportar en este momento.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {diaDescanso && (
        <div className="bg-indigo-950/30 border border-indigo-700/40 rounded-xl px-4 py-2 text-indigo-300 text-xs font-bold">
          🛌 Tu día de descanso fijo: {diaDescanso}
        </div>
      )}

      {grupos.map((grupo) => {
        const estilo = ESTILOS_URGENCIA[grupo.urgencia];
        return (
          <div key={grupo.urgencia}>
            <h3 className={`text-xs font-black tracking-widest mb-2 ${estilo.texto}`}>
              {estilo.emoji} {estilo.etiqueta}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {grupo.items.map((tienda) => {
                const estaSeleccionada = seleccionada?.rutaActivaId === tienda.rutaActivaId;
                return (
                  <button
                    key={tienda.rutaActivaId}
                    onClick={() => setSeleccionada(tienda)}
                    disabled={tienda.yaReportado}
                    className={`text-left rounded-xl border-2 p-4 transition ${estilo.borde} ${estilo.fondo} ${
                      estaSeleccionada ? "ring-2 ring-white" : ""
                    } ${tienda.yaReportado ? "opacity-40 cursor-not-allowed" : "hover:brightness-125"}`}
                  >
                    <p className="font-black text-white">{tienda.tiendaNombre}</p>
                    <p className="text-[11px] text-slate-400 capitalize mt-1">
                      {formatearFechaLegible(tienda.fechaPlanificada)}
                    </p>
                    {tienda.area && (
                      <p className="text-[11px] text-slate-500 mt-1">
                        {tienda.area}
                        {tienda.enfoque ? ` · ${tienda.enfoque}` : ""}
                      </p>
                    )}
                    {tienda.yaReportado && (
                      <p className="text-[11px] text-green-500 font-bold mt-2">
                        ✅ Ya reportado
                      </p>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      {seleccionada && (
        <form
          action={formAction}
          className="bg-[#0f111a] border-2 border-cyan-500/40 rounded-2xl p-5 space-y-4"
        >
          <input type="hidden" name="rutaActivaId" value={seleccionada.rutaActivaId} />
          <input type="hidden" name="tiendaId" value={seleccionada.tiendaId} />

          <p className="text-xs text-slate-400">
            Reportando: <span className="text-white font-bold">{seleccionada.tiendaNombre}</span>
          </p>

          <div>
            <label className="block text-slate-400 text-[10px] uppercase font-bold mb-1">
              Observación
            </label>
            <textarea
              name="observacion"
              required
              rows={3}
              className="w-full p-3 bg-[#0d1117] border border-slate-800 rounded-xl text-white text-sm outline-none focus:border-cyan-500"
              placeholder="¿Qué encontraste en la visita?"
            />
          </div>

          <div>
            <label className="block text-slate-400 text-[10px] uppercase font-bold mb-1">
              Actividad realizada (opcional)
            </label>
            <input
              name="actividad"
              className="w-full p-3 bg-[#0d1117] border border-slate-800 rounded-xl text-white text-sm outline-none focus:border-cyan-500"
              placeholder="Ej: capacitación de caja, revisión de inventario..."
            />
          </div>

          <BotonEnviar />

          {estadoReporte.mensaje && !estadoReporte.exito && (
            <p className="text-yellow-400 text-xs font-bold text-center">
              {estadoReporte.mensaje}
            </p>
          )}
        </form>
      )}
    </div>
  );
}