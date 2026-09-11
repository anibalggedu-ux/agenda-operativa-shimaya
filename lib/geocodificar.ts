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
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=pe&q=${encodeURIComponent(
      query
    )}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "AgendaOperativaShimaya/1.0 (contacto: anibalggedu@gmail.com)",
      },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = await res.json();
    const primero = json?.[0];
    if (!primero) return null;
    return {
      lat: Number(primero.lat),
      lon: Number(primero.lon),
      direccionEncontrada: primero.display_name,
    };
  } catch {
    return null;
  }
}
