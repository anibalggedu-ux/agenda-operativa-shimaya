// Manejo de tiempo. Toda marca de tiempo se guarda como ISO-8601 UTC con milisegundos
// ("2026-10-24T22:30:00.000Z"); America/Lima solo se aplica para mostrar y para
// interpretar fechas que escribe una persona. Perú no usa horario de verano: UTC-5 fijo.

export const LIMA_TZ = "America/Lima";
export const LIMA_OFFSET_HOURS = 5;

const YMD = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Devuelve [año, mes, día] si `ymd` es una fecha de calendario real, o null. */
export function parseYmd(ymd: string): [number, number, number] | null {
  const m = YMD.exec(ymd);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const probe = new Date(Date.UTC(y, mo - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== mo - 1 || probe.getUTCDate() !== d) return null;
  return [y, mo, d];
}

/** Medianoche (00:00) de ese día en Lima, como instante UTC ISO. */
export function limaDayStartIso(ymd: string): string | null {
  const p = parseYmd(ymd);
  if (!p) return null;
  return new Date(Date.UTC(p[0], p[1] - 1, p[2], LIMA_OFFSET_HOURS)).toISOString();
}

/** Primer instante del día SIGUIENTE en Lima: sirve como fin exclusivo de un rango "hasta ese día inclusive". */
export function limaDayEndExclusiveIso(ymd: string): string | null {
  const p = parseYmd(ymd);
  if (!p) return null;
  return new Date(Date.UTC(p[0], p[1] - 1, p[2] + 1, LIMA_OFFSET_HOURS)).toISOString();
}

/** Fecha y hora legibles en Lima, p. ej. "24 oct 2026, 5:30 p. m.". */
export function formatLima(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("es-PE", {
    timeZone: LIMA_TZ,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}

/** Solo la fecha en Lima, p. ej. "24 oct 2026". */
export function formatLimaDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("es-PE", {
    timeZone: LIMA_TZ,
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(d);
}

/** Fecha YYYY-MM-DD en Lima de un instante (para rellenar <input type="date">). */
export function limaYmd(iso: string): string {
  const d = new Date(new Date(iso).getTime() - LIMA_OFFSET_HOURS * 3600_000);
  return d.toISOString().slice(0, 10);
}

/** Para campañas: el campo "hasta" es un día inclusive; el almacenado es el fin exclusivo. */
export function limaYmdOfInclusiveEnd(endsAtExclusiveIso: string): string {
  return limaYmd(new Date(new Date(endsAtExclusiveIso).getTime() - 1).toISOString());
}
