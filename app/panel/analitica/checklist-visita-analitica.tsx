"use client";

import { GaleriaEvidencias, fotosGuardadasParaPdf } from "../fotos-evidencia";
import { Fragment, useEffect, useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import {
  FileDown,
  AlertTriangle,
  BarChart3,
  LineChart as LineChartIcon,
  Target,
  Puzzle,
  PieChart as PieChartIcon,
  ClipboardList,
} from "lucide-react";
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

// Paleta de colores distintos por tienda para la torta -- a diferencia de las
// barras (donde el color por umbral de puntaje tiene sentido porque cada
// tienda ya tiene su propia etiqueta en el eje), en una torta dos tiendas con
// puntaje parecido terminarían del mismo color y serían indistinguibles.
const PALETA_TIENDAS = [
  "#e23744",
  "#38bdf8",
  "#fbbf24",
  "#34d399",
  "#a78bfa",
  "#f472b6",
  "#fb923c",
  "#22d3ee",
  "#a3e635",
  "#f43f5e",
];

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
  const [generandoPdf, setGenerandoPdf] = useState(false);

  useEffect(() => {
    obtenerDetalleChecklistVisita(id)
      .then(setDetalle)
      .finally(() => setCargando(false));
  }, [id]);

  async function handleDescargar() {
    if (!detalle || generandoPdf) return;
    setGenerandoPdf(true);
    try {
      await generarPdfConFotos(detalle);
    } finally {
      setGenerandoPdf(false);
    }
  }

  async function generarPdfConFotos(detalle: ChecklistVisitaDetalle) {
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
      fotos: await fotosGuardadasParaPdf(detalle.fotos),
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
                disabled={generandoPdf}
                className="text-marca-rojoclaro hover:text-marca-rojo disabled:opacity-50 text-[11px] font-bold uppercase flex items-center gap-1"
              >
                <FileDown className="w-3.5 h-3.5" /> {generandoPdf ? "Generando..." : "Descargar PDF"}
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
          <GaleriaEvidencias fotos={detalle.fotos} />
        </>
      )}
    </div>
  );
}

const FILTROS_CLASIFICACION = ["Excelente", "Bueno", "Requiere mejora", "Acción inmediata"] as const;

function Kpi({ label, valor, sub, bien }: { label: string; valor: string; sub: string; bien?: boolean }) {
  return (
    <div className="bg-marca-superficie p-4">
      <p className="text-marca-tenue text-[10px] uppercase font-bold mb-2">{label}</p>
      <p className={`font-display text-2xl font-semibold tabular-nums ${bien ? "text-emerald-500" : "text-marca-textofuerte"}`}>
        {valor}
      </p>
      <p className="text-marca-tenue text-[11px] mt-1">{sub}</p>
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
  const [busquedaTienda, setBusquedaTienda] = useState("");
  const [filtroClasificacion, setFiltroClasificacion] = useState<string>("todos");
  const [tiendaEvolucion, setTiendaEvolucion] = useState<string>("");
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

  const filas = datos.resumen.filter((c) => {
    const coincideTienda = c.tiendaNombre.toLowerCase().includes(busquedaTienda.trim().toLowerCase());
    if (!coincideTienda) return false;
    if (filtroClasificacion === "todos") return true;
    if (filtroClasificacion === "sin_puntaje") return c.clasificacion === null;
    return c.clasificacion === filtroClasificacion;
  });

  const tiendasConChecklist = Array.from(new Set(datos.resumen.map((c) => c.tiendaNombre))).sort((a, b) =>
    a.localeCompare(b)
  );
  const tiendaSeleccionada = tiendasConChecklist.includes(tiendaEvolucion)
    ? tiendaEvolucion
    : tiendasConChecklist[0] ?? "";
  const historialTienda = datos.resumen
    .filter((c) => c.tiendaNombre === tiendaSeleccionada && c.porcentaje !== null)
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
  const primerPuntoTienda = historialTienda[0] ?? null;
  const ultimoPuntoTienda = historialTienda[historialTienda.length - 1] ?? null;
  const deltaTienda =
    primerPuntoTienda && ultimoPuntoTienda && primerPuntoTienda.id !== ultimoPuntoTienda.id
      ? (ultimoPuntoTienda.porcentaje as number) - (primerPuntoTienda.porcentaje as number)
      : null;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-marca-borde border border-marca-borde rounded-[3px] overflow-hidden">
        <Kpi label="Checklists" valor={String(datos.totalChecklists)} sub="enviados en el rango" />
        <Kpi
          label="Promedio general"
          valor={datos.promedioGeneral === null ? "—" : `${datos.promedioGeneral}%`}
          sub="de la red"
          bien={datos.promedioGeneral !== null && datos.promedioGeneral >= 75}
        />
        <Kpi label="Acción inmediata" valor={String(datos.totalAccionInmediata)} sub="checklists críticos" />
        <Kpi
          label="Tienda líder"
          valor={datos.tiendaLider ? datos.tiendaLider.tiendaNombre : "—"}
          sub={datos.tiendaLider ? `${datos.tiendaLider.promedio}% de promedio` : "sin puntaje"}
        />
      </div>

      {datos.alertasCriticas.length > 0 && (
        <div className="bg-marca-rojo/10 border border-marca-rojo/40 rounded-[3px] p-5">
          <h3 className="text-xs font-black tracking-widest text-marca-tenue mb-1 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-marca-rojoclaro" /> ALERTAS CRÍTICAS — CHECKLISTS EN
            ACCIÓN INMEDIATA
          </h3>
          <p className="text-marca-tenue text-[11px] mb-4">
            Menos del 60% de puntaje — conviene revisar estas tiendas cuanto antes.
          </p>
          <div className="space-y-2">
            {datos.alertasCriticas.map((a) => (
              <div
                key={a.id}
                className="flex items-center justify-between flex-wrap gap-2 bg-marca-fondo border border-marca-rojo/30 rounded-[3px] p-3"
              >
                <div>
                  <p className="text-marca-textofuerte font-semibold text-sm">{a.tiendaNombre}</p>
                  <p className="text-marca-tenue text-[11px] capitalize">
                    {formatearFechaLegible(a.fecha)} · {a.usuarioNombre}
                  </p>
                </div>
                <span className="text-marca-rojoclaro font-black text-sm shrink-0">{a.porcentaje}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-marca-superficie border border-marca-borde rounded-[3px] p-5">
        <h3 className="text-xs font-black tracking-widest text-marca-tenue mb-1 flex items-center gap-1.5">
          <BarChart3 className="w-3.5 h-3.5 text-marca-rojoclaro" /> CHECKLISTS POR DÍA
        </h3>
        <p className="text-marca-tenue text-[11px] mb-4">Actividad en el rango seleccionado, en toda la red.</p>
        {datos.checklistsPorDia.length === 0 ? (
          <p className="text-marca-tenue text-sm italic py-6 text-center">
            No hay checklists enviados en este rango de fechas.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={datos.checklistsPorDia}>
              <CartesianGrid strokeDasharray="3 3" stroke={colores.grilla} />
              <XAxis dataKey="fecha" stroke={colores.eje} tick={{ fontSize: 10 }} tickFormatter={(v) => v.slice(5)} />
              <YAxis stroke={colores.eje} tick={{ fontSize: 10 }} allowDecimals={false} />
              <Tooltip
                contentStyle={{ background: colores.superficie, border: `1px solid ${colores.grilla}` }}
                labelFormatter={(v) => formatearFechaLegible(String(v))}
              />
              <Bar dataKey="cantidad" name="Checklists" fill="#e23744" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="bg-marca-superficie border border-marca-borde rounded-[3px] p-5">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-1">
          <h3 className="text-xs font-black tracking-widest text-marca-tenue flex items-center gap-1.5">
            <LineChartIcon className="w-3.5 h-3.5 text-marca-rojoclaro" /> EVOLUCIÓN DE UNA TIENDA
          </h3>
          {tiendasConChecklist.length > 0 && (
            <select
              value={tiendaSeleccionada}
              onChange={(e) => setTiendaEvolucion(e.target.value)}
              className="p-2 bg-marca-fondo border border-marca-borde rounded-[3px] text-marca-texto text-xs outline-none focus:border-marca-rojoclaro"
            >
              {tiendasConChecklist.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          )}
        </div>
        <p className="text-marca-tenue text-[11px] mb-4">
          Puntaje de cada checklist enviado a esa tienda en el rango, en orden — así se ve si va
          mejorando o empeorando, sin importar cada cuánto se le hace.
        </p>
        {historialTienda.length === 0 ? (
          <p className="text-marca-tenue text-sm italic py-6 text-center">
            Esta tienda no tiene checklists con puntaje calculable en este rango.
          </p>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={historialTienda} margin={{ left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={colores.grilla} />
                <XAxis
                  dataKey="fecha"
                  stroke={colores.eje}
                  tick={{ fontSize: 10 }}
                  tickFormatter={(v) => formatearFechaLegible(v).slice(0, 12)}
                />
                <YAxis stroke={colores.eje} tick={{ fontSize: 10 }} domain={[0, 100]} unit="%" />
                <Tooltip
                  contentStyle={{ background: colores.superficie, border: `1px solid ${colores.grilla}` }}
                  labelFormatter={(v) => formatearFechaLegible(String(v))}
                  formatter={(v: any, _n: any, item: any) => [
                    `${v}% (${item.payload.usuarioNombre})`,
                    "Puntaje",
                  ]}
                />
                <Line
                  type="monotone"
                  dataKey="porcentaje"
                  stroke="#e23744"
                  strokeWidth={2}
                  dot={(props: any) => {
                    const { cx, cy, payload, key } = props;
                    return (
                      <circle
                        key={key}
                        cx={cx}
                        cy={cy}
                        r={5}
                        fill={colorBarraPorcentaje(payload.porcentaje)}
                        stroke={colores.superficie}
                        strokeWidth={1.5}
                      />
                    );
                  }}
                />
              </LineChart>
            </ResponsiveContainer>
            {deltaTienda !== null && (
              <div className="mt-3 bg-marca-superficie2 border border-marca-borde rounded-[3px] px-3.5 py-2.5 text-[12.5px] text-marca-tenue leading-relaxed">
                <span className="text-marca-textofuerte font-semibold">{tiendaSeleccionada}</span>{" "}
                {deltaTienda >= 0 ? "subió" : "bajó"}{" "}
                <span className={deltaTienda >= 0 ? "text-emerald-400 font-semibold" : "text-marca-rojoclaro font-semibold"}>
                  {Math.abs(deltaTienda)} puntos
                </span>{" "}
                desde su primer checklist en el rango ({formatearFechaLegible(primerPuntoTienda!.fecha)},{" "}
                {primerPuntoTienda!.porcentaje}%) hasta el más reciente ({formatearFechaLegible(ultimoPuntoTienda!.fecha)}
                , {ultimoPuntoTienda!.porcentaje}%).
              </div>
            )}
          </>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-marca-superficie border border-marca-rojo/30 rounded-[3px] p-5">
          <h3 className="text-xs font-black tracking-widest text-marca-tenue mb-1 flex items-center gap-1.5">
            <Target className="w-3.5 h-3.5 text-marca-rojoclaro" /> PUNTAJE GENERAL POR TIENDA
          </h3>
          <p className="text-marca-tenue text-[11px] mb-4">
            Promedio de todos los checklists enviados en el rango, en base a las preguntas que sí
            cuentan para el puntaje.
          </p>
          {datos.promedioGeneralPorTienda.length === 0 ? (
            <p className="text-marca-tenue text-sm italic py-6 text-center">
              No hay checklists con puntaje calculable en este rango.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
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
          <h3 className="text-xs font-black tracking-widest text-marca-tenue mb-1 flex items-center gap-1.5">
            <Puzzle className="w-3.5 h-3.5 text-marca-rojoclaro" /> PROMEDIO POR SECCIÓN
          </h3>
          <p className="text-marca-tenue text-[11px] mb-4">
            Qué área del negocio está mejor o peor, en toda la red, en el rango seleccionado.
          </p>
          {datos.promedioPorSeccion.length === 0 ? (
            <p className="text-marca-tenue text-sm italic py-6 text-center">
              No hay preguntas puntuables respondidas en este rango.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={datos.promedioPorSeccion} layout="vertical" margin={{ left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={colores.grilla} />
                <XAxis type="number" domain={[0, 100]} unit="%" stroke={colores.eje} tick={{ fontSize: 10 }} />
                <YAxis
                  type="category"
                  dataKey="seccion"
                  stroke={colores.eje}
                  tick={{ fontSize: 10 }}
                  width={140}
                />
                <Tooltip
                  contentStyle={{ background: colores.superficie, border: `1px solid ${colores.grilla}` }}
                  formatter={(v) => [`${v}%`, "Promedio"] as [string, string]}
                />
                <Bar dataKey="promedio" radius={[0, 4, 4, 0]}>
                  {datos.promedioPorSeccion.map((d, i) => (
                    <Cell key={i} fill={colorBarraPorcentaje(d.promedio)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="bg-marca-superficie border border-marca-borde rounded-[3px] p-5">
        <h3 className="text-xs font-black tracking-widest text-marca-tenue mb-1 flex items-center gap-1.5">
          <PieChartIcon className="w-3.5 h-3.5 text-marca-rojoclaro" /> PUNTAJE POR TIENDA
        </h3>
        <p className="text-marca-tenue text-[11px] mb-4">
          Cada porción es una tienda, de tamaño según su puntaje promedio en el rango — un color
          distinto por tienda para diferenciarlas de un vistazo.
        </p>
        {datos.promedioGeneralPorTienda.length === 0 ? (
          <p className="text-marca-tenue text-sm italic py-6 text-center">
            No hay checklists con puntaje calculable en este rango.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={320}>
            <PieChart>
              <Pie
                data={datos.promedioGeneralPorTienda}
                dataKey="promedio"
                nameKey="tiendaNombre"
                cx="50%"
                cy="50%"
                outerRadius={110}
                label={(d: any) => `${d.tiendaNombre} (${d.promedio}%)`}
              >
                {datos.promedioGeneralPorTienda.map((d, i) => (
                  <Cell key={i} fill={PALETA_TIENDAS[i % PALETA_TIENDAS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ background: colores.superficie, border: `1px solid ${colores.grilla}` }}
                formatter={(v) => [`${v}%`, "Puntaje"] as [string, string]}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="bg-marca-superficie border border-marca-borde rounded-[3px] p-5">
        <h3 className="text-xs font-black tracking-widest text-marca-tenue mb-4 flex items-center gap-1.5">
          <ClipboardList className="w-3.5 h-3.5 text-marca-rojoclaro" /> CHECKLISTS ENVIADOS
        </h3>

        <div className="flex flex-wrap items-center gap-2 mb-4">
          <input
            value={busquedaTienda}
            onChange={(e) => setBusquedaTienda(e.target.value)}
            placeholder="Buscar tienda..."
            className="p-2.5 bg-marca-fondo border border-marca-borde rounded-[3px] text-marca-texto text-sm outline-none focus:border-marca-rojoclaro flex-1 min-w-[180px]"
          />
          <button
            onClick={() => setFiltroClasificacion("todos")}
            className={`px-3 py-1.5 rounded-full text-[11px] font-bold uppercase transition ${
              filtroClasificacion === "todos"
                ? "bg-marca-rojo text-marca-textofuerte"
                : "bg-marca-superficie2 border border-marca-borde text-marca-tenue hover:border-marca-rojo/40"
            }`}
          >
            Todos
          </button>
          {FILTROS_CLASIFICACION.map((c) => (
            <button
              key={c}
              onClick={() => setFiltroClasificacion(c)}
              className={`px-3 py-1.5 rounded-full text-[11px] font-bold uppercase transition ${
                filtroClasificacion === c
                  ? "bg-marca-rojo text-marca-textofuerte"
                  : "bg-marca-superficie2 border border-marca-borde text-marca-tenue hover:border-marca-rojo/40"
              }`}
            >
              {c}
            </button>
          ))}
          <button
            onClick={() => setFiltroClasificacion("sin_puntaje")}
            className={`px-3 py-1.5 rounded-full text-[11px] font-bold uppercase transition ${
              filtroClasificacion === "sin_puntaje"
                ? "bg-marca-rojo text-marca-textofuerte"
                : "bg-marca-superficie2 border border-marca-borde text-marca-tenue hover:border-marca-rojo/40"
            }`}
          >
            Sin puntaje
          </button>
        </div>

        {filas.length === 0 ? (
          <p className="text-marca-tenue text-sm italic py-6 text-center">
            No hay checklists que coincidan en este rango de fechas.
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
                {filas.map((c) => (
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
