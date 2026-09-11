"use client";

import { useEffect, useMemo, useState } from "react";
import { ResponsiveContainer, BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import {
  obtenerDashboardTiendas,
  type ResumenTiendaDashboard,
  type DashboardTiendas,
} from "./actions";
import { formatearFechaLegible } from "@/lib/fechas";

const COLOR_EJE = "#8b8d92";
const COLOR_GRILLA = "#2a2c31";

const CLASIFICACIONES = ["Excelente", "Bueno", "Requiere mejora", "Acción inmediata"] as const;

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

function colorBarra(promedio: number): string {
  if (promedio >= 90) return "#34d399";
  if (promedio >= 75) return "#38bdf8";
  if (promedio >= 60) return "#fbbf24";
  return "#e23744";
}

type Columna = "tienda" | "visitas" | "fecha" | "porcentaje";

export default function DashboardTiendasVista({ desde, hasta }: { desde: string; hasta: string }) {
  const [datos, setDatos] = useState<DashboardTiendas | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState<string>("todos");
  const [orden, setOrden] = useState<{ columna: Columna; asc: boolean }>({ columna: "tienda", asc: true });

  useEffect(() => {
    setCargando(true);
    setError(null);
    obtenerDashboardTiendas(desde, hasta)
      .then(setDatos)
      .catch((e) => setError(e.message || "No se pudo cargar el dashboard de tiendas."))
      .finally(() => setCargando(false));
  }, [desde, hasta]);

  const resumen = datos?.resumenTiendas ?? [];

  const totales = useMemo(() => {
    let bien = 0;
    let mejora = 0;
    let critico = 0;
    resumen.forEach((t) => {
      if (t.clasificacion === "Excelente" || t.clasificacion === "Bueno") bien++;
      else if (t.clasificacion === "Requiere mejora") mejora++;
      else if (t.clasificacion === "Acción inmediata") critico++;
    });
    return { total: resumen.length, bien, mejora, critico };
  }, [resumen]);

  function alternarOrden(columna: Columna) {
    setOrden((prev) => (prev.columna === columna ? { columna, asc: !prev.asc } : { columna, asc: true }));
  }

  const filas = useMemo(() => {
    let lista = resumen.filter((t) => t.tiendaNombre.toLowerCase().includes(busqueda.trim().toLowerCase()));

    if (filtro === "sin_auditar") {
      lista = lista.filter((t) => !t.clasificacion);
    } else if (filtro !== "todos") {
      lista = lista.filter((t) => t.clasificacion === filtro);
    }

    const factor = orden.asc ? 1 : -1;
    lista = [...lista].sort((a, b) => {
      switch (orden.columna) {
        case "visitas":
          return (a.visitas - b.visitas) * factor;
        case "fecha":
          return (
            (a.ultimaAuditoriaFecha ?? "").localeCompare(b.ultimaAuditoriaFecha ?? "") * factor
          );
        case "porcentaje":
          return ((a.ultimaAuditoriaPorcentaje ?? -1) - (b.ultimaAuditoriaPorcentaje ?? -1)) * factor;
        default:
          return a.tiendaNombre.localeCompare(b.tiendaNombre) * factor;
      }
    });

    return lista;
  }, [resumen, busqueda, filtro, orden]);

  if (cargando) return <p className="text-marca-tenue text-sm animate-pulse">Cargando dashboard de tiendas...</p>;
  if (error) return <p className="text-marca-rojoclaro text-sm">{error}</p>;
  if (!datos) return null;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-marca-borde border border-marca-borde rounded-[3px] overflow-hidden">
        <div className="bg-marca-superficie p-4">
          <p className="text-marca-tenue text-[10px] uppercase font-bold mb-2">Tiendas activas</p>
          <p className="font-display text-2xl font-semibold tabular-nums">{totales.total}</p>
        </div>
        <div className="bg-marca-superficie p-4">
          <p className="text-marca-tenue text-[10px] uppercase font-bold mb-2">Excelente / Bueno</p>
          <p className="font-display text-2xl font-semibold tabular-nums text-emerald-400">{totales.bien}</p>
        </div>
        <div className="bg-marca-superficie p-4">
          <p className="text-marca-tenue text-[10px] uppercase font-bold mb-2">Requiere mejora</p>
          <p className="font-display text-2xl font-semibold tabular-nums text-amber-400">{totales.mejora}</p>
        </div>
        <div className="bg-marca-superficie p-4">
          <p className="text-marca-tenue text-[10px] uppercase font-bold mb-2">Acción inmediata</p>
          <p className="font-display text-2xl font-semibold tabular-nums text-marca-rojoclaro">{totales.critico}</p>
        </div>
      </div>

      <div className="bg-marca-superficie border border-marca-borde rounded-[3px] p-5">
        <h3 className="text-xs font-black tracking-widest text-marca-tenue mb-1">
          PROMEDIO DE AUDITORÍA POR CATEGORÍA
        </h3>
        <p className="text-marca-tenue text-[11px] mb-4">
          De todas las auditorías enviadas en el rango seleccionado, en toda la red.
        </p>
        {datos.promediosPorCategoria.length === 0 ? (
          <p className="text-marca-tenue text-sm italic py-6 text-center">
            No hay auditorías enviadas en este rango de fechas.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={datos.promediosPorCategoria} margin={{ left: -10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={COLOR_GRILLA} />
              <XAxis dataKey="categoria" stroke={COLOR_EJE} tick={{ fontSize: 9.5 }} interval={0} angle={-12} textAnchor="end" height={50} />
              <YAxis stroke={COLOR_EJE} tick={{ fontSize: 10 }} domain={[0, 100]} unit="%" />
              <Tooltip
                contentStyle={{ background: "#18191d", border: "1px solid #2a2c31" }}
                formatter={(v) => [`${v ?? 0}%`, "Promedio"] as [string, string]}
              />
              <Bar dataKey="promedio" radius={[4, 4, 0, 0]}>
                {datos.promediosPorCategoria.map((d, i) => (
                  <Cell key={i} fill={colorBarra(d.promedio)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="bg-marca-superficie border border-marca-borde rounded-[3px] p-5">
        <h3 className="text-xs font-black tracking-widest text-marca-tenue mb-1">TODAS LAS TIENDAS</h3>
        <p className="text-marca-tenue text-[11px] mb-4">
          Ordenable por columna, buscable por nombre, filtrable por clasificación.
        </p>

        <div className="flex flex-wrap items-center gap-2 mb-4">
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar tienda..."
            className="p-2.5 bg-marca-fondo border border-marca-borde rounded-[3px] text-marca-texto text-sm outline-none focus:border-marca-rojoclaro flex-1 min-w-[180px]"
          />
          <button
            onClick={() => setFiltro("todos")}
            className={`px-3 py-1.5 rounded-full text-[11px] font-bold uppercase transition ${
              filtro === "todos"
                ? "bg-marca-rojo text-marca-textofuerte"
                : "bg-marca-superficie2 border border-marca-borde text-marca-tenue hover:border-marca-rojo/40"
            }`}
          >
            Todas
          </button>
          {CLASIFICACIONES.map((c) => (
            <button
              key={c}
              onClick={() => setFiltro(c)}
              className={`px-3 py-1.5 rounded-full text-[11px] font-bold uppercase transition ${
                filtro === c
                  ? "bg-marca-rojo text-marca-textofuerte"
                  : "bg-marca-superficie2 border border-marca-borde text-marca-tenue hover:border-marca-rojo/40"
              }`}
            >
              {c}
            </button>
          ))}
          <button
            onClick={() => setFiltro("sin_auditar")}
            className={`px-3 py-1.5 rounded-full text-[11px] font-bold uppercase transition ${
              filtro === "sin_auditar"
                ? "bg-marca-rojo text-marca-textofuerte"
                : "bg-marca-superficie2 border border-marca-borde text-marca-tenue hover:border-marca-rojo/40"
            }`}
          >
            Sin auditar
          </button>
        </div>

        {filas.length === 0 ? (
          <p className="text-marca-tenue text-sm italic py-6 text-center">No hay tiendas que coincidan.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-marca-borde">
                  <th
                    onClick={() => alternarOrden("tienda")}
                    className="pb-2.5 pr-3 text-[10.5px] uppercase tracking-wide text-marca-tenue font-bold cursor-pointer"
                  >
                    Tienda ↕
                  </th>
                  <th className="pb-2.5 pr-3 text-[10.5px] uppercase tracking-wide text-marca-tenue font-bold">
                    Encargado fijo
                  </th>
                  <th
                    onClick={() => alternarOrden("visitas")}
                    className="pb-2.5 pr-3 text-[10.5px] uppercase tracking-wide text-marca-tenue font-bold cursor-pointer"
                  >
                    Visitas (rango) ↕
                  </th>
                  <th
                    onClick={() => alternarOrden("fecha")}
                    className="pb-2.5 pr-3 text-[10.5px] uppercase tracking-wide text-marca-tenue font-bold cursor-pointer"
                  >
                    Última auditoría ↕
                  </th>
                  <th
                    onClick={() => alternarOrden("porcentaje")}
                    className="pb-2.5 pr-3 text-[10.5px] uppercase tracking-wide text-marca-tenue font-bold cursor-pointer"
                  >
                    Clasificación ↕
                  </th>
                  <th className="pb-2.5 text-[10.5px] uppercase tracking-wide text-marca-tenue font-bold">
                    Alertas
                  </th>
                </tr>
              </thead>
              <tbody>
                {filas.map((t: ResumenTiendaDashboard) => (
                  <tr key={t.tiendaId} className="border-b border-marca-borde/60 last:border-b-0 hover:bg-marca-superficie2 transition">
                    <td className="py-2.5 pr-3 font-bold text-marca-textofuerte whitespace-nowrap">
                      {t.tiendaNombre}
                    </td>
                    <td className="py-2.5 pr-3 text-marca-tenue text-[12.5px]">
                      {t.encargados.length === 0 ? "—" : t.encargados.join(", ")}
                    </td>
                    <td className="py-2.5 pr-3 font-data tabular-nums">{t.visitas}</td>
                    <td className="py-2.5 pr-3 font-data text-[12px] whitespace-nowrap">
                      {t.ultimaAuditoriaFecha ? (
                        <>
                          {formatearFechaLegible(t.ultimaAuditoriaFecha)} · {t.ultimaAuditoriaPorcentaje}%
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="py-2.5 pr-3">
                      {t.clasificacion ? (
                        <span
                          className={`text-[11px] font-bold px-2.5 py-1 rounded-full border whitespace-nowrap ${claseClasificacion(
                            t.clasificacion
                          )}`}
                        >
                          {t.clasificacion}
                        </span>
                      ) : (
                        <span className="text-[11px] text-marca-tenue border border-dashed border-marca-borde px-2.5 py-1 rounded-full">
                          Sin auditar
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 text-marca-rojoclaro font-bold text-[12.5px]">
                      {t.alertasCriticas > 0 ? `🚨 ${t.alertasCriticas}` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
