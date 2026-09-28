import { NextRequest, NextResponse } from "next/server";
import { list } from "@vercel/blob";
import { obtenerSesion } from "@/lib/session";
import { almacenes, diagnosticoR2, r2Configurado } from "@/lib/almacen-fotos";

// Limpieza de las fotos que quedaron duplicadas en Vercel Blob después de
// migrar todo a Cloudflare R2 (ver /api/migrar-fotos-r2, que copia sin
// borrar el original). Solo borra un archivo si YA está confirmado en R2 --
// si algo no se migró (por lo que sea), se salta y se reporta, nunca se
// borra a ciegas. Por default es un ensayo (no borra nada, solo cuenta);
// hace falta "?confirmar=si" en la URL para que borre de verdad.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TIEMPO_MAXIMO_MS = 45_000;

function pagina(titulo: string, detalle: string, estado = 200) {
  return new NextResponse(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Limpieza de fotos en Vercel Blob</title>
<body style="font-family:system-ui,sans-serif;background:#0d0e10;color:#f1eee6;padding:24px;line-height:1.5">
<h1 style="font-size:20px">${titulo}</h1><p>${detalle}</p></body>`,
    { status: estado, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

export async function GET(request: NextRequest) {
  const sesion = await obtenerSesion();
  if (!sesion || sesion.rol !== "coordinador") {
    return pagina("No autorizado", "Entra a la app como coordinador y vuelve a abrir este enlace.", 401);
  }
  if (!r2Configurado()) {
    return pagina(
      "Falta configurar Cloudflare R2",
      `Sin R2 activo no hay forma de confirmar qué ya está migrado, así que no se borra nada.<br><br>${diagnosticoR2().join("<br>")}`,
      400
    );
  }

  const confirmar = request.nextUrl.searchParams.get("confirmar") === "si";
  const inicio = Date.now();
  let confirmadasEnR2 = 0;
  let borradas = 0;
  let noMigradasTodavia = 0;
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
        const yaEstaEnR2 = await almacenes.r2.existe(blob.pathname);
        if (!yaEstaEnR2) {
          noMigradasTodavia++;
          continue;
        }
        confirmadasEnR2++;
        if (confirmar) {
          await almacenes.vercel.borrar([blob.pathname]);
          borradas++;
        }
      } catch (error) {
        console.error(`No se pudo revisar/borrar ${blob.pathname}:`, error);
        noMigradasTodavia++; // ante la duda, no se toca
      }
    }
    cursor = lote.hasMore && !seCortoPorTiempo ? lote.cursor : undefined;
  } while (cursor);

  const resumen = `Revisadas: ${revisadas} · Confirmadas ya en R2: ${confirmadasEnR2} · ${
    confirmar ? `Borradas de Vercel Blob: ${borradas}` : "Borradas: 0 (esto fue solo un ensayo)"
  } · Sin confirmar en R2 (no tocadas): ${noMigradasTodavia}.`;

  if (seCortoPorTiempo) {
    return pagina(
      confirmar ? "Borrado en curso…" : "Ensayo en curso…",
      `${resumen}<br><br><b>Recarga esta misma página</b> (con la misma URL) para seguir con el resto.`
    );
  }

  if (noMigradasTodavia > 0) {
    return pagina(
      "Hay fotos sin confirmar en R2",
      `${resumen}<br><br>Esas no se tocaron. Corre primero <a href="/api/migrar-fotos-r2" style="color:#f1eee6">/api/migrar-fotos-r2</a> (puede que solo falten unas pocas) y después vuelve a abrir este enlace.`
    );
  }

  if (!confirmar) {
    return pagina(
      "Ensayo terminado -- nada se borró",
      `${resumen}<br><br>Todo lo que hay en Vercel Blob ya está confirmado en R2. Para borrarlo de verdad, abre <a href="?confirmar=si" style="color:#f1eee6">este mismo enlace con ?confirmar=si</a>.`
    );
  }

  return pagina("✅ Limpieza terminada", `${resumen}<br><br>Vercel Blob quedó sin las fotos que ya estaban duplicadas en R2.`);
}
