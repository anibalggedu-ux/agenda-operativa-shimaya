import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { diaLaboralPeru, horaPeru, formatearHora } from "@/lib/fechas";
import { notificarPush } from "@/lib/notificar-push";
import { enviarCorreo } from "@/lib/email";

// Respaldo del aviso de "quedan 5 min de break" cuando el celular tiene la
// app cerrada o la pantalla apagada: avisarCincoMinutosBreak (break-actions.ts)
// depende de un setInterval en el navegador, que el sistema operativo
// suspende apenas la app deja de estar en primer plano -- si eso pasa, el
// aviso nunca se dispara solo. Este cron (disparado por pg_cron de Supabase
// cada minuto, mismo mecanismo que recordatorios-agenda) revisa los breaks
// en curso sin importar si hay alguien mirando la pantalla.
export const dynamic = "force-dynamic";

const AVISO_ANTES_SEG = 5 * 60;

function segundosDesdeMedianoche(horaHHMMSS: string): number {
  const [h, m, s] = horaHHMMSS.split(":").map(Number);
  return h * 3600 + m * 60 + (s || 0);
}

export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (!process.env.SUPABASE_CRON_SECRET || auth !== `Bearer ${process.env.SUPABASE_CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const supabase = supabaseServer();
  const ahoraSeg = segundosDesdeMedianoche(horaPeru());

  const { data: candidatos, error } = await supabase
    .from("marcaciones_break")
    .select("id, usuario_id, hora_limite, usuarios(nombre, email)")
    .eq("fecha", diaLaboralPeru())
    .eq("aviso_5min_enviado", false)
    .eq("no_salio", false)
    .is("hora_entrada", null)
    .not("hora_limite", "is", null);

  if (error || !candidatos || candidatos.length === 0) {
    return NextResponse.json({ ok: true, avisados: 0 });
  }

  const porAvisar = candidatos.filter(
    (b) => segundosDesdeMedianoche(b.hora_limite!) - ahoraSeg <= AVISO_ANTES_SEG
  );

  let avisados = 0;
  for (const b of porAvisar) {
    // Mismo chequeo atómico que avisarCincoMinutosBreak -- si el cliente ya
    // lo mandó un instante antes (app abierta en primer plano), esta
    // actualización no encuentra filas y se salta el break sin duplicar aviso.
    const { data: actualizado } = await supabase
      .from("marcaciones_break")
      .update({ aviso_5min_enviado: true })
      .eq("id", b.id)
      .eq("aviso_5min_enviado", false)
      .is("hora_entrada", null)
      .select("id")
      .maybeSingle();
    if (!actualizado) continue;

    const nombre = (b as any).usuarios?.nombre ?? "";
    const email = (b as any).usuarios?.email ?? null;
    const horaLimiteTexto = formatearHora(b.hora_limite!);

    const payloadPush = {
      titulo: "⏰ Te quedan 5 minutos de break",
      cuerpo: `Marca tu entrada antes de las ${horaLimiteTexto}.`,
    };
    for (let i = 0; i < 3; i++) {
      if (i > 0) await new Promise((resolve) => setTimeout(resolve, 2000));
      await notificarPush([b.usuario_id], payloadPush);
    }

    if (email) {
      await enviarCorreo({
        para: email,
        asunto: "Te quedan 5 minutos de tu break",
        tituloEmoji: "⏰",
        cuerpoHtml: `<p>Hola ${nombre.split(" ")[0]},</p>
          <p>Te quedan <strong>5 minutos</strong> de tu break. Tienes que marcar tu entrada antes de las
          <strong>${horaLimiteTexto}</strong>.</p>`,
      });
    }
    avisados++;
  }

  return NextResponse.json({ ok: true, avisados });
}
