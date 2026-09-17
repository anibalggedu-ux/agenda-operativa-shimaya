"use client";

import { useEffect, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Store, ClipboardList, Check } from "lucide-react";
import {
  obtenerMisTiendasFijas,
  obtenerObservacionesTiendasFijas,
  responderObservacionTiendaFija,
  marcarObservacionLeida,
  obtenerChecklistsTiendasFijas,
  marcarChecklistTiendaFijaLeido,
  type TiendaFija,
  type ObservacionTiendaFija,
  type ResultadoReporte,
  type ChecklistTiendaFija,
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
  const [marcando, setMarcando] = useState(false);
  const [errorLeido, setErrorLeido] = useState<string | null>(null);

  useEffect(() => {
    if (estado.exito) onRespondida();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado]);

  async function handleMarcarLeido() {
    setMarcando(true);
    setErrorLeido(null);
    const resultado = await marcarObservacionLeida(obs.id);
    setMarcando(false);
    if (resultado.exito) onRespondida();
    else setErrorLeido(resultado.mensaje || "No se pudo marcar como leída.");
  }

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
          <div className="flex items-center gap-3">
            <BotonResponder />
            <button
              type="button"
              onClick={handleMarcarLeido}
              disabled={marcando}
              className="inline-flex items-center gap-1 text-marca-tenue hover:text-marca-texto disabled:opacity-50 text-[11px] font-bold uppercase tracking-widest"
            >
              {marcando ? (
                "Marcando..."
              ) : (
                <>
                  <Check className="w-3 h-3" /> Marcar como leído
                </>
              )}
            </button>
          </div>
          {estado.mensaje && !estado.exito && (
            <p className="text-marca-rojoclaro text-xs font-bold">{estado.mensaje}</p>
          )}
          {errorLeido && <p className="text-marca-rojoclaro text-xs font-bold">{errorLeido}</p>}
        </form>
      )}
    </div>
  );
}

function claseBadgePuntaje(clasificacion: string | null): string {
  switch (clasificacion) {
    case "Excelente":
      return "bg-emerald-950/30 border-emerald-700/40 text-emerald-300";
    case "Bueno":
      return "bg-sky-950/30 border-sky-700/40 text-sky-300";
    case "Requiere mejora":
      return "bg-amber-950/30 border-amber-700/40 text-amber-300";
    case "Acción inmediata":
      return "bg-marca-rojo/15 border-marca-rojo/40 text-marca-rojoclaro";
    default:
      return "border-dashed border-marca-borde text-marca-tenue";
  }
}

function ChecklistItem({
  checklist,
  onLeido,
}: {
  checklist: ChecklistTiendaFija;
  onLeido: () => void;
}) {
  const [marcando, setMarcando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleMarcarLeido() {
    setMarcando(true);
    setError(null);
    const resultado = await marcarChecklistTiendaFijaLeido(checklist.id);
    setMarcando(false);
    if (resultado.exito) onLeido();
    else setError(resultado.mensaje || "No se pudo marcar como leído.");
  }

  return (
    <div className="bg-marca-fondo border border-marca-borde rounded-[3px] p-4">
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div>
          <p className="text-marca-textofuerte font-bold text-sm">
            {checklist.tiendaNombre} — {checklist.usuarioNombre}{" "}
            <span className="text-marca-tenue font-normal text-[11px] uppercase">({checklist.rol})</span>
          </p>
          <p className="text-marca-tenue text-[11px] capitalize mt-1">
            {formatearFechaLegible(checklist.fecha)}
          </p>
        </div>
        {checklist.porcentaje !== null ? (
          <span
            className={`text-[11px] font-bold px-2.5 py-1 rounded-full border whitespace-nowrap ${claseBadgePuntaje(
              checklist.clasificacion
            )}`}
          >
            {checklist.porcentaje}% · {checklist.clasificacion}
          </span>
        ) : (
          <span className="text-[11px] text-marca-tenue border border-dashed border-marca-borde px-2.5 py-1 rounded-full">
            Sin puntaje
          </span>
        )}
      </div>
      <div className="flex items-center gap-4 mt-3">
        <a
          href={`/panel/supervisor?seccion=analitica&checklist=${checklist.id}`}
          className="text-marca-rojoclaro hover:text-marca-rojo text-[11px] font-bold uppercase tracking-widest"
        >
          Ver resultados completos →
        </a>
        <button
          type="button"
          onClick={handleMarcarLeido}
          disabled={marcando}
          className="inline-flex items-center gap-1 text-marca-tenue hover:text-marca-texto disabled:opacity-50 text-[11px] font-bold uppercase tracking-widest"
        >
          {marcando ? (
            "Marcando..."
          ) : (
            <>
              <Check className="w-3 h-3" /> Marcar como leído
            </>
          )}
        </button>
      </div>
      {error && <p className="text-marca-rojoclaro text-xs font-bold mt-2">{error}</p>}
    </div>
  );
}

const AYER = sumarDias(hoyPeru(), -1);

export default function TiendasFijas() {
  const [tiendas, setTiendas] = useState<TiendaFija[]>([]);
  const [observaciones, setObservaciones] = useState<ObservacionTiendaFija[]>([]);
  const [checklists, setChecklists] = useState<ChecklistTiendaFija[]>([]);
  const [cargando, setCargando] = useState(true);
  const [cargandoObs, setCargandoObs] = useState(true);
  const [cargandoChecklists, setCargandoChecklists] = useState(true);
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

  function cargarChecklists() {
    setCargandoChecklists(true);
    obtenerChecklistsTiendasFijas(desde, hasta)
      .then(setChecklists)
      .catch((e) => setError(e.message || "Error al cargar los checklists."))
      .finally(() => setCargandoChecklists(false));
  }

  useEffect(() => {
    cargarObservaciones();
    cargarChecklists();
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
        <h3 className="flex items-center gap-1.5 text-xs font-black tracking-widest text-marca-tenue">
          <Store className="w-3.5 h-3.5 text-marca-rojoclaro" /> MIS TIENDAS FIJAS
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

      <div className="bg-marca-superficie border border-marca-rojo/25 rounded-[3px] p-5 space-y-4">
        <h3 className="flex items-center gap-1.5 text-xs font-black tracking-widest text-marca-tenue">
          <ClipboardList className="w-3.5 h-3.5 text-marca-rojoclaro" /> CHECKLISTS EN TUS TIENDAS FIJAS (
          {checklists.length})
        </h3>
        <SelectorFechas desde={desde} hasta={hasta} onDesde={setDesde} onHasta={setHasta} />

        {cargandoChecklists ? (
          <p className="text-marca-tenue text-sm animate-pulse">Cargando checklists...</p>
        ) : checklists.length === 0 ? (
          <p className="text-marca-tenue text-sm italic">
            Nadie más llenó un checklist de rutina en tus tiendas fijas en este rango de fechas.
          </p>
        ) : (
          <div className="space-y-2">
            {checklists.map((c) => (
              <ChecklistItem key={c.id} checklist={c} onLeido={cargarChecklists} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
