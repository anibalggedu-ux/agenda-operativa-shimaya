// GPS del navegador al marcar una llegada/salida (tienda o evento) — no debe
// confundirse con lib/geocodificar.ts, que convierte una dirección de texto
// en coordenadas del lado del servidor.

function pedirPosicion(opciones: PositionOptions): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (posicion) => resolve({ lat: posicion.coords.latitude, lng: posicion.coords.longitude }),
      (error) => reject(error),
      opciones
    );
  });
}

export async function obtenerUbicacionActual(): Promise<{ lat: number; lng: number }> {
  if (!navigator.geolocation) {
    throw new Error("Tu navegador no soporta ubicación.");
  }

  try {
    // 20s en vez de 10: dentro de una tienda el GPS suele tardar más, y al
    // vencerse se perdía la foto que ya se había tomado.
    return await pedirPosicion({ enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
  } catch {
    // Sin señal para un fix nuevo (ej. sótano de un centro comercial) --
    // se acepta una ubicación ya conocida de hasta 15 minutos atrás (de
    // justo antes de perder la señal) en vez de bloquear la marcación por
    // completo. Esto es lo que permite, junto con la cola de marcaciones
    // pendientes, marcar sin señal y que se envíe sola al recuperarla.
    try {
      return await pedirPosicion({ enableHighAccuracy: false, timeout: 5000, maximumAge: 15 * 60 * 1000 });
    } catch {
      throw new Error(
        "No se pudo obtener tu ubicación. Revisa los permisos del navegador o muévete a un lugar con mejor señal."
      );
    }
  }
}
