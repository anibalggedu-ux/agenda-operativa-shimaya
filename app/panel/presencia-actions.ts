"use server";

import { supabaseServer } from "@/lib/supabase-server";
import { obtenerSesion } from "@/lib/session";

// Marca que la persona está usando la app ahora mismo. Lo llama la
// campanita de notificaciones (que está en todos los paneles) mientras la
// pantalla está visible; con eso se muestra "En línea" en su perfil y en
// las tarjetas del equipo (ver lib/presencia.ts). Solo guarda la hora, no
// la ubicación.
export async function marcarActividad(): Promise<void> {
  const sesion = await obtenerSesion();
  if (!sesion) return;
  await supabaseServer()
    .from("usuarios")
    .update({ ultima_actividad: new Date().toISOString() })
    .eq("id", sesion.id);
}
