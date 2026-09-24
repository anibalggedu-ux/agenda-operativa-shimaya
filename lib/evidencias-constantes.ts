// Fotos opcionales al final del checklist de visita y de la auditoría.
// Este archivo no importa nada del servidor: lo usan también los
// formularios del navegador.

export const MAX_FOTOS_EVIDENCIA = 10;
export const MAX_LARGO_PIE_FOTO = 200;
// Se borran solas pasado este tiempo (cron diario de depuración).
export const DIAS_RETENCION_EVIDENCIAS = 60;

export type TipoRegistroEvidencia = "checklist" | "auditoria";

// url = versión liviana para mostrar; urlCompleta = la original, al tocarla.
// rutaPdf = la liviana servida por la propia app (/api/blob/descargar), para
// poder meterla en el PDF desde el navegador.
export type FotoEvidencia = {
  id: string;
  url: string | null;
  urlCompleta: string | null;
  rutaPdf: string;
  pie: string | null;
};
