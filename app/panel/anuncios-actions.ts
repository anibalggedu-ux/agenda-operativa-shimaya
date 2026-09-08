"use server";

import { supabaseServer } from "@/lib/supabase-server";
import { obtenerSesion } from "@/lib/session";
import { hoyPeru } from "@/lib/fechas";

export type ComunicadoPublico = {
  id: string;
  fecha: string;
  tipo: string;
  mensaje: string;
  autor: string | null;
  fechaEvento: string | null;
  ubicacion: string | null;
};

// Lectura de anuncios para cualquier rol autenticado — a diferencia de
// app/panel/coordinador/actions.ts, que además permite crear/eliminar y
// está restringido a Coordinador. Solo muestra los vigentes: si tienen
// fecha de evento, desaparecen de aquí al día siguiente del evento (pero
// el registro se conserva en la base de datos para historial).
export async function obtenerAnunciosRecientes(): Promise<ComunicadoPublico[]> {
  const sesion = await obtenerSesion();
  if (!sesion) throw new Error("No autorizado.");

  const supabase = supabaseServer();
  const hoy = hoyPeru();

  const { data, error } = await supabase
    .from("comunicados")
    .select("id, fecha, tipo, mensaje, autor, fecha_evento, ubicacion")
    .or(`fecha_evento.is.null,fecha_evento.gte.${hoy}`)
    .order("fecha", { ascending: false })
    .limit(10);

  if (error) throw new Error("No se pudo cargar los anuncios.");

  return (data ?? []).map((c) => ({
    id: c.id,
    fecha: c.fecha,
    tipo: c.tipo,
    mensaje: c.mensaje,
    autor: c.autor,
    fechaEvento: c.fecha_evento,
    ubicacion: c.ubicacion,
  }));
}
