// Las fotos que salen de la cámara de un celular suelen pesar varios MB,
// muy por encima del límite que aceptan los Server Actions de Next.js. Antes
// de enviarla se redimensiona y recomprime en el propio navegador — además
// de evitar el error, sube más rápido y gasta menos datos móviles.

// Los iPhone guardan la foto siempre en el mismo sentido físico y anotan
// cómo hay que rotarla en un tag EXIF. Al dibujarla en un canvas ese tag se
// ignoraba y la marcación quedaba acostada. createImageBitmap con
// imageOrientation "from-image" aplica la rotación antes de dibujar.
async function cargarImagen(archivo: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(archivo, { imageOrientation: "from-image" });
    } catch {
      // Algunos navegadores no decodifican ciertos formatos (HEIC) o no
      // aceptan la opción — se cae al método clásico de abajo.
    }
  }
  return cargarConEtiquetaImg(archivo);
}

function cargarConEtiquetaImg(archivo: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onerror = () => reject(new Error("No se pudo leer la foto tomada."));
    lector.onload = () => {
      const img = new Image();
      img.onerror = () =>
        reject(
          new Error(
            "No se pudo procesar la foto. Si tu cámara guarda en formato HEIC, cámbiala a JPG en los ajustes del celular."
          )
        );
      img.onload = () => resolve(img);
      img.src = lector.result as string;
    };
    lector.readAsDataURL(archivo);
  });
}

export async function comprimirFotoComoBase64(
  archivo: File,
  maxAncho = 1280,
  calidad = 0.72
): Promise<string> {
  const fuente = await cargarImagen(archivo);

  let ancho = fuente.width;
  let alto = fuente.height;
  if (ancho > maxAncho) {
    alto = Math.round((alto * maxAncho) / ancho);
    ancho = maxAncho;
  }

  const canvas = document.createElement("canvas");
  canvas.width = ancho;
  canvas.height = alto;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    if ("close" in fuente) fuente.close();
    throw new Error("No se pudo procesar la foto tomada.");
  }

  ctx.drawImage(fuente, 0, 0, ancho, alto);
  // El ImageBitmap se libera a mano; si no, la memoria del celular se va
  // llenando foto tras foto durante la jornada.
  if ("close" in fuente) fuente.close();

  return canvas.toDataURL("image/jpeg", calidad);
}
