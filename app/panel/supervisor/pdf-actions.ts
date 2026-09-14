"use server";

import { supabaseServer } from "@/lib/supabase-server";
import { obtenerSesion, tieneBitacora } from "@/lib/session";
import type { ReporteHistorialItem, MarcacionHistorial } from "@/lib/generar-pdf";
import { resolverHoraLimite } from "@/lib/puntualidad";

export async function obtenerHistorialReportes(
  desde: string,
  hasta: string
): Promise<ReporteHistorialItem[]> {
  const sesion = await obtenerSesion();
  if (!sesion || !tieneBitacora(sesion.rol)) {
    throw new Error("No autorizado.");
  }

  const supabase = supabaseServer();
  const { data, error } = await supabase
    .from("rutas_diarias")
    .select("fecha, observacion, actividad, tiendas!tienda_id(nombre)")
    .eq("usuario_id", sesion.id)
    .gte("fecha", desde)
    .lte("fecha", hasta)
    .order("fecha", { ascending: true });

  if (error) throw new Error("No se pudo cargar el historial de reportes.");

  return (data ?? []).map((r: any) => ({
    fecha: r.fecha,
    tiendaNombre: r.tiendas.nombre,
    observacion: r.observacion,
    actividad: r.actividad,
  }));
}

export async function obtenerHistorialMarcaciones(
  desde: string,
  hasta: string
): Promise<MarcacionHistorial[]> {
  const sesion = await obtenerSesion();
  if (!sesion || !tieneBitacora(sesion.rol)) {
    throw new Error("No autorizado.");
  }

  const supabase = supabaseServer();
  const [{ data, error }, { data: usuario }] = await Promise.all([
    supabase
      .from("asistencia")
      .select("fecha, hora_ingreso, hora_salida")
      .eq("usuario_id", sesion.id)
      .gte("fecha", desde)
      .lte("fecha", hasta)
      .order("fecha", { ascending: true }),
    supabase.from("usuarios").select("hora_limite_ingreso").eq("id", sesion.id).maybeSingle(),
  ]);

  if (error) throw new Error("No se pudo cargar las marcaciones.");

  const limite = resolverHoraLimite(sesion.rol, usuario?.hora_limite_ingreso);

  return (data ?? []).map((a) => ({
    fecha: a.fecha,
    horaIngreso: a.hora_ingreso,
    horaSalida: a.hora_salida,
    tarde: !!(limite && a.hora_ingreso && a.hora_ingreso > limite),
  }));
}

export async function obtenerMisAutoasignaciones(desde: string, hasta: string): Promise<number> {
  const sesion = await obtenerSesion();
  if (!sesion || !tieneBitacora(sesion.rol)) throw new Error("No autorizado.");

  const supabase = supabaseServer();
  const { count, error } = await supabase
    .from("rutas_diarias")
    .select("id", { count: "exact", head: true })
    .eq("usuario_id", sesion.id)
    .not("origen_tienda_id", "is", null)
    .gte("fecha", desde)
    .lte("fecha", hasta);

  if (error) throw new Error("No se pudo cargar las auto-asignaciones.");
  return count ?? 0;
}

export type AsignacionEspecialPdf = { tipo: string; fechaInicio: string; fechaFin: string; motivo: string | null };

export async function obtenerMisAsignacionesEspeciales(
  desde: string,
  hasta: string
): Promise<AsignacionEspecialPdf[]> {
  const sesion = await obtenerSesion();
  if (!sesion || !tieneBitacora(sesion.rol)) throw new Error("No autorizado.");

  const supabase = supabaseServer();
  const { data, error } = await supabase
    .from("asignaciones_especiales")
    .select("tipo, fecha_inicio, fecha_fin, motivo")
    .eq("usuario_id", sesion.id)
    .lte("fecha_inicio", hasta)
    .gte("fecha_fin", desde)
    .order("fecha_inicio", { ascending: true });

  if (error) throw new Error("No se pudo cargar las asignaciones especiales.");
  return (data ?? []).map((a) => ({
    tipo: a.tipo,
    fechaInicio: a.fecha_inicio,
    fechaFin: a.fecha_fin,
    motivo: a.motivo ?? null,
  }));
}

export type PerfilPdf = {
  rol: string;
  tiendasPermanentes: string[];
  diasDescanso: string[];
};

export async function obtenerPerfilParaPdf(): Promise<PerfilPdf> {
  const sesion = await obtenerSesion();
  if (!sesion || !tieneBitacora(sesion.rol)) {
    throw new Error("No autorizado.");
  }

  const supabase = supabaseServer();
  const [{ data: usuario }, { data: permanentes }] = await Promise.all([
    supabase.from("usuarios").select("dias_descanso").eq("id", sesion.id).maybeSingle(),
    supabase.from("tiendas_permanentes").select("tiendas(nombre)").eq("usuario_id", sesion.id),
  ]);

  return {
    rol: sesion.rol,
    tiendasPermanentes: (permanentes ?? [])
      .map((p: any) => p.tiendas?.nombre as string | undefined)
      .filter((n): n is string => !!n),
    diasDescanso: usuario?.dias_descanso ?? [],
  };
}
