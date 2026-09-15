import { NextRequest, NextResponse } from "next/server";
import { enviarCorreo } from "@/lib/email";

// Ruta temporal de diagnostico para confirmar que el envio con el dominio
// propio (agendashimaya.com) funciona y no cae en spam. Solo se manda al
// propio admin, no a todo el equipo. Se elimina despues de la prueba.
const TOKEN = "shimaya-diag-domain-2b7fa1";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (token !== TOKEN) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const resultado = await enviarCorreo({
    para: ["anibalggedu@gmail.com"],
    tituloEmoji: "✅",
    asunto: "Prueba final - dominio propio agendashimaya.com",
    cuerpoHtml: `
      <p>Este correo se envió desde el dominio propio autenticado (agendashimaya.com) para confirmar que ya no debería caer en spam.</p>
    `,
  });

  return NextResponse.json({ exito: resultado.exito });
}
