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
    <div className="flex flex-col sm:flex-row gap-2">
      <div className="flex-1">
        <label className="block text-marca-tenue text-[10px] uppercase font-bold mb-1">Desde</label>
        <input
          type="date"
          value={desde}
          max={hasta}
          onChange={(e) => onDesde(e.target.value)}
          className="w-full p-2 bg-marca-fondo border border-marca-borde rounded-[3px] text-marca-texto text-sm outline-none focus:border-marca-rojoclaro"
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
          className="w-full p-2 bg-marca-fondo border border-marca-borde rounded-[3px] text-marca-texto text-sm outline-none focus:border-marca-rojoclaro"
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
  onGuardado: (datos: { observacion: string; actividad: string }) => void;
  onCancelar: () => void;
}) {
  const [estado, formAction] = useFormState(editarReporte, estadoInicial);
  const [observacion, setObservacion] = useState(reporte.observacion);
  const [actividad, setActividad] = useState(reporte.actividad ?? "");

  useEffect(() => {
    if (estado.exito) onGuardado({ observacion, actividad });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado]);

  return (
    <form action={formAction} className="mt-2 space-y-2">
      <input type="hidden" name="reporteId" value={reporte.id} />
      <textarea
        name="observacion"
        required
        rows={3}
        value={observacion}
        onChange={(e) => setObservacion(e.target.value)}
        className="w-full p-2.5 bg-marca-fondo border border-marca-borde rounded-[3px] text-marca-texto text-sm outline-none focus:border-marca-rojoclaro"
      />
      <input
        name="actividad"
        value={actividad}
        onChange={(e) => setActividad(e.target.value)}
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

const LARGO_PREVIA = 90;

function FilaReporte({ reporte }: { reporte: MiReporte }) {
  const [editando, setEditando] = useState(false);
  const [expandido, setExpandido] = useState(false);
  const [version, setVersion] = useState(reporte);

  const esLarga = version.observacion.length > LARGO_PREVIA;
  const textoMostrado =
    esLarga && !expandido ? version.observacion.slice(0, LARGO_PREVIA) + "…" : version.observacion;

  return (
    <div className="bg-marca-fondo border border-marca-borde rounded-[3px] px-3 py-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-marca-textofuerte font-bold text-sm truncate">
            {version.tiendaNombre}{" "}
            <span className="text-marca-tenue font-normal text-[11px] capitalize">
              · {formatearFechaLegible(version.fecha)}
            </span>
          </p>
        </div>
        {version.puedeEditar && !editando && (
          <button
            onClick={() => setEditando(true)}
            className="text-marca-rojoclaro hover:text-marca-rojo text-[11px] font-bold uppercase shrink-0"
          >
            Editar
          </button>
        )}
      </div>

      {editando ? (
        <FormularioEdicion
          reporte={version}
          onGuardado={(datos) => {
            setVersion((prev) => ({ ...prev, ...datos }));
            setEditando(false);
          }}
          onCancelar={() => setEditando(false)}
        />
      ) : (
        <>
          <p className="text-marca-texto text-sm mt-1">
            {textoMostrado}
            {esLarga && (
              <button
                onClick={() => setExpandido((v) => !v)}
                className="text-marca-rojoclaro hover:text-marca-rojo text-[11px] font-bold uppercase ml-2 align-middle"
              >
                {expandido ? "Ver menos" : "Ver más"}
              </button>
            )}
          </p>
          {version.actividad && (
            <p className="text-marca-tenue text-[11px] italic mt-1">Actividad: {version.actividad}</p>
          )}
        </>
      )}

      {version.respuesta && (
        <div className="mt-2 bg-marca-rojo/10 border border-marca-rojo/30 rounded-[3px] p-2.5">
          <p className="text-marca-rojoclaro text-[10px] font-black uppercase tracking-widest">
            💬 Respuesta{version.respuestaPor ? " de " + version.respuestaPor : ""}
          </p>
          <p className="text-marca-textofuerte text-sm mt-1">{version.respuesta}</p>
        </div>
      )}
    </div>
  );
}

export default function MisReportes() {
  const [reportes, setReportes] = useState<MiReporte[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [desde, setDesde] = useState(hoyPeru());
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
    <div className="bg-marca-superficie border border-marca-rojo/25 rounded-[3px] p-4 space-y-2.5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-xs font-black tracking-widest text-marca-tenue">
          🗂️ MIS REGISTROS DE OBSERVACIONES
        </h3>
        <div className="flex gap-1.5">
          {[
            { etiqueta: "Hoy", desde: hoyPeru(), hasta: hoyPeru() },
            { etiqueta: "7 días", desde: sumarDias(hoyPeru(), -6), hasta: hoyPeru() },
            { etiqueta: "30 días", desde: sumarDias(hoyPeru(), -29), hasta: hoyPeru() },
          ].map((atajo) => (
            <button
              key={atajo.etiqueta}
              onClick={() => {
                setDesde(atajo.desde);
                setHasta(atajo.hasta);
              }}
              className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase transition ${
                desde === atajo.desde && hasta === atajo.hasta
                  ? "bg-marca-rojo text-marca-textofuerte"
                  : "bg-marca-superficie2 border border-marca-borde text-marca-tenue hover:border-marca-rojo/40"
              }`}
            >
              {atajo.etiqueta}
            </button>
          ))}
        </div>
      </div>

      <SelectorFechas desde={desde} hasta={hasta} onDesde={setDesde} onHasta={setHasta} />

      <p className="text-marca-tenue text-[11px]">
        Editable hasta 48h después de que el coordinador te asignó la ruta/tienda.
      </p>

      {error && <p className="text-marca-rojoclaro text-sm">{error}</p>}

      {cargando ? (
        <p className="text-marca-tenue text-sm animate-pulse">Cargando...</p>
      ) : reportes.length === 0 ? (
        <p className="text-marca-tenue text-sm italic">Sin reportes en este rango de fechas.</p>
      ) : (
        <div className="space-y-1.5">
          {reportes.map((r) => (
            <FilaReporte key={r.id} reporte={r} />
          ))}
        </div>
      )}
    </div>
  );
}
