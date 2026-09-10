"use client";

import { useEffect, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { obtenerMisReportesRecientes, editarReporte, type MiReporte, type ResultadoReporte } from "./actions";
import { formatearFechaLegible, hoyPeru, sumarDias } from "@/lib/fechas";

function SelectorFechas({
  desde,
  hasta,
  onDesde,
  onHasta,
}: {
  desde: string;
  hasta: string;
  onDesde: (v: string) => void;
  onHasta: (v: string) => void;
}) {
  return (
    <div className="flex flex-col sm:flex-row gap-3">
      <div className="flex-1">
        <label className="block text-marca-tenue text-[10px] uppercase font-bold mb-1">Desde</label>
        <input
          type="date"
          value={desde}
          max={hasta}
          onChange={(e) => onDesde(e.target.value)}
          className="w-full p-2.5 bg-marca-fondo border border-marca-borde rounded-[3px] text-marca-texto text-sm outline-none focus:border-marca-rojoclaro"
        />
      </div>
      <div className="flex-1">
        <label className="block text-marca-tenue text-[10px] uppercase font-bold mb-1">Hasta</label>
        <input
          type="date"
          value={hasta}
          min={desde}
          max={hoyPeru()}
          onChange={(e) => onHasta(e.target.value)}
          className="w-full p-2.5 bg-marca-fondo border border-marca-borde rounded-[3px] text-marca-texto text-sm outline-none focus:border-marca-rojoclaro"
        />
      </div>
    </div>
  );
}

const estadoInicial: ResultadoReporte = { exito: false };

function BotonGuardar() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="bg-marca-rojo hover:bg-marca-rojoclaro disabled:opacity-50 text-marca-textofuerte font-black py-2 px-4 rounded-[3px] text-[11px] tracking-widest uppercase transition"
    >
      {pending ? "Guardando..." : "Guardar cambios"}
    </button>
  );
}

function FormularioEdicion({
  reporte,
  onGuardado,
  onCancelar,
}: {
  reporte: MiReporte;
  onGuardado: () => void;
  onCancelar: () => void;
}) {
  const [estado, formAction] = useFormState(editarReporte, estadoInicial);

  useEffect(() => {
    if (estado.exito) onGuardado();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado]);

  return (
    <form action={formAction} className="mt-3 space-y-2">
      <input type="hidden" name="reporteId" value={reporte.id} />
      <textarea
        name="observacion"
        required
        rows={3}
        defaultValue={reporte.observacion}
        className="w-full p-2.5 bg-marca-fondo border border-marca-borde rounded-[3px] text-marca-texto text-sm outline-none focus:border-marca-rojoclaro"
      />
      <input
        name="actividad"
        defaultValue={reporte.actividad ?? ""}
        placeholder="Actividad realizada (opcional)"
        className="w-full p-2.5 bg-marca-fondo border border-marca-borde rounded-[3px] text-marca-texto text-sm outline-none focus:border-marca-rojoclaro"
      />
      <div className="flex items-center gap-2">
        <BotonGuardar />
        <button
          type="button"
          onClick={onCancelar}
          className="text-marca-tenue hover:text-marca-texto text-[11px] font-bold uppercase"
        >
          Cancelar
        </button>
      </div>
      {estado.mensaje && !estado.exito && (
        <p className="text-marca-rojoclaro text-xs font-bold">{estado.mensaje}</p>
      )}
    </form>
  );
}

export default function MisReportes() {
  const [reportes, setReportes] = useState<MiReporte[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [conFiltro, setConFiltro] = useState(false);
  const [desde, setDesde] = useState(sumarDias(hoyPeru(), -7));
  const [hasta, setHasta] = useState(hoyPeru());

  function cargar() {
    setCargando(true);
    const promesa = conFiltro
      ? obtenerMisReportesRecientes(desde, hasta)
      : obtenerMisReportesRecientes();
    promesa
      .then(setReportes)
      .catch((e) => setError(e.message || "Error al cargar tus reportes."))
      .finally(() => setCargando(false));
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conFiltro, desde, hasta]);

  return (
    <div className="bg-marca-superficie border border-marca-rojo/25 rounded-[3px] p-5 space-y-3">
      <h3 className="text-xs font-black tracking-widest text-marca-tenue">
        🗂️ MIS REGISTROS DE OBSERVACIONES
      </h3>
      <p className="text-marca-tenue text-[11px]">
        Puedes corregir un reporte hasta 48 horas después de que el coordinador te asignó esa
        ruta o tienda — pasado ese tiempo queda fijado.
      </p>

      {conFiltro ? (
        <div className="space-y-2">
          <SelectorFechas desde={desde} hasta={hasta} onDesde={setDesde} onHasta={setHasta} />
          <button
            onClick={() => setConFiltro(false)}
            className="text-marca-rojoclaro hover:text-marca-rojo text-[11px] font-bold uppercase"
          >
            ← Volver a los últimos 3 registros
          </button>
        </div>
      ) : (
        <button
          onClick={() => setConFiltro(true)}
          className="text-marca-rojoclaro hover:text-marca-rojo text-[11px] font-bold uppercase"
        >
          🔎 Ver más con filtro de fechas
        </button>
      )}

      {error && <p className="text-marca-rojoclaro text-sm">{error}</p>}

      {cargando ? (
        <p className="text-marca-tenue text-sm animate-pulse">Cargando tus reportes...</p>
      ) : reportes.length === 0 ? (
        <p className="text-marca-tenue text-sm italic">Todavía no has enviado ningún reporte.</p>
      ) : (
        <div className="space-y-2">
          {reportes.map((r) => (
            <div key={r.id} className="bg-marca-fondo border border-marca-borde rounded-[3px] p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-marca-textofuerte font-bold text-sm">{r.tiendaNombre}</p>
                  <p className="text-marca-tenue text-[11px] capitalize mt-1">
                    {formatearFechaLegible(r.fecha)}
                  </p>
                </div>
                {r.puedeEditar && editandoId !== r.id && (
                  <button
                    onClick={() => setEditandoId(r.id)}
                    className="text-marca-rojoclaro hover:text-marca-rojo text-[11px] font-bold uppercase shrink-0"
                  >
                    Editar
                  </button>
                )}
              </div>

              {editandoId === r.id ? (
                <FormularioEdicion
                  reporte={r}
                  onGuardado={() => {
                    setEditandoId(null);
                    cargar();
                  }}
                  onCancelar={() => setEditandoId(null)}
                />
              ) : (
                <>
                  <p className="text-marca-texto text-sm mt-2">{r.observacion}</p>
                  {r.actividad && (
                    <p className="text-marca-tenue text-[12px] italic mt-1">
                      Actividad: {r.actividad}
                    </p>
                  )}
                </>
              )}

              {r.respuesta && (
                <div className="mt-3 bg-marca-rojo/10 border border-marca-rojo/30 rounded-[3px] p-3">
                  <p className="text-marca-rojoclaro text-[10px] font-black uppercase tracking-widest">
                    💬 Respuesta{r.respuestaPor ? " de " + r.respuestaPor : ""}
                  </p>
                  <p className="text-marca-textofuerte text-sm mt-1">{r.respuesta}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
