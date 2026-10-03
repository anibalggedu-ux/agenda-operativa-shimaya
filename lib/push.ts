import webpush from "web-push";

// Configura web-push una sola vez por instancia del servidor (las variables
// VAPID_* se generaron una vez con webpush.generateVAPIDKeys() y viven como
// variables de entorno en Vercel -- nunca en el código).
let configurado = false;
function asegurarConfiguracion() {
  if (configurado) return;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) {
    throw new Error("Faltan las variables VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY/VAPID_SUBJECT.");
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configurado = true;
}

export type SuscripcionPush = { endpoint: string; p256dh: string; auth: string };

// Manda la notificación a UN dispositivo suscrito. "expirada" avisa a quien
// llama que el navegador ya invalidó esa suscripción (se desinstaló la app,
// se borraron los datos del sitio, etc.) para que la borre de la base y no
// se siga intentando en vano.
export async function enviarNotificacionPush(
  suscripcion: SuscripcionPush,
  payload: { titulo: string; cuerpo: string; url?: string }
): Promise<{ ok: boolean; expirada: boolean }> {
  asegurarConfiguracion();
  try {
    await webpush.sendNotification(
      { endpoint: suscripcion.endpoint, keys: { p256dh: suscripcion.p256dh, auth: suscripcion.auth } },
      JSON.stringify(payload)
    );
    return { ok: true, expirada: false };
  } catch (error: any) {
    const expirada = error?.statusCode === 404 || error?.statusCode === 410;
    if (!expirada) console.error("No se pudo enviar la notificación push:", error);
    return { ok: false, expirada };
  }
}
