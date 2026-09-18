// GPS del navegador al marcar una llegada/salida (tienda o evento) — no debe
// confundirse con lib/geocodificar.ts, que convierte una dirección de texto
// en coordenadas del lado del servidor.
export function obtenerUbicacionActual(): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Tu navegador no soporta ubicación."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (posicion) => resolve({ lat: posicion.coords.latitude, lng: posicion.coords.longitude }),
      () =>
        reject(
          new Error(
            "No se pudo obtener tu ubicación. Revisa los permisos del navegador o muévete a un lugar con mejor señal."
          )
        ),
      // 20s en vez de 10: dentro de una tienda el GPS suele tardar más, y al
      // vencerse se perdía la foto que ya se había tomado.
      { enableHighAccuracy: true, timeout: 20000 }
    );
  });
}
