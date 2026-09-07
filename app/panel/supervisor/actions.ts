"use server";

import { supabaseServer } from "@/lib/supabase-server";
import { obtenerSesion } from "@/lib/session";
import { hoyPeru, sumarDias } from "@/lib/fechas";

export type Urgencia = "HOY" | "MANANA" | "AYER" | "ANTES_DE_AYER";

export type TiendaClasificada = {
  rutaActivaId: string;
  tiendaId: string;
  tiendaNombre: string;
  fechaPlanificada: string;
  area: string | null;
  enfoque: string | null;
  urgencia: Urgencia;
  yaReportado: boolean;
};

export async function obtenerTiendasClasificadas(): Promise<{
  tiendas: TiendaClasificada[];
  diaDescansoFijo: string | null;
}> {
  const sesion = await obtenerSesion();
  if (!sesion || sesion.rol !== "supervisor") {
    throw new Error("No autorizado.");
  }

  const supabase = supabaseServer();
  const hoy = hoyPeru();
  const manana = sumarDias(hoy, 1);
  const ayer = sumarDias(hoy, -1);

  const { data: usuario } = await supabase
    .from("usuarios")
    .select("descanso")
    .eq("id", sesion.id)
    .maybeSingle();

  const { data: activas, error } = await supabase
    .from("rutas_activas")
    .select("id, fecha_planificada, area, enfoque, tiendas(id, nombre)")
    .eq("usuario_id", sesion.id)
    .order("fecha_planificada", { ascending: false });

  if (error) throw new Error("No se pudo cargar las tiendas asignadas.");

  const { data: reportadas } = await supabase
    .from("rutas_diarias")
    .select("tienda_id")
    .eq("usuario_id", sesion.id);

  const idsReportados = new Set((reportadas ?? []).map((r) => r.tienda_id));

  const tiendas: TiendaClasificada[] = (activas ?? []).map((r: any) => {
    let urgencia: Urgencia;
    if (r.fecha_planificada === hoy) urgencia = "HOY";
    else if (r.fecha_planificada === manana) urgencia = "MANANA";
    else if (r.fecha_planificada === ayer) urgencia = "AYER";
    else urgencia = "ANTES_DE_AYER";

    return {
      rutaActivaId: r.id,
      tiendaId: r.tiendas.id,
      tiendaNombre: r.tiendas.nombre,
      fechaPlanificada: r.fecha_planificada,
