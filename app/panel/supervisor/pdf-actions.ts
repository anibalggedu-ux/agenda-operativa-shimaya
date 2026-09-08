"use server";

import { supabaseServer } from "@/lib/supabase-server";
import { obtenerSesion, tieneBitacora } from "@/lib/session";
import type { ReporteHistorialItem } from "@/lib/generar-pdf";

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
