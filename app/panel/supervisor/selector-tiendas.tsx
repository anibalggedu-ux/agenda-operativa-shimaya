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
import { generarPdfReporteIndividual } from "@/lib/generar-pdf";

const ESTILOS_URGENCIA: Record<
  TiendaClasificada["urgencia"],
  { emoji: string; borde: string; fondo: string; texto: string; etiqueta: string }
> = {
  HOY: {
    emoji: "🟢",
    borde: "border-emerald-500",
    fondo: "bg-emerald-950/30",
    texto: "text-emerald-400",
    etiqueta: "HOY",
  },
  MANANA: {
    emoji: "🟡",
    borde: "border-amber-500/60",
    fondo: "bg-amber-950/20",
    texto: "text-amber-400",
    etiqueta: "MAÑANA",
  },
  AYER: {
    emoji: "⚠️",
    borde: "border-marca-borde",
    fondo: "bg-marca-superficie2",
    texto: "text-marca-tenue",
    etiqueta: "AYER",
  },
  ANTES_DE_AYER: {
    emoji: "🚨",
    borde: "border-marca-rojo",
    fondo: "bg-marca-rojo/15",
    texto: "text-marca-rojoclaro",
    etiqueta: "ANTES DE AYER",
  },
};
const estadoInicialReporte: ResultadoReporte = { exito: false };
function BotonEnviar() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full bg-marca-rojo hover:bg-marca-rojoclaro disabled:opacity-50 text-marca-textofuerte font-black py-3 rounded-[3px] text-xs tracking-widest uppercase transition"
    >
      {pending ? "Enviando..." : "Enviar Reporte"}
    </button>
  );
}

export default function SelectorTiendas({
  supervisorNombre,
  mostrarDescansoFijo = true,
}: {
  supervisorNombre: string;
  // El banner de descanso fijo se oculta cuando el panel ya lo muestra en
  // otro lugar más visible (p. ej. el banner de perfil del Supervisor y del
  // Coordinador), para no repetir la misma información dos veces.
  mostrarDescansoFijo?: boolean;
}) {
  const [tiendas, setTiendas] = useState<TiendaClasificada[] | null>(null);
  const [diaDescanso, setDiaDescanso] = useState<string[] | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [seleccionada, setSeleccionada] = useState<TiendaClasificada | null>(null);
  const [observacion, setObservacion] = useState("");
  const [actividad, setActividad] = useState("");

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
      generarPdfReporteIndividual({
        supervisorNombre,
        tiendaNombre: seleccionada.tiendaNombre,
        fecha: seleccionada.fechaPlanificada,
        area: seleccionada.area,
        enfoque: seleccionada.enfoque,
        observacion,
        actividad,
      });
      setTiendas((prev) =>
        (prev ?? []).filter((t) => t.rutaActivaId !== seleccionada.rutaActivaId)
      );
      setSeleccionada(null);
      setObservacion("");
      setActividad("");
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
    return <p className="text-marca-tenue text-sm animate-pulse">Cargando tus tiendas asignadas...</p>;
  }

  if (error) {
    return <p className="text-marca-rojoclaro text-sm">{error}</p>;
  }

  if (!tiendas || tiendas.length === 0) {
    return (
      <p className="text-marca-tenue text-sm italic">
        No tienes tiendas asignadas pendientes por reportar en este momento.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {mostrarDescansoFijo && diaDescanso && diaDescanso.length > 0 && (
        <div className="bg-marca-rojo/10 border border-marca-rojo/30 rounded-[3px] px-4 py-2 text-marca-rojoclaro text-xs font-bold">
          🛌 Tu{diaDescanso.length > 1 ? "s días de descanso fijos" : " día de descanso fijo"}:{" "}
          {diaDescanso.join(" y ")}
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
                    onClick={() => {
                      setSeleccionada(tienda);
                      setObservacion("");
                      setActividad("");
                    }}
                    disabled={tienda.yaReportado}
                    className={`text-left rounded-[3px] border-2 p-4 transition ${estilo.borde} ${estilo.fondo} ${
                      estaSeleccionada ? "ring-2 ring-marca-rojo" : ""
                    } ${tienda.yaReportado ? "opacity-40 cursor-not-allowed" : "hover:brightness-125"}`}
                  >
                    <p className="font-black text-marca-textofuerte">{tienda.tiendaNombre}</p>
                    <p className="text-[11px] text-marca-tenue capitalize mt-1">
                      {formatearFechaLegible(tienda.fechaPlanificada)}
                    </p>
                    {tienda.area && (
                      <p className="text-[11px] text-marca-tenue mt-1">
                        {tienda.area}
                        {tienda.enfoque ? ` · ${tienda.enfoque}` : ""}
                      </p>
                    )}
                    {tienda.yaReportado && (
                      <p className="text-[11px] text-emerald-400 font-bold mt-2">
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
          className="bg-marca-superficie border border-marca-rojo/40 rounded-[3px] p-5 space-y-4"
        >
          <input type="hidden" name="rutaActivaId" value={seleccionada.rutaActivaId} />
          <input type="hidden" name="tiendaId" value={seleccionada.tiendaId} />

          <p className="text-xs text-marca-tenue">
            Reportando: <span className="text-marca-textofuerte font-bold">{seleccionada.tiendaNombre}</span>
          </p>

          <div>
            <label className="block text-marca-tenue text-[10px] uppercase font-bold mb-1">
              Observación
            </label>
            <textarea
              name="observacion"
              required
              rows={3}
              value={observacion}
              onChange={(e) => setObservacion(e.target.value)}
              className="w-full p-3 bg-marca-fondo border border-marca-borde rounded-[3px] text-marca-texto text-sm outline-none focus:border-marca-rojoclaro"
              placeholder="¿Qué encontraste en la visita?"
            />
          </div>

          <div>
            <label className="block text-marca-tenue text-[10px] uppercase font-bold mb-1">
              Actividad realizada (opcional)
            </label>
            <input
              name="actividad"
              value={actividad}
              onChange={(e) => setActividad(e.target.value)}
              className="w-full p-3 bg-marca-fondo border border-marca-borde rounded-[3px] text-marca-texto text-sm outline-none focus:border-marca-rojoclaro"
              placeholder="Ej: capacitación de caja, revisión de inventario..."
            />
          </div>

          <BotonEnviar />

          {estadoReporte.mensaje && !estadoReporte.exito && (
            <p className="text-marca-rojoclaro text-xs font-bold text-center">
              {estadoReporte.mensaje}
            </p>
          )}
        </form>
      )}
    </div>
  );
}
