// Convierte una dirección de texto en coordenadas usando la API de
// Geocoding de Mapbox -- la misma cuenta/token que ya se usa para calcular
// rutas y tiempos de manejo (lib/distancia.ts), sin alta ni costo aparte.
// Antes se usaba Nominatim (OpenStreetMap), gratuito pero con cobertura
// floja en Perú: muchas direcciones nuevas o de centros comerciales no las
// encontraba, o las ubicaba mal. Mapbox tiene mejor cobertura en Lima/Perú.

export type ResultadoGeocodificacion = { lat: number; lon: number; direccionEncontrada: string };

// Centro de Lima: solo sesga el orden de resultados hacia ahí cuando la
// dirección es ambigua (no descarta otras ciudades) -- hay sedes en
// Arequipa y Chiclayo además de Lima Metropolitana.
const PROXIMIDAD_LIMA = "-77.03,-12.05";

export async function geocodificarDireccion(direccion: string): Promise<ResultadoGeocodificacion | null> {
  const token = process.env.MAPBOX_ACCESS_TOKEN;
  if (!token) return null;

  try {
    const query = direccion.toLowerCase().includes("per")
      ? direccion
      : `${direccion}, Perú`;
    const url =
      `https://api.mapbox.com/search/geocode/v6/forward?q=${encodeURIComponent(query)}` +
      `&country=pe&language=es&limit=1&proximity=${PROXIMIDAD_LIMA}&access_token=${token}`;
    const res = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    const primero = json?.features?.[0];
    if (!primero) return null;

    const [lon, lat] = primero.geometry?.coordinates ?? [];
    // Descarta respuestas con coordenadas ilegibles o fuera de Perú, en vez
    // de guardar un punto inválido que después rompe el cálculo de rutas.
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    if (lat > 0.5 || lat < -18.6 || lon > -68.5 || lon < -81.5) return null;

    const direccionEncontrada: string = primero.properties?.full_address ?? primero.properties?.name ?? query;
    return { lat, lon, direccionEncontrada };
  } catch {
    return null;
  }
}
