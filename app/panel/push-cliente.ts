import { obtenerClavePublicaPush, guardarSuscripcionPush } from "./notificaciones-push-actions";

// Lógica de activación de push compartida entre el toggle manual de Mi
// Agenda (notificaciones-toggle.tsx) y la activación automática al aceptar
// el Aviso de Privacidad (aviso-privacidad-modal.tsx) -- antes vivía
// duplicada solo en el toggle.

// La clave pública VAPID viaja en base64url; el navegador la necesita como
// bytes para pushManager.subscribe().
function base64UrlABytes(base64Url: string): Uint8Array {
  const relleno = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + relleno).replace(/-/g, "+").replace(/_/g, "/");
  const binario = atob(base64);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return bytes;
}

export function soportaPush(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window;
}

export type ResultadoActivarPush = { exito: boolean; mensaje?: string };

// Pide permiso, registra el Service Worker y guarda la suscripción. Llamarla
// fuera de un gesto del usuario (click) puede hacer que el navegador
// bloquee el permiso silenciosamente -- por eso quien la use debe invocarla
// lo antes posible dentro del handler del click, no después de otro await.
export async function activarNotificacionesPush(): Promise<ResultadoActivarPush> {
  if (!soportaPush()) return { exito: false, mensaje: "Este navegador no soporta notificaciones push." };

  const permiso = await Notification.requestPermission();
  if (permiso !== "granted") {
    return { exito: false, mensaje: "No se dio el permiso de notificaciones." };
  }

  const clave = await obtenerClavePublicaPush();
  if (!clave) return { exito: false, mensaje: "Las notificaciones no están configuradas todavía." };

  const registro = await navigator.serviceWorker.register("/sw.js");
  let sub = await registro.pushManager.getSubscription();
  if (!sub) {
    sub = await registro.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlABytes(clave) as BufferSource,
    });
  }
  const json = sub.toJSON();
  if (!json.keys?.p256dh || !json.keys?.auth) {
    return { exito: false, mensaje: "No se pudo activar las notificaciones." };
  }

  return guardarSuscripcionPush(sub.endpoint, json.keys.p256dh, json.keys.auth);
}
