import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { notificarPush } from "@/lib/notificar-push";
import { enviarCorreo, escaparHtml } from "@/lib/email";
import { formatearFechaLegible, formatearHora } from "@/lib/fechas";

// Mismo secreto que los demás endpoints de admin -- deja reenviar el aviso
// (push + correo) de un comunicado/evento ya publicado a sus destinatarios,
// fuera de una sesión de coordinador (ej. un recordatorio puntual el día
// antes de la reunión), sin decodificar ni reusar credenciales de nadie.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (!process.env.SUPABASE_CRON_SECRET || auth !== `Bearer ${process.env.SUPABASE_CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Falta el parámetro id." }, { status: 400 });

  const supabase = supabaseServer();
  const { data: comunicado } = await supabase
    .from("comunicados")
    .select("id, tipo, mensaje, fecha_evento, hora_inicio, hora_fin, ubicacion, usuarios_destino")
    .eq("id", id)
    .maybeSingle();

  if (!comunicado) return NextResponse.json({ error: "No se encontró el comunicado." }, { status: 404 });

  const destinatarioIds = comunicado.usuarios_destino ?? [];
  if (destinatarioIds.length === 0) {
    return NextResponse.json({ error: "El comunicado no tiene destinatarios específicos." }, { status: 400 });
  }

  const { data: destinatarios } = await supabase
    .from("usuarios")
    .select("id, email")
    .in("id", destinatarioIds)
    .eq("activo", true);

  const cuandoTexto = comunicado.fecha_evento
    ? `${formatearFechaLegible(comunicado.fecha_evento)}${
        comunicado.hora_inicio ? ", " + formatearHora(comunicado.hora_inicio) : ""
      }${comunicado.hora_fin ? " a " + formatearHora(comunicado.hora_fin) : ""}`
    : null;

  const cuerpo = `${comunicado.tipo}${cuandoTexto ? ` — ${cuandoTexto}` : ""}${
    comunicado.ubicacion ? ` en ${comunicado.ubicacion}` : ""
  }`;

  await notificarPush(destinatarioIds, {
    titulo: "🔔 Recordatorio de reunión",
    cuerpo,
  });

  const correos = (destinatarios ?? []).map((d) => d.email).filter((e): e is string => Boolean(e));
  if (correos.length > 0) {
    await enviarCorreo({
      para: process.env.SENDGRID_FROM_EMAIL ?? "",
      cco: correos,
      asunto: `Recordatorio: ${comunicado.tipo}`,
      tituloEmoji: "🔔",
      cuerpoHtml: `
        <p><strong>${escaparHtml(comunicado.tipo)}</strong></p>
        ${cuandoTexto ? `<p>${escaparHtml(cuandoTexto)}</p>` : ""}
        ${comunicado.ubicacion ? `<p>${escaparHtml(comunicado.ubicacion)}</p>` : ""}
        ${comunicado.mensaje ? `<p>${escaparHtml(comunicado.mensaje)}</p>` : ""}
      `,
    });
  }

  return NextResponse.json({ ok: true, avisados: destinatarioIds.length });
}
