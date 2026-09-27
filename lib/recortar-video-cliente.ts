"use client";

// Recorta un video DENTRO del navegador reproduciendo el tramo elegido y
// grabando esa reproducción como un archivo nuevo, más corto -- en vez de
// re-codificar el archivo entero (que exigiría una librería pesada tipo
// ffmpeg.wasm, poco confiable en Safari de iPhone). Es el camino "rápido";
// si el celular no puede hacerlo, se rechaza para que quien llama use el
// respaldo del servidor (ver /api/historias/recortar-video).

export function soportaRecorteEnNavegador(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof MediaRecorder !== "undefined" &&
    typeof HTMLVideoElement !== "undefined" &&
    typeof (HTMLVideoElement.prototype as any).captureStream === "function"
  );
}

function elegirMimeType(): string {
  const candidatos = ["video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp9,opus", "video/webm"];
  for (const tipo of candidatos) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(tipo)) return tipo;
  }
  return "video/webm";
}

export async function recortarVideoEnNavegador(archivo: File, inicioSeg: number, finSeg: number): Promise<Blob> {
  if (!soportaRecorteEnNavegador()) {
    throw new Error("Este navegador no puede recortar video directamente.");
  }

  const url = URL.createObjectURL(archivo);
  const video = document.createElement("video");
  video.src = url;
  video.muted = false;
  video.playsInline = true;
  // Oculto pero "presente" en el documento -- algunos navegadores no
  // producen cuadros de un <video> que nunca se adjuntó al DOM.
  Object.assign(video.style, {
    position: "fixed",
    opacity: "0",
    pointerEvents: "none",
    width: "1px",
    height: "1px",
    top: "0",
    left: "0",
  });
  document.body.appendChild(video);

  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("No se pudo leer el video."));
    });

    const stream = (video as any).captureStream?.() as MediaStream | undefined;
    if (!stream || stream.getVideoTracks().length === 0) {
      throw new Error("Este navegador no puede recortar video directamente.");
    }

    const mimeType = elegirMimeType();
    const grabador = new MediaRecorder(stream, { mimeType });
    const partes: Blob[] = [];
    grabador.ondataavailable = (e) => {
      if (e.data.size > 0) partes.push(e.data);
    };

    const listo = new Promise<Blob>((resolve, reject) => {
      // Margen sobre la duración esperada -- si algo se traba, no se queda
      // esperando para siempre.
      const tope = setTimeout(() => {
        try {
          grabador.stop();
        } catch {
          reject(new Error("El recorte tardó demasiado."));
        }
      }, (finSeg - inicioSeg) * 1000 + 8000);

      grabador.onerror = () => {
        clearTimeout(tope);
        reject(new Error("No se pudo grabar el recorte."));
      };
      grabador.onstop = () => {
        clearTimeout(tope);
        if (partes.length === 0) reject(new Error("El recorte salió vacío."));
        else resolve(new Blob(partes, { type: mimeType }));
      };
    });

    await new Promise<void>((resolve, reject) => {
      video.onseeked = () => resolve();
      video.onerror = () => reject(new Error("No se pudo posicionar el video."));
      video.currentTime = inicioSeg;
    });

    grabador.start();
    await video.play();

    await new Promise<void>((resolve) => {
      function chequear() {
        if (video.currentTime >= finSeg || video.ended) resolve();
        else requestAnimationFrame(chequear);
      }
      chequear();
    });

    video.pause();
    grabador.stop();

    return await listo;
  } finally {
    video.remove();
    URL.revokeObjectURL(url);
  }
}
