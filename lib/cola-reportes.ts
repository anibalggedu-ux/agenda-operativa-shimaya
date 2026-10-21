// Cola de reportes de visita (la "observación" + actividad que se manda al
// cerrar una tienda en la Bitácora) que no se pudieron enviar por falta de
// señal -- mismo problema y misma solución que lib/cola-checklists.ts. Solo
// cubre el reporte NUEVO, no la edición de uno ya enviado (editarReporte):
// editar es menos frecuente y corre el riesgo de pisar una edición hecha
// desde otro dispositivo mientras estuvo en cola, así que ese camino se deja
// tal cual (muestra el error y la persona reintenta a mano cuando quiera).

export type ReportePendiente = {
  id: string;
  rutaActivaId: string;
  tiendaId: string;
  observacion: string;
  actividad: string;
  // Para mostrar en el aviso de "pendientes" sin tener que recargar datos.
  etiqueta: string;
};

const CLAVE = "shimaya_reportes_pendientes";
const EVENTO_CAMBIO = "shimaya:cola-reportes-cambio";

export function obtenerReportesPendientes(): ReportePendiente[] {
  if (typeof window === "undefined") return [];
  try {
    const crudo = window.localStorage.getItem(CLAVE);
    return crudo ? JSON.parse(crudo) : [];
  } catch {
    return [];
  }
}

export function agregarReportePendiente(item: ReportePendiente): void {
  if (typeof window === "undefined") return;
  try {
    const actuales = obtenerReportesPendientes();
    window.localStorage.setItem(CLAVE, JSON.stringify([...actuales, item]));
    window.dispatchEvent(new Event(EVENTO_CAMBIO));
  } catch (error) {
    console.error("No se pudo guardar el reporte pendiente:", error);
  }
}

export function quitarReportePendiente(id: string): void {
  if (typeof window === "undefined") return;
  try {
    const restantes = obtenerReportesPendientes().filter((r) => r.id !== id);
    window.localStorage.setItem(CLAVE, JSON.stringify(restantes));
    window.dispatchEvent(new Event(EVENTO_CAMBIO));
  } catch (error) {
    console.error("No se pudo actualizar la cola de reportes:", error);
  }
}

export function suscribirseACambiosDeColaReportes(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(EVENTO_CAMBIO, callback);
  return () => window.removeEventListener(EVENTO_CAMBIO, callback);
}
