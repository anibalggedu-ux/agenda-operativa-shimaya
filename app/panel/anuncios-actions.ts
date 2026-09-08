"use server";

import { supabaseServer } from "@/lib/supabase-server";
import { obtenerSesion } from "@/lib/session";
import { hoyPeru, calcularProximaFechaAnual } from "@/lib/fechas";

const DIAS_ANTICIPACION_CUMPLEANOS = 2;

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

export type ProximoCumpleanos = {
  usuarioNombre: string;
  rol: string;
  fecha: string;
  diasFaltantes: number;
  edadQueCumple: number | null;
};

// Cumpleaños de cualquier colaborador que caiga dentro de los próximos
// DIAS_ANTICIPACION_CUMPLEANOS días (incluye el día de hoy) — visible para
// cualquier rol autenticado, igual que el resto de Anuncios.
export async function obtenerProximosCumpleanos(): Promise<ProximoCumpleanos[]> {
  const sesion = await obtenerSesion();
  if (!sesion) throw new Error("No autorizado.");

  const supabase = supabaseServer();
  const { data, error } = await supabase
    .from("usuarios")
    .select("nombre, rol, fecha_nacimiento")
    .not("fecha_nacimiento", "is", null);

  if (error) throw new Error("No se pudo cargar los cumpleaños.");

  const hoy = hoyPeru();

  const proximos: ProximoCumpleanos[] = [];
  (data ?? []).forEach((u) => {
    if (!u.fecha_nacimiento) return;
    const [yNac, mNac, dNac] = u.fecha_nacimiento.split("-").map(Number);
    const { fecha, diasFaltantes } = calcularProximaFechaAnual(mNac, dNac, hoy);
    if (diasFaltantes > DIAS_ANTICIPACION_CUMPLEANOS) return;

    const [yProximo] = fecha.split("-").map(Number);
    proximos.push({
      usuarioNombre: u.nombre,
      rol: u.rol,
      fecha,
      diasFaltantes,
      edadQueCumple: yProximo - yNac,
    });
  });

  return proximos.sort((a, b) => a.diasFaltantes - b.diasFaltantes);
}
