"use client";

import { Fragment, useEffect, useState } from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Pie, Cell, Legend } from "recharts";
import {
  obtenerAgregadosChecklistVisita,
  obtenerDetalleChecklistVisita,
  obtenerPlantillaChecklistVisita,
  type AgregadosChecklistVisita,
  type ChecklistVisitaDetalle,
  type SeccionChecklist,
} from "../checklist-visita-actions";
import { generarPdfChecklistVisita, type SeccionChecklistVisitaPdf } from "@/lib/generar-pdf";
import { formatearFechaLegible } from "@/lib/fechas";
import { useColoresGrafico } from "@/lib/usar-colores-grafico";

const PALETA = ["#e23744", "#38bdf8", "#fbbf24", "#34d399", "#a78bfa", "#f472b6"];

function formatearValor(tipo: string, valor: any): string {
  if (valor === null || valor === undefined || valor === "") return "—";
  if (tipo === "escala_5") return `${valor}/5`;
  if (tipo === "si_no") return valor === "true" || valor === true ? "Sí" : "No";
  return String(valor);
}

function colorBarraPorcentaje(promedio: number): string {
  if (promedio >= 90) return "#34d399";
  if (promedio >= 75) return "#38bdf8";
  if (promedio >= 60) return "#fbbf24";
  return "#e23744";
}

function claseBadgeClasificacion(clasificacion: string | null): string {
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

function BadgePuntaje({ porcentaje, clasificacion }: { porcentaje: number | null; clasificacion: string | null }) {
  if (porcentaje === null) {
    return <span className="text-[11px] text-marca-tenue border border-dashed border-marca-borde px-2.5 py-1 rounded-full">Sin puntaje</span>;
  }
  return (
    <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full border whitespace-nowrap ${claseBadgeClasificacion(clasificacion)}`}>
      {porcentaje}% · {clasificacion}
    </span>
  );
}

function DetalleChecklist({
  id,
  secciones,
  onCerrar,
}: {
  id: string;
  secciones: SeccionChecklist[];
  onCerrar: () => void;
}) {
  const [detalle, setDetalle] = useState<ChecklistVisitaDetalle | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    obtenerDetalleChecklistVisita(id)
      .then(setDetalle)
      .finally(() => setCargando(false));
  }, [id]);

  async function handleDescargar() {
    if (!detalle) return;
    const seccionesPdf: SeccionChecklistVisitaPdf[] = secciones.map((s) => ({
      titulo: s.titulo,
      items: s.items.map((it) => ({
        etiqueta: it.etiqueta,
        tipo: it.tipo,
        valor: detalle.respuestas[s.clave]?.[it.clave] ?? null,
      })),
    }));
    await generarPdfChecklistVisita({
      tiendaNombre: detalle.tiendaNombre,
      fecha: detalle.fecha,
      usuarioNombre: detalle.usuarioNombre,
      rol: detalle.rol,
      secciones: seccionesPdf,
      porcentaje: detalle.porcentaje,
      clasificacion: detalle.clasificacion,
    });
  }

  return (
    <div className="bg-marca-fondo border border-marca-rojo/30 rounded-[3px] p-4 mt-2 space-y-3">
      {cargando || !detalle ? (
        <p className="text-marca-tenue text-sm animate-pulse">Cargando detalle...</p>
      ) : (
        <>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <p className="text-marca-textofuerte font-bold text-sm">{detalle.tiendaNombre}</p>
              <p className="text-marca-tenue text-[11px]">
                {formatearFechaLegible(detalle.fecha)} · {detalle.usuarioNombre} ({detalle.rol})
              </p>
              <div className="mt-1.5">
                <BadgePuntaje porcentaje={detalle.porcentaje} clasificacion={detalle.clasificacion} />
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <button
                onClick={handleDescargar}
                className="text-marca-rojoclaro hover:text-marca-rojo text-[11px] font-bold uppercase"
              >
                📄 Descargar PDF
              </button>
              <button
                onClick={onCerrar}
                className="text-marca-tenue hover:text-marca-texto text-[11px] font-bold uppercase"
              >
                Cerrar
              </button>
            </div>
          </div>

          <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
            {secciones.map((s) => {
              const respSeccion = detalle.respuestas[s.clave];
              const itemsConValor = s.items.filter(
                (it) => respSeccion?.[it.clave] !== undefined && respSeccion?.[it.clave] !== null && respSeccion?.[it.clave] !== ""
              );
              if (itemsConValor.length === 0) return null;
              return (
                <div key={s.clave}>
                  <p className="text-marca-rojoclaro text-[10.5px] font-black uppercase tracking-wide mb-1">
                    {s.titulo}
                  </p>
                  <div className="space-y-0.5">
                    {itemsConValor.map((it) => (
                      <p key={it.clave} className="text-[12px] flex justify-between gap-2">
                        <span className="text-marca-tenue">{it.etiqueta}</span>
                        <span className="text-marca-texto font-bold text-right">
                          {formatearValor(it.tipo, respSeccion?.[it.clave])}
                        </span>
                      </p>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

export default function ChecklistVisitaAnalitica({
  desde,
  hasta,
  resaltarId,
}: {
  desde: string;
  hasta: string;
  resaltarId?: string | null;
}) {
  const [datos, setDatos] = useState<AgregadosChecklistVisita | null>(null);
  const [secciones, setSecciones] = useState<SeccionChecklist[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detalleAbierto, setDetalleAbierto] = useState<string | null>(resaltarId ?? null);
  const colores = useColoresGrafico();

  useEffect(() => {
    setCargando(true);
    setError(null);
    Promise.all([obtenerAgregadosChecklistVisita(desde, hasta), obtenerPlantillaChecklistVisita()])
      .then(([d, s]) => {
        setDatos(d);
        setSecciones(s);
      })
      .catch((e) => setError(e.message || "No se pudo cargar el checklist de rutina."))
      .finally(() => setCargando(false));
  }, [desde, hasta]);

  if (cargando) return <p className="text-marca-tenue text-sm animate-pulse">Cargando checklist de rutina...</p>;
  if (error) return <p className="text-marca-rojoclaro text-sm">{error}</p>;
  if (!datos) return null;

  return (
    <div className="space-y-6">
      <div className="bg-marca-superficie border border-marca-rojo/30 rounded-[3px] p-5">
        <h3 className="text-xs font-black tracking-widest text-marca-tenue mb-1">
          🎯 PUNTAJE GENERAL POR TIENDA
        </h3>
        <p className="text-marca-tenue text-[11px] mb-4">
          Promedio de todos los checklists enviados en el rango, en base a las preguntas que sí
          cuentan para el puntaje (las de texto libre y algunas de opción no puntúan).
        </p>
        {datos.promedioGeneralPorTienda.length === 0 ? (
          <p className="text-marca-tenue text-sm italic py-6 text-center">
            No hay checklists con puntaje calculable en este rango.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={datos.promedioGeneralPorTienda} margin={{ left: -10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={colores.grilla} />
              <XAxis
                dataKey="tiendaNombre"
                stroke={colores.eje}
                tick={{ fontSize: 9.5 }}
                interval={0}
                angle={-20}
                textAnchor="end"
                height={55}
              />
              <YAxis stroke={colores.eje} tick={{ fontSize: 10 }} domain={[0, 100]} unit="%" />
              <Tooltip
                contentStyle={{ background: colores.superficie, border: `1px solid ${colores.grilla}` }}
                formatter={(v) => [`${v}%`, "Promedio"] as [string, string]}
              />
              <Bar dataKey="promedio" radius={[4, 4, 0, 0]}>
                {datos.promedioGeneralPorTienda.map((d, i) => (
                  <Cell key={i} fill={colorBarraPorcentaje(d.promedio)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="bg-marca-superficie border border-marca-borde rounded-[3px] p-5">
        <h3 className="text-xs font-black tracking-widest text-marca-tenue mb-1">
          📊 PROMEDIO DE CAJA POR TIENDA
        </h3>
        <p className="text-marca-tenue text-[11px] mb-4">
          Promedio de orden + limpieza + organización (escala 1 a 5), de los checklists enviados en el
          rango.
        </p>
        {datos.promedioCajaPorTienda.length === 0 ? (
          <p className="text-marca-tenue text-sm italic py-6 text-center">
            No hay checklists con la sección de Caja llenada en este rango.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={datos.promedioCajaPorTienda} margin={{ left: -10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={colores.grilla} />
              <XAxis
                dataKey="tiendaNombre"
                stroke={colores.eje}
                tick={{ fontSize: 9.5 }}
                interval={0}
                angle={-20}
                textAnchor="end"
                height={55}
              />
              <YAxis stroke={colores.eje} tick={{ fontSize: 10 }} domain={[0, 5]} />
              <Tooltip
                contentStyle={{ background: colores.superficie, border: `1px solid ${colores.grilla}` }}
                formatter={(v) => [`${v}/5`, "Promedio"] as [string, string]}
              />
              <Bar dataKey="promedio" fill="#e23744" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="bg-marca-superficie border border-marca-borde rounded-[3px] p-5">
        <h3 className="text-xs font-black tracking-widest text-marca-tenue mb-1">
          🥧 ESTADO DE LIMPIEZA DE NEVERAS
        </h3>
        <p className="text-marca-tenue text-[11px] mb-4">
          De todos los checklists enviados en el rango, en toda la red.
        </p>
        {datos.distribucionNeveras.length === 0 ? (
          <p className="text-marca-tenue text-sm italic py-6 text-center">
            No hay checklists con la sección de Neveras llenada en este rango.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie
                data={datos.distribucionNeveras}
                dataKey="cantidad"
                nameKey="opcion"
                cx="50%"
                cy="50%"
                outerRadius={80}
                label={(d: any) => `${d.opcion} (${d.cantidad})`}
              >
                {datos.distribucionNeveras.map((_, i) => (
                  <Cell key={i} fill={PALETA[i % PALETA.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ background: colores.superficie, border: `1px solid ${colores.grilla}` }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="bg-marca-superficie border border-marca-borde rounded-[3px] p-5">
        <h3 className="text-xs font-black tracking-widest text-marca-tenue mb-4">
          📋 CHECKLISTS ENVIADOS
        </h3>
        {datos.resumen.length === 0 ? (
          <p className="text-marca-tenue text-sm italic py-6 text-center">
            No hay checklists enviados en este rango de fechas.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-marca-borde">
                  <th className="pb-2.5 pr-3 text-[10.5px] uppercase tracking-wide text-marca-tenue font-bold">
                    Fecha
                  </th>
                  <th className="pb-2.5 pr-3 text-[10.5px] uppercase tracking-wide text-marca-tenue font-bold">
                    Tienda
                  </th>
                  <th className="pb-2.5 pr-3 text-[10.5px] uppercase tracking-wide text-marca-tenue font-bold">
                    Colaborador
                  </th>
                  <th className="pb-2.5 pr-3 text-[10.5px] uppercase tracking-wide text-marca-tenue font-bold">
                    Puntaje
                  </th>
                  <th className="pb-2.5 text-[10.5px] uppercase tracking-wide text-marca-tenue font-bold" />
                </tr>
              </thead>
              <tbody>
                {datos.resumen.map((c) => (
                  <Fragment key={c.id}>
                    <tr className="border-b border-marca-borde/60 hover:bg-marca-superficie2 transition">
                      <td className="py-2.5 pr-3 font-data text-[12.5px] whitespace-nowrap">
                        {formatearFechaLegible(c.fecha)}
                      </td>
                      <td className="py-2.5 pr-3 font-bold text-marca-textofuerte whitespace-nowrap">
                        {c.tiendaNombre}
                      </td>
                      <td className="py-2.5 pr-3 text-marca-tenue text-[12.5px]">
                        {c.usuarioNombre} ({c.rol})
                      </td>
                      <td className="py-2.5 pr-3">
                        <BadgePuntaje porcentaje={c.porcentaje} clasificacion={c.clasificacion} />
                      </td>
                      <td className="py-2.5 text-right">
                        <button
                          onClick={() => setDetalleAbierto(detalleAbierto === c.id ? null : c.id)}
                          className="text-marca-rojoclaro hover:text-marca-rojo text-[11px] font-bold uppercase"
                        >
                          {detalleAbierto === c.id ? "Ocultar" : "Ver detalle"}
                        </button>
                      </td>
                    </tr>
                    {detalleAbierto === c.id && (
                      <tr>
                        <td colSpan={5}>
                          <DetalleChecklist id={c.id} secciones={secciones} onCerrar={() => setDetalleAbierto(null)} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
