"use client";

import { useEffect, useMemo, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import {
  obtenerTiendasClasificadas,
  enviarReporte,
  editarReporte,
  obtenerTodasLasTiendas,
  autoasignarTienda,
  type TiendaClasificada,
  type ResultadoReporte,
  type TiendaBasicaBitacora,
} from "./actions";
import { formatearFechaLegible } from "@/lib/fechas";

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

function BotonEnviar({ esEdicion }: { esEdicion: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full bg-marca-rojo hover:bg-marca-rojoclaro disabled:opacity-50 text-marca-textofuerte font-black py-3 rounded-[3px] text-xs tracking-widest uppercase transition"
    >
      {pending ? "Guardando..." : esEdicion ? "Guardar cambios" : "Enviar Reporte"}
    </button>
  );
}

function AsignarmeTienda({ onAsignado }: { onAsignado: () => void }) {
  const [abierto, setAbierto] = useState(false);
  const [tiendas, setTiendas] = useState<TiendaBasicaBitacora[]>([]);
  const [tiendaId, setTiendaId] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [mensaje, setMensaje] = useState<{ texto: string; exito: boolean } | null>(null);

  useEffect(() => {
    if (abierto && tiendas.length === 0) {
      obtenerTodasLasTiendas()
        .then(setTiendas)
        .catch(() => {});
    }
  }, [abierto, tiendas.length]);

  async function handleAsignar() {
    if (!tiendaId) {
      setMensaje({ texto: "Selecciona una tienda.", exito: false });
      return;
    }
    setEnviando(true);
    setMensaje(null);
    const resultado = await autoasignarTienda(tiendaId);
    setEnviando(false);
    setMensaje({ texto: resultado.mensaje ?? "", exito: resultado.exito });
    if (resultado.exito) {
      setTiendaId("");
      onAsignado();
    }
  }

  if (!abierto) {
    return (
      <button
        onClick={() => setAbierto(true)}
        className="text-marca-rojoclaro text-[11px] font-black uppercase tracking-widest hover:text-marca-rojo transition"
      >
        ⚡ ¿Te cambiaron la ruta de último momento? Asígnate una tienda
      </button>
    );
  }

  return (
    <div className="bg-marca-superficie border border-marca-rojo/30 rounded-[3px] p-4 space-y-3">
      <p className="text-marca-tenue text-[11px]">
        Úsalo cuando el coordinador te cambió la ruta a último momento y aún no lo actualizó en el
        sistema. Se asigna para hoy y le llega un aviso automático — no necesitas esperar
        aprobación para reportar.
      </p>
      <div className="flex flex-wrap gap-2">
        <select
          value={tiendaId}
          onChange={(e) => setTiendaId(e.target.value)}
          className="flex-1 min-w-[180px] p-2.5 bg-marca-fondo border border-marca-borde rounded-[3px] text-marca-texto text-sm outline-none focus:border-marca-rojoclaro"
        >
          <option value="">Selecciona una tienda...</option>
          {tiendas.map((t) => (
            <option key={t.id} value={t.id}>
              {t.nombre}
            </option>
          ))}
        </select>
        <button
          onClick={handleAsignar}
          disabled={enviando}
          className="bg-marca-rojo hover:bg-marca-rojoclaro disabled:opacity-50 text-marca-textofuerte font-black py-2 px-4 rounded-[3px] text-[11px] tracking-widest uppercase transition"
        >
          {enviando ? "Asignando..." : "Asignarme"}
        </button>
        <button
          onClick={() => {
            setAbierto(false);
            setMensaje(null);
          }}
          className="text-marca-tenue text-[11px] font-bold uppercase"
        >
          Cancelar
        </button>
      </div>
      {mensaje && (
        <p className={`text-xs font-bold ${mensaje.exito ? "text-emerald-400" : "text-marca-rojoclaro"}`}>
          {mensaje.texto}
        </p>
      )}
    </div>
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

  const [estadoNuevo, formActionNuevo] = useFormState(enviarReporte, estadoInicialReporte);
  const [estadoEditar, formActionEditar] = useFormState(editarReporte, estadoInicialReporte);

  const esEdicion = !!seleccionada?.reporteId;
  const estadoActivo = esEdicion ? estadoEditar : estadoNuevo;

  function cargar() {
    setCargando(true);
    obtenerTiendasClasificadas()
      .then(({ tiendas, diaDescansoFijo }) => {
        setTiendas(tiendas);
        setDiaDescanso(diaDescansoFijo);
      })
      .catch((e) => setError(e.message || "Error al cargar tiendas."))
      .finally(() => setCargando(false));
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (estadoNuevo.exito || estadoEditar.exito) {
      setSeleccionada(null);
      setObservacion("");
      setActividad("");
      cargar();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estadoNuevo.exito, estadoEditar.exito]);

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
      <div className="space-y-4">
        <p className="text-marca-tenue text-sm italic">
          No tienes tiendas asignadas ni reportes editables en este momento.
        </p>
        <AsignarmeTienda onAsignado={cargar} />
      </div>
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

      <AsignarmeTienda onAsignado={cargar} />

      {grupos.map((grupo) => {
        const estilo = ESTILOS_URGENCIA[grupo.urgencia];
        return (
          <div key={grupo.urgencia}>
            <h3 className={`text-xs font-black tracking-widest mb-2 ${estilo.texto}`}>
              {estilo.emoji} {estilo.etiqueta}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {grupo.items.map((tienda) => {
                const estaSeleccionada = seleccionada?.id === tienda.id;
                return (
                  <button
                    key={tienda.id}
                    onClick={() => {
                      setSeleccionada(tienda);
                      setObservacion(tienda.observacionActual);
                      setActividad(tienda.actividadActual);
                    }}
                    className={`text-left rounded-[3px] border-2 p-4 transition hover:brightness-125 ${estilo.borde} ${estilo.fondo} ${
                      estaSeleccionada ? "ring-2 ring-marca-rojo" : ""
                    }`}
                  >
                    <p className="font-black text-marca-textofuerte">{tienda.tiendaNombre}</p>
                    <p className="text-[11px] text-marca-tenue capitalize mt-1">
                      {formatearFechaLegible(tienda.fechaPlanificada)}
                    </p>
                    {tienda.autoasignada && (
                      <p className="text-[10.5px] text-marca-rojoclaro font-bold mt-1">⚡ Auto-asignada</p>
                    )}
                    {tienda.area && (
                      <p className="text-[11px] text-marca-tenue mt-1">
                        {tienda.area}
                        {tienda.enfoque ? ` · ${tienda.enfoque}` : ""}
                      </p>
                    )}
                    {tienda.clima && (
                      <div
                        className={`flex items-center gap-2 mt-2 rounded-[3px] px-2.5 py-1.5 border ${
                          tienda.clima.riesgo
                            ? "bg-amber-950/25 border-amber-500/40"
                            : "bg-marca-fondo/60 border-marca-borde"
                        }`}
                      >
                        <span className="text-base leading-none">{tienda.clima.icono}</span>
                        <div className="min-w-0">
                          <p
                            className={`text-[10.5px] font-bold truncate ${
                              tienda.clima.riesgo ? "text-amber-400" : "text-marca-texto"
                            }`}
                          >
                            {tienda.clima.descripcion} · {tienda.clima.tempMax}°/{tienda.clima.tempMin}°
                          </p>
                          {tienda.clima.avisoTexto && (
                            <p className="text-[10px] text-amber-400/90">{tienda.clima.avisoTexto}</p>
                          )}
                        </div>
                      </div>
                    )}
                    {tienda.reporteId && (
                      <p className="text-[11px] text-emerald-400 font-bold mt-2">
                        ✅ Reportado — toca para editar
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
          action={esEdicion ? formActionEditar : formActionNuevo}
          className="bg-marca-superficie border border-marca-rojo/40 rounded-[3px] p-5 space-y-4"
        >
          {esEdicion ? (
            <input type="hidden" name="reporteId" value={seleccionada.reporteId ?? ""} />
          ) : (
            <>
              <input type="hidden" name="rutaActivaId" value={seleccionada.rutaActivaId ?? ""} />
              <input type="hidden" name="tiendaId" value={seleccionada.tiendaId} />
            </>
          )}

          <p className="text-xs text-marca-tenue">
            {esEdicion ? "Editando reporte de" : "Reportando"}:{" "}
            <span className="text-marca-textofuerte font-bold">{seleccionada.tiendaNombre}</span>
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

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setSeleccionada(null)}
              className="flex-1 bg-marca-superficie2 border border-marca-borde text-marca-tenue py-3 rounded-[3px] text-xs font-bold uppercase hover:text-marca-texto transition"
            >
              Cancelar
            </button>
            <div className="flex-1">
              <BotonEnviar esEdicion={esEdicion} />
            </div>
          </div>

          {estadoActivo.mensaje && !estadoActivo.exito && (
            <p className="text-marca-rojoclaro text-xs font-bold text-center">
              {estadoActivo.mensaje}
            </p>
          )}
        </form>
      )}
    </div>
  );
}
