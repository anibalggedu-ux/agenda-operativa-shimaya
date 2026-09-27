import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { obtenerSesion } from "@/lib/session";
import { almacenActivo } from "@/lib/almacen-fotos";
import { recortarVideoBuffer } from "@/lib/recorte-video";
import { supabaseServer } from "@/lib/supabase-server";
import { hoyPeru } from "@/lib/fechas";

// Respaldo del recorte de video para cuando el navegador no puede hacerlo
// directo (ver lib/recortar-video-cliente.ts) -- una ruta propia (no un
// Server Action) porque necesita más tiempo del que Vercel da por defecto,
// y ese límite se fija por ruta, no por función individual.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CARPETA_HISTORIAS = "historias";
const TEXTO_MAXIMO = 200;
// Debe coincidir con el tope del recorte en el navegador (ver
// historias-feed.tsx) más un margen chico.
const DURACION_MAXIMA_VENTANA_SEG = 30.5;

async function streamABuffer(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
  const partes: Uint8Array[] = [];
  const lector = stream.getReader();
  for (;;) {
    const { done, value } = await lector.read();
    if (done) break;
    if (value) partes.push(value);
  }
  return Buffer.concat(partes.map((p) => Buffer.from(p)));
}

export async function POST(request: NextRequest) {
  const sesion = await obtenerSesion();
  if (!sesion) {
    return NextResponse.json({ exito: false, mensaje: "No autorizado." }, { status: 401 });
  }

  let cuerpo: any;
  try {
    cuerpo = await request.json();
  } catch {
    return NextResponse.json({ exito: false, mensaje: "Solicitud inválida." }, { status: 400 });
  }

  const { blobPath, inicioSeg, finSeg, texto } = cuerpo ?? {};
  if (
    typeof blobPath !== "string" ||
    !blobPath.startsWith(`${sesion.id}/`) ||
    typeof inicioSeg !== "number" ||
    typeof finSeg !== "number" ||
    !Number.isFinite(inicioSeg) ||
    !Number.isFinite(finSeg) ||
    inicioSeg < 0 ||
    finSeg <= inicioSeg ||
    finSeg - inicioSeg > DURACION_MAXIMA_VENTANA_SEG
  ) {
    return NextResponse.json({ exito: false, mensaje: "Datos de recorte inválidos." }, { status: 400 });
  }

  const ruta = `${CARPETA_HISTORIAS}/${blobPath}`;

  try {
    const original = await almacenActivo().leer(ruta);
    if (!original) {
      return NextResponse.json(
        { exito: false, mensaje: "El video no terminó de subirse. Intenta de nuevo." },
        { status: 404 }
      );
    }

    const bufferOriginal = await streamABuffer(original.stream);
    const bufferRecortado = await recortarVideoBuffer(bufferOriginal, inicioSeg, finSeg);

    const rutaRecortada = `${sesion.id}/${Date.now()}-${randomUUID().slice(0, 8)}.mp4`;
    await almacenActivo().subir(`${CARPETA_HISTORIAS}/${rutaRecortada}`, bufferRecortado, "video/mp4", false);
    // El original completo ya no hace falta -- solo era un paso intermedio
    // para poder recortarlo acá.
    await almacenActivo().borrar([ruta]);

    const textoLimpio = typeof texto === "string" ? texto.trim().slice(0, TEXTO_MAXIMO) || null : null;
    const supabase = supabaseServer();
    const { error } = await supabase.from("historias").insert({
      usuario_id: sesion.id,
      foto_blob: rutaRecortada,
      texto: textoLimpio,
      tiene_miniatura: false,
      es_video: true,
    });

    if (error) {
      return NextResponse.json({ exito: false, mensaje: "No se pudo guardar el video." }, { status: 500 });
    }

    await supabase
      .from("historia_publicaciones")
      .upsert({ usuario_id: sesion.id, fecha: hoyPeru() }, { onConflict: "usuario_id,fecha", ignoreDuplicates: true });

    return NextResponse.json({ exito: true });
  } catch (err: any) {
    return NextResponse.json(
      { exito: false, mensaje: err?.message || "No se pudo recortar el video en el servidor." },
      { status: 500 }
    );
  }
}
