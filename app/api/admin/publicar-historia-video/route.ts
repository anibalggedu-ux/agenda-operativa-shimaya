import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { prepararSubidaVideoHistoriaEnAlmacen, existeVideoHistoria } from "@/lib/blob-storage";
import { hoyPeru } from "@/lib/fechas";

// Mismo secreto que los demás endpoints de admin -- deja publicar un video
// como historia de un usuario puntual (ej. un video armado fuera de la app,
// como el explicativo de novedades) sin pasar por el flujo normal del
// navegador (que sube el archivo directo desde la cámara/galería).
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = request.headers.get("authorization");
  if (!process.env.SUPABASE_CRON_SECRET || auth !== `Bearer ${process.env.SUPABASE_CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const usuarioId = body?.usuarioId as string | undefined;
  const videoBase64 = body?.videoBase64 as string | undefined;
  // Alternativa a videoBase64 -- el servidor descarga el video él mismo
  // desde esta URL (ej. un archivo público temporal en /public) en vez de
  // recibir los bytes en el cuerpo del POST. Evita tener que mandar un
  // archivo binario grande como string.
  const videoUrl = body?.videoUrl as string | undefined;
  const contentType = (body?.contentType as string | undefined) || "video/webm";
  const texto = (body?.texto as string | undefined)?.trim().slice(0, 200) || null;

  if (!usuarioId || (!videoBase64 && !videoUrl)) {
    return NextResponse.json({ error: "Faltan parámetros (usuarioId, y videoBase64 o videoUrl)." }, { status: 400 });
  }

  const supabase = supabaseServer();
  const { data: usuario } = await supabase.from("usuarios").select("id").eq("id", usuarioId).eq("activo", true).maybeSingle();
  if (!usuario) return NextResponse.json({ error: "Usuario no encontrado o inactivo." }, { status: 404 });

  let buffer: Buffer;
  if (videoUrl) {
    const origen = await fetch(videoUrl);
    if (!origen.ok) return NextResponse.json({ error: "No se pudo descargar el video de origen." }, { status: 502 });
    buffer = Buffer.from(await origen.arrayBuffer());
  } else {
    buffer = Buffer.from(videoBase64!, "base64");
  }

  const preparado = await prepararSubidaVideoHistoriaEnAlmacen(usuarioId, contentType);
  if (!preparado) {
    return NextResponse.json({ error: "La subida de video no está disponible (falta configurar el almacén)." }, { status: 500 });
  }

  const subida = await fetch(preparado.urlSubida, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: new Uint8Array(buffer),
  });
  if (!subida.ok) {
    return NextResponse.json({ error: "No se pudo subir el video al almacén." }, { status: 502 });
  }

  if (!(await existeVideoHistoria(preparado.blobPath))) {
    return NextResponse.json({ error: "El video no terminó de subirse." }, { status: 500 });
  }

  const { error } = await supabase.from("historias").insert({
    usuario_id: usuarioId,
    foto_blob: preparado.blobPath,
    texto,
    tiene_miniatura: false,
    es_video: true,
  });
  if (error) return NextResponse.json({ error: "No se pudo guardar la historia." }, { status: 500 });

  await supabase
    .from("historia_publicaciones")
    .upsert({ usuario_id: usuarioId, fecha: hoyPeru() }, { onConflict: "usuario_id,fecha", ignoreDuplicates: true });

  return NextResponse.json({ ok: true, blobPath: preparado.blobPath });
}
