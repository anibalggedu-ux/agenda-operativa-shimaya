const OFFSET_HORAS_PERU = -5;

function ahoraEnPeru(): Date {
  const ahora = new Date();
  const utcMs = ahora.getTime() + ahora.getTimezoneOffset() * 60000;
  return new Date(utcMs + OFFSET_HORAS_PERU * 3600000);
}

export function hoyPeru(): string {
  return ahoraEnPeru().toISOString().slice(0, 10);
}

export function horaPeru(): string {
  return ahoraEnPeru().toISOString().slice(11, 19);
}

export function sumarDias(fechaISO: string, dias: number): string {
  const partes = fechaISO.split("-").map(Number);
  const y = partes[0];
  const m = partes[1];
  const d = partes[2];
  const fecha = new Date(Date.UTC(y, m - 1, d));
  fecha.setUTCDate(fecha.getUTCDate() + dias);
  return fecha.toISOString().slice(0, 10);
}

export function formatearFechaLegible(fechaISO: string): string {
  const partes = fechaISO.split("-").map(Number);
  const y = partes[0];
  const m = partes[1];
  const d = partes[2];
  const fecha = new Date(Date.UTC(y, m - 1, d));
  return fecha.toLocaleDateString("es-PE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}

// El turno nocturno del Capacitador cruza la medianoche: si marca ingreso
// a las 10pm y sale a las 5am, ese trabajo pertenece al día en que EMPEZÓ
// el turno, no al día calendario en que salió. Antes de este corte de
// madrugada, "hoy" para un turno nocturno sigue siendo el día anterior.
const CORTE_MADRUGADA_HORA = 6;

export function diaLaboralPeru(esTurnoNocturno: boolean): string {
  if (!esTurnoNocturno) return hoyPeru();
  const horaActual = Number(horaPeru().split(":")[0]);
  return horaActual < CORTE_MADRUGADA_HORA ? sumarDias(hoyPeru(), -1) : hoyPeru();
}

export function formatearHora(horaHHMMSS: string): string {
  const partes = horaHHMMSS.split(":");
  const h = Number(partes[0]);
  const m = partes[1];
  const sufijo = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return h12 + ":" + m + " " + sufijo;
}