// "En línea" / "Activo hace X": a partir de usuarios.ultima_actividad, que
// la app actualiza cada ~45 s mientras la pantalla está abierta (ver
// app/panel/presencia-actions.ts).
const EN_LINEA_MS = 2 * 60 * 1000;

export type Presencia = { enLinea: boolean; texto: string } | null;

export function calcularPresencia(ultimaActividad: string | null | undefined, ahora = Date.now()): Presencia {
  if (!ultimaActividad) return null;
  const hace = ahora - new Date(ultimaActividad).getTime();
  if (hace < EN_LINEA_MS) return { enLinea: true, texto: "En línea" };
  const minutos = Math.floor(hace / 60000);
  if (minutos < 60) return { enLinea: false, texto: `Activo hace ${minutos} min` };
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return { enLinea: false, texto: `Activo hace ${horas} h` };
  const dias = Math.floor(horas / 24);
  if (dias <= 7) return { enLinea: false, texto: `Activo hace ${dias} d` };
  return null;
}
