import { supabaseServer } from "@/lib/supabase-server";
import { enviarNotificacionPush } from "@/lib/push";

// Punto único para mandar push a un grupo de usuarios desde cualquier flujo
// (anuncios, encuestas, rutas, etc.) -- a diferencia del cron de Mi Agenda,
// esto se dispara al momento del evento, no en una revisión periódica.
export async function notificarPush(
  usuarioIds: string[],
  payload: { titulo: string; cuerpo: string; url?: string }
): Promise<void> {
  const ids = Array.from(new Set(usuarioIds)).filter(Boolean);
  if (ids.length === 0) return;

  const supabase = supabaseServer();
  const { data: suscripciones } = await supabase
    .from("suscripciones_push")
    .select("id, endpoint, p256dh, auth")
    .in("usuario_id", ids);

  if (!suscripciones || suscripciones.length === 0) return;

  const idsExpiradas: string[] = [];
  await Promise.all(
    suscripciones.map(async (s) => {
      const resultado = await enviarNotificacionPush(
        { endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth },
        payload
      );
      if (resultado.expirada) idsExpiradas.push(s.id);
    })
  );

  if (idsExpiradas.length > 0) {
    await supabase.from("suscripciones_push").delete().in("id", idsExpiradas);
  }
}
