// Perú no usa horario de verano, así que UTC-5 es fijo todo el año.
const OFFSET_HORAS_PERU = -5;

export function hoyPeru(): string {
  const ahora = new Date();
  const utcMs = ahora.getTime() + ahora.getTimezoneOffset() * 60000;
  const peruMs = utcMs + OFFSET_HORAS_PERU * 3600000;
  return new Date(peruMs).toISOString().slice(0, 10); // YYYY-MM-DD
}

export function sumarDias(fechaISO: string, dias: number): string {
  const [y, m, d] = fechaISO.split("-").map(Number);
  const fecha = new Date(Date.UTC(y, m - 1, d));
  fecha.setUTCDate(fecha.getUTCDate() + dias);
  return fecha.toISOString().slice(0, 10);
}

export function formatearFechaLegible(fechaISO: string): string {
  const [y, m, d] = fechaISO.split("-").map(Number);
  const fecha = new Date(Date.UTC(y, m - 1, d));
  return fecha.toLocaleDateString("es-PE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}
