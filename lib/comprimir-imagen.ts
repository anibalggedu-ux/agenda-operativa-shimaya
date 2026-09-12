// Las fotos que salen de la cámara de un celular suelen pesar varios MB,
// muy por encima del límite que aceptan los Server Actions de Next.js. Antes
// de enviarla se redimensiona y recomprime en el propio navegador — además
// de evitar el error, sube más rápido y gasta menos datos móviles.

export function comprimirFotoComoBase64(
  archivo: File,
  maxAncho = 1280,
  calidad = 0.72
): Promise<string> {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onerror = () => reject(new Error("No se pudo leer la foto tomada."));
    lector.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("No se pudo procesar la foto tomada."));
      img.onload = () => {
        let ancho = img.width;
        let alto = img.height;
        if (ancho > maxAncho) {
          alto = Math.round((alto * maxAncho) / ancho);
          ancho = maxAncho;
        }
        const canvas = document.createElement("canvas");
        canvas.width = ancho;
        canvas.height = alto;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("No se pudo procesar la foto tomada."));
          return;
        }
        ctx.drawImage(img, 0, 0, ancho, alto);
        resolve(canvas.toDataURL("image/jpeg", calidad));
      };
      img.src = lector.result as string;
    };
    lector.readAsDataURL(archivo);
  });
}
