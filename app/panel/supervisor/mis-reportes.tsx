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
        <label className="block text-slate-400 text-[10px] uppercase font-bold mb-1">Desde</label>
        <input
          type="date"
          value={desde}
          max={hasta}
          onChange={(e) => onDesde(e.target.value)}
          className="w-full p-2.5 bg-[#0d1117] border border-slate-800 rounded-xl text-white text-sm outline-none focus:border-cyan-500"
        />
      </div>
      <div className="flex-1">
        <label className="block text-slate-400 text-[10px] uppercase font-bold mb-1">Hasta</label>
        <input
          type="date"
          value={hasta}
          min={desde}
          max={hoyPeru()}
          onChange={(e) => onHasta(e.target.value)}
          className="w-full p-2.5 bg-[#0d1117] border border-slate-800 rounded-xl text-white text-sm outline-none focus:border-cyan-500"
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
      className="bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-black py-2 px-4 rounded-lg text-[11px] tracking-widest uppercase transition"
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
        className="w-full p-2.5 bg-[#07080c] border border-slate-800 rounded-xl text-white text-sm outline-none focus:border-cyan-500"
      />
      <input
        name="actividad"
        defaultValue={reporte.actividad ?? ""}
        placeholder="Actividad realizada (opcional)"
        className="w-full p-2.5 bg-[#07080c] border border-slate-800 rounded-xl text-white text-sm outline-none focus:border-cyan-500"
      />
      <div className="flex items-center gap-2">
        <BotonGuardar />
        <button
          type="button"
          onClick={onCancelar}
          className="text-slate-400 hover:text-slate-200 text-[11px] font-bold uppercase"
        >
          Cancelar
        </button>
      </div>
      {estado.mensaje && !estado.exito && (
        <p className="text-yellow-400 text-xs font-bold">{estado.mensaje}</p>
      )}
    </form>
  );
}

export default function MisReportes() {
  const [reportes, setReportes] = useState<MiReporte[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [desde, setDesde] = useState(sumarDias(hoyPeru(), -30));
  const [hasta, setHasta] = useState(hoyPeru());

  function cargar() {
    setCargando(true);
    obtenerMisReportesRecientes(desde, hasta)
      .then(setReportes)
      .catch((e) => setError(e.message || "Error al cargar tus reportes."))
      .finally(() => setCargando(false));
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desde, hasta]);

  return (
    <div className="bg-[#0f111a] border-2 border-slate-700/60 rounded-2xl p-5 space-y-3">
      <h3 className="text-xs font-black tracking-widest text-slate-300">
        🗂️ MIS REGISTROS DE OBSERVACIONES
      </h3>
      <p className="text-slate-600 text-[11px]">
        Puedes corregir un reporte hasta 48 horas después de haberlo enviado.
      </p>

      <SelectorFechas desde={desde} hasta={hasta} onDesde={setDesde} onHasta={setHasta} />

      {error && <p className="text-red-400 text-sm">{error}</p>}

      {cargando ? (
        <p className="text-slate-500 text-sm animate-pulse">Cargando tus reportes...</p>
      ) : reportes.length === 0 ? (
        <p className="text-slate-500 text-sm italic">Todavía no has enviado ningún reporte.</p>
      ) : (
        <div className="space-y-2">
          {reportes.map((r) => (
            <div key={r.id} className="bg-[#0d1117] border border-slate-800 rounded-xl p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-white font-bold text-sm">{r.tiendaNombre}</p>
                  <p className="text-slate-500 text-[11px] capitalize mt-1">
                    {formatearFechaLegible(r.fecha)}
                  </p>
                </div>
                {r.puedeEditar && editandoId !== r.id && (
                  <button
                    onClick={() => setEditandoId(r.id)}
                    className="text-cyan-400 hover:text-cyan-300 text-[11px] font-bold uppercase shrink-0"
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
                  <p className="text-slate-300 text-sm mt-2">{r.observacion}</p>
                  {r.actividad && (
                    <p className="text-slate-500 text-[12px] italic mt-1">
                      Actividad: {r.actividad}
                    </p>
                  )}
                </>
              )}

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
