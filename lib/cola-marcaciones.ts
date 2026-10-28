// Cola de marcaciones (ingreso/salida) que no se pudieron enviar por falta de
// señal -- pasa seguido en los estacionamientos subterráneos de los centros
// comerciales donde están los locales. Se guarda en el propio celular (con
// la foto ya comprimida, la ubicación y la hora exacta del intento) y el
// componente SincronizadorOffline la reenvía sola apenas vuelve la conexión,
// usando esa hora original -- no la hora en que por fin logra conectar.

export type AccionMarcacion =
  | "llegada-tienda"
  | "salida-tienda"
  | "llegada-evento"
  | "salida-evento"
  | "salida-break"
  | "entrada-break";

export type MarcacionPendiente = {
  id: string;
  accion: AccionMarcacion;
  rutaActivaId?: string | null;
  reporteId?: string | null;
  comunicadoId?: string;
  // Solo para "entrada-break" -- el id de la fila de marcaciones_break que
  // ya quedó creada al marcar la salida.
  breakId?: string;
  foto: string;
  // El break no pide GPS -- opcionales para no forzar un 0,0 falso en esos
  // casos (ver salida-break/entrada-break en enviarPendiente).
  lat?: number;
  lng?: number;
  horaCapturadaMs: number;
  // Justificativo de tardanza (texto + foto opcional), para "llegada-tienda"
  // y "entrada-break".
  justificativoTardanza?: string;
  fotoJustificativoTardanza?: string;
  // Fecha elegida por la persona cuando marcó salida de madrugada (ver
  // confirmarDiaSalida en selector-tiendas.tsx), solo para "salida-tienda".
  fechaAsistenciaElegida?: string;
  // Para mostrar en el aviso de "pendientes" sin tener que recargar datos.
  etiqueta: string;
};

const CLAVE = "shimaya_marcaciones_pendientes";
// Evento propio (no nativo) para avisar a otras partes de la app en la misma
// pestaña que la cola cambió -- "storage" del navegador solo dispara en
// OTRAS pestañas, nunca en la que hizo el cambio.
const EVENTO_CAMBIO = "shimaya:cola-marcaciones-cambio";

export function obtenerMarcacionesPendientes(): MarcacionPendiente[] {
  if (typeof window === "undefined") return [];
  try {
    const crudo = window.localStorage.getItem(CLAVE);
    return crudo ? JSON.parse(crudo) : [];
  } catch {
    return [];
  }
}

export function agregarMarcacionPendiente(item: MarcacionPendiente): void {
  if (typeof window === "undefined") return;
  try {
    const actuales = obtenerMarcacionesPendientes();
    window.localStorage.setItem(CLAVE, JSON.stringify([...actuales, item]));
    window.dispatchEvent(new Event(EVENTO_CAMBIO));
  } catch (error) {
    console.error("No se pudo guardar la marcación pendiente:", error);
  }
}

export function quitarMarcacionPendiente(id: string): void {
  if (typeof window === "undefined") return;
  try {
    const restantes = obtenerMarcacionesPendientes().filter((m) => m.id !== id);
    window.localStorage.setItem(CLAVE, JSON.stringify(restantes));
    window.dispatchEvent(new Event(EVENTO_CAMBIO));
  } catch (error) {
    console.error("No se pudo actualizar la cola de marcaciones:", error);
  }
}

export function suscribirseACambiosDeCola(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(EVENTO_CAMBIO, callback);
  return () => window.removeEventListener(EVENTO_CAMBIO, callback);
}

// Falla por falta de señal (fetch/Server Action que nunca llegó al
// servidor) -- distinto de que el servidor responda con un error real
// (esas ya vienen como {exito:false, mensaje} y no deben quedar en cola).
export function pareceFallaDeConexion(error: unknown): boolean {
  if (typeof navigator !== "undefined" && !navigator.onLine) return true;
  if (error instanceof TypeError) return true;
  const texto = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return texto.includes("fetch") || texto.includes("network") || texto.includes("conexión") || texto.includes("conexion");
}

// Foto ya tomada (y comprimida) para una marcación de llegada/salida a
// tienda, mientras espera un reintento manual -- distinto de la cola de
// arriba: esto cubre el caso en que el GPS falló (típico dentro de un local,
// antes de siquiera intentar el envío) o el servidor devolvió un error que
// no es de conexión, donde SelectorTiendas guarda la foto en memoria con un
// botón "Reintentar envío" ("tu foto quedó guardada, no hace falta tomarla
// de nuevo"). Sin este respaldo en localStorage, esa promesa era falsa: si
// la persona cerraba la app antes de tocar "Reintentar", la foto se perdía
// sin dejar rastro -- ni en la cola de arriba (no hubo falla de conexión),
// ni en la base (nunca se llegó a enviar) -- y más tarde la tienda aparecía
// como si no se hubiera marcado nada (caso real: Anibal Garrido, tienda El
// Polo, oct 2026).
//
// Guardar esto bajo una clave por tienda/evento no alcanza: ese aviso de
// "Reintentar envío" solo se dibuja dentro de la tarjeta de ESA tienda/
// evento puntual -- si la persona se fue a otra tienda, o pasó el día, o el
// evento ya no es "de hoy", esa tarjeta ni siquiera se vuelve a montar, así
// que el aviso queda invisible para siempre aunque el dato siga guardado en
// el celular (caso real: Elizabeth Vera, Las Begonias, oct 2026 -- la salida
// falló sin ser "sin señal", y como al día siguiente ya estaba en otra
// sede, nunca volvió a ver el botón de reintentar). `origen` + los campos de
// abajo alcanzan para que SincronizadorOffline (montado una sola vez, visible
// desde cualquier pantalla) pueda reintentar genéricamente sin depender de
// qué tarjeta esté abierta.
export type FotoPendienteTienda = {
  origen: "tienda" | "evento" | "break";
  tipo: "llegada" | "salida" | "entrada";
  foto: string;
  horaCapturadaMs: number;
  etiqueta: string;
  // Solo "tienda".
  rutaActivaId?: string | null;
  reporteId?: string | null;
  // Solo "evento".
  comunicadoId?: string;
  // Solo "entrada" de break -- el id de la fila de marcaciones_break que ya
  // quedó creada al marcar la salida.
  breakId?: string;
};

function clavePendiente(claveTarjeta: string): string {
  return `shimaya_foto_pendiente_${claveTarjeta}`;
}

const PREFIJO_PENDIENTE = "shimaya_foto_pendiente_";
const EVENTO_CAMBIO_FOTOS_PENDIENTES = "shimaya:fotos-pendientes-cambio";

export function guardarFotoPendienteTienda(claveTarjeta: string, dato: FotoPendienteTienda): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(clavePendiente(claveTarjeta), JSON.stringify(dato));
    window.dispatchEvent(new Event(EVENTO_CAMBIO_FOTOS_PENDIENTES));
  } catch (error) {
    console.error("No se pudo guardar la foto pendiente:", error);
  }
}

export function leerFotoPendienteTienda(claveTarjeta: string): FotoPendienteTienda | null {
  if (typeof window === "undefined") return null;
  try {
    const crudo = window.localStorage.getItem(clavePendiente(claveTarjeta));
    return crudo ? JSON.parse(crudo) : null;
  } catch {
    return null;
  }
}

export function borrarFotoPendienteTienda(claveTarjeta: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(clavePendiente(claveTarjeta));
    window.dispatchEvent(new Event(EVENTO_CAMBIO_FOTOS_PENDIENTES));
  } catch (error) {
    console.error("No se pudo borrar la foto pendiente:", error);
  }
}

// Para el aviso global (SincronizadorOffline) -- recorre TODAS las fotos
// pendientes de reintento manual, sin importar de qué tarjeta/tienda/evento
// vinieron, así ninguna queda escondida detrás de una pantalla que la
// persona ya no vuelve a abrir.
export function obtenerTodasLasFotosPendientes(): { clave: string; dato: FotoPendienteTienda }[] {
  if (typeof window === "undefined") return [];
  const resultado: { clave: string; dato: FotoPendienteTienda }[] = [];
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const clave = window.localStorage.key(i);
      if (!clave || !clave.startsWith(PREFIJO_PENDIENTE)) continue;
      try {
        const crudo = window.localStorage.getItem(clave);
        if (!crudo) continue;
        resultado.push({ clave, dato: JSON.parse(crudo) });
      } catch {
        // Una entrada corrupta no debe tumbar el resto del aviso.
      }
    }
  } catch (error) {
    console.error("No se pudo leer las fotos pendientes:", error);
  }
  return resultado;
}

export function borrarFotoPendientePorClave(clave: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(clave);
    window.dispatchEvent(new Event(EVENTO_CAMBIO_FOTOS_PENDIENTES));
  } catch (error) {
    console.error("No se pudo borrar la foto pendiente:", error);
  }
}

export function suscribirseACambiosDeFotosPendientes(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(EVENTO_CAMBIO_FOTOS_PENDIENTES, callback);
  // "storage" dispara en otras pestañas/ventanas cuando cambia localStorage
  // -- relevante acá porque esto puede escribirse desde selector-tiendas.tsx,
  // eventos-hoy.tsx o break-widget.tsx, cada uno en su propio componente.
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(EVENTO_CAMBIO_FOTOS_PENDIENTES, callback);
    window.removeEventListener("storage", callback);
  };
}
