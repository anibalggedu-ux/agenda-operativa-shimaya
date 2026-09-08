"use client";

import { useEffect, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import {
  obtenerReportesRecientes,
  responderReporte,
  type ReporteBitacora,
  type ResultadoAccion,
} from "./actions";
import { formatearFechaLegible } from "@/lib/fechas";

const estadoInicial: ResultadoAccion = { exito: false };

function BotonResponder() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-black py-2 px-4 rounded-lg text-[11px] tracking-widest uppercase transition"
    >
      {pending ? "Enviando..." : "Responder"}
    </button>
  );
}

function ReporteItem({
  reporte,
  onRespondido,
}: {
  reporte: ReporteBitacora;
  onRespondido: () => void;
}) {
  const [estado, formAction] = useFormState(responderReporte, estadoInicial);

  useEffect(() => {
    if (estado.exito) onRespondido();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado]);

  return (
    <div className="bg-[#0f111a] border border-slate-800 rounded-xl p-4">
      <p className="text-white font-bold text-sm">
        {reporte.usuarioNombre} → {reporte.tiendaNombre}
      </p>
      <p className="text-slate-500 text-[11px] capitalize mt-1">
        {formatearFechaLegible(reporte.fecha)} · {reporte.rol}
      </p>
      <p className="text-slate-300 text-sm mt-2">{reporte.observacion}</p>
      {reporte.actividad && (
        <p className="text-slate-500 text-[12px] italic mt-1">
          Actividad: {reporte.actividad}
        </p>
      )}

      {reporte.respuesta ? (
        <div className="mt-3 bg-cyan-950/20 border border-cyan-700/40 rounded-lg p-3">
          <p className="text-cyan-400 text-[10px] font-black uppercase tracking-widest">
            Tu respuesta{reporte.respuestaPor ? " · " + reporte.respuestaPor : ""}
          </p>
          <p className="text-white text-sm mt-1">{reporte.respuesta}</p>
        </div>
      ) : (
        <form action={formAction} className="mt-3 space-y-2">
          <input type="hidden" name="reporteId" value={reporte.id} />
          <textarea
            name="respuesta"
            required
            rows={2}
            placeholder="Escribe una respuesta para quien reportó..."
            className="w-full p-2.5 bg-[#0d1117] border border-slate-800 rounded-xl text-white text-sm outline-none focus:border-cyan-500"
          />
          <BotonResponder />
          {estado.mensaje && !estado.exito && (
            <p className="text-yellow-400 text-xs font-bold">{estado.mensaje}</p>
          )}
        </form>
      )}
    </div>
  );
}

export default function Reportes() {
  const [reportes, setReportes] = useState<ReporteBitacora[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function cargar() {
    setCargando(true);
    obtenerReportesRecientes()
      .then(setReportes)
      .catch((e) => setError(e.message || "Error al cargar los reportes."))
      .finally(() => setCargando(false));
  }

  useEffect(() => {
    cargar();
  }, []);

  if (cargando) {
    return <p className="text-slate-500 text-sm animate-pulse">Cargando reportes...</p>;
  }

  if (error) {
    return <p className="text-red-400 text-sm">{error}</p>;
  }

  if (reportes.length === 0) {
    return <p className="text-slate-500 text-sm italic">No hay reportes registrados todavía.</p>;
  }

  const sinResponder = reportes.filter((r) => !r.respuesta);
  const respondidos = reportes.filter((r) => r.respuesta);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-xs font-black tracking-widest text-slate-300 mb-3">
          SIN RESPONDER ({sinResponder.length})
        </h3>
        {sinResponder.length === 0 ? (
          <p className="text-slate-500 text-sm italic">Estás al día — no hay reportes pendientes.</p>
        ) : (
          <div className="space-y-2">
            {sinResponder.map((r) => (
              <ReporteItem key={r.id} reporte={r} onRespondido={cargar} />
            ))}
          </div>
        )}
      </div>

      {respondidos.length > 0 && (
        <div>
          <h3 className="text-xs font-black tracking-widest text-slate-300 mb-3">
            RESPONDIDOS ({respondidos.length})
          </h3>
          <div className="space-y-2">
            {respondidos.map((r) => (
              <ReporteItem key={r.id} reporte={r} onRespondido={cargar} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
