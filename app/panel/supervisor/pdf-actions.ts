"use server";

import { supabaseServer } from "@/lib/supabase-server";
import { obtenerSesion, tieneBitacora } from "@/lib/session";
import type { ReporteHistorialItem, MarcacionHistorial } from "@/lib/generar-pdf";
import { HORA_LIMITE_TARDANZA } from "../coordinador/constantes";

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
    .select("fecha, observacion, actividad, tiendas(nombre)")
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
  const { data, error } = await supabase
    .from("asistencia")
    .select("fecha, hora_ingreso, hora_salida")
    .eq("usuario_id", sesion.id)
    .gte("fecha", desde)
    .lte("fecha", hasta)
    .order("fecha", { ascending: true });

  if (error) throw new Error("No se pudo cargar las marcaciones.");

  const limite = HORA_LIMITE_TARDANZA[sesion.rol];

  return (data ?? []).map((a) => ({
    fecha: a.fecha,
    horaIngreso: a.hora_ingreso,
    horaSalida: a.hora_salida,
    tarde: !!(limite && a.hora_ingreso && a.hora_ingreso > limite),
  }));
}
