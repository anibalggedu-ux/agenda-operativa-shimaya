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

function BotonResponder() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="bg-marca-rojo hover:bg-marca-rojoclaro disabled:opacity-50 text-marca-textofuerte font-black py-2 px-4 rounded-[3px] text-[11px] tracking-widest uppercase transition"
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
    <div className="bg-marca-fondo border border-marca-borde rounded-[3px] p-4">
      <p className="text-marca-textofuerte font-bold text-sm">
        {obs.tiendaNombre} — {obs.usuarioNombre}{" "}
        <span className="text-marca-tenue font-normal text-[11px] uppercase">({obs.rol})</span>
      </p>
      <p className="text-marca-tenue text-[11px] capitalize mt-1">
        {formatearFechaLegible(obs.fecha)}
      </p>
      <p className="text-marca-texto text-sm mt-2">{obs.observacion}</p>
      {obs.actividad && (
        <p className="text-marca-tenue text-[12px] italic mt-1">Actividad: {obs.actividad}</p>
      )}

      {obs.respuesta ? (
        <div className="mt-3 bg-marca-rojo/10 border border-marca-rojo/30 rounded-[3px] p-3">
          <p className="text-marca-rojoclaro text-[10px] font-black uppercase tracking-widest">
            Respuesta{obs.respuestaPor ? " · " + obs.respuestaPor : ""}
          </p>
          <p className="text-marca-textofuerte text-sm mt-1">{obs.respuesta}</p>
        </div>
      ) : (
        <form action={formAction} className="mt-3 space-y-2">
          <input type="hidden" name="reporteId" value={obs.id} />
          <textarea
            name="respuesta"
            required
            rows={2}
            placeholder="Responde a este colaborador..."
            className="w-full p-2.5 bg-marca-superficie2 border border-marca-borde rounded-[3px] text-marca-texto text-sm outline-none focus:border-marca-rojoclaro"
          />
          <BotonResponder />
          {estado.mensaje && !estado.exito && (
            <p className="text-marca-rojoclaro text-xs font-bold">{estado.mensaje}</p>
          )}
        </form>
      )}
    </div>
  );
}

const AYER = sumarDias(hoyPeru(), -1);

export default function TiendasFijas() {
  const [tiendas, setTiendas] = useState<TiendaFija[]>([]);
  const [observaciones, setObservaciones] = useState<ObservacionTiendaFija[]>([]);
  const [cargando, setCargando] = useState(true);
  const [cargandoObs, setCargandoObs] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [desde, setDesde] = useState(AYER);
  const [hasta, setHasta] = useState(AYER);

  useEffect(() => {
    obtenerMisTiendasFijas()
      .then(setTiendas)
      .catch((e) => setError(e.message || "Error al cargar tus tiendas fijas."))
      .finally(() => setCargando(false));
  }, []);

  function cargarObservaciones() {
    setCargandoObs(true);
    obtenerObservacionesTiendasFijas(desde, hasta)
      .then(setObservaciones)
      .catch((e) => setError(e.message || "Error al cargar las observaciones."))
      .finally(() => setCargandoObs(false));
  }

  useEffect(() => {
    cargarObservaciones();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desde, hasta]);

  if (cargando) {
    return <p className="text-marca-tenue text-sm animate-pulse">Cargando tus tiendas fijas...</p>;
  }

  if (error) {
    return <p className="text-marca-rojoclaro text-sm">{error}</p>;
  }

  return (
    <div className="space-y-4">
      <div className="bg-marca-superficie border border-marca-rojo/25 rounded-[3px] p-5 space-y-3">
        <h3 className="text-xs font-black tracking-widest text-marca-tenue">
          🏬 MIS TIENDAS FIJAS
        </h3>
        {tiendas.length === 0 ? (
          <p className="text-marca-tenue text-sm italic">
            No tienes tiendas asignadas de forma permanente.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {tiendas.map((t) => (
              <span
                key={t.id}
                className="bg-marca-fondo border border-marca-borde rounded-full px-3 py-1.5 text-xs text-marca-textofuerte font-bold"
              >
                {t.nombre}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="bg-marca-superficie border border-marca-rojo/25 rounded-[3px] p-5 space-y-4">
        <h3 className="text-xs font-black tracking-widest text-marca-tenue">
          OBSERVACIONES EN TUS TIENDAS FIJAS ({observaciones.length})
        </h3>
        <SelectorFechas desde={desde} hasta={hasta} onDesde={setDesde} onHasta={setHasta} />

        {cargandoObs ? (
          <p className="text-marca-tenue text-sm animate-pulse">Cargando observaciones...</p>
        ) : observaciones.length === 0 ? (
          <p className="text-marca-tenue text-sm italic">
            Nadie más ha dejado observaciones en tus tiendas fijas en este rango de fechas.
          </p>
        ) : (
          <div className="space-y-2">
            {observaciones.map((o) => (
              <ObservacionItem key={o.id} obs={o} onRespondida={cargarObservaciones} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
