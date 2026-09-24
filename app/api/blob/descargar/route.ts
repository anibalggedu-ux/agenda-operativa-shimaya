import { NextRequest, NextResponse } from "next/server";
import { get } from "@vercel/blob";
import { obtenerSesion, type SesionUsuario } from "@/lib/session";
import { supabaseServer } from "@/lib/supabase-server";

// Vercel Blob no deja fijar Content-Disposition en una URL firmada (a
// diferencia del SAS de Azure), así que el botón "Descargar" de Mi Galería
// pasa por acá -- la sesión del usuario (cookie propia del dominio) protege
// esta ruta, no un token de Vercel. Solo lee fotos privadas, nunca escribe.
//
// También sirve las fotos de evidencia (checklists/auditorías) al navegador
// para armarlas dentro del PDF: el enlace firmado de Vercel apunta a otro
// dominio y el navegador podría no dejar leerlo desde la app.
const CARPETAS_PERMITIDAS = new Set(["marcaciones", "historias", "perfiles", "evidencias"]);

// "checklist|auditoria/<uuid>/<archivo>.<ext>" -- ver subirFotoEvidencia.
const RUTA_EVIDENCIA = /^(checklist|auditoria)\/([0-9a-f-]{36})\/[A-Za-z0-9-]+\.(jpg|png|webp)$/;

// Mismo criterio que el detalle de cada registro: un checklist lo puede ver
// cualquiera con sesión (Central Analítica); una auditoría, quien la hizo,
// coordinador/gerente o el supervisor a cargo de esa tienda.
async function puedeVerEvidencia(sesion: SesionUsuario, archivo: string): Promise<boolean> {
  const partes = archivo.match(RUTA_EVIDENCIA);
  if (!partes) return false;
  if (partes[1] === "checklist") return true;
  if (sesion.rol === "coordinador" || sesion.rol === "gerente") return true;

  const supabase = supabaseServer();
  const { data } = await supabase
    .from("auditorias")
    .select("supervisor_id, tienda_id")
    .eq("id", partes[2])
    .maybeSingle();
  if (!data) return false;
  if (data.supervisor_id === sesion.id) return true;
  const { data: permanente } = await supabase
    .from("tiendas_permanentes")
    .select("id")
    .eq("tienda_id", data.tienda_id)
    .eq("usuario_id", sesion.id)
    .is("fecha_fin", null)
    .maybeSingle();
  return !!permanente;
}

export async function GET(request: NextRequest) {
  const sesion = await obtenerSesion();
  if (!sesion) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  const carpeta = request.nextUrl.searchParams.get("carpeta");
  const archivo = request.nextUrl.searchParams.get("archivo");
  if (!carpeta || !archivo || !CARPETAS_PERMITIDAS.has(carpeta)) {
    return NextResponse.json({ error: "Parámetros inválidos." }, { status: 400 });
  }
  if (carpeta === "evidencias" && !(await puedeVerEvidencia(sesion, archivo))) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  const resultado = await get(`${carpeta}/${archivo}`, { access: "private" });
  if (!resultado || resultado.statusCode !== 200 || !resultado.stream) {
    return NextResponse.json({ error: "No se encontró la foto." }, { status: 404 });
  }

  return new NextResponse(resultado.stream, {
    headers: {
      "Content-Type": resultado.blob.contentType,
      "Content-Disposition":
        carpeta === "evidencias" ? "inline" : 'attachment; filename="historia-shimaya.jpg"',
      "X-Content-Type-Options": "nosniff",
    },
  });
}
