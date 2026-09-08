"use server";

import { supabaseServer } from "@/lib/supabase-server";
import { obtenerSesion, tieneBitacora } from "@/lib/session";
import { sumarDias, diaLaboralPeru } from "@/lib/fechas";

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
  if (!sesion || !tieneBitacora(sesion.rol)) {
    throw new Error("No autorizado.");
  }

  const supabase = supabaseServer();
  const hoy = diaLaboralPeru(sesion.rol === "capacitador");
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
      area: r.area,
      enfoque: r.enfoque,
      urgencia,
      yaReportado: idsReportados.has(r.tiendas.id),
    };
  });

  return { tiendas, diaDescansoFijo: usuario?.descanso ?? null };
}

export type ResultadoReporte = { exito: boolean; mensaje?: string };

export async function enviarReporte(
  _prevState: ResultadoReporte,
  formData: FormData
): Promise<ResultadoReporte> {
  const sesion = await obtenerSesion();
  if (!sesion || !tieneBitacora(sesion.rol)) {
    return { exito: false, mensaje: "No autorizado." };
  }

  const rutaActivaId = String(formData.get("rutaActivaId") || "");
  const tiendaId = String(formData.get("tiendaId") || "");
  const observacion = String(formData.get("observacion") || "").trim();
  const actividad = String(formData.get("actividad") || "").trim();

  if (!tiendaId || !observacion) {
    return { exito: false, mensaje: "Completa la observación antes de enviar." };
  }

  const supabase = supabaseServer();

  const { error: errorInsert } = await supabase.from("rutas_diarias").insert({
    fecha: diaLaboralPeru(sesion.rol === "capacitador"),
    usuario_id: sesion.id,
    tienda_id: tiendaId,
    rol: sesion.rol,
    observacion,
    actividad,
  });

  if (errorInsert) {
    return { exito: false, mensaje: "No se pudo guardar el reporte. Intenta de nuevo." };
  }

  if (rutaActivaId) {
    await supabase.from("rutas_activas").delete().eq("id", rutaActivaId);
  }

  return { exito: true, mensaje: "Reporte enviado correctamente." };
}

export type MiReporte = {
  id: string;
  fecha: string;
  tiendaNombre: string;
  observacion: string;
  actividad: string | null;
  respuesta: string | null;
  respuestaPor: string | null;
};

export async function obtenerMisReportesRecientes(): Promise<MiReporte[]> {
  const sesion = await obtenerSesion();
  if (!sesion || !tieneBitacora(sesion.rol)) {
    throw new Error("No autorizado.");
  }

  const supabase = supabaseServer();
  const { data, error } = await supabase
    .from("rutas_diarias")
    .select("id, fecha, observacion, actividad, respuesta, respuesta_por, tiendas(nombre)")
    .eq("usuario_id", sesion.id)
    .order("fecha", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(15);

  if (error) throw new Error("No se pudo cargar tus reportes.");

  return (data ?? []).map((r: any) => ({
    id: r.id,
    fecha: r.fecha,
    tiendaNombre: r.tiendas?.nombre ?? "—",
    observacion: r.observacion,
    actividad: r.actividad,
    respuesta: r.respuesta,
    respuestaPor: r.respuesta_por,
  }));
}