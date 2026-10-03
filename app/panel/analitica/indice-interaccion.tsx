"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { obtenerIndiceInteraccion, type IndiceInteraccion, type KpiInteraccion } from "./interaccion-actions";
import { ContadorNumero } from "../contador-numero";
import EstadoVacio from "../estado-vacio";

const ETIQUETA_ROL: Record<string, string> = {
  supervisor: "Supervisor",
  capacitador: "Capacitador",
  coordinador: "Coordinador",
  gerente: "Gerente",
};

// Convierte una serie diaria en los puntos de una polyline SVG de 0 a 100 de
// ancho y 0 a 24 de alto -- un solo trazo dorado, sin ejes ni grilla (es un
// adorno de tendencia dentro de la tarjeta KPI, no un gráfico aparte).
function puntosChispa(serie: { valor: number }[]): string {
  if (serie.length === 0) return "";
  const max = Math.max(1, ...serie.map((p) => p.valor));
  const paso = serie.length > 1 ? 100 / (serie.length - 1) : 0;
  return serie.map((p, i) => `${(i * paso).toFixed(1)},${(24 - (p.valor / max) * 22).toFixed(1)}`).join(" ");
}

function TarjetaKpi({ titulo, kpi, sufijo }: { titulo: string; kpi: KpiInteraccion; sufijo?: string }) {
  const sube = kpi.deltaPct !== null && kpi.deltaPct >= 0;
  return (
    <div className="bg-marca-superficie p-4">
      <p className="text-marca-tenue text-[10px] uppercase font-bold mb-2">{titulo}</p>
      <div className="flex items-baseline gap-2">
        <p className="font-display text-2xl font-semibold tabular-nums text-marca-textofuerte">
          <ContadorNumero valor={kpi.total} />
          {sufijo ? <span className="text-sm font-normal text-marca-tenue"> {sufijo}</span> : null}
        </p>
        {kpi.deltaPct !== null && (
          <span className={`text-[11px] font-bold ${sube ? "text-emerald-500" : "text-marca-rojoclaro"}`}>
            {sube ? "↑" : "↓"} {Math.abs(kpi.deltaPct)}%
          </span>
        )}
      </div>
      <svg viewBox="0 0 100 24" className="w-full h-6 mt-1.5" preserveAspectRatio="none">
        <polyline
          points={puntosChispa(kpi.serie)}
          fill="none"
          stroke="rgb(var(--marca-oro))"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

export default function IndiceInteraccionVista({ desde, hasta }: { desde: string; hasta: string }) {
  const [datos, setDatos] = useState<IndiceInteraccion | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [abiertoId, setAbiertoId] = useState<string | null>(null);

  useEffect(() => {
    setCargando(true);
    setError(null);
    setAbiertoId(null);
    obtenerIndiceInteraccion(desde, hasta)
      .then(setDatos)
      .catch((e) => setError(e.message || "No se pudo cargar el Índice de Interacción."))
      .finally(() => setCargando(false));
  }, [desde, hasta]);

  const maxPuntaje = useMemo(
    () => Math.max(1, ...(datos?.personas.map((p) => p.puntaje) ?? [0])),
    [datos]
  );

  if (cargando) return <p className="text-marca-tenue text-sm animate-pulse">Cargando Índice de Interacción...</p>;
  if (error) return <p className="text-marca-rojoclaro text-sm">{error}</p>;
  if (!datos) return null;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-xs font-black tracking-widest text-marca-tenue mb-1">ÍNDICE DE INTERACCIÓN</h3>
        <p className="text-marca-tenue text-[11px] mb-4">
          Quién usa más la app en el rango seleccionado -- combina inicios de sesión, historias publicadas y minutos
          conectado. El % de cada tarjeta compara contra el mismo número de días justo antes del rango.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-marca-borde border border-marca-borde rounded-[3px] overflow-hidden">
          <TarjetaKpi titulo="Inicios de sesión" kpi={datos.sesiones} />
          <TarjetaKpi titulo="Historias publicadas" kpi={datos.historias} />
          <TarjetaKpi titulo="Minutos conectados" kpi={datos.minutos} />
        </div>
      </div>

      <div>
        <h3 className="text-xs font-black tracking-widest text-marca-tenue mb-3">RANKING DE INTERACCIÓN</h3>
        {datos.personas.length === 0 ? (
          <EstadoVacio mensaje="Todavía no hay actividad registrada en este rango." />
        ) : (
          <div className="bg-marca-superficie border border-marca-borde rounded-[3px] overflow-hidden">
            {datos.personas.map((p, i) => {
              const abierto = abiertoId === p.usuarioId;
              return (
                <div
                  key={p.usuarioId}
                  className="border-b border-marca-borde last:border-b-0 cursor-pointer"
                  onClick={() => setAbiertoId(abierto ? null : p.usuarioId)}
                >
                  <div className="flex items-center gap-3 px-4 py-2.5">
                    <span className="text-marca-tenue text-[11px] w-4 text-right shrink-0">{i + 1}</span>
                    <span className="text-marca-texto text-[12.5px] font-bold w-32 sm:w-40 shrink-0 truncate">
                      {p.nombre}
                    </span>
                    <div className="flex-1 h-5 rounded bg-marca-superficie2 overflow-hidden">
                      <div
                        className="h-full rounded"
                        style={{
                          width: `${Math.max(2, (p.puntaje / maxPuntaje) * 100)}%`,
                          background: `rgb(var(--marca-oro) / ${Math.max(0.2, p.puntaje / maxPuntaje)})`,
                        }}
                      />
                    </div>
                    <span className="text-marca-textofuerte text-[12px] font-black w-9 text-right shrink-0">
                      {p.puntaje}
                    </span>
                    <ChevronDown
                      className={`w-3.5 h-3.5 text-marca-tenue shrink-0 transition-transform ${abierto ? "rotate-180" : ""}`}
                    />
                  </div>
                  {abierto && (
                    <div
                      className="flex gap-5 text-[10.5px] text-marca-tenue px-4 pb-3 pl-[7.5rem] sm:pl-[9.5rem]"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <span>{ETIQUETA_ROL[p.rol] ?? p.rol}</span>
                      <span>{p.sesiones} sesión{p.sesiones === 1 ? "" : "es"}</span>
                      <span>{p.historias} historia{p.historias === 1 ? "" : "s"}</span>
                      <span>{p.minutos} min conectado</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
