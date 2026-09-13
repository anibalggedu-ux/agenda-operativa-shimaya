"use server";

import { supabaseServer } from "@/lib/supabase-server";
import { obtenerSesion } from "@/lib/session";
import { hoyPeru, calcularAntiguedad, diasEntreFechas, sumarDias, formatearFechaCorta } from "@/lib/fechas";

async function exigirSesion() {
  const sesion = await obtenerSesion();
  if (!sesion) throw new Error("No autorizado.");
  return sesion;
}

// Umbral de tardanza al marcar ingreso: cada rol tiene su propia hora límite.
const HORA_LIMITE_POR_ROL: Record<string, string> = {
  capacitador: "11:00:00",
  supervisor: "12:00:00",
};

export type ReportesPorDia = { fecha: string; cantidad: number };

export async function obtenerReportesPorDia(
  desde: string,
  hasta: string
): Promise<ReportesPorDia[]> {
  await exigirSesion();
  const supabase = supabaseServer();

  const { data, error } = await supabase
    .from("rutas_diarias")
    .select("fecha")
    .gte("fecha", desde)
    .lte("fecha", hasta);

  if (error) throw new Error("No se pudo cargar los reportes por día.");

  const conteo = new Map<string, number>();
  (data ?? []).forEach((r) => {
    conteo.set(r.fecha, (conteo.get(r.fecha) ?? 0) + 1);
  });

  return Array.from(conteo.entries())
    .map(([fecha, cantidad]) => ({ fecha, cantidad }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
}

export type DesempenoPersona = { nombre: string; rol: string; reportes: number };

export async function obtenerDesempenoPorPersona(
  desde: string,
  hasta: string
): Promise<DesempenoPersona[]> {
  await exigirSesion();
  const supabase = supabaseServer();

  const { data, error } = await supabase
    .from("rutas_diarias")
    .select("fecha, usuario_id, tienda_id, rol, usuarios(nombre)")
    .gte("fecha", desde)
    .lte("fecha", hasta);

  if (error) throw new Error("No se pudo cargar el desempeño por persona.");

  // Reportes duplicados de la misma persona para la misma tienda el mismo día
  // cuentan como UNA sola visita, no varias (mismo criterio que en Coordinador).
  const visitasUnicas = new Map<string, any>();
  (data ?? []).forEach((r: any) => {
    const clave = `${r.usuario_id}|${r.tienda_id}|${r.fecha}`;
    if (!visitasUnicas.has(clave)) visitasUnicas.set(clave, r);
  });

  const conteo = new Map<string, { nombre: string; rol: string; reportes: number }>();
  visitasUnicas.forEach((r: any) => {
    const nombre = r.usuarios?.nombre ?? "—";
    const existente = conteo.get(nombre);
    if (existente) existente.reportes += 1;
    else conteo.set(nombre, { nombre, rol: r.rol ?? "—", reportes: 1 });
  });

  return Array.from(conteo.values()).sort((a, b) => b.reportes - a.reportes);
}

export type RankingTardanza = { nombre: string; rol: string; tardanzas: number };

export async function obtenerRankingTardanzas(
  desde: string,
  hasta: string
): Promise<RankingTardanza[]> {
  await exigirSesion();
  const supabase = supabaseServer();

  const { data, error } = await supabase
    .from("asistencia")
    .select("fecha, hora_ingreso, usuarios(nombre, rol)")
    .gte("fecha", desde)
    .lte("fecha", hasta)
    .not("hora_ingreso", "is", null);

  if (error) throw new Error("No se pudo cargar el ranking de tardanzas.");

  const conteo = new Map<string, { nombre: string; rol: string; tardanzas: number }>();
  (data ?? []).forEach((r: any) => {
    const rol = r.usuarios?.rol as string | undefined;
    if (!rol || !r.hora_ingreso) return;
    const limite = HORA_LIMITE_POR_ROL[rol];
    if (!limite) return;
    if (r.hora_ingreso <= limite) return;

    const nombre = r.usuarios?.nombre ?? "—";
    const existente = conteo.get(nombre);
    if (existente) existente.tardanzas += 1;
    else conteo.set(nombre, { nombre, rol, tardanzas: 1 });
  });

  return Array.from(conteo.values()).sort((a, b) => b.tardanzas - a.tardanzas);
}

export type RankingPuntualidad = { nombre: string; rol: string; cantidad: number };

export async function obtenerRankingPuntualidad(
  desde: string,
  hasta: string
): Promise<RankingPuntualidad[]> {
  await exigirSesion();
  const supabase = supabaseServer();

  const { data, error } = await supabase
    .from("asistencia")
    .select("fecha, hora_ingreso, usuarios(nombre, rol)")
    .gte("fecha", desde)
    .lte("fecha", hasta)
    .not("hora_ingreso", "is", null);

  if (error) throw new Error("No se pudo cargar el ranking de puntualidad.");

  const conteo = new Map<string, { nombre: string; rol: string; cantidad: number }>();
  (data ?? []).forEach((r: any) => {
    const rol = r.usuarios?.rol as string | undefined;
    if (!rol || !r.hora_ingreso) return;
    const limite = HORA_LIMITE_POR_ROL[rol];
    if (!limite) return;
    if (r.hora_ingreso > limite) return; // llegó tarde, no cuenta como puntual

    const nombre = r.usuarios?.nombre ?? "—";
    const existente = conteo.get(nombre);
    if (existente) existente.cantidad += 1;
    else conteo.set(nombre, { nombre, rol, cantidad: 1 });
  });

  return Array.from(conteo.values()).sort((a, b) => b.cantidad - a.cantidad);
}

// ---------- Visitas a tiendas (ranking + tardanzas + reporte por tienda) ----------
//
// Una "visita" cuenta desde dos fuentes, sin duplicar (mismo criterio que en
// el panel del Coordinador): reportes con observación ya enviados en
// rutas_diarias, y asignaciones en rutas_activas que todavía no tienen un
// reporte para ese mismo usuario+tienda+fecha.

export type VisitaAnalitica = {
  fecha: string;
  tiendaId: string;
  usuarioId: string;
  usuarioNombre: string;
  rol: string;
  tieneObservacion: boolean;
  // Tienda desde la que se hizo el viaje, cuando la asignación fue una
  // auto-asignación de último momento hecha estando en otra tienda — null
  // significa que el viaje sale del domicilio del colaborador (caso normal).
  origenTiendaId: string | null;
};

export async function obtenerVisitasEnRangoAnalitica(
  desde: string,
  hasta: string,
  tiendaId?: string
): Promise<VisitaAnalitica[]> {
  const supabase = supabaseServer();

  let consultaReportes = supabase
    .from("rutas_diarias")
    .select("fecha, tienda_id, usuario_id, rol, origen_tienda_id, usuarios(nombre)")
    .gte("fecha", desde)
    .lte("fecha", hasta);
  if (tiendaId) consultaReportes = consultaReportes.eq("tienda_id", tiendaId);

  let consultaAsignaciones = supabase
    .from("rutas_activas")
    .select("fecha_planificada, tienda_id, usuario_id, origen_tienda_id, usuarios(nombre, rol)")
    .gte("fecha_planificada", desde)
    .lte("fecha_planificada", hasta);
  if (tiendaId) consultaAsignaciones = consultaAsignaciones.eq("tienda_id", tiendaId);

  const [{ data: reportes, error: errorReportes }, { data: asignaciones, error: errorAsignaciones }] =
    await Promise.all([consultaReportes, consultaAsignaciones]);

  if (errorReportes || errorAsignaciones) {
    throw new Error("No se pudo cargar las visitas.");
  }

  const reportesUnicos = new Map<string, any>();
  (reportes ?? []).forEach((r: any) => {
    const clave = `${r.usuario_id}|${r.tienda_id}|${r.fecha}`;
    if (!reportesUnicos.has(clave)) reportesUnicos.set(clave, r);
  });

  const clavesReportadas = new Set(reportesUnicos.keys());

  const visitas: VisitaAnalitica[] = Array.from(reportesUnicos.values()).map((r: any) => ({
    fecha: r.fecha,
    tiendaId: r.tienda_id,
    usuarioId: r.usuario_id,
    usuarioNombre: r.usuarios?.nombre ?? "—",
    rol: r.rol ?? "—",
    tieneObservacion: true,
    origenTiendaId: r.origen_tienda_id ?? null,
  }));

  (asignaciones ?? []).forEach((a: any) => {
    const clave = `${a.usuario_id}|${a.tienda_id}|${a.fecha_planificada}`;
    if (clavesReportadas.has(clave)) return; // ya contada vía el reporte
    visitas.push({
      fecha: a.fecha_planificada,
      tiendaId: a.tienda_id,
      usuarioId: a.usuario_id,
      usuarioNombre: a.usuarios?.nombre ?? "—",
      rol: a.usuarios?.rol ?? "—",
      tieneObservacion: false,
      origenTiendaId: a.origen_tienda_id ?? null,
    });
  });

  return visitas;
}

export type RankingTiendaCompleto = { tiendaId: string; tiendaNombre: string; visitas: number };

export type RankingTiendasCompleto = {
  top20: RankingTiendaCompleto[];
  resto: RankingTiendaCompleto[];
  sinVisitas: RankingTiendaCompleto[];
};

export async function obtenerRankingTiendasCompleto(
  desde: string,
  hasta: string
): Promise<RankingTiendasCompleto> {
  await exigirSesion();
  const supabase = supabaseServer();

  const [{ data: tiendas, error: errorTiendas }, visitas] = await Promise.all([
    supabase.from("tiendas").select("id, nombre").order("nombre"),
    obtenerVisitasEnRangoAnalitica(desde, hasta),
  ]);

  if (errorTiendas) throw new Error("No se pudo cargar el ranking de tiendas.");

  const conteo = new Map<string, number>();
  visitas.forEach((v) => {
    conteo.set(v.tiendaId, (conteo.get(v.tiendaId) ?? 0) + 1);
  });

  const ranking = (tiendas ?? [])
    .map((t) => ({ tiendaId: t.id, tiendaNombre: t.nombre, visitas: conteo.get(t.id) ?? 0 }))
    .sort((a, b) => b.visitas - a.visitas);

  const conVisitas = ranking.filter((r) => r.visitas > 0);
  const sinVisitas = ranking.filter((r) => r.visitas === 0);

  return {
    top20: conVisitas.slice(0, 20),
    resto: conVisitas.slice(20),
    sinVisitas,
  };
}

export type VisitaTiendaDetalle = {
  fecha: string;
  usuarioNombre: string;
  rol: string;
  tieneObservacion: boolean;
};

export async function obtenerVisitasTiendaDetalle(
  tiendaId: string,
  desde: string,
  hasta: string
): Promise<VisitaTiendaDetalle[]> {
  await exigirSesion();
  const visitas = await obtenerVisitasEnRangoAnalitica(desde, hasta, tiendaId);
  return visitas
    .map((v) => ({
      fecha: v.fecha,
      usuarioNombre: v.usuarioNombre,
      rol: v.rol,
      tieneObservacion: v.tieneObservacion,
    }))
    .sort((a, b) => b.fecha.localeCompare(a.fecha));
}

// ---------- Tiendas por tardanzas ----------

export type ColaboradorVisitaTienda = {
  usuarioNombre: string;
  rol: string;
  fecha: string;
  tarde: boolean;
};

export type TiendaConTardanzas = {
  tiendaId: string;
  tiendaNombre: string;
  totalVisitas: number;
  visitantes: ColaboradorVisitaTienda[];
  cantidadTarde: number;
  visitantesTarde: ColaboradorVisitaTienda[];
};

export async function obtenerTiendasPorTardanzas(
  desde: string,
  hasta: string
): Promise<TiendaConTardanzas[]> {
  await exigirSesion();
  const supabase = supabaseServer();

  const [{ data: tiendas, error: errorTiendas }, visitas, { data: asistencia, error: errorAsistencia }] =
    await Promise.all([
      supabase.from("tiendas").select("id, nombre").order("nombre"),
      obtenerVisitasEnRangoAnalitica(desde, hasta),
      supabase
        .from("asistencia")
        .select("usuario_id, fecha, hora_ingreso")
        .gte("fecha", desde)
        .lte("fecha", hasta),
    ]);

  if (errorTiendas || errorAsistencia) {
    throw new Error("No se pudo cargar las tardanzas por tienda.");
  }

  const horaIngresoPorClave = new Map<string, string | null>();
  (asistencia ?? []).forEach((a: any) => {
    horaIngresoPorClave.set(`${a.usuario_id}|${a.fecha}`, a.hora_ingreso);
  });

  function esTarde(usuarioId: string, fecha: string, rol: string): boolean {
    const limite = HORA_LIMITE_POR_ROL[rol];
    if (!limite) return false;
    const horaIngreso = horaIngresoPorClave.get(`${usuarioId}|${fecha}`);
    return !!horaIngreso && horaIngreso > limite;
  }

  const porTienda = new Map<string, TiendaConTardanzas>();
  (tiendas ?? []).forEach((t) => {
    porTienda.set(t.id, {
      tiendaId: t.id,
      tiendaNombre: t.nombre,
      totalVisitas: 0,
      visitantes: [],
      cantidadTarde: 0,
      visitantesTarde: [],
    });
  });

  visitas.forEach((v) => {
    const tienda = porTienda.get(v.tiendaId);
    if (!tienda) return;
    const tarde = esTarde(v.usuarioId, v.fecha, v.rol);
    const entrada: ColaboradorVisitaTienda = {
      usuarioNombre: v.usuarioNombre,
      rol: v.rol,
      fecha: v.fecha,
      tarde,
    };
    tienda.totalVisitas += 1;
    tienda.visitantes.push(entrada);
    if (tarde) {
      tienda.cantidadTarde += 1;
      tienda.visitantesTarde.push(entrada);
    }
  });

  return Array.from(porTienda.values())
    .filter((t) => t.totalVisitas > 0)
    .sort((a, b) => b.cantidadTarde - a.cantidadTarde || b.totalVisitas - a.totalVisitas);
}

// ---------- Reporte de tienda (PDF) ----------

export type TiendaBasicaAnalitica = { id: string; nombre: string };

export async function obtenerTiendasBasicas(): Promise<TiendaBasicaAnalitica[]> {
  await exigirSesion();
  const supabase = supabaseServer();

  const { data, error } = await supabase.from("tiendas").select("id, nombre").order("nombre");
  if (error) throw new Error("No se pudo cargar las tiendas.");
  return data ?? [];
}

export type ObservacionTiendaAnalitica = {
  fecha: string;
  usuarioNombre: string;
  rol: string;
  observacion: string;
  actividad: string | null;
};

export type VisitanteTiendaAnalitica = { usuarioNombre: string; rol: string; visitas: number };

export type SupervisorPermanenteTiendaAnalitica = { usuarioNombre: string; rol: string };

export type HistorialTiendaAnalitica = {
  tiendaNombre: string;
  totalVisitas: number;
  observaciones: ObservacionTiendaAnalitica[];
  visitantes: VisitanteTiendaAnalitica[];
  supervisoresPermanentes: SupervisorPermanenteTiendaAnalitica[];
};

export async function obtenerHistorialTiendaAnalitica(
  tiendaId: string,
  desde: string,
  hasta: string
): Promise<HistorialTiendaAnalitica> {
  await exigirSesion();
  const supabase = supabaseServer();

  const [
    { data: tienda, error: errorTienda },
    { data, error },
    { data: permanentes, error: errorPermanentes },
  ] = await Promise.all([
    supabase.from("tiendas").select("nombre").eq("id", tiendaId).maybeSingle(),
    supabase
      .from("rutas_diarias")
      .select("fecha, usuario_id, rol, observacion, actividad, usuarios(nombre)")
      .eq("tienda_id", tiendaId)
      .gte("fecha", desde)
      .lte("fecha", hasta)
      .order("fecha", { ascending: false }),
    supabase
      .from("tiendas_permanentes")
      .select("usuarios(nombre, rol)")
      .eq("tienda_id", tiendaId)
      .is("fecha_fin", null),
  ]);

  if (errorTienda || error || errorPermanentes) {
    throw new Error("No se pudo cargar el historial de la tienda.");
  }

  const filas = data ?? [];

  // "Total visitas" y el conteo por colaborador cuentan visitas, no
  // reportes: si la misma persona escribió más de un reporte de esta tienda
  // el mismo día, eso sigue siendo UNA visita (aunque abajo se muestren
  // todas las observaciones escritas, esas sí completas, una por una).
  const visitasUnicas = new Set(filas.map((r: any) => `${r.usuario_id}|${r.fecha}`));

  const visitantesMap = new Map<string, VisitanteTiendaAnalitica>();
  const usuarioFechaContado = new Set<string>();
  filas.forEach((r: any) => {
    const clave = `${r.usuario_id}|${r.fecha}`;
    const nombre = r.usuarios?.nombre ?? "—";
    if (!usuarioFechaContado.has(clave)) {
      usuarioFechaContado.add(clave);
      const existente = visitantesMap.get(nombre);
      if (existente) existente.visitas += 1;
      else visitantesMap.set(nombre, { usuarioNombre: nombre, rol: r.rol ?? "—", visitas: 1 });
    }
  });

  return {
    tiendaNombre: tienda?.nombre ?? "—",
    totalVisitas: visitasUnicas.size,
    observaciones: filas.map((r: any) => ({
      fecha: r.fecha,
      usuarioNombre: r.usuarios?.nombre ?? "—",
      rol: r.rol,
      observacion: r.observacion,
      actividad: r.actividad,
    })),
    visitantes: Array.from(visitantesMap.values()).sort((a, b) => b.visitas - a.visitas),
    supervisoresPermanentes: (permanentes ?? []).map((p: any) => ({
      usuarioNombre: p.usuarios?.nombre ?? "—",
      rol: p.usuarios?.rol ?? "—",
    })),
  };
}

// ---------- Tendencias por tienda (heatmap + detalle semanal) ----------

export type SemanaTendencia = { inicio: string; etiqueta: string };

export type PuntoSemanalTienda = {
  visitas: number;
  puntualidadPct: number | null; // null = sin asistencia registrada esa semana
  reportadoPct: number | null; // null = sin visitas esa semana
  tardanzas: number;
};

export type TendenciaTienda = {
  tiendaId: string;
  tiendaNombre: string;
  totalVisitas: number;
  porSemana: PuntoSemanalTienda[];
};

export type TendenciasTiendas = {
  semanas: SemanaTendencia[];
  tiendas: TendenciaTienda[];
};

const MAX_SEMANAS_TENDENCIA = 12;
const MAX_TIENDAS_TENDENCIA = 15;

function lunesDe(fechaISO: string): string {
  const partes = fechaISO.split("-").map(Number);
  const fecha = new Date(Date.UTC(partes[0], partes[1] - 1, partes[2]));
  const diaSemana = fecha.getUTCDay(); // 0 = domingo ... 6 = sabado
  const offset = diaSemana === 0 ? -6 : 1 - diaSemana;
  fecha.setUTCDate(fecha.getUTCDate() + offset);
  return fecha.toISOString().slice(0, 10);
}

export async function obtenerTendenciasTiendas(
  desde: string,
  hasta: string
): Promise<TendenciasTiendas> {
  await exigirSesion();
  const supabase = supabaseServer();

  let cursores: string[] = [];
  let cursor = lunesDe(desde);
  const ultimoLunes = lunesDe(hasta);
  while (cursor <= ultimoLunes) {
    cursores.push(cursor);
    cursor = sumarDias(cursor, 7);
  }
  if (cursores.length === 0) cursores = [lunesDe(hasta)];
  if (cursores.length > MAX_SEMANAS_TENDENCIA) {
    cursores = cursores.slice(cursores.length - MAX_SEMANAS_TENDENCIA);
  }

  const semanas: SemanaTendencia[] = cursores.map((inicio) => ({
    inicio,
    etiqueta: formatearFechaCorta(inicio),
  }));

  const desdeReal = semanas[0].inicio;
  const hastaReal = sumarDias(semanas[semanas.length - 1].inicio, 6);

  const [{ data: tiendas, error: errorTiendas }, visitas, { data: asistencia, error: errorAsistencia }] =
    await Promise.all([
      supabase.from("tiendas").select("id, nombre").order("nombre"),
      obtenerVisitasEnRangoAnalitica(desdeReal, hastaReal),
      supabase
        .from("asistencia")
        .select("usuario_id, fecha, hora_ingreso")
        .gte("fecha", desdeReal)
        .lte("fecha", hastaReal),
    ]);

  if (errorTiendas || errorAsistencia) {
    throw new Error("No se pudo cargar las tendencias por tienda.");
  }

  const horaIngresoPorClave = new Map<string, string | null>();
  (asistencia ?? []).forEach((a: any) => {
    horaIngresoPorClave.set(`${a.usuario_id}|${a.fecha}`, a.hora_ingreso);
  });

  function esTarde(usuarioId: string, fecha: string, rol: string): boolean | null {
    const limite = HORA_LIMITE_POR_ROL[rol];
    if (!limite) return null;
    const horaIngreso = horaIngresoPorClave.get(`${usuarioId}|${fecha}`);
    if (!horaIngreso) return null;
    return horaIngreso > limite;
  }

  function semanaIndexPara(fecha: string): number {
    const lunes = lunesDe(fecha);
    return semanas.findIndex((s) => s.inicio === lunes);
  }

  type Acumulado = { visitas: number; conAsistencia: number; puntuales: number; reportadas: number; tarde: number };
  const acumPorTiendaSemana = new Map<string, Acumulado[]>();
  const totalVisitasPorTienda = new Map<string, number>();

  (tiendas ?? []).forEach((t: any) => {
    acumPorTiendaSemana.set(
      t.id,
      semanas.map(() => ({ visitas: 0, conAsistencia: 0, puntuales: 0, reportadas: 0, tarde: 0 }))
    );
    totalVisitasPorTienda.set(t.id, 0);
  });

  visitas.forEach((v) => {
    const idx = semanaIndexPara(v.fecha);
    if (idx < 0) return;
    const acumSemanas = acumPorTiendaSemana.get(v.tiendaId);
    if (!acumSemanas) return;
    const acc = acumSemanas[idx];
    acc.visitas += 1;
    if (v.tieneObservacion) acc.reportadas += 1;
    const tarde = esTarde(v.usuarioId, v.fecha, v.rol);
    if (tarde !== null) {
      acc.conAsistencia += 1;
      if (tarde) acc.tarde += 1;
      else acc.puntuales += 1;
    }
    totalVisitasPorTienda.set(v.tiendaId, (totalVisitasPorTienda.get(v.tiendaId) ?? 0) + 1);
  });

  const tiendasOrdenadas = (tiendas ?? [])
    .map((t: any) => ({ id: t.id as string, nombre: t.nombre as string, total: totalVisitasPorTienda.get(t.id) ?? 0 }))
    .filter((t) => t.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, MAX_TIENDAS_TENDENCIA);

  const tiendasResultado: TendenciaTienda[] = tiendasOrdenadas.map((t) => {
    const acumSemanas = acumPorTiendaSemana.get(t.id)!;
    return {
      tiendaId: t.id,
      tiendaNombre: t.nombre,
      totalVisitas: t.total,
      porSemana: acumSemanas.map((acc) => ({
        visitas: acc.visitas,
        puntualidadPct: acc.conAsistencia > 0 ? Math.round((acc.puntuales / acc.conAsistencia) * 100) : null,
        reportadoPct: acc.visitas > 0 ? Math.round((acc.reportadas / acc.visitas) * 100) : null,
        tardanzas: acc.tarde,
      })),
    };
  });

  return { semanas, tiendas: tiendasResultado };
}

function formatearDuracion(desdeISO: string, hastaISO: string): string {
  const dias = diasEntreFechas(desdeISO, hastaISO);
  if (dias < 30) return `${dias} día${dias === 1 ? "" : "s"}`;

  const { anios, meses } = calcularAntiguedad(desdeISO, hastaISO);
  const partes: string[] = [];
  if (anios > 0) partes.push(`${anios} año${anios === 1 ? "" : "s"}`);
  if (meses > 0) partes.push(`${meses} mes${meses === 1 ? "" : "es"}`);
  return partes.length > 0 ? partes.join(" y ") : "menos de un mes";
}

export type EncargadoRotacion = {
  usuarioNombre: string;
  rol: string;
  desde: string;
  hasta: string | null;
  duracion: string;
  actual: boolean;
};

// Historial completo de quién ha estado a cargo de una tienda como
// permanente, con cuánto tiempo duró cada tramo — a diferencia de
// "supervisoresPermanentes" de arriba (que solo muestra los vigentes ahora),
// esto incluye también a quienes ya terminaron esa asignación.
export async function obtenerRotacionTienda(tiendaId: string): Promise<EncargadoRotacion[]> {
  await exigirSesion();
  const supabase = supabaseServer();

  const { data, error } = await supabase
    .from("tiendas_permanentes")
    .select("created_at, fecha_fin, usuarios(nombre, rol)")
    .eq("tienda_id", tiendaId)
    .order("created_at", { ascending: false });

  if (error) throw new Error("No se pudo cargar la rotación de la tienda.");

  const hoy = hoyPeru();
  return (data ?? []).map((r: any) => {
    const desde = String(r.created_at).slice(0, 10);
    const hasta = r.fecha_fin ?? null;
    return {
      usuarioNombre: r.usuarios?.nombre ?? "—",
      rol: r.usuarios?.rol ?? "—",
      desde,
      hasta,
      duracion: formatearDuracion(desde, hasta ?? hoy),
      actual: hasta === null,
    };
  });
}

export type ResumenTiendaDashboard = {
  tiendaId: string;
  tiendaNombre: string;
  encargados: string[];
  visitas: number;
  ultimaAuditoriaFecha: string | null;
  ultimaAuditoriaPorcentaje: number | null;
  clasificacion: string | null;
  alertasCriticas: number;
};

export type PromedioCategoriaDashboard = { categoria: string; promedio: number };

export type DashboardTiendas = {
  resumenTiendas: ResumenTiendaDashboard[];
  promediosPorCategoria: PromedioCategoriaDashboard[];
};

export async function obtenerDashboardTiendas(desde: string, hasta: string): Promise<DashboardTiendas> {
  await exigirSesion();
  const supabase = supabaseServer();

  const [
    { data: tiendas },
    { data: visitas },
    { data: permanentes },
    { data: auditoriasRango },
    { data: todasAuditorias },
  ] = await Promise.all([
    supabase.from("tiendas").select("id, nombre").order("nombre"),
    supabase.from("rutas_diarias").select("tienda_id").gte("fecha", desde).lte("fecha", hasta),
    supabase.from("tiendas_permanentes").select("tienda_id, usuarios(nombre)"),
    supabase.from("auditorias").select("tienda_id, items").gte("fecha", desde).lte("fecha", hasta),
    supabase
      .from("auditorias")
      .select("tienda_id, fecha, porcentaje, clasificacion, alertas")
      .order("fecha", { ascending: false })
      .order("created_at", { ascending: false }),
  ]);

  const visitasPorTienda = new Map<string, number>();
  (visitas ?? []).forEach((v: any) => {
    if (!v.tienda_id) return;
    visitasPorTienda.set(v.tienda_id, (visitasPorTienda.get(v.tienda_id) ?? 0) + 1);
  });

  const encargadosPorTienda = new Map<string, string[]>();
  (permanentes ?? []).forEach((p: any) => {
    const nombre = p.usuarios?.nombre as string | undefined;
    if (!nombre || !p.tienda_id) return;
    const lista = encargadosPorTienda.get(p.tienda_id) ?? [];
    lista.push(nombre);
    encargadosPorTienda.set(p.tienda_id, lista);
  });

  // La primera auditoría de cada tienda en este orden (fecha desc) ya es la
  // más reciente — no se filtra por rango porque "última auditoría" importa
  // aunque haya sido hace más de 30 días.
  const ultimaPorTienda = new Map<
    string,
    { fecha: string; porcentaje: number; clasificacion: string; alertas: string[] }
  >();
  (todasAuditorias ?? []).forEach((a: any) => {
    if (!a.tienda_id || ultimaPorTienda.has(a.tienda_id)) return;
    ultimaPorTienda.set(a.tienda_id, {
      fecha: a.fecha,
      porcentaje: a.porcentaje,
      clasificacion: a.clasificacion,
      alertas: a.alertas ?? [],
    });
  });

  const resumenTiendas: ResumenTiendaDashboard[] = (tiendas ?? []).map((t: any) => {
    const ultima = ultimaPorTienda.get(t.id);
    return {
      tiendaId: t.id,
      tiendaNombre: t.nombre,
      encargados: encargadosPorTienda.get(t.id) ?? [],
      visitas: visitasPorTienda.get(t.id) ?? 0,
      ultimaAuditoriaFecha: ultima?.fecha ?? null,
      ultimaAuditoriaPorcentaje: ultima?.porcentaje ?? null,
      clasificacion: ultima?.clasificacion ?? null,
      alertasCriticas: ultima?.alertas.length ?? 0,
    };
  });

  const sumaPorCategoria = new Map<string, { suma: number; maximo: number }>();
  (auditoriasRango ?? []).forEach((a: any) => {
    (a.items ?? []).forEach((it: any) => {
      const actual = sumaPorCategoria.get(it.categoria) ?? { suma: 0, maximo: 0 };
      actual.suma += it.puntaje;
      actual.maximo += 2;
      sumaPorCategoria.set(it.categoria, actual);
    });
  });

  const promediosPorCategoria: PromedioCategoriaDashboard[] = Array.from(sumaPorCategoria.entries()).map(
    ([categoria, v]) => ({
      categoria,
      promedio: v.maximo > 0 ? Math.round((v.suma / v.maximo) * 100) : 0,
    })
  );

  return { resumenTiendas, promediosPorCategoria };
}
