import type { TipoRegistroEvidencia } from "./evidencias-constantes";

// Cola de fotos de evidencia (checklist de visita / auditoría) que no se
// pudieron subir -- mismo problema y misma solución que
// lib/cola-marcaciones.ts y lib/cola-checklists.ts. A diferencia de esas,
// acá el registro en sí (el checklist o la auditoría) ya está guardado en
// la base con un id real antes de que arranque la subida de fotos -- lo
// único que se puede perder es la foto. Se encola ANTES de intentar subirla
// (no solo cuando falla), así que sobrevive aunque la app se cierre a mitad
// de la subida, no solo si el error fue justo de conexión.

export type FotoEvidenciaPendiente = {
  id: string;
  tipo: TipoRegistroEvidencia;
  registroId: string;
  dataUrl: string;
  miniDataUrl?: string;
  pie: string;
  // Para mostrar en el aviso de "pendientes" sin tener que recargar datos.
  etiqueta: string;
};

const CLAVE = "shimaya_evidencias_pendientes";
// Evento propio (no nativo) para avisar a otras partes de la app en la misma
// pestaña que la cola cambió -- "storage" del navegador solo dispara en
// OTRAS pestañas, nunca en la que hizo el cambio.
const EVENTO_CAMBIO = "shimaya:cola-evidencias-cambio";

export function obtenerEvidenciasPendientes(): FotoEvidenciaPendiente[] {
  if (typeof window === "undefined") return [];
  try {
    const crudo = window.localStorage.getItem(CLAVE);
    return crudo ? JSON.parse(crudo) : [];
  } catch {
    return [];
  }
}

export function agregarEvidenciaPendiente(item: FotoEvidenciaPendiente): void {
  if (typeof window === "undefined") return;
  try {
    const actuales = obtenerEvidenciasPendientes();
    window.localStorage.setItem(CLAVE, JSON.stringify([...actuales, item]));
    window.dispatchEvent(new Event(EVENTO_CAMBIO));
  } catch (error) {
    // Localstorage lleno (varias fotos de evidencia pesan harto) -- la
    // subida sigue de largo igual, con el riesgo normal de siempre (se
    // pierde si se cierra la app antes de que termine).
    console.error("No se pudo guardar la foto de evidencia pendiente:", error);
  }
}

export function quitarEvidenciaPendiente(id: string): void {
  if (typeof window === "undefined") return;
  try {
    const restantes = obtenerEvidenciasPendientes().filter((f) => f.id !== id);
    window.localStorage.setItem(CLAVE, JSON.stringify(restantes));
    window.dispatchEvent(new Event(EVENTO_CAMBIO));
  } catch (error) {
    console.error("No se pudo actualizar la cola de evidencias:", error);
  }
}

export function suscribirseACambiosDeColaEvidencias(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(EVENTO_CAMBIO, callback);
  return () => window.removeEventListener(EVENTO_CAMBIO, callback);
}
