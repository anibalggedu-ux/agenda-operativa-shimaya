// Distancia y tiempo estimado en auto entre dos coordenadas, vía la API de
// Direcciones de Mapbox (perfil "driving-traffic") — usa tráfico en vivo,
// no una vía libre teórica como el servidor gratuito que se usaba antes
// (OSRM), que en Lima subestimaba mucho el tiempo real (caso real: 6 km que
// OSRM daba en 9 min tomaban 25-30 min manejando de verdad). El tráfico
// cambia hora a hora, así que el caché es mucho más corto que antes — solo
// para no repetir la misma consulta varias veces en pocos minutos.

export type RutaAuto = { km: number; minutos: number };

export async function calcularRutaAuto(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
  // Hora de salida a futuro para la que se quiere predecir el tráfico (ej.
  // la hora límite de ingreso de la persona, el día que le toca esa ruta) —
  // sin esto, Mapbox calcula el tráfico de AHORA MISMO, que no sirve de
  // nada si se está asignando de noche una ruta para mañana en la mañana.
  horaSalida?: Date,
  // Segundos que se cachea la respuesta antes de volver a consultar a
  // Mapbox -- 1 hora por defecto (cálculos que no necesitan ser al segundo,
  // como kilómetros del mes o el correo de una ruta nueva). El tiempo
  // estimado de "Ruta de hoy", que la persona puede mirar varias veces en
  // el día y espera que refleje el tráfico de ESE momento, pasa 0 (sin
  // caché) desde obtenerTiendasClasificadas.
  revalidateSegundos = 60 * 60
): Promise<RutaAuto | null> {
  const token = process.env.MAPBOX_ACCESS_TOKEN;
  if (!token) return null;

  try {
    // Mapbox rechaza el "YYYY-MM-DDThh:mm:ss.sssZ" que da toISOString() por
    // los milisegundos -- solo acepta hasta los segundos.
    const departAt =
      horaSalida && horaSalida.getTime() > Date.now()
        ? `&depart_at=${horaSalida.toISOString().replace(/\.\d{3}Z$/, "Z")}`
        : "";
    const url = `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${lon1},${lat1};${lon2},${lat2}?overview=false&access_token=${token}${departAt}`;
    // Sin tiempo máximo de espera, un Mapbox lento o colgado bloqueaba el
    // render hasta que expiraba la función de Vercel y se caía la página
    // entera. Preferimos quedarnos sin el dato de distancia (la vista lo
    // maneja como "sin calcular") antes que tumbar la pantalla.
    const res = await fetch(url, {
      next: { revalidate: revalidateSegundos },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    const ruta = json?.routes?.[0];
    if (!ruta || typeof ruta.distance !== "number" || typeof ruta.duration !== "number") return null;
    return {
      km: Math.round((ruta.distance / 1000) * 10) / 10,
      minutos: Math.round(ruta.duration / 60),
    };
  } catch {
    return null;
  }
}

export function formatearMinutos(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m} min`;
  return `${h}h ${m}min`;
}

// Ejecuta las llamadas en lotes pequeños en vez de todas a la vez, por
// consideración con el límite de la cuenta gratuita de Mapbox.
export async function calcularRutasEnLotes<T>(
  items: T[],
  calcular: (item: T) => Promise<void>,
  tamanoLote = 5
): Promise<void> {
  for (let i = 0; i < items.length; i += tamanoLote) {
    await Promise.all(items.slice(i, i + tamanoLote).map(calcular));
  }
}
