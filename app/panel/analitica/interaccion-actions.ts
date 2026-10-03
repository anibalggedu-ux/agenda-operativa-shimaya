"use server";

import { supabaseServer } from "@/lib/supabase-server";
import { exigirSesion } from "@/lib/session";
import { sumarDias, diasEntreFechas } from "@/lib/fechas";

// Pesos del puntaje compuesto (ver el muestrario que se mostró antes de
// programar esto): una sesión vale 1, una historia publicada vale 3 (cuesta
// más esfuerzo que solo entrar), y cada minuto conectado vale 0.1 -- así una
// hora conectada (60 min) pesa igual que 6 sesiones sueltas.
const PESO_SESION = 1;
const PESO_HISTORIA = 3;
const PESO_MINUTO = 0.1;

// Cada latido representa ~45s de uso real (ver marcarActividad en
// presencia-actions.ts) -- contar latidos y convertir a minutos es la forma
// de estimar cuánto tiempo estuvo conectada cada persona, ya que no se guarda
// un "fin de sesión" explícito.
const MINUTOS_POR_LATIDO = 45 / 60;

export type PuntoSerieDia = { fecha: string; valor: number };
export type KpiInteraccion = { total: number; deltaPct: number | null; serie: PuntoSerieDia[] };
export type PersonaInteraccion = {
  usuarioId: string;
  nombre: string;
  rol: string;
  sesiones: number;
  historias: number;
  minutos: number;
  puntaje: number;
};
export type IndiceInteraccion = {
  sesiones: KpiInteraccion;
  historias: KpiInteraccion;
  minutos: KpiInteraccion;
  personas: PersonaInteraccion[];
};

function diasDelRango(desde: string, hasta: string): string[] {
  const n = diasEntreFechas(desde, hasta);
  return Array.from({ length: n + 1 }, (_, i) => sumarDias(desde, i));
}

function serieDiaria(fechas: string[], diasRango: string[]): PuntoSerieDia[] {
  const conteo = new Map<string, number>();
  fechas.forEach((f) => conteo.set(f, (conteo.get(f) ?? 0) + 1));
  return diasRango.map((fecha) => ({ fecha, valor: conteo.get(fecha) ?? 0 }));
}

function deltaPorcentual(actual: number, anterior: number): number | null {
  if (anterior === 0) return actual > 0 ? 100 : null;
  return Math.round(((actual - anterior) / anterior) * 100);
}

// El "Índice de Interacción": quién usa más la app, combinando inicios de
// sesión (accesos_sistema), historias publicadas (historias) y minutos
// conectado (latidos_actividad) -- las 3 fuentes que ya existían o se
// agregaron en el paso anterior. Compara contra el mismo número de días
// inmediatamente antes del rango para las flechas de tendencia de los KPI.
export async function obtenerIndiceInteraccion(desde: string, hasta: string): Promise<IndiceInteraccion> {
  await exigirSesion();
  const supabase = supabaseServer();

  const diasRango = diasDelRango(desde, hasta);
  const desdeAnterior = sumarDias(desde, -diasRango.length);
  const hastaAnterior = sumarDias(desde, -1);

  const [
    { data: usuarios, error: errorUsuarios },
    { data: accesos, error: errorAccesos },
    { data: historias, error: errorHistorias },
    { data: latidos, error: errorLatidos },
    { count: accesosAnterior },
    { count: historiasAnterior },
    { count: latidosAnterior },
  ] = await Promise.all([
    supabase.from("usuarios").select("id, nombre, rol").eq("activo", true).order("nombre"),
    supabase
      .from("accesos_sistema")
      .select("usuario_id, created_at")
      .gte("created_at", `${desde}T00:00:00`)
      .lte("created_at", `${hasta}T23:59:59`),
    supabase
      .from("historias")
      .select("usuario_id, created_at")
      .gte("created_at", `${desde}T00:00:00`)
      .lte("created_at", `${hasta}T23:59:59`),
    supabase
      .from("latidos_actividad")
      .select("usuario_id, creado_en")
      .gte("creado_en", `${desde}T00:00:00`)
      .lte("creado_en", `${hasta}T23:59:59`),
    supabase
      .from("accesos_sistema")
      .select("id", { count: "exact", head: true })
      .gte("created_at", `${desdeAnterior}T00:00:00`)
      .lte("created_at", `${hastaAnterior}T23:59:59`),
    supabase
      .from("historias")
      .select("id", { count: "exact", head: true })
      .gte("created_at", `${desdeAnterior}T00:00:00`)
      .lte("created_at", `${hastaAnterior}T23:59:59`),
    supabase
      .from("latidos_actividad")
      .select("id", { count: "exact", head: true })
      .gte("creado_en", `${desdeAnterior}T00:00:00`)
      .lte("creado_en", `${hastaAnterior}T23:59:59`),
  ]);

  if (errorUsuarios || errorAccesos || errorHistorias || errorLatidos) {
    throw new Error("No se pudo cargar el Índice de Interacción.");
  }

  const sesionesPorUsuario = new Map<string, number>();
  (accesos ?? []).forEach((a) => {
    if (!a.usuario_id) return;
    sesionesPorUsuario.set(a.usuario_id, (sesionesPorUsuario.get(a.usuario_id) ?? 0) + 1);
  });

  const historiasPorUsuario = new Map<string, number>();
  (historias ?? []).forEach((h) => {
    historiasPorUsuario.set(h.usuario_id, (historiasPorUsuario.get(h.usuario_id) ?? 0) + 1);
  });

  const latidosPorUsuario = new Map<string, number>();
  (latidos ?? []).forEach((l) => {
    if (!l.usuario_id) return;
    latidosPorUsuario.set(l.usuario_id, (latidosPorUsuario.get(l.usuario_id) ?? 0) + 1);
  });

  const personas: PersonaInteraccion[] = (usuarios ?? []).map((u) => {
    const sesiones = sesionesPorUsuario.get(u.id) ?? 0;
    const historiasCant = historiasPorUsuario.get(u.id) ?? 0;
    const minutos = Math.round((latidosPorUsuario.get(u.id) ?? 0) * MINUTOS_POR_LATIDO);
    const puntaje = Math.round(sesiones * PESO_SESION + historiasCant * PESO_HISTORIA + minutos * PESO_MINUTO);
    return { usuarioId: u.id, nombre: u.nombre, rol: u.rol, sesiones, historias: historiasCant, minutos, puntaje };
  });
  personas.sort((a, b) => b.puntaje - a.puntaje);

  const totalSesiones = accesos?.length ?? 0;
  const totalHistorias = historias?.length ?? 0;
  const totalMinutos = Math.round((latidos?.length ?? 0) * MINUTOS_POR_LATIDO);

  return {
    sesiones: {
      total: totalSesiones,
      deltaPct: deltaPorcentual(totalSesiones, accesosAnterior ?? 0),
      serie: serieDiaria((accesos ?? []).map((a) => a.created_at.slice(0, 10)), diasRango),
    },
    historias: {
      total: totalHistorias,
      deltaPct: deltaPorcentual(totalHistorias, historiasAnterior ?? 0),
      serie: serieDiaria((historias ?? []).map((h) => h.created_at.slice(0, 10)), diasRango),
    },
    minutos: {
      total: totalMinutos,
      deltaPct: deltaPorcentual(totalMinutos, Math.round((latidosAnterior ?? 0) * MINUTOS_POR_LATIDO)),
      serie: serieDiaria((latidos ?? []).map((l) => l.creado_en.slice(0, 10)), diasRango),
    },
    personas,
  };
}
