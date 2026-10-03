"use server";

import { supabaseServer } from "@/lib/supabase-server";
import { exigirSesion } from "@/lib/session";

export type ResultadoAccion = { exito: boolean; mensaje?: string };

// La clave pública VAPID no es secreta (viaja al navegador para que pueda
// suscribirse) -- se expone por una acción en vez de NEXT_PUBLIC_* para no
// quedar quemada en el bundle, siguiendo el mismo criterio que el resto de
// la app con las claves de Supabase.
export async function obtenerClavePublicaPush(): Promise<string | null> {
  await exigirSesion();
  return process.env.VAPID_PUBLIC_KEY ?? null;
}

export async function guardarSuscripcionPush(
  endpoint: string,
  p256dh: string,
  auth: string
): Promise<ResultadoAccion> {
  const sesion = await exigirSesion();
  const supabase = supabaseServer();

  // Un mismo endpoint (navegador+dispositivo) solo puede pertenecer a una
  // persona a la vez -- si alguien cierra sesión y entra otro usuario desde
  // el mismo celular, la suscripción pasa a ser de quien la activó último.
  const { error } = await supabase
    .from("suscripciones_push")
    .upsert({ usuario_id: sesion.id, endpoint, p256dh, auth }, { onConflict: "endpoint" });

  if (error) return { exito: false, mensaje: "No se pudo activar las notificaciones." };
  return { exito: true };
}

export async function eliminarSuscripcionPush(endpoint: string): Promise<ResultadoAccion> {
  const sesion = await exigirSesion();
  const supabase = supabaseServer();

  const { error } = await supabase
    .from("suscripciones_push")
    .delete()
    .eq("endpoint", endpoint)
    .eq("usuario_id", sesion.id);

  if (error) return { exito: false, mensaje: "No se pudo desactivar las notificaciones." };
  return { exito: true };
}

// Si ya existe una suscripción activa para este dispositivo+persona, para
// que el botón arranque mostrando el estado correcto en vez de "Activar"
// aunque ya esté prendido.
export async function tieneSuscripcionPush(endpoint: string): Promise<boolean> {
  const sesion = await exigirSesion();
  const supabase = supabaseServer();

  const { data } = await supabase
    .from("suscripciones_push")
    .select("id")
    .eq("endpoint", endpoint)
    .eq("usuario_id", sesion.id)
    .maybeSingle();

  return !!data;
}
