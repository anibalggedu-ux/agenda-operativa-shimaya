// Convierte una dirección de texto en coordenadas usando Nominatim
// (OpenStreetMap), gratuito. Se usa solo bajo una acción puntual del
// administrador (nunca en bucle ni automático), respetando su política de
// uso: un identificador propio en el User-Agent y como mucho una consulta
// a la vez.

export type ResultadoGeocodificacion = { lat: number; lon: number; direccionEncontrada: string };

export async function geocodificarDireccion(direccion: string): Promise<ResultadoGeocodificacion | null> {
  try {
    const query = direccion.toLowerCase().includes("per")
      ? direccion
      : `${direccion}, Perú`;
    // La mayoría de las direcciones (domicilios y tiendas) están en Lima
    // Metropolitana, pero también hay sedes en Arequipa y Chiclayo — por eso
    // el viewbox va SIN bounded=1: solo prioriza resultados de Lima cuando la
    // dirección es ambigua, sin descartar provincias. Antes, con todo Perú
    // como universo, una calle ambigua podía resolverse a cientos de
    // kilómetros (pasó dos veces con domicilios de colaboradores).
    const VIEWBOX_LIMA = "-77.20,-11.75,-76.75,-12.40";
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=pe&viewbox=${VIEWBOX_LIMA}&q=${encodeURIComponent(
      query
    )}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "AgendaOperativaShimaya/1.0 (contacto: anibalggedu@gmail.com)",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    const primero = json?.[0];
    if (!primero) return null;

    const lat = Number(primero.lat);
    const lon = Number(primero.lon);
    // Descarta respuestas con coordenadas ilegibles o fuera de Perú, en vez
    // de guardar un punto inválido que después rompe el cálculo de rutas.
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    if (lat > 0.5 || lat < -18.6 || lon > -68.5 || lon < -81.5) return null;

    return { lat, lon, direccionEncontrada: primero.display_name };
  } catch {
    return null;
  }
}
