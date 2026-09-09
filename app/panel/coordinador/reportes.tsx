"use client";

import { useEffect, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import {
  obtenerReportesRecientes,
  responderReporte,
  obtenerUsuariosYTiendas,
  obtenerHistorialTienda,
  obtenerHistorialPersona,
  type ReporteBitacora,
  type ResultadoAccion,
  type UsuarioBasico,
  type TiendaBasica,
  type HistorialTienda,
  type HistorialPersona,
} from "./actions";
import { formatearFechaLegible, formatearHora, hoyPeru, sumarDias } from "@/lib/fechas";
import {
  generarPdfHistorialTienda,
  generarPdfHistorialPersona,
} from "@/lib/generar-pdf";

type SubPestana = "observaciones" | "tienda" | "persona";

const SUBPESTANAS: { id: SubPestana; etiqueta: string }[] = [
  { id: "observaciones", etiqueta: "Observaciones" },
  { id: "tienda", etiqueta: "Por Tienda" },
  { id: "persona", etiqueta: "Por Persona" },
];

const estadoInicial: ResultadoAccion = { exito: false };

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
    <div className="bg-marca-superficie border border-marca-borde rounded-[3px] p-4">
      <p className="text-marca-textofuerte font-bold text-sm">
        {reporte.usuarioNombre} → {reporte.tiendaNombre}
      </p>
      <p className="text-marca-tenue text-[11px] capitalize mt-1">
        {formatearFechaLegible(reporte.fecha)} · {reporte.rol}
      </p>
      <p className="text-marca-texto text-sm mt-2">{reporte.observacion}</p>
      {reporte.actividad && (
        <p className="text-marca-tenue text-[12px] italic mt-1">
          Actividad: {reporte.actividad}
        </p>
      )}

      {reporte.respuesta ? (
        <div className="mt-3 bg-marca-rojo/10 border border-marca-rojo/30 rounded-[3px] p-3">
          <p className="text-marca-rojoclaro text-[10px] font-black uppercase tracking-widest">
            Tu respuesta{reporte.respuestaPor ? " · " + reporte.respuestaPor : ""}
          </p>
          <p className="text-marca-textofuerte text-sm mt-1">{reporte.respuesta}</p>
        </div>
      ) : (
        <form action={formAction} className="mt-3 space-y-2">
          <input type="hidden" name="reporteId" value={reporte.id} />
          <textarea
            name="respuesta"
            required
            rows={2}
            placeholder="Escribe una respuesta para quien reportó..."
            className="w-full p-2.5 bg-marca-fondo border border-marca-borde rounded-[3px] text-marca-texto text-sm outline-none focus:border-marca-rojoclaro"
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
          onChange={(e) => onHasta(e.target.value)}
          className="w-full p-2.5 bg-marca-fondo border border-marca-borde rounded-[3px] text-marca-texto text-sm outline-none focus:border-marca-rojoclaro"
        />
      </div>
    </div>
  );
}

function TabObservaciones() {
  const [desde, setDesde] = useState(hoyPeru());
  const [hasta, setHasta] = useState(hoyPeru());
  const [reportes, setReportes] = useState<ReporteBitacora[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function cargar() {
    setCargando(true);
    obtenerReportesRecientes(desde, hasta)
      .then(setReportes)
      .catch((e) => setError(e.message || "Error al cargar los reportes."))
      .finally(() => setCargando(false));
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desde, hasta]);

  if (error) return <p className="text-marca-rojoclaro text-sm">{error}</p>;

  const sinResponder = reportes.filter((r) => !r.respuesta);
  const respondidos = reportes.filter((r) => r.respuesta);

  return (
    <div className="space-y-6">
      <div className="bg-marca-superficie border border-marca-borde rounded-[3px] p-4">
        <SelectorFechas desde={desde} hasta={hasta} onDesde={setDesde} onHasta={setHasta} />
        <p className="text-marca-tenue text-[11px] mt-2">
          El día de hoy siempre queda incluido si amplías el rango hacia atrás.
        </p>
      </div>

      {cargando ? (
        <p className="text-marca-tenue text-sm animate-pulse">Cargando reportes...</p>
      ) : reportes.length === 0 ? (
        <p className="text-marca-tenue text-sm italic">No hay reportes en este rango de fechas.</p>
      ) : (
        <>
          <div>
            <h3 className="text-xs font-black tracking-widest text-marca-tenue mb-3">
              SIN RESPONDER ({sinResponder.length})
            </h3>
            {sinResponder.length === 0 ? (
              <p className="text-marca-tenue text-sm italic">Estás al día — no hay reportes pendientes.</p>
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
              <h3 className="text-xs font-black tracking-widest text-marca-tenue mb-3">
                RESPONDIDOS ({respondidos.length})
              </h3>
              <div className="space-y-2">
                {respondidos.map((r) => (
                  <ReporteItem key={r.id} reporte={r} onRespondido={cargar} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function TabPorTienda() {
  const [tiendas, setTiendas] = useState<TiendaBasica[]>([]);
  const [tiendaId, setTiendaId] = useState("");
  const [desde, setDesde] = useState(sumarDias(hoyPeru(), -30));
  const [hasta, setHasta] = useState(hoyPeru());
  const [historial, setHistorial] = useState<HistorialTienda | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    obtenerUsuariosYTiendas().then(({ tiendas }) => setTiendas(tiendas));
  }, []);

  useEffect(() => {
    if (!tiendaId) {
      setHistorial(null);
      return;
    }
    setCargando(true);
    setError(null);
    obtenerHistorialTienda(tiendaId, desde, hasta)
      .then(setHistorial)
      .catch((e) => setError(e.message || "Error al cargar el historial."))
      .finally(() => setCargando(false));
  }, [tiendaId, desde, hasta]);

  return (
    <div className="space-y-6">
      <div className="bg-marca-superficie border border-marca-borde rounded-[3px] p-4 space-y-3">
        <div>
          <label className="block text-marca-tenue text-[10px] uppercase font-bold mb-1">
            Tienda
          </label>
          <select
            value={tiendaId}
            onChange={(e) => setTiendaId(e.target.value)}
            className="w-full p-2.5 bg-marca-fondo border border-marca-borde rounded-[3px] text-marca-texto text-sm outline-none focus:border-marca-rojoclaro"
          >
            <option value="">Selecciona una tienda...</option>
            {tiendas.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nombre}
              </option>
            ))}
          </select>
        </div>
        <SelectorFechas desde={desde} hasta={hasta} onDesde={setDesde} onHasta={setHasta} />
      </div>

      {error && <p className="text-marca-rojoclaro text-sm">{error}</p>}
      {cargando && <p className="text-marca-tenue text-sm animate-pulse">Cargando historial...</p>}

      {!cargando && !tiendaId && (
        <p className="text-marca-tenue text-sm italic">Selecciona una tienda para ver su historial.</p>
      )}

      {!cargando && historial && (
        <div className="space-y-5">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <p className="font-display text-lg text-marca-textofuerte">{historial.tiendaNombre}</p>
              <p className="text-marca-tenue text-xs">
                {historial.totalVisitas} visita(s) en el rango seleccionado
              </p>
            </div>
            <button
              onClick={() => generarPdfHistorialTienda({ ...historial, desde, hasta })}
              className="bg-marca-rojo hover:bg-marca-rojoclaro text-marca-textofuerte font-black py-2 px-4 rounded-[3px] text-[11px] tracking-widest uppercase transition"
            >
              📄 Descargar PDF
            </button>
          </div>

          <div>
            <h4 className="text-xs font-black tracking-widest text-marca-tenue mb-2">
              COLABORADORES QUE VISITARON
            </h4>
            {historial.visitantes.length === 0 ? (
              <p className="text-marca-tenue text-sm italic">Sin visitas registradas.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {historial.visitantes.map((v) => (
                  <span
                    key={v.usuarioNombre}
                    className="bg-marca-fondo border border-marca-borde rounded-full px-3 py-1.5 text-xs"
                  >
                    <span className="text-marca-textofuerte font-bold">{v.usuarioNombre}</span>{" "}
                    <span className="text-marca-tenue">({v.rol})</span>{" "}
                    <span className="text-marca-rojoclaro font-black">×{v.visitas}</span>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div>
            <h4 className="text-xs font-black tracking-widest text-marca-tenue mb-2">
              OBSERVACIONES
            </h4>
            {historial.observaciones.length === 0 ? (
              <p className="text-marca-tenue text-sm italic">Sin observaciones en este rango.</p>
            ) : (
              <div className="space-y-2">
                {historial.observaciones.map((o, i) => (
                  <div key={i} className="bg-marca-superficie border border-marca-borde rounded-[3px] p-4">
                    <p className="text-marca-textofuerte font-bold text-sm">
                      {o.usuarioNombre} <span className="text-marca-tenue font-normal">({o.rol})</span>
                    </p>
                    <p className="text-marca-tenue text-[11px] capitalize mt-1">
                      {formatearFechaLegible(o.fecha)}
                    </p>
                    <p className="text-marca-texto text-sm mt-2">{o.observacion}</p>
                    {o.actividad && (
                      <p className="text-marca-tenue text-[12px] italic mt-1">
                        Actividad: {o.actividad}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function TabPorPersona() {
  const [usuarios, setUsuarios] = useState<UsuarioBasico[]>([]);
  const [usuarioId, setUsuarioId] = useState("");
  const [desde, setDesde] = useState(sumarDias(hoyPeru(), -30));
  const [hasta, setHasta] = useState(hoyPeru());
  const [historial, setHistorial] = useState<HistorialPersona | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    obtenerUsuariosYTiendas().then(({ usuarios }) =>
      setUsuarios(usuarios.filter((u) => u.rol === "supervisor" || u.rol === "capacitador"))
    );
  }, []);

  useEffect(() => {
    if (!usuarioId) {
      setHistorial(null);
      return;
    }
    setCargando(true);
    setError(null);
    obtenerHistorialPersona(usuarioId, desde, hasta)
      .then(setHistorial)
      .catch((e) => setError(e.message || "Error al cargar el historial."))
      .finally(() => setCargando(false));
  }, [usuarioId, desde, hasta]);

  return (
    <div className="space-y-6">
      <div className="bg-marca-superficie border border-marca-borde rounded-[3px] p-4 space-y-3">
        <div>
          <label className="block text-marca-tenue text-[10px] uppercase font-bold mb-1">
            Supervisor / Capacitador
          </label>
          <select
            value={usuarioId}
            onChange={(e) => setUsuarioId(e.target.value)}
            className="w-full p-2.5 bg-marca-fondo border border-marca-borde rounded-[3px] text-marca-texto text-sm outline-none focus:border-marca-rojoclaro"
          >
            <option value="">Selecciona una persona...</option>
            {usuarios.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nombre} ({u.rol})
              </option>
            ))}
          </select>
        </div>
        <SelectorFechas desde={desde} hasta={hasta} onDesde={setDesde} onHasta={setHasta} />
      </div>

      {error && <p className="text-marca-rojoclaro text-sm">{error}</p>}
      {cargando && <p className="text-marca-tenue text-sm animate-pulse">Cargando historial...</p>}

      {!cargando && !usuarioId && (
        <p className="text-marca-tenue text-sm italic">Selecciona una persona para ver su historial.</p>
      )}

      {!cargando && historial && (
        <div className="space-y-5">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <p className="font-display text-lg text-marca-textofuerte">{historial.usuarioNombre}</p>
              <p className="text-marca-tenue text-xs uppercase">{historial.rol}</p>
            </div>
            <button
              onClick={() => generarPdfHistorialPersona({ ...historial, desde, hasta })}
              className="bg-marca-rojo hover:bg-marca-rojoclaro text-marca-textofuerte font-black py-2 px-4 rounded-[3px] text-[11px] tracking-widest uppercase transition"
            >
              📄 Descargar PDF
            </button>
          </div>

          <div className="bg-marca-superficie border border-marca-rojo/25 rounded-[3px] p-4">
            <p className="font-display text-2xl text-marca-textofuerte">{historial.puntos.puntos} pts</p>
            <div className="flex items-center gap-4 mt-2">
              <span className="text-sm">🥉 ×{historial.puntos.medallas.bronce}</span>
              <span className="text-sm">🥈 ×{historial.puntos.medallas.plata}</span>
              <span className="text-sm">🥇 ×{historial.puntos.medallas.oro}</span>
              <span className="text-sm">🌟 ×{historial.puntos.medallas.estrella}</span>
            </div>
          </div>

          <div>
            <h4 className="text-xs font-black tracking-widest text-marca-tenue mb-2">
              MARCACIONES DE ENTRADA / SALIDA
            </h4>
            {historial.marcaciones.length === 0 ? (
              <p className="text-marca-tenue text-sm italic">Sin marcaciones en este rango.</p>
            ) : (
              <div className="space-y-1.5">
                {historial.marcaciones.map((m, i) => (
                  <div
                    key={i}
                    className={`flex items-center justify-between rounded-[3px] p-3 border ${
                      m.tarde
                        ? "border-marca-rojo/40 bg-marca-rojo/10"
                        : "border-marca-borde bg-marca-superficie"
                    }`}
                  >
                    <span className="text-marca-tenue text-xs capitalize">
                      {formatearFechaLegible(m.fecha)}
                    </span>
                    <span className={`text-xs font-bold ${m.tarde ? "text-marca-rojoclaro" : "text-marca-texto"}`}>
                      Ingreso: {m.horaIngreso ? formatearHora(m.horaIngreso) : "—"}
                      {m.tarde ? " (TARDE)" : ""} · Salida:{" "}
                      {m.horaSalida ? formatearHora(m.horaSalida) : "—"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <h4 className="text-xs font-black tracking-widest text-marca-tenue mb-2">
              TIENDAS VISITADAS
            </h4>
            {historial.tiendasVisitadas.length === 0 ? (
              <p className="text-marca-tenue text-sm italic">Sin visitas registradas en este rango.</p>
            ) : (
              <div className="space-y-2">
                {historial.tiendasVisitadas.map((t, i) => (
                  <div key={i} className="bg-marca-superficie border border-marca-borde rounded-[3px] p-4">
                    <p className="text-marca-textofuerte font-bold text-sm">{t.tiendaNombre}</p>
                    <p className="text-marca-tenue text-[11px] capitalize mt-1">
                      {formatearFechaLegible(t.fecha)}
                    </p>
                    <p className="text-marca-texto text-sm mt-2">{t.observacion}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Reportes() {
  const [subpestana, setSubpestana] = useState<SubPestana>("observaciones");

  return (
    <div>
      <div className="flex gap-2 mb-6 overflow-x-auto">
        {SUBPESTANAS.map((p) => (
          <button
            key={p.id}
            onClick={() => setSubpestana(p.id)}
            className={`px-3 py-1.5 rounded-[3px] text-[11px] font-black tracking-widest uppercase transition shrink-0 ${
              subpestana === p.id
                ? "bg-marca-rojo text-marca-textofuerte"
                : "bg-marca-superficie2 border border-marca-borde text-marca-tenue hover:border-marca-rojo/40"
            }`}
          >
            {p.etiqueta}
          </button>
        ))}
      </div>

      {subpestana === "observaciones" && <TabObservaciones />}
      {subpestana === "tienda" && <TabPorTienda />}
      {subpestana === "persona" && <TabPorPersona />}
    </div>
  );
}
