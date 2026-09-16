"use server";

import { supabaseServer } from "@/lib/supabase-server";
import { obtenerSesion, tieneBitacora } from "@/lib/session";
import { hoyPeru, horaPeru, sumarDias, diaSemanaPeru } from "@/lib/fechas";
import { obtenerTiendasClasificadas } from "./supervisor/actions";
import { obtenerMisPuntos, obtenerVitrinaTrofeos } from "./puntos-actions";
import { obtenerDashboardTiendas } from "./analitica/actions";
import { obtenerClimaActual, resumirClimaActual } from "@/lib/clima";
import {
  calcularEstadoPuntualidad,
  construirItemsAlerta,
  expandirRangoFechas,
  type AlertaPuntualidad,
  type AlertaPuntualidadItem,
  type AtendidoPorTipo,
  type RegistroAsistencia,
} from "@/lib/puntualidad";

export type ClimaResumenPersonal = {
  zonaNombre: string;
  icono: string;
  descripcion: string;
  tempActual: number | null;
  tempMax: number | null;
  tempMin: number | null;
  riesgo: boolean;
  avisoTexto: string | null;
};

export type ResumenPersonal = {
  rutaHoyNombre: string | null;
  rutaHoyEstado: "pendiente" | "reportado" | null;
  rutaHoyExtra: number;
  reportesEditables: number;
  rachaActual: number;
  comunicadosRecientes: number;
  ultimoComunicadoTipo: string | null;
  proximoEvento: { etiqueta: string; fecha: string } | null;
  climaActual: ClimaResumenPersonal | null;
  alertaPuntualidad: AlertaPuntualidad;
};

export async function obtenerResumenPersonal(): Promise<ResumenPersonal> {
  const sesion = await obtenerSesion();
  if (!sesion || !tieneBitacora(sesion.rol)) {
    throw new Error("No autorizado.");
  }

  const supabase = supabaseServer();
  const hoy = hoyPeru();
  const horaActual = horaPeru();
  const desdeAlerta = sumarDias(hoy, -45);

  const [
    { tiendas },
    misPuntos,
    { data: comunicados },
    { data: usuarioPropio },
    { data: asistenciaPropia },
    { data: especialesPropias },
  ] = await Promise.all([
    obtenerTiendasClasificadas(),
    obtenerMisPuntos(),
    supabase
      .from("comunicados")
      .select("tipo, created_at")
      .gte("created_at", sumarDias(hoy, -3) + "T00:00:00")
      .order("created_at", { ascending: false }),
    supabase
      .from("usuarios")
      .select("dias_descanso, fecha_ingreso, hora_limite_ingreso, horario_por_dia")
      .eq("id", sesion.id)
      .maybeSingle(),
    supabase
      .from("asistencia")
      .select("fecha, hora_ingreso, hora_salida")
      .eq("usuario_id", sesion.id)
      .gte("fecha", desdeAlerta)
      .lte("fecha", hoy),
    // Vacaciones, permisos, descanso semanal o licencia — esos días no
    // deben contar como tardanza ni salida faltante (ver lib/puntualidad.ts).
    supabase
      .from("asignaciones_especiales")
      .select("fecha_inicio, fecha_fin")
      .eq("usuario_id", sesion.id)
      .gte("fecha_fin", desdeAlerta)
      .lte("fecha_inicio", hoy),
  ]);

  const asistenciaPorFecha = new Map<string, RegistroAsistencia>();
  (asistenciaPropia ?? []).forEach((a) => {
    asistenciaPorFecha.set(a.fecha, { horaIngreso: a.hora_ingreso, horaSalida: a.hora_salida });
  });
  const diasExentosPropios = new Set<string>();
  (especialesPropias ?? []).forEach((e) => {
    expandirRangoFechas(e.fecha_inicio, e.fecha_fin).forEach((f) => diasExentosPropios.add(f));
  });
  const alertaPuntualidad = calcularEstadoPuntualidad(
    sesion.id,
    sesion.nombre,
    sesion.rol,
    usuarioPropio?.dias_descanso ?? [],
    asistenciaPorFecha,
    hoy,
    horaActual,
    diasExentosPropios,
    usuarioPropio?.fecha_ingreso ?? null,
    usuarioPropio?.hora_limite_ingreso ?? null,
    (usuarioPropio?.horario_por_dia as Record<string, string> | null) ?? null
  );

  const cardsHoy = tiendas.filter((t) => t.urgencia === "HOY");
  const pendientesHoy = cardsHoy.filter((t) => t.rutaActivaId);
  const reportadosHoy = cardsHoy.filter((t) => t.reporteId);

  let rutaHoyNombre: string | null = null;
  let rutaHoyEstado: "pendiente" | "reportado" | null = null;
  let rutaHoyExtra = 0;

  if (pendientesHoy.length > 0) {
    rutaHoyNombre = pendientesHoy[0].tiendaNombre;
    rutaHoyEstado = "pendiente";
    rutaHoyExtra = pendientesHoy.length - 1 + reportadosHoy.length;
  } else if (reportadosHoy.length > 0) {
    rutaHoyNombre = reportadosHoy[0].tiendaNombre;
    rutaHoyEstado = "reportado";
    rutaHoyExtra = reportadosHoy.length - 1;
  }

  const reportesEditables = tiendas.filter((t) => t.reporteId).length;

  // Clima: si hay ruta para hoy, se usa el pronóstico de esa tienda (ya
  // calculado en obtenerTiendasClasificadas); si no, se cae a la primera
  // tienda fija (solo aplica a Supervisor) con el clima "ahora" en vivo.
  let climaActual: ClimaResumenPersonal | null = null;
  const cardConClima = cardsHoy.find((t) => t.clima);
  if (cardConClima?.clima) {
    climaActual = {
      zonaNombre: cardConClima.tiendaNombre,
      icono: cardConClima.clima.icono,
      descripcion: cardConClima.clima.descripcion,
      tempActual: null,
      tempMax: cardConClima.clima.tempMax,
      tempMin: cardConClima.clima.tempMin,
      riesgo: cardConClima.clima.riesgo,
      avisoTexto: cardConClima.clima.avisoTexto,
    };
  } else {
    const { data: fija } = await supabase
      .from("tiendas_permanentes")
      .select("tiendas(nombre, lat, lon)")
      .eq("usuario_id", sesion.id)
      .limit(1)
      .maybeSingle();
    const tiendaFija: any = fija?.tiendas;
    if (tiendaFija?.lat !== null && tiendaFija?.lat !== undefined && tiendaFija?.lon !== null) {
      const actual = await obtenerClimaActual(Number(tiendaFija.lat), Number(tiendaFija.lon));
      if (actual) {
        const r = resumirClimaActual(actual);
        climaActual = {
          zonaNombre: tiendaFija.nombre,
          icono: r.icono,
          descripcion: r.descripcion,
          tempActual: r.temp,
          tempMax: null,
          tempMin: null,
          riesgo: false,
          avisoTexto: null,
        };
      }
    }
  }

  // Próximo evento relevante: primero un comunicado con fecha de evento
  // próxima, si no hay, la siguiente asignación especial propia, si tampoco
  // hay, el próximo día de descanso fijo.
  let proximoEvento: { etiqueta: string; fecha: string } | null = null;

  const { data: proximoComunicado } = await supabase
    .from("comunicados")
    .select("tipo, fecha_evento")
    .not("fecha_evento", "is", null)
    .gte("fecha_evento", hoy)
    .order("fecha_evento", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (proximoComunicado?.fecha_evento) {
    proximoEvento = { etiqueta: proximoComunicado.tipo, fecha: proximoComunicado.fecha_evento };
  }

  if (!proximoEvento) {
    const { data: proximaEspecial } = await supabase
      .from("asignaciones_especiales")
      .select("tipo, fecha_inicio")
      .eq("usuario_id", sesion.id)
      .gte("fecha_inicio", hoy)
      .order("fecha_inicio", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (proximaEspecial) {
      proximoEvento = { etiqueta: proximaEspecial.tipo, fecha: proximaEspecial.fecha_inicio };
    }
  }

  if (!proximoEvento) {
    const diasDescanso: string[] = usuarioPropio?.dias_descanso ?? [];

    if (diasDescanso.length > 0) {
      let cursor = hoy;
      for (let i = 0; i < 14; i++) {
        if (diasDescanso.includes(diaSemanaPeru(cursor))) {
          proximoEvento = { etiqueta: "Descanso semanal", fecha: cursor };
          break;
        }
        cursor = sumarDias(cursor, 1);
      }
    }
  }

  return {
    rutaHoyNombre,
    rutaHoyEstado,
    rutaHoyExtra,
    reportesEditables,
    rachaActual: misPuntos.rachaActual,
    comunicadosRecientes: comunicados?.length ?? 0,
    ultimoComunicadoTipo: comunicados?.[0]?.tipo ?? null,
    proximoEvento,
    climaActual,
    alertaPuntualidad,
  };
}

export type ResumenOperativo = {
  tiendasCriticas: { nombre: string; porcentaje: number }[];
  visitasHoy: number;
  reportadasHoy: number;
  totalTiendas: number;
  tiendasDeHoyDetalle: { tiendaNombre: string; reportada: boolean }[];
  asignacionEspecialHoy: { nombre: string; tipo: string } | null;
  asignacionesEspecialesHoyTotal: number;
  asignacionesEspecialesHoy: { nombre: string; tipo: string }[];
  comunicadosSemana: number;
  comunicadosDetalle: { tipo: string; fecha: string }[];
  rachaTop: { nombre: string; racha: number } | null;
  alertasPuntualidad: AlertaPuntualidadItem[];
};

const ROLES_CON_ASISTENCIA = ["supervisor", "capacitador"];

export async function obtenerResumenOperativo(): Promise<ResumenOperativo> {
  const sesion = await obtenerSesion();
  if (!sesion || (sesion.rol !== "coordinador" && sesion.rol !== "gerente")) {
    throw new Error("No autorizado.");
  }

  const supabase = supabaseServer();
  const hoy = hoyPeru();
  const horaActual = horaPeru();
  const desdeAlerta = sumarDias(hoy, -45);

  const [
    { data: tiendas },
    { data: visitasHoyRows },
    { data: asignadasHoyRows },
    { data: especialesHoy },
    { data: comunicadosSemana },
    vitrina,
    dashboard,
    { data: colaboradores },
    { data: asistenciaEquipo },
    { data: especialesEquipo },
    { data: atendidas },
  ] = await Promise.all([
    supabase.from("tiendas").select("id, nombre"),
    supabase.from("rutas_diarias").select("tienda_id").eq("fecha", hoy),
    supabase.from("rutas_activas").select("tienda_id").eq("fecha_planificada", hoy),
    supabase
      .from("asignaciones_especiales")
      .select("tipo, usuarios(nombre)")
      .lte("fecha_inicio", hoy)
      .gte("fecha_fin", hoy),
    supabase
      .from("comunicados")
      .select("tipo, created_at")
      .gte("created_at", sumarDias(hoy, -6) + "T00:00:00")
      .order("created_at", { ascending: false }),
    obtenerVitrinaTrofeos(),
    obtenerDashboardTiendas(sumarDias(hoy, -30), hoy),
    supabase
      .from("usuarios")
      .select("id, nombre, rol, dias_descanso, fecha_ingreso, hora_limite_ingreso, horario_por_dia")
      .eq("activo", true)
      .in("rol", ROLES_CON_ASISTENCIA),
    supabase
      .from("asistencia")
      .select("usuario_id, fecha, hora_ingreso, hora_salida")
      .gte("fecha", desdeAlerta)
      .lte("fecha", hoy),
    // Vacaciones, permisos, descanso médico o misión especial de todo el
    // equipo en la ventana — esos días no cuentan como tardanza ni salida
    // faltante (ver lib/puntualidad.ts). Aparte de "especialesHoy" de arriba,
    // que solo cubre hoy y no trae usuario_id.
    supabase
      .from("asignaciones_especiales")
      .select("usuario_id, fecha_inicio, fecha_fin")
      .gte("fecha_fin", desdeAlerta)
      .lte("fecha_inicio", hoy),
    supabase.from("alertas_puntualidad_atendidas").select("usuario_id, tipo, fecha_referencia"),
  ]);

  const asistenciaPorUsuario = new Map<string, Map<string, RegistroAsistencia>>();
  (asistenciaEquipo ?? []).forEach((a) => {
    const mapa = asistenciaPorUsuario.get(a.usuario_id) ?? new Map<string, RegistroAsistencia>();
    mapa.set(a.fecha, { horaIngreso: a.hora_ingreso, horaSalida: a.hora_salida });
    asistenciaPorUsuario.set(a.usuario_id, mapa);
  });

  const diasExentosPorUsuario = new Map<string, Set<string>>();
  (especialesEquipo ?? []).forEach((e) => {
    const set = diasExentosPorUsuario.get(e.usuario_id) ?? new Set<string>();
    expandirRangoFechas(e.fecha_inicio, e.fecha_fin).forEach((f) => set.add(f));
    diasExentosPorUsuario.set(e.usuario_id, set);
  });

  const atendidoPorUsuario = new Map<string, AtendidoPorTipo>();
  (atendidas ?? []).forEach((a) => {
    const actual = atendidoPorUsuario.get(a.usuario_id) ?? { tardanzaDesde: null, salidaDesde: null };
    if (a.tipo === "tardanza") actual.tardanzaDesde = a.fecha_referencia;
    else actual.salidaDesde = a.fecha_referencia;
    atendidoPorUsuario.set(a.usuario_id, actual);
  });

  const estadosEquipo = (colaboradores ?? []).map((u) =>
    calcularEstadoPuntualidad(
      u.id,
      u.nombre,
      u.rol,
      u.dias_descanso ?? [],
      asistenciaPorUsuario.get(u.id) ?? new Map(),
      hoy,
      horaActual,
      diasExentosPorUsuario.get(u.id) ?? new Set(),
      u.fecha_ingreso ?? null,
      u.hora_limite_ingreso ?? null,
      (u.horario_por_dia as Record<string, string> | null) ?? null
    )
  );

  const alertasPuntualidad: AlertaPuntualidadItem[] = estadosEquipo
    .flatMap((e) => construirItemsAlerta(e, hoy, atendidoPorUsuario.get(e.usuarioId)))
    .sort((a, b) => {
      if (a.tipo !== b.tipo) return a.tipo === "tardanza" ? -1 : 1;
      return b.severidad - a.severidad; // racha más grave primero
    });

  const totalTiendas = tiendas?.length ?? 0;
  const tiendaNombrePorId = new Map((tiendas ?? []).map((t: any) => [t.id, t.nombre as string]));

  // Cuenta tiendas con ruta asignada hoy, se haya enviado ya el reporte o no
  // — rutas_diarias (ya reportadas) + rutas_activas (asignadas, pendientes
  // de reportar). Antes solo miraba rutas_diarias, así que una tienda recién
  // asignada no aparecía aquí hasta que alguien enviaba la observación.
  const reportadasHoySet = new Set((visitasHoyRows ?? []).map((r: any) => r.tienda_id));
  const asignadasHoySet = new Set((asignadasHoyRows ?? []).map((r: any) => r.tienda_id));
  const tiendasConActividadHoy = new Set([...reportadasHoySet, ...asignadasHoySet]);
  const visitasHoy = tiendasConActividadHoy.size;

  const tiendasDeHoyDetalle = Array.from(tiendasConActividadHoy)
    .map((id) => ({
      tiendaNombre: tiendaNombrePorId.get(id as string) ?? "—",
      reportada: reportadasHoySet.has(id),
    }))
    .sort((a, b) => a.tiendaNombre.localeCompare(b.tiendaNombre));

  const tiendasCriticas = dashboard.resumenTiendas
    .filter((t) => t.clasificacion === "Acción inmediata")
    .map((t) => ({ nombre: t.tiendaNombre, porcentaje: t.ultimaAuditoriaPorcentaje ?? 0 }));

  const asignacionesEspecialesHoy = (especialesHoy ?? []).map((e: any) => ({
    nombre: e.usuarios?.nombre ?? "—",
    tipo: e.tipo,
  }));
  const asignacionEspecialHoy = asignacionesEspecialesHoy[0] ?? null;

  const conRacha = vitrina.filter((f) => f.rachaActual > 0);
  const top = conRacha.length > 0 ? conRacha.reduce((max, f) => (f.rachaActual > max.rachaActual ? f : max)) : null;

  return {
    tiendasCriticas,
    visitasHoy,
    reportadasHoy: reportadasHoySet.size,
    totalTiendas,
    tiendasDeHoyDetalle,
    asignacionEspecialHoy,
    asignacionesEspecialesHoyTotal: especialesHoy?.length ?? 0,
    asignacionesEspecialesHoy,
    comunicadosSemana: comunicadosSemana?.length ?? 0,
    comunicadosDetalle: (comunicadosSemana ?? []).map((c: any) => ({ tipo: c.tipo, fecha: c.created_at })),
    rachaTop: top ? { nombre: top.nombre, racha: top.rachaActual } : null,
    alertasPuntualidad,
  };
}

// Marca una alerta de puntualidad como atendida — no la borra para siempre:
// si el problema sigue después de hoy (una tardanza o salida sin marcar
// nueva), vuelve a aparecer sola porque ya es una situación distinta a la
// que se atendió (ver construirItemsAlerta en lib/puntualidad.ts).
export async function marcarAlertaAtendida(
  usuarioId: string,
  tipo: "tardanza" | "salida"
): Promise<{ exito: boolean; mensaje?: string }> {
  const sesion = await obtenerSesion();
  if (!sesion || (sesion.rol !== "coordinador" && sesion.rol !== "gerente")) {
    return { exito: false, mensaje: "No autorizado." };
  }

  const supabase = supabaseServer();
  const { error } = await supabase.from("alertas_puntualidad_atendidas").upsert(
    {
      usuario_id: usuarioId,
      tipo,
      fecha_referencia: hoyPeru(),
      atendido_por_nombre: sesion.nombre,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "usuario_id,tipo" }
  );

  if (error) return { exito: false, mensaje: "No se pudo marcar como atendida." };
  return { exito: true };
}
