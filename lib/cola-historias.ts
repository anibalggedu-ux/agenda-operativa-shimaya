// Colas de Historias (texto/foto, comentarios y reacciones) que no se
// pudieron enviar por falta de señal -- mismo problema y misma solución que
// lib/cola-checklists.ts. El video queda FUERA a propósito: una sola foto ya
// ocupa buena parte de lo poco que el celular da para guardar "para después"
// sin señal (unos 5-10 MB en total, repartidos entre todas estas colas); un
// video no entra ahí ni de cerca, así que publicarlo sigue exigiendo
// conexión como hasta ahora.

export type HistoriaPendiente = {
  id: string;
  fotoDataUrl: string;
  texto?: string;
  miniDataUrl?: string;
  etiqueta: string;
};

const CLAVE_HISTORIAS = "shimaya_historias_pendientes";
const EVENTO_CAMBIO_HISTORIAS = "shimaya:cola-historias-cambio";

export function obtenerHistoriasPendientes(): HistoriaPendiente[] {
  if (typeof window === "undefined") return [];
  try {
    const crudo = window.localStorage.getItem(CLAVE_HISTORIAS);
    return crudo ? JSON.parse(crudo) : [];
  } catch {
    return [];
  }
}

export function agregarHistoriaPendiente(item: HistoriaPendiente): void {
  if (typeof window === "undefined") return;
  try {
    const actuales = obtenerHistoriasPendientes();
    window.localStorage.setItem(CLAVE_HISTORIAS, JSON.stringify([...actuales, item]));
    window.dispatchEvent(new Event(EVENTO_CAMBIO_HISTORIAS));
  } catch (error) {
    console.error("No se pudo guardar la historia pendiente:", error);
  }
}

export function quitarHistoriaPendiente(id: string): void {
  if (typeof window === "undefined") return;
  try {
    const restantes = obtenerHistoriasPendientes().filter((h) => h.id !== id);
    window.localStorage.setItem(CLAVE_HISTORIAS, JSON.stringify(restantes));
    window.dispatchEvent(new Event(EVENTO_CAMBIO_HISTORIAS));
  } catch (error) {
    console.error("No se pudo actualizar la cola de historias:", error);
  }
}

export function suscribirseACambiosDeColaHistorias(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(EVENTO_CAMBIO_HISTORIAS, callback);
  return () => window.removeEventListener(EVENTO_CAMBIO_HISTORIAS, callback);
}

export type ComentarioHistoriaPendiente = {
  id: string;
  historiaId: string;
  texto: string;
  padreId?: string | null;
  etiqueta: string;
};

const CLAVE_COMENTARIOS = "shimaya_comentarios_pendientes";
const EVENTO_CAMBIO_COMENTARIOS = "shimaya:cola-comentarios-cambio";

export function obtenerComentariosPendientes(): ComentarioHistoriaPendiente[] {
  if (typeof window === "undefined") return [];
  try {
    const crudo = window.localStorage.getItem(CLAVE_COMENTARIOS);
    return crudo ? JSON.parse(crudo) : [];
  } catch {
    return [];
  }
}

export function agregarComentarioPendiente(item: ComentarioHistoriaPendiente): void {
  if (typeof window === "undefined") return;
  try {
    const actuales = obtenerComentariosPendientes();
    window.localStorage.setItem(CLAVE_COMENTARIOS, JSON.stringify([...actuales, item]));
    window.dispatchEvent(new Event(EVENTO_CAMBIO_COMENTARIOS));
  } catch (error) {
    console.error("No se pudo guardar el comentario pendiente:", error);
  }
}

export function quitarComentarioPendiente(id: string): void {
  if (typeof window === "undefined") return;
  try {
    const restantes = obtenerComentariosPendientes().filter((c) => c.id !== id);
    window.localStorage.setItem(CLAVE_COMENTARIOS, JSON.stringify(restantes));
    window.dispatchEvent(new Event(EVENTO_CAMBIO_COMENTARIOS));
  } catch (error) {
    console.error("No se pudo actualizar la cola de comentarios:", error);
  }
}

export function suscribirseACambiosDeColaComentarios(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(EVENTO_CAMBIO_COMENTARIOS, callback);
  return () => window.removeEventListener(EVENTO_CAMBIO_COMENTARIOS, callback);
}

export type ReaccionHistoriaPendiente = {
  id: string;
  historiaId: string;
  emoji: string;
  etiqueta: string;
};

const CLAVE_REACCIONES = "shimaya_reacciones_pendientes";
const EVENTO_CAMBIO_REACCIONES = "shimaya:cola-reacciones-cambio";

export function obtenerReaccionesPendientes(): ReaccionHistoriaPendiente[] {
  if (typeof window === "undefined") return [];
  try {
    const crudo = window.localStorage.getItem(CLAVE_REACCIONES);
    return crudo ? JSON.parse(crudo) : [];
  } catch {
    return [];
  }
}

export function agregarReaccionPendiente(item: ReaccionHistoriaPendiente): void {
  if (typeof window === "undefined") return;
  try {
    const actuales = obtenerReaccionesPendientes();
    window.localStorage.setItem(CLAVE_REACCIONES, JSON.stringify([...actuales, item]));
    window.dispatchEvent(new Event(EVENTO_CAMBIO_REACCIONES));
  } catch (error) {
    console.error("No se pudo guardar la reacción pendiente:", error);
  }
}

export function quitarReaccionPendiente(id: string): void {
  if (typeof window === "undefined") return;
  try {
    const restantes = obtenerReaccionesPendientes().filter((r) => r.id !== id);
    window.localStorage.setItem(CLAVE_REACCIONES, JSON.stringify(restantes));
    window.dispatchEvent(new Event(EVENTO_CAMBIO_REACCIONES));
  } catch (error) {
    console.error("No se pudo actualizar la cola de reacciones:", error);
  }
}

export function suscribirseACambiosDeColaReacciones(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(EVENTO_CAMBIO_REACCIONES, callback);
  return () => window.removeEventListener(EVENTO_CAMBIO_REACCIONES, callback);
}
