// Distancia y tiempo estimado en auto entre dos coordenadas, vía OSRM
// (Open Source Routing Machine, gratuito y sin API key) — sigue las calles
// reales, no línea recta. El servidor público es solo para uso moderado,
// así que cada par de coordenadas se cachea varios días (la ruta entre una
// casa y una tienda no cambia de un día para otro).

export type RutaAuto = { km: number; minutos: number };

export async function calcularRutaAuto(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): Promise<RutaAuto | null> {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${lon1},${lat1};${lon2},${lat2}?overview=false`;
    const res = await fetch(url, { next: { revalidate: 60 * 60 * 24 * 30 } });
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
// consideración con el servidor público gratuito de OSRM.
export async function calcularRutasEnLotes<T>(
  items: T[],
  calcular: (item: T) => Promise<void>,
  tamanoLote = 5
): Promise<void> {
  for (let i = 0; i < items.length; i += tamanoLote) {
    await Promise.all(items.slice(i, i + tamanoLote).map(calcular));
  }
}
