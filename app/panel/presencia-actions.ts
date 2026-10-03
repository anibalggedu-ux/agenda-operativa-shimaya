"use server";

import { supabaseServer } from "@/lib/supabase-server";
import { obtenerSesion } from "@/lib/session";

// Marca que la persona está usando la app ahora mismo. Lo llama la
// campanita de notificaciones (que está en todos los paneles) mientras la
// pantalla está visible; con eso se muestra "En línea" en su perfil y en
// las tarjetas del equipo (ver lib/presencia.ts). Solo guarda la hora, no
// la ubicación.
//
// De paso deja un "latido" en latidos_actividad -- cada fila representa
// ~45s de uso real (el intervalo con el que la campanita llama a esta
// función, ver INTERVALO_REVISION_MS en campana-notificaciones.tsx), así que
// contar filas en un rango estima los minutos conectados de cada persona
// para el Índice de Interacción de Central Analítica. Se depuran solas
// pasados ~35 días (ver api/cron/depurar-marcaciones).
export async function marcarActividad(): Promise<void> {
  const sesion = await obtenerSesion();
  if (!sesion) return;
  const supabase = supabaseServer();
  await Promise.all([
    supabase.from("usuarios").update({ ultima_actividad: new Date().toISOString() }).eq("id", sesion.id),
    supabase.from("latidos_actividad").insert({ usuario_id: sesion.id }),
  ]);
}
