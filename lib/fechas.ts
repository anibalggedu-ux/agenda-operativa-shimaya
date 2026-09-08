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

export const DIAS_SEMANA = [
  "DOMINGO",
  "LUNES",
  "MARTES",
  "MIERCOLES",
  "JUEVES",
  "VIERNES",
  "SABADO",
];

// Coincide con el formato guardado en usuarios.descanso (mayúsculas, sin
// tilde), para poder cruzar "hoy" contra el día de descanso fijo de cada
// persona.
export function diaSemanaPeru(fechaISO?: string): string {
  const fecha = fechaISO ?? hoyPeru();
  const partes = fecha.split("-").map(Number);
  const d = new Date(Date.UTC(partes[0], partes[1] - 1, partes[2]));
  return DIAS_SEMANA[d.getUTCDay()];
}

export function diasEntreFechas(desdeISO: string, hastaISO: string): number {
  const [y1, m1, d1] = desdeISO.split("-").map(Number);
  const [y2, m2, d2] = hastaISO.split("-").map(Number);
  const t1 = Date.UTC(y1, m1 - 1, d1);
  const t2 = Date.UTC(y2, m2 - 1, d2);
  return Math.round((t2 - t1) / 86400000);
}

export function calcularAntiguedad(
  fechaIngreso: string,
  hoy: string
): { anios: number; meses: number } {
  const [yIng, mIng, dIng] = fechaIngreso.split("-").map(Number);
  const [yHoy, mHoy, dHoy] = hoy.split("-").map(Number);

  let anios = yHoy - yIng;
  let meses = mHoy - mIng;
  if (dHoy < dIng) meses -= 1;
  if (meses < 0) {
    anios -= 1;
    meses += 12;
  }
  return { anios, meses };
}

export function calcularProximaFechaAnual(
  mes: number,
  dia: number,
  hoy: string
): { fecha: string; diasFaltantes: number } {
  const pad = (n: number) => String(n).padStart(2, "0");
  const [yHoy] = hoy.split("-").map(Number);
  const esteAnio = `${yHoy}-${pad(mes)}-${pad(dia)}`;
  const anio = esteAnio < hoy ? yHoy + 1 : yHoy;
  const fecha = `${anio}-${pad(mes)}-${pad(dia)}`;
  return { fecha, diasFaltantes: diasEntreFechas(hoy, fecha) };
}

export function formatearHora(horaHHMMSS: string): string {
  const partes = horaHHMMSS.split(":");
  const h = Number(partes[0]);
  const m = partes[1];
  const sufijo = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return h12 + ":" + m + " " + sufijo;
}