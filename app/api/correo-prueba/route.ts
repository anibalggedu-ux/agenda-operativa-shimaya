import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { enviarCorreo } from "@/lib/email";

// Ruta temporal de diagnostico para confirmar que el envio de correos
// funciona tras el limite diario de Gmail reportado antes. Se elimina
// despues de la prueba.
const TOKEN_DIAGNOSTICO = "shimaya-diag-8f31c02a";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (token !== TOKEN_DIAGNOSTICO) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const supabase = supabaseServer();
  const { data, error } = await supabase
    .from("usuarios")
    .select("nombre, email")
    .not("email", "is", null)
    .eq("activo", true)
    .not("nombre", "ilike", "%generico%");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const correos = (data ?? []).map((u) => u.email).filter((e): e is string => !!e);

  const resultado = await enviarCorreo({
    para: [],
    cco: correos,
    tituloEmoji: "✅",
    asunto: "Correo de prueba - Agenda Shimaya",
    cuerpoHtml: `
      <p>Este es un correo de prueba para confirmar que el envío de notificaciones está funcionando correctamente.</p>
      <p style="color:#8b8d92; font-size:12px;">No necesitas hacer nada con este mensaje.</p>
    `,
  });

  return NextResponse.json({
    exito: resultado.exito,
    totalDestinatarios: correos.length,
    destinatarios: (data ?? []).map((u) => ({ nombre: u.nombre, email: u.email })),
  });
}
