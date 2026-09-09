"use client";

import { useEffect, useState } from "react";
import {
  obtenerTodasLasAuditorias,
  obtenerMisAuditorias,
  obtenerDetalleAuditoria,
  type AuditoriaResumen,
  type DetalleAuditoria,
} from "./actions";
import { formatearFechaLegible } from "@/lib/fechas";

function claseClasificacion(clasificacion: string): string {
  switch (clasificacion) {
    case "Excelente":
      return "bg-emerald-950/30 border-emerald-700/40 text-emerald-300";
    case "Bueno":
      return "bg-sky-950/30 border-sky-700/40 text-sky-300";
    case "Requiere mejora":
      return "bg-amber-950/30 border-amber-700/40 text-amber-300";
    default:
      return "bg-marca-rojo/15 border-marca-rojo/40 text-marca-rojoclaro";
  }
}

export default function HistorialAuditorias({ modo }: { modo: "todas" | "propias" }) {
  const [filas, setFilas] = useState<AuditoriaResumen[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detalle, setDetalle] = useState<DetalleAuditoria | null>(null);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);

  function cargar() {
    setCargando(true);
    const fn = modo === "todas" ? obtenerTodasLasAuditorias : obtenerMisAuditorias;
    fn()
      .then(setFilas)
      .catch((e) => setError(e.message || "Error al cargar auditorías."))
      .finally(() => setCargando(false));
  }

  useEffect(cargar, [modo]);

  async function abrirDetalle(id: string) {
    setCargandoDetalle(true);
    try {
      const d = await obtenerDetalleAuditoria(id);
      setDetalle(d);
    } catch (e: any) {
      setError(e.message || "No se pudo abrir la auditoría.");
    } finally {
      setCargandoDetalle(false);
    }
  }

  if (cargando) return <p className="text-marca-tenue text-sm animate-pulse">Cargando auditorías...</p>;

  return (
    <div className="space-y-3">
      {error && <p className="text-marca-rojoclaro text-xs font-bold">{error}</p>}
      {filas.length === 0 ? (
        <p className="text-marca-tenue text-sm italic">
          {modo === "todas"
            ? "No hay auditorías registradas todavía."
            : "Todavía no has enviado ninguna auditoría."}
        </p>
      ) : (
        <div className="space-y-2">
          {filas.map((f) => (
            <button
              key={f.id}
              onClick={() => abrirDetalle(f.id)}
              className="w-full text-left flex items-center justify-between flex-wrap gap-2 bg-marca-superficie border border-marca-borde rounded-[3px] p-4 hover:border-marca-rojo/40 transition"
            >
              <div>
                <p className="text-marca-textofuerte font-bold text-sm">{f.tiendaNombre}</p>
                <p className="text-marca-tenue text-[11px] font-data capitalize">
                  {formatearFechaLegible(f.fecha)} · {f.supervisorNombre}
                </p>
                {f.alertas.length > 0 && (
                  <p className="text-marca-rojoclaro text-[11px] font-bold mt-1">
                    🚨 {f.alertas.length} alerta{f.alertas.length === 1 ? "" : "s"} crítica
                    {f.alertas.length === 1 ? "" : "s"}
                  </p>
                )}
              </div>
              <span
                className={`text-xs font-black px-3 py-1.5 rounded-full border whitespace-nowrap ${claseClasificacion(
                  f.clasificacion
                )}`}
              >
                {f.porcentaje}% · {f.clasificacion}
              </span>
            </button>
          ))}
        </div>
      )}

      {(detalle || cargandoDetalle) && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center p-5 z-50"
          onClick={() => setDetalle(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl max-h-[85vh] overflow-y-auto bg-marca-superficie border border-marca-borde rounded-[3px] p-6 space-y-5"
          >
            {cargandoDetalle && !detalle ? (
              <p className="text-marca-tenue text-sm animate-pulse">Cargando...</p>
            ) : detalle ? (
              <>
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <p className="font-display text-lg text-marca-textofuerte">{detalle.tiendaNombre}</p>
                    <p className="text-marca-tenue text-xs capitalize">
                      {formatearFechaLegible(detalle.fecha)} · Auditor: {detalle.supervisorNombre}
                      {detalle.lider ? ` · Líder: ${detalle.lider}` : ""}
                    </p>
                  </div>
                  <span
                    className={`text-xs font-black px-3 py-1.5 rounded-full border whitespace-nowrap ${claseClasificacion(
                      detalle.clasificacion
                    )}`}
                  >
                    {detalle.puntajeTotal}/{detalle.puntajeMaximo} pts · {detalle.porcentaje}%
                  </span>
                </div>

                {detalle.alertas.length > 0 && (
                  <div className="bg-marca-rojo/10 border border-marca-rojo/40 rounded-[3px] p-3">
                    <p className="text-marca-rojoclaro text-xs font-black uppercase mb-1">
                      🚨 Alertas críticas
                    </p>
                    {detalle.alertas.map((a) => (
                      <p key={a} className="text-marca-texto text-sm">
                        • {a}
                      </p>
                    ))}
                  </div>
                )}

                {Array.from(new Set(detalle.items.map((i) => i.categoria))).map((cat) => (
                  <div key={cat}>
                    <p className="text-marca-tenue text-[11px] font-black uppercase tracking-wide mb-1">
                      {cat}
                    </p>
                    <div className="space-y-1">
                      {detalle.items
                        .filter((i) => i.categoria === cat)
                        .map((i, idx) => (
                          <div key={idx} className="flex items-center justify-between text-sm gap-2">
                            <span className="text-marca-texto">{i.item}</span>
                            <span
                              className={
                                i.puntaje === 2
                                  ? "text-emerald-400 shrink-0"
                                  : i.puntaje === 1
                                  ? "text-amber-400 shrink-0"
                                  : "text-marca-rojoclaro shrink-0"
                              }
                            >
                              {i.puntaje === 2 ? "Cumple" : i.puntaje === 1 ? "Parcial" : "No cumple"}
                            </span>
                          </div>
                        ))}
                    </div>
                    {detalle.observaciones[cat] && (
                      <p className="text-marca-tenue text-xs italic mt-1">
                        Obs: {detalle.observaciones[cat]}
                      </p>
                    )}
                  </div>
                ))}

                {detalle.fortalezas && (
                  <div>
                    <p className="text-marca-tenue text-[11px] font-black uppercase mb-1">Fortalezas</p>
                    <p className="text-marca-texto text-sm">{detalle.fortalezas}</p>
                  </div>
                )}
                {detalle.oportunidades && (
                  <div>
                    <p className="text-marca-tenue text-[11px] font-black uppercase mb-1">
                      Oportunidades de mejora
                    </p>
                    <p className="text-marca-texto text-sm">{detalle.oportunidades}</p>
                  </div>
                )}
                {detalle.compromisos.length > 0 && (
                  <div>
                    <p className="text-marca-tenue text-[11px] font-black uppercase mb-1">Compromisos</p>
                    <div className="space-y-1">
                      {detalle.compromisos.map((c, i) => (
                        <p key={i} className="text-marca-texto text-sm">
                          • {c.accion}{" "}
                          <span className="text-marca-tenue">
                            {c.responsable}
                            {c.fecha ? ` (${formatearFechaLegible(c.fecha)})` : ""}
                          </span>
                        </p>
                      ))}
                    </div>
                  </div>
                )}

                <button
                  onClick={() => setDetalle(null)}
                  className="w-full bg-marca-superficie2 border border-marca-borde text-marca-tenue py-2.5 rounded-[3px] text-xs font-bold uppercase hover:text-marca-texto transition"
                >
                  Cerrar
                </button>
              </>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
