import { formatearHora } from "./fechas";

// Horario de los eventos publicados como anuncio (comunicados con
// fecha_evento). hora_inicio/hora_fin son opcionales y vienen de la base de
// datos como "HH:MM:SS" (hora Perú), igual que horaPeru().

// Un evento está finalizado cuando su día ya pasó, o cuando es hoy y ya
// pasó su hora de fin. Sin hora de fin, dura todo el día (como siempre).
export function eventoFinalizado(
  fechaEvento: string | null,
  horaFin: string | null,
  hoy: string,
  horaActual: string
): boolean {
  if (!fechaEvento) return false;
  if (fechaEvento < hoy) return true;
  return fechaEvento === hoy && !!horaFin && horaActual >= normalizarHora(horaFin);
}

// "9:5" / "09:05" / "09:05:00" -> "09:05:00"
export function normalizarHora(hora: string): string {
  const [h = "0", m = "0", s = "0"] = hora.split(":");
  return [h, m, s].map((x) => x.padStart(2, "0")).join(":");
}

// "9:00 AM – 11:00 AM", "Desde las 9:00 AM", "Hasta las 11:00 AM" o null.
export function textoHorarioEvento(horaInicio: string | null, horaFin: string | null): string | null {
  if (horaInicio && horaFin) return `${formatearHora(horaInicio)} – ${formatearHora(horaFin)}`;
  if (horaInicio) return `Desde las ${formatearHora(horaInicio)}`;
  if (horaFin) return `Hasta las ${formatearHora(horaFin)}`;
  return null;
}
