import { NextRequest, NextResponse } from "next/server";
import { get } from "@vercel/blob";
import { obtenerSesion } from "@/lib/session";

// Vercel Blob no deja fijar Content-Disposition en una URL firmada (a
// diferencia del SAS de Azure), así que el botón "Descargar" de Mi Galería
// pasa por acá -- la sesión del usuario (cookie propia del dominio) protege
// esta ruta, no un token de Vercel. Solo lee fotos privadas, nunca escribe.
const CARPETAS_PERMITIDAS = new Set(["marcaciones", "historias", "perfiles"]);

export async function GET(request: NextRequest) {
  const sesion = await obtenerSesion();
  if (!sesion) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  const carpeta = request.nextUrl.searchParams.get("carpeta");
  const archivo = request.nextUrl.searchParams.get("archivo");
  if (!carpeta || !archivo || !CARPETAS_PERMITIDAS.has(carpeta)) {
    return NextResponse.json({ error: "Parámetros inválidos." }, { status: 400 });
  }

  const resultado = await get(`${carpeta}/${archivo}`, { access: "private" });
  if (!resultado || resultado.statusCode !== 200 || !resultado.stream) {
    return NextResponse.json({ error: "No se encontró la foto." }, { status: 404 });
  }

  return new NextResponse(resultado.stream, {
    headers: {
      "Content-Type": resultado.blob.contentType,
      "Content-Disposition": 'attachment; filename="historia-shimaya.jpg"',
      "X-Content-Type-Options": "nosniff",
    },
  });
}
