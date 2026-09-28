import type { RespuestasChecklist } from "./checklist-puntaje";

// Cola de checklists de visita que no se pudieron guardar por falta de
// señal -- mismo problema y misma solución que lib/cola-marcaciones.ts
// (estacionamientos subterráneos, tiendas con poca cobertura). Se guarda en
// el propio celular y SincronizadorOffline la reenvía sola apenas vuelve la
// conexión. No incluye las fotos de evidencia -- esas se suben recién
// después de que el checklist ya tiene un id, así que si el guardado en sí
// nunca llegó al servidor, tampoco había fotos que reintentar; quedan para
// agregarlas a mano corrigiendo el checklist una vez que ya se sincronizó
// (hay 24h para eso, ver checklist-visita-actions.ts).

export type ChecklistPendiente = {
  id: string;
  tiendaId: string;
  fecha: string;
  respuestas: RespuestasChecklist;
  // Para mostrar en el aviso de "pendientes" sin tener que recargar datos.
  etiqueta: string;
};

const CLAVE = "shimaya_checklists_pendientes";
// Evento propio (no nativo) para avisar a otras partes de la app en la misma
// pestaña que la cola cambió -- "storage" del navegador solo dispara en
// OTRAS pestañas, nunca en la que hizo el cambio.
const EVENTO_CAMBIO = "shimaya:cola-checklists-cambio";

export function obtenerChecklistsPendientes(): ChecklistPendiente[] {
  if (typeof window === "undefined") return [];
  try {
    const crudo = window.localStorage.getItem(CLAVE);
    return crudo ? JSON.parse(crudo) : [];
  } catch {
    return [];
  }
}

export function agregarChecklistPendiente(item: ChecklistPendiente): void {
  if (typeof window === "undefined") return;
  try {
    const actuales = obtenerChecklistsPendientes();
    window.localStorage.setItem(CLAVE, JSON.stringify([...actuales, item]));
    window.dispatchEvent(new Event(EVENTO_CAMBIO));
  } catch (error) {
    console.error("No se pudo guardar el checklist pendiente:", error);
  }
}

export function quitarChecklistPendiente(id: string): void {
  if (typeof window === "undefined") return;
  try {
    const restantes = obtenerChecklistsPendientes().filter((c) => c.id !== id);
    window.localStorage.setItem(CLAVE, JSON.stringify(restantes));
    window.dispatchEvent(new Event(EVENTO_CAMBIO));
  } catch (error) {
    console.error("No se pudo actualizar la cola de checklists:", error);
  }
}

export function suscribirseACambiosDeColaChecklists(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(EVENTO_CAMBIO, callback);
  return () => window.removeEventListener(EVENTO_CAMBIO, callback);
}
