"use client";

import { prepararSubidaVideoHistoria, crearHistoriaVideo } from "./actions";

// Sube el archivo directo a R2 con la URL firmada (no pasa por el Server
// Action) -- XMLHttpRequest en vez de fetch porque es la única forma de
// enterarse del progreso de la subida mientras corre.
function subirConProgreso(url: string, archivo: File | Blob, contentType: string, onProgreso: (fraccion: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgreso(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error("No se pudo subir el video."));
    };
    xhr.onerror = () => reject(new Error("No se pudo subir el video. Revisa tu conexión."));
    xhr.send(archivo);
  });
}

// Camino normal: el video ya tiene la duración final (≤30s), se sube y se
// publica directo. Lo usan tanto un video corto de entrada como uno que ya
// se recortó dentro del propio navegador.
export async function publicarVideoDirecto(
  archivo: File | Blob,
  contentType: string,
  texto: string,
  onProgreso: (fraccion: number) => void
): Promise<void> {
  const preparado = await prepararSubidaVideoHistoria(contentType);
  if (!preparado.exito || !preparado.blobPath || !preparado.urlSubida) {
    throw new Error(preparado.mensaje || "No se pudo preparar la subida del video.");
  }
  await subirConProgreso(preparado.urlSubida, archivo, contentType, onProgreso);
  const resultado = await crearHistoriaVideo(preparado.blobPath, texto);
  if (!resultado.exito) {
    throw new Error(resultado.mensaje || "No se pudo publicar el video.");
  }
}

// Camino de respaldo: sube el ORIGINAL completo (sin recortar) para que el
// servidor lo recorte -- ver /api/historias/recortar-video. Devuelve la
// ruta para pedir después ese recorte.
export async function subirVideoOriginalParaRecorte(
  archivo: File,
  contentType: string,
  onProgreso: (fraccion: number) => void
): Promise<string> {
  const preparado = await prepararSubidaVideoHistoria(contentType);
  if (!preparado.exito || !preparado.blobPath || !preparado.urlSubida) {
    throw new Error(preparado.mensaje || "No se pudo preparar la subida del video.");
  }
  await subirConProgreso(preparado.urlSubida, archivo, contentType, onProgreso);
  return preparado.blobPath;
}

export async function pedirRecorteEnServidor(
  blobPath: string,
  inicioSeg: number,
  finSeg: number,
  texto: string
): Promise<void> {
  const respuesta = await fetch("/api/historias/recortar-video", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ blobPath, inicioSeg, finSeg, texto }),
  });
  const datos = await respuesta.json().catch(() => ({ exito: false }));
  if (!datos.exito) {
    throw new Error(datos.mensaje || "No se pudo recortar el video en el servidor.");
  }
}
