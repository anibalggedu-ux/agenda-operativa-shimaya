// Cola de marcaciones (ingreso/salida) que no se pudieron enviar por falta de
// señal -- pasa seguido en los estacionamientos subterráneos de los centros
// comerciales donde están los locales. Se guarda en el propio celular (con
// la foto ya comprimida, la ubicación y la hora exacta del intento) y el
// componente SincronizadorOffline la reenvía sola apenas vuelve la conexión,
// usando esa hora original -- no la hora en que por fin logra conectar.

export type AccionMarcacion = "llegada-tienda" | "salida-tienda" | "llegada-evento" | "salida-evento";

export type MarcacionPendiente = {
  id: string;
  accion: AccionMarcacion;
  rutaActivaId?: string | null;
  reporteId?: string | null;
  comunicadoId?: string;
  foto: string;
  lat: number;
  lng: number;
  horaCapturadaMs: number;
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
