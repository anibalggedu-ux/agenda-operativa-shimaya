import { NextResponse } from "next/server";
import { list } from "@vercel/blob";
import { obtenerSesion } from "@/lib/session";
import { almacenes, r2Configurado } from "@/lib/almacen-fotos";

// Migración única de las fotos que ya estaban en Vercel Blob a Cloudflare R2,
// con la misma ruta ("carpeta/archivo") para que las referencias guardadas
// en la base de datos sigan sirviendo. Se abre desde el navegador con sesión
// de coordinador; copia por tandas (hasta ~45 s por vez) y se puede recargar
// hasta que diga que terminó -- lo ya copiado se salta.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TIEMPO_MAXIMO_MS = 45_000;

function pagina(titulo: string, detalle: string, estado = 200) {
  return new NextResponse(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Migración de fotos</title>
<body style="font-family:system-ui,sans-serif;background:#0d0e10;color:#f1eee6;padding:24px;line-height:1.5">
<h1 style="font-size:20px">${titulo}</h1><p>${detalle}</p></body>`,
    { status: estado, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

export async function GET() {
  const sesion = await obtenerSesion();
  if (!sesion || sesion.rol !== "coordinador") {
    return pagina("No autorizado", "Entra a la app como coordinador y vuelve a abrir este enlace.", 401);
  }
  if (!r2Configurado()) {
    return pagina(
      "Falta configurar Cloudflare R2",
      "Agrega en Vercel las variables R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY y R2_BUCKET, vuelve a publicar y abre este enlace de nuevo.",
      400
    );
  }

  const inicio = Date.now();
  let copiadas = 0;
  let yaEstaban = 0;
  let fallidas = 0;
  let revisadas = 0;
  let cursor: string | undefined;
  let seCortoPorTiempo = false;

  do {
    const lote = await list({ cursor, limit: 500 });
    for (const blob of lote.blobs) {
      if (Date.now() - inicio > TIEMPO_MAXIMO_MS) {
        seCortoPorTiempo = true;
        break;
      }
      revisadas++;
      try {
        if (await almacenes.r2.existe(blob.pathname)) {
          yaEstaban++;
          continue;
        }
        const archivo = await almacenes.vercel.leer(blob.pathname);
        if (!archivo) {
          fallidas++;
          continue;
        }
        const contenido = Buffer.from(await new Response(archivo.stream).arrayBuffer());
        await almacenes.r2.subir(blob.pathname, contenido, archivo.contentType, true);
        copiadas++;
      } catch (error) {
        console.error(`No se pudo copiar ${blob.pathname}:`, error);
        fallidas++;
      }
    }
    cursor = lote.hasMore && !seCortoPorTiempo ? lote.cursor : undefined;
  } while (cursor);

  const resumen = `Revisadas: ${revisadas} · Copiadas ahora: ${copiadas} · Ya estaban en R2: ${yaEstaban} · Con error: ${fallidas}.`;
  if (seCortoPorTiempo) {
    return pagina("Migración en curso…", `${resumen}<br><br><b>Recarga esta página</b> para seguir con las que faltan.`);
  }
  if (fallidas > 0) {
    return pagina("Migración casi completa", `${resumen}<br><br>Recarga la página para reintentar las que fallaron.`);
  }
  return pagina("✅ Migración terminada", `${resumen}<br><br>Todas las fotos ya están en Cloudflare R2.`);
}
