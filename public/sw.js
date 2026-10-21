// Service Worker -- hace dos cosas sin relación entre sí:
// 1) Notificaciones push (de siempre): puede recibir un "push" y mostrar una
//    notificación del sistema aunque la pestaña/app esté cerrada o la
//    pantalla apagada.
// 2) Caché mínima para que el panel ABRA aunque no haya señal en absoluto
//    (estacionamientos subterráneos, zonas sin cobertura) -- antes, sin
//    señal, la app ni siquiera cargaba la pantalla para poder usar las colas
//    de "pendientes por enviar" (ver lib/cola-*.ts). Deliberadamente NO
//    cachea datos (nada de Server Actions, que además son POST y el
//    navegador nunca se los manda a un Service Worker) -- cualquier
//    respuesta guardada puede quedar vieja, así que primero intenta la red
//    y recién si falla por completo usa lo que tenga guardado. Ver
//    CACHE_VERSION más abajo antes de tocar la lógica de caché.

// Subir este número (no el número de versión de la app) invalida TODO lo
// que este Service Worker tenga guardado -- solo hace falta si cambia la
// estrategia de caché en sí, no en cada deploy normal: los archivos propios
// de Next (_next/static/...) ya llevan un hash en el nombre, así que una
// build nueva simplemente agrega archivos nuevos sin pisar los viejos.
const CACHE_VERSION = "shimaya-v1";
const CACHE_ESTATICOS = `${CACHE_VERSION}-estaticos`;
const CACHE_PAGINAS = `${CACHE_VERSION}-paginas`;
const URL_SIN_CONEXION = "/sin-conexion.html";

// Sin esto, una actualización de este archivo (ej. el fix del "tag" que
// hacía que las notificaciones se taparan entre sí) se queda instalada pero
// "esperando" -- el navegador sigue usando la versión vieja hasta que la
// persona cierre la app del todo. skipWaiting()+claim() fuerza a que la
// nueva versión tome control apenas se instala, sin esperar a que se cierre
// nada.
self.addEventListener("install", (evento) => {
  evento.waitUntil(
    Promise.all([caches.open(CACHE_ESTATICOS).then((c) => c.add(URL_SIN_CONEXION)), self.skipWaiting()])
  );
});
self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    Promise.all([
      // Borra cachés de una versión anterior de ESTA estrategia (no de un
      // deploy normal de la app, ver CACHE_VERSION arriba).
      caches.keys().then((claves) =>
        Promise.all(
          claves.filter((c) => !c.startsWith(CACHE_VERSION)).map((c) => caches.delete(c))
        )
      ),
      self.clients.claim(),
    ])
  );
});

self.addEventListener("fetch", (evento) => {
  const peticion = evento.request;
  // Nunca se mete con nada que no sea GET (las Server Actions son POST) ni
  // con peticiones a otro origen (ej. Supabase, R2) -- esas siempre van
  // directo a la red, como si este Service Worker no existiera.
  if (peticion.method !== "GET") return;
  const url = new URL(peticion.url);
  if (url.origin !== self.location.origin) return;

  // Archivos propios de Next con hash en el nombre -- inmutables, se pueden
  // guardar para siempre sin riesgo de quedar "viejos": una build nueva usa
  // nombres de archivo distintos, nunca pisa estos.
  //
  // El guardado en caché (caches.open(...).then(...)) va envuelto en
  // evento.waitUntil en los tres casos de abajo -- sin eso, es un trabajo
  // "de fondo" que el navegador no se compromete a terminar: si la persona
  // cierra la app (o se queda sin señal) justo después de que la pantalla ya
  // cargó, puede cortarlo a mitad de camino, y esa pantalla queda SIN
  // guardar pese a haberse visto. waitUntil le avisa al navegador "no demos
  // por terminado este fetch hasta que esto también termine".
  if (url.pathname.startsWith("/_next/static/")) {
    evento.respondWith(
      caches.match(peticion, { ignoreVary: true }).then((guardado) => {
        if (guardado) return guardado;
        return fetch(peticion).then((respuesta) => {
          const copia = respuesta.clone();
          evento.waitUntil(caches.open(CACHE_ESTATICOS).then((c) => c.put(peticion, copia)));
          return respuesta;
        });
      })
    );
    return;
  }

  // Navegación a una página (abrir la app, entrar a una pestaña del menú) --
  // primero la red, para que el contenido esté siempre al día; solo si la
  // red falla por completo (sin señal) se usa la última copia guardada de
  // ESA página, o si nunca se visitó, la pantalla de "sin conexión".
  if (peticion.mode === "navigate") {
    evento.respondWith(
      fetch(peticion)
        .then((respuesta) => {
          const copia = respuesta.clone();
          evento.waitUntil(caches.open(CACHE_PAGINAS).then((c) => c.put(peticion, copia)));
          return respuesta;
        })
        .catch(() =>
          // ignoreVary: true -- Next.js agrega cabeceras Vary (para la
          // navegación entre rutas) y por defecto Cache API las respeta al
          // buscar: si la petición que falló ahora no trae exactamente las
          // mismas cabeceras que la que se guardó (algo que varía solo con
          // que el navegador arme la petición un poco distinto cada vez),
          // la búsqueda fallaba igual aunque la URL fuera idéntica.
          caches.match(peticion, { ignoreVary: true }).then((guardado) => {
            if (guardado) return guardado;
            // La URL exacta no está guardada -- el caso típico es "/", que
            // ESTANDO CONECTADO redirige sola al panel según la sesión (JWT
            // en una cookie), pero esa redirección en sí nunca queda
            // guardada porque nunca llega a completarse sin señal. Mejor
            // abrir la última pantalla del panel que sí esté guardada que
            // mandar a la persona a un callejón sin salida.
            return caches.open(CACHE_PAGINAS).then((c) =>
              c.keys().then((claves) => {
                const delPanel = claves.find((req) => new URL(req.url).pathname.startsWith("/panel/"));
                return delPanel ? c.match(delPanel) : null;
              })
            );
          }).then((guardado) => guardado || caches.match(URL_SIN_CONEXION))
        )
    );
    return;
  }

  // El resto (datos de React Server Components al cambiar de pestaña, fetch
  // de las propias páginas, etc.) -- red primero, y si no hay señal, la
  // última copia guardada de esa misma petición si existe; si no, se deja
  // fallar como fallaría sin este Service Worker (cada pantalla ya maneja
  // su propio estado de "no se pudo cargar").
  evento.respondWith(
    fetch(peticion)
      .then((respuesta) => {
        const copia = respuesta.clone();
        evento.waitUntil(caches.open(CACHE_PAGINAS).then((c) => c.put(peticion, copia)));
        return respuesta;
      })
      .catch(() => caches.match(peticion, { ignoreVary: true }).then((guardado) => guardado || Promise.reject()))
  );
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
