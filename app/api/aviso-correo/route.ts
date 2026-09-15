import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { enviarCorreo } from "@/lib/email";

// Ruta temporal para mandar el aviso, una sola vez, de que los correos
// ahora salen por un nuevo sistema de envio. Se elimina despues de usarla.
const TOKEN = "shimaya-aviso-7c41ba90";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (token !== TOKEN) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const supabase = supabaseServer();
  const { data, error } = await supabase
    .from("usuarios")
    .select("email")
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
    tituloEmoji: "📬",
    asunto: "Aviso: los correos de la Agenda cambian de sistema de envío",
    cuerpoHtml: `
      <p>Hola,</p>
      <p>A partir de hoy, los correos que te manda la Agenda Operativa (asignación de rutas, aprobación de descansos y permisos, comunicados, etc.) van a seguir llegando con el mismo diseño de siempre — solo cambia el sistema que los envía, para que lleguen de forma más confiable.</p>
      <p style="margin:20px 0 8px;"><strong>Así se ve, por ejemplo, un aviso de ruta asignada:</strong></p>
      <div style="border:1px solid #2a2c31; border-radius:6px; padding:16px; background:#101114;">
        <p style="margin:0 0 10px; color:#8b8d92; font-size:11px; text-transform:uppercase; letter-spacing:.05em;">Asunto: Nueva ruta asignada — lunes, 15 de setiembre</p>
        <p style="margin:0 0 10px;">Hola Juan,</p>
        <p style="margin:0 0 10px;">Se te asignó una nueva ruta:</p>
        <ul style="padding-left:18px; margin:0 0 12px;">
          <li><strong>Tienda:</strong> Villa El Salvador</li>
          <li><strong>Fecha:</strong> Lunes, 15 de setiembre</li>
          <li><strong>Clima previsto:</strong> ☀️ Soleado · 26°/19°</li>
        </ul>
        <p style="margin:0; color:#e23744; font-weight:700;">Ir a la Bitácora de Campo →</p>
      </div>
      <p style="margin:20px 0 0;">No necesitas hacer nada distinto — solo asegúrate de que estos correos no te caigan en spam o promociones.</p>
      <p style="color:#8b8d92; font-size:12px; margin-top:16px;">Cualquier duda, escríbele a tu coordinador.</p>
    `,
  });

  return NextResponse.json({
    exito: resultado.exito,
    totalDestinatarios: correos.length,
  });
}
