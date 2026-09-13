"use server";

import { supabaseServer } from "@/lib/supabase-server";
import { obtenerSesion } from "@/lib/session";
import { hoyPeru, diaSemanaPeru } from "@/lib/fechas";

async function exigirGerente() {
  const sesion = await obtenerSesion();
  if (!sesion || sesion.rol !== "gerente") {
    throw new Error("No autorizado.");
  }
  return sesion;
}

function diasEntre(desdeISO: string, hastaISO: string): number {
  const [y1, m1, d1] = desdeISO.split("-").map(Number);
  const [y2, m2, d2] = hastaISO.split("-").map(Number);
  const t1 = Date.UTC(y1, m1 - 1, d1);
  const t2 = Date.UTC(y2, m2 - 1, d2);
  return Math.round((t2 - t1) / 86400000);
}

export type AlertaAtrasada = {
  id: string;
  usuarioNombre: string;
  tiendaNombre: string;
  fechaPlanificada: string;
  diasAtraso: number;
};

export type PersonaDescansando = { nombre: string; rol: string };

export type AsignacionEspecialVigente = {
  nombre: string;
  tipo: string;
  fechaInicio: string;
  fechaFin: string;
};

export type DashboardGerente = {
  kpis: {
    tiendasVisitadasHoy: number;
    reportesPendientesHoy: number;
    reportesAtrasados: number;
    personalEnCampoHoy: number;
  };
  alertasAtrasadas: AlertaAtrasada[];
  personalDescansandoHoy: PersonaDescansando[];
  personalConAsignacionEspecial: AsignacionEspecialVigente[];
};

export async function obtenerDashboardGerente(): Promise<DashboardGerente> {
  await exigirGerente();
  const supabase = supabaseServer();
  const hoy = hoyPeru();
  const diaSemana = diaSemanaPeru();

  const [
    visitasHoy,
    rutasActivas,
    usuariosDescanso,
    asignacionesEspeciales,
    enCampoHoy,
  ] = await Promise.all([
    supabase.from("rutas_diarias").select("id", { count: "exact", head: true }).eq("fecha", hoy),
    supabase
      .from("rutas_activas")
      .select("id, fecha_planificada, usuarios(nombre), tiendas!tienda_id(nombre)")
      .order("fecha_planificada", { ascending: true }),
    supabase.from("usuarios").select("nombre, rol").contains("dias_descanso", [diaSemana]),
    supabase
      .from("asignaciones_especiales")
      .select("tipo, fecha_inicio, fecha_fin, usuarios(nombre)")
      .lte("fecha_inicio", hoy)
      .gte("fecha_fin", hoy),
    supabase
      .from("asistencia")
      .select("id", { count: "exact", head: true })
      .eq("fecha", hoy)
      .not("hora_ingreso", "is", null)
      .is("hora_salida", null),
  ]);

  if (rutasActivas.error || usuariosDescanso.error || asignacionesEspeciales.error) {
    throw new Error("No se pudo cargar el dashboard.");
  }

  const activas = (rutasActivas.data ?? []) as any[];
  const pendientesHoy = activas.filter((r) => r.fecha_planificada === hoy);
  const atrasadas = activas.filter((r) => r.fecha_planificada < hoy);

  return {
    kpis: {
      tiendasVisitadasHoy: visitasHoy.count ?? 0,
      reportesPendientesHoy: pendientesHoy.length,
      reportesAtrasados: atrasadas.length,
      personalEnCampoHoy: enCampoHoy.count ?? 0,
    },
    alertasAtrasadas: atrasadas.map((r) => ({
      id: r.id,
      usuarioNombre: r.usuarios?.nombre ?? "—",
      tiendaNombre: r.tiendas?.nombre ?? "—",
      fechaPlanificada: r.fecha_planificada,
      diasAtraso: diasEntre(r.fecha_planificada, hoy),
    })),
    personalDescansandoHoy: (usuariosDescanso.data ?? []).map((u: any) => ({
      nombre: u.nombre,
      rol: u.rol,
    })),
    personalConAsignacionEspecial: (asignacionesEspeciales.data ?? []).map((a: any) => ({
      nombre: a.usuarios?.nombre ?? "—",
      tipo: a.tipo,
      fechaInicio: a.fecha_inicio,
      fechaFin: a.fecha_fin,
    })),
  };
}
