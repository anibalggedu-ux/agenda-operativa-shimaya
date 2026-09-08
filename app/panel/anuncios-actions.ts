"use server";

import { supabaseServer } from "@/lib/supabase-server";
import { obtenerSesion } from "@/lib/session";

export type ComunicadoPublico = {
  id: string;
  fecha: string;
  tipo: string;
  mensaje: string;
  autor: string | null;
};

// Lectura de anuncios para cualquier rol autenticado — a diferencia de
// app/panel/coordinador/actions.ts, que además permite crear/eliminar y
// está restringido a Coordinador.
export async function obtenerAnunciosRecientes(): Promise<ComunicadoPublico[]> {
  const sesion = await obtenerSesion();
  if (!sesion) throw new Error("No autorizado.");

  const supabase = supabaseServer();
  const { data, error } = await supabase
    .from("comunicados")
    .select("id, fecha, tipo, mensaje, autor")
    .order("fecha", { ascending: false })
    .limit(10);

  if (error) throw new Error("No se pudo cargar los anuncios.");
  return data ?? [];
}
