// Cola de respuestas/lecturas de observaciones (tiendas fijas) que no se
// pudieron enviar por falta de señal -- mismo problema y misma solución que
// lib/cola-checklists.ts. "respuesta" es contestar con texto (y de paso
// marca leído); "leido" es solo confirmar que se vio, sin escribir nada.

export type ObservacionPendiente = {
  id: string;
  tipo: "respuesta" | "leido";
  reporteId: string;
  respuesta?: string;
  // Para mostrar en el aviso de "pendientes" sin tener que recargar datos.
  etiqueta: string;
};

const CLAVE = "shimaya_observaciones_pendientes";
const EVENTO_CAMBIO = "shimaya:cola-observaciones-cambio";

export function obtenerObservacionesPendientes(): ObservacionPendiente[] {
  if (typeof window === "undefined") return [];
  try {
    const crudo = window.localStorage.getItem(CLAVE);
    return crudo ? JSON.parse(crudo) : [];
  } catch {
    return [];
  }
}

export function agregarObservacionPendiente(item: ObservacionPendiente): void {
  if (typeof window === "undefined") return;
  try {
    const actuales = obtenerObservacionesPendientes();
    window.localStorage.setItem(CLAVE, JSON.stringify([...actuales, item]));
    window.dispatchEvent(new Event(EVENTO_CAMBIO));
  } catch (error) {
    console.error("No se pudo guardar la observación pendiente:", error);
  }
}

export function quitarObservacionPendiente(id: string): void {
  if (typeof window === "undefined") return;
  try {
    const restantes = obtenerObservacionesPendientes().filter((o) => o.id !== id);
    window.localStorage.setItem(CLAVE, JSON.stringify(restantes));
    window.dispatchEvent(new Event(EVENTO_CAMBIO));
  } catch (error) {
    console.error("No se pudo actualizar la cola de observaciones:", error);
  }
}

export function suscribirseACambiosDeColaObservaciones(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(EVENTO_CAMBIO, callback);
  return () => window.removeEventListener(EVENTO_CAMBIO, callback);
}
