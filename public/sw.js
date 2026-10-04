// Service Worker de notificaciones push -- vive aparte de la app en sí, por
// eso puede recibir un "push" y mostrar una notificación del sistema aunque
// la pestaña/app esté cerrada o la pantalla apagada. No cachea nada ni
// intercepta peticiones: solo atiende push y el toque sobre la notificación.

// Sin esto, una actualización de este archivo (ej. el fix del "tag" que
// hacía que las notificaciones se taparan entre sí) se queda instalada pero
// "esperando" -- el navegador sigue usando la versión vieja para atender los
// push hasta que la persona cierre la app del todo. skipWaiting()+claim()
// fuerza a que la nueva versión tome control apenas se instala, sin esperar
// a que se cierre nada.
self.addEventListener("install", (evento) => {
  evento.waitUntil(self.skipWaiting());
});
self.addEventListener("activate", (evento) => {
  evento.waitUntil(self.clients.claim());
});

self.addEventListener("push", (evento) => {
  let datos = { titulo: "Shimaya", cuerpo: "Tienes un recordatorio pendiente.", url: "/" };
  try {
    if (evento.data) datos = { ...datos, ...evento.data.json() };
  } catch {
    // Si el payload no es JSON válido, se usa el texto por defecto de arriba.
  }

  // Sin "tag" por defecto: dos notificaciones con el mismo tag se
  // reemplazan entre sí en la bandeja (solo queda la última) en vez de
  // apilarse -- quien manda el push puede pasar un tag a propósito cuando sí
  // quiere ese reemplazo (ej. ir actualizando un mismo aviso).
  const opciones = {
    body: datos.cuerpo,
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    vibrate: [200, 100, 200],
    data: { url: datos.url },
    actions: [{ action: "abrir", title: "Abrir app" }],
  };
  if (datos.tag) opciones.tag = datos.tag;

  evento.waitUntil(self.registration.showNotification(datos.titulo, opciones));
});

// Al tocar la notificación O el botón "Abrir app": si ya hay una pestaña de
// la app abierta, la enfoca; si no, abre una nueva. Es el mismo destino en
// ambos casos, así que no hace falta distinguir evento.action.
self.addEventListener("notificationclick", (evento) => {
  evento.notification.close();
  const url = evento.notification.data?.url || "/";

  evento.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((listaClientes) => {
      for (const cliente of listaClientes) {
        if (cliente.url.includes(self.location.origin) && "focus" in cliente) {
          return cliente.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
