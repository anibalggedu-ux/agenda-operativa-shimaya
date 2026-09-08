"use client";

import { useEffect, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import {
  obtenerMisTiendasFijas,
  obtenerObservacionesTiendasFijas,
  responderObservacionTiendaFija,
  type TiendaFija,
  type ObservacionTiendaFija,
  type ResultadoReporte,
} from "./actions";
import { formatearFechaLegible } from "@/lib/fechas";

const estadoInicial: ResultadoReporte = { exito: false };

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

function ObservacionItem({
  obs,
  onRespondida,
}: {
  obs: ObservacionTiendaFija;
  onRespondida: () => void;
}) {
  const [estado, formAction] = useFormState(responderObservacionTiendaFija, estadoInicial);

  useEffect(() => {
    if (estado.exito) onRespondida();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado]);

  return (
    <div className="bg-[#0d1117] border border-slate-800 rounded-xl p-4">
      <p className="text-white font-bold text-sm">
        {obs.tiendaNombre} — {obs.usuarioNombre}{" "}
        <span className="text-slate-500 font-normal text-[11px] uppercase">({obs.rol})</span>
      </p>
      <p className="text-slate-500 text-[11px] capitalize mt-1">
        {formatearFechaLegible(obs.fecha)}
      </p>
      <p className="text-slate-300 text-sm mt-2">{obs.observacion}</p>
      {obs.actividad && (
        <p className="text-slate-500 text-[12px] italic mt-1">Actividad: {obs.actividad}</p>
      )}

      {obs.respuesta ? (
        <div className="mt-3 bg-cyan-950/20 border border-cyan-700/40 rounded-lg p-3">
          <p className="text-cyan-400 text-[10px] font-black uppercase tracking-widest">
            Respuesta{obs.respuestaPor ? " · " + obs.respuestaPor : ""}
          </p>
          <p className="text-white text-sm mt-1">{obs.respuesta}</p>
        </div>
      ) : (
        <form action={formAction} className="mt-3 space-y-2">
          <input type="hidden" name="reporteId" value={obs.id} />
          <textarea
            name="respuesta"
            required
            rows={2}
            placeholder="Responde a este colaborador..."
            className="w-full p-2.5 bg-[#07080c] border border-slate-800 rounded-xl text-white text-sm outline-none focus:border-cyan-500"
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

export default function TiendasFijas() {
  const [tiendas, setTiendas] = useState<TiendaFija[]>([]);
  const [observaciones, setObservaciones] = useState<ObservacionTiendaFija[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function cargar() {
    setCargando(true);
    Promise.all([obtenerMisTiendasFijas(), obtenerObservacionesTiendasFijas()])
      .then(([t, o]) => {
        setTiendas(t);
        setObservaciones(o);
      })
      .catch((e) => setError(e.message || "Error al cargar tus tiendas fijas."))
      .finally(() => setCargando(false));
  }

  useEffect(() => {
    cargar();
  }, []);

  if (cargando) {
    return <p className="text-slate-500 text-sm animate-pulse">Cargando tus tiendas fijas...</p>;
  }

  if (error) {
    return <p className="text-red-400 text-sm">{error}</p>;
  }

  return (
    <div className="space-y-4">
      <div className="bg-[#0f111a] border-2 border-slate-700/60 rounded-2xl p-5 space-y-3">
        <h3 className="text-xs font-black tracking-widest text-slate-300">
          🏬 MIS TIENDAS FIJAS
        </h3>
        {tiendas.length === 0 ? (
          <p className="text-slate-500 text-sm italic">
            No tienes tiendas asignadas de forma permanente.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {tiendas.map((t) => (
              <span
                key={t.id}
                className="bg-[#0d1117] border border-slate-800 rounded-full px-3 py-1.5 text-xs text-white font-bold"
              >
                {t.nombre}
              </span>
            ))}
          </div>
        )}
      </div>

      <div>
        <h3 className="text-xs font-black tracking-widest text-slate-300 mb-3">
          OBSERVACIONES EN TUS TIENDAS FIJAS ({observaciones.length})
        </h3>
        {observaciones.length === 0 ? (
          <p className="text-slate-500 text-sm italic">
            Nadie más ha dejado observaciones en tus tiendas fijas todavía.
          </p>
        ) : (
          <div className="space-y-2">
            {observaciones.map((o) => (
              <ObservacionItem key={o.id} obs={o} onRespondida={cargar} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
