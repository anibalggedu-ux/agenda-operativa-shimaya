"use server";

import { supabaseServer } from "@/lib/supabase-server";
import { obtenerSesion } from "@/lib/session";

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

type VisitaAnalitica = {
  fecha: string;
  tiendaId: string;
  usuarioId: string;
  usuarioNombre: string;
  rol: string;
  tieneObservacion: boolean;
};

async function obtenerVisitasEnRangoAnalitica(
  desde: string,
  hasta: string,
  tiendaId?: string
): Promise<VisitaAnalitica[]> {
  const supabase = supabaseServer();

  let consultaReportes = supabase
    .from("rutas_diarias")
    .select("fecha, tienda_id, usuario_id, rol, usuarios(nombre)")
    .gte("fecha", desde)
    .lte("fecha", hasta);
  if (tiendaId) consultaReportes = consultaReportes.eq("tienda_id", tiendaId);

  let consultaAsignaciones = supabase
    .from("rutas_activas")
    .select("fecha_planificada, tienda_id, usuario_id, usuarios(nombre, rol)")
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
      .eq("tienda_id", tiendaId),
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
