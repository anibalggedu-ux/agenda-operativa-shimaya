import ffmpegPath from "ffmpeg-static";
import { spawn } from "child_process";
import { writeFile, readFile, unlink } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";

// Respaldo del recorte de video cuando el navegador de la persona no puede
// hacerlo directo (algunos iPhone viejos) -- ver lib/recortar-video-cliente.ts
// para el camino normal. "-c copy" reempaqueta sin recodificar (rápido, cabe
// en el tiempo límite de una función de Vercel) en vez de recodificar cuadro
// por cuadro; el costo es que el corte se ajusta al fotograma clave (keyframe)
// más cercano, así que puede quedar uno o dos segundos distinto de lo pedido
// -- aceptable para "recortar a 30 segundos", no para edición fina.
export async function recortarVideoBuffer(buffer: Buffer, inicioSeg: number, finSeg: number): Promise<Buffer> {
  if (!ffmpegPath) {
    throw new Error("El recorte en el servidor no está disponible en este momento.");
  }

  const id = randomUUID();
  const entrada = join(tmpdir(), `historia-in-${id}.mp4`);
  const salida = join(tmpdir(), `historia-out-${id}.mp4`);
  await writeFile(entrada, buffer);

  try {
    const duracion = Math.max(0.5, finSeg - inicioSeg);
    await new Promise<void>((resolve, reject) => {
      const proceso = spawn(ffmpegPath as unknown as string, [
        "-y",
        "-ss",
        String(inicioSeg),
        "-i",
        entrada,
        "-t",
        String(duracion),
        "-c",
        "copy",
        "-avoid_negative_ts",
        "make_zero",
        salida,
      ]);

      let stderr = "";
      proceso.stderr.on("data", (d) => {
        stderr += d.toString();
      });
      proceso.on("error", reject);
      proceso.on("close", (codigo) => {
        if (codigo === 0) resolve();
        else reject(new Error(`ffmpeg terminó con error (${codigo}): ${stderr.slice(-400)}`));
      });
    });

    return await readFile(salida);
  } finally {
    await unlink(entrada).catch(() => {});
    await unlink(salida).catch(() => {});
  }
}
