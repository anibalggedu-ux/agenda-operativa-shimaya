// Distancia en línea recta entre dos coordenadas (fórmula de haversine) —
// usada para avisar cuando el GPS de una marcación de llegada/salida queda
// lejos de la dirección registrada de la tienda. Distinta de lib/distancia.ts
// (que calcula ruta/tiempo real en auto vía Mapbox): acá alcanza con una
// línea recta, es solo un chequeo rápido, no una ETA.

const RADIO_TIERRA_KM = 6371;

export function distanciaMetros(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const radianes = (grados: number) => (grados * Math.PI) / 180;
  const dLat = radianes(lat2 - lat1);
  const dLon = radianes(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(radianes(lat1)) * Math.cos(radianes(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(RADIO_TIERRA_KM * c * 1000);
}

// A partir de cuántos metros se avisa que una marcación quedó lejos de la
// tienda. Con margen a propósito: el GPS de un celular común puede fallar
// por 100-300m fácil dentro de un centro comercial o edificio alto.
export const UMBRAL_LEJOS_METROS = 500;

// El GPS de la marcación no se guarda como lat/lon aparte -- se guarda como
// el link "https://www.google.com/maps?q=<lat>,<lng>" que ya arma
// marcarLlegadaTienda/marcarSalidaTienda (ver supervisor/actions.ts). Esta
// función lo desarma para poder comparar contra la tienda.
export function coordsDeUrlMaps(url: string | null | undefined): { lat: number; lng: number } | null {
  if (!url) return null;
  const match = url.match(/[?&]q=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  if (!match) return null;
  const lat = Number(match[1]);
  const lng = Number(match[2]);
  if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
  return { lat, lng };
}
