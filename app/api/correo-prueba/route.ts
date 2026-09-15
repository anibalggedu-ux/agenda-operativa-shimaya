import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { enviarCorreo } from "@/lib/email";

// Ruta temporal de diagnostico para confirmar que el envio con el dominio
// propio (agendashimaya.com) funciona y no cae en spam para todo el equipo.
// Se elimina despues de la prueba.
const TOKEN = "shimaya-diag-todos-e91fa3";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (token !== TOKEN) {
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
    asunto: "Prueba de correo — nuevo dominio agendashimaya.com",
    cuerpoHtml: `
      <p>Este es un correo de prueba enviado desde el dominio propio de la Agenda Operativa.</p>
      <p style="color:#8b8d92; font-size:12px;">Si te llegó a la bandeja principal (no a spam/promociones), no necesitas hacer nada más.</p>
    `,
  });

  return NextResponse.json({
    exito: resultado.exito,
    totalDestinatarios: correos.length,
  });
}
