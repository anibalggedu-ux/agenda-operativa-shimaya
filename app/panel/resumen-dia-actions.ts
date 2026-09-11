"use server";

import { supabaseServer } from "@/lib/supabase-server";
import { obtenerSesion, tieneBitacora } from "@/lib/session";
import { hoyPeru, sumarDias, diaSemanaPeru } from "@/lib/fechas";
import { obtenerTiendasClasificadas } from "./supervisor/actions";
import { obtenerMisPuntos, obtenerVitrinaTrofeos } from "./puntos-actions";
import { obtenerDashboardTiendas } from "./analitica/actions";
import { obtenerClimaActual, resumirClimaActual } from "@/lib/clima";

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
};

export async function obtenerResumenPersonal(): Promise<ResumenPersonal> {
  const sesion = await obtenerSesion();
  if (!sesion || !tieneBitacora(sesion.rol)) {
    throw new Error("No autorizado.");
  }

  const supabase = supabaseServer();
  const hoy = hoyPeru();

  const [{ tiendas }, misPuntos, { data: comunicados }] = await Promise.all([
    obtenerTiendasClasificadas(),
    obtenerMisPuntos(),
    supabase
      .from("comunicados")
      .select("tipo, created_at")
      .gte("created_at", sumarDias(hoy, -3) + "T00:00:00")
      .order("created_at", { ascending: false }),
  ]);

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
    const { data: usuario } = await supabase
      .from("usuarios")
      .select("dias_descanso")
      .eq("id", sesion.id)
      .maybeSingle();
    const diasDescanso: string[] = usuario?.dias_descanso ?? [];

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
  };
}

export type ResumenOperativo = {
  tiendasCriticas: { nombre: string; porcentaje: number }[];
  visitasHoy: number;
  totalTiendas: number;
  asignacionEspecialHoy: { nombre: string; tipo: string } | null;
  asignacionesEspecialesHoyTotal: number;
  comunicadosSemana: number;
  rachaTop: { nombre: string; racha: number } | null;
};

export async function obtenerResumenOperativo(): Promise<ResumenOperativo> {
  const sesion = await obtenerSesion();
  if (!sesion || (sesion.rol !== "coordinador" && sesion.rol !== "gerente")) {
    throw new Error("No autorizado.");
  }

  const supabase = supabaseServer();
  const hoy = hoyPeru();

  const [
    { data: tiendas },
    { data: visitasHoyRows },
    { data: especialesHoy },
    { data: comunicadosSemana },
    vitrina,
    dashboard,
  ] = await Promise.all([
    supabase.from("tiendas").select("id"),
    supabase.from("rutas_diarias").select("tienda_id").eq("fecha", hoy),
    supabase
      .from("asignaciones_especiales")
      .select("tipo, usuarios(nombre)")
      .lte("fecha_inicio", hoy)
      .gte("fecha_fin", hoy),
    supabase.from("comunicados").select("id").gte("created_at", sumarDias(hoy, -6) + "T00:00:00"),
    obtenerVitrinaTrofeos(),
    obtenerDashboardTiendas(sumarDias(hoy, -30), hoy),
  ]);

  const totalTiendas = tiendas?.length ?? 0;
  const visitasHoy = new Set((visitasHoyRows ?? []).map((r: any) => r.tienda_id)).size;

  const tiendasCriticas = dashboard.resumenTiendas
    .filter((t) => t.clasificacion === "Acción inmediata")
    .map((t) => ({ nombre: t.tiendaNombre, porcentaje: t.ultimaAuditoriaPorcentaje ?? 0 }));

  const primeraEspecial = (especialesHoy ?? [])[0] as any;
  const asignacionEspecialHoy = primeraEspecial
    ? { nombre: primeraEspecial.usuarios?.nombre ?? "—", tipo: primeraEspecial.tipo }
    : null;

  const conRacha = vitrina.filter((f) => f.rachaActual > 0);
  const top = conRacha.length > 0 ? conRacha.reduce((max, f) => (f.rachaActual > max.rachaActual ? f : max)) : null;

  return {
    tiendasCriticas,
    visitasHoy,
    totalTiendas,
    asignacionEspecialHoy,
    asignacionesEspecialesHoyTotal: especialesHoy?.length ?? 0,
    comunicadosSemana: comunicadosSemana?.length ?? 0,
    rachaTop: top ? { nombre: top.nombre, racha: top.rachaActual } : null,
  };
}
