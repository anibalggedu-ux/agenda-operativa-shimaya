import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { enviarNotificacionPush } from "@/lib/push";

// A diferencia del cron diario (que usa Vercel Cron -- limitado a 2 crons y
// una corrida al día en el plan Hobby), este lo dispara pg_cron desde
// Supabase cada pocos minutos, con su propio secreto (SUPABASE_CRON_SECRET)
// en vez del CRON_SECRET que ya usa Vercel.
export const dynamic = "force-dynamic";

const LOTE_MAXIMO = 200;

export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (!process.env.SUPABASE_CRON_SECRET || auth !== `Bearer ${process.env.SUPABASE_CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const supabase = supabaseServer();

  // Pendientes, con recordatorio ya vencido, y todavía no avisadas por push.
  const { data: notas, error } = await supabase
    .from("agenda_personal")
    .select("id, usuario_id, texto")
    .eq("cumplida", false)
    .not("recordatorio_en", "is", null)
    .lte("recordatorio_en", new Date().toISOString())
    .is("notificado_push_en", null)
    .limit(LOTE_MAXIMO);

  if (error || !notas || notas.length === 0) {
    return NextResponse.json({ ok: true, avisadas: 0 });
  }

  const idsUsuarios = Array.from(new Set(notas.map((n) => n.usuario_id)));
  const { data: suscripciones } = await supabase
    .from("suscripciones_push")
    .select("id, usuario_id, endpoint, p256dh, auth")
    .in("usuario_id", idsUsuarios);

  const suscripcionesPorUsuario = new Map<string, typeof suscripciones>();
  (suscripciones ?? []).forEach((s) => {
    const lista = suscripcionesPorUsuario.get(s.usuario_id) ?? [];
    lista.push(s);
    suscripcionesPorUsuario.set(s.usuario_id, lista);
  });

  let avisadas = 0;
  const idsExpiradas: string[] = [];

  for (const nota of notas) {
    const misSuscripciones = suscripcionesPorUsuario.get(nota.usuario_id) ?? [];
    const texto = nota.texto.length > 80 ? `${nota.texto.slice(0, 80)}...` : nota.texto;

    await Promise.all(
      misSuscripciones.map(async (s) => {
        const resultado = await enviarNotificacionPush(
          { endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth },
          { titulo: "⏰ Recordatorio de tu agenda", cuerpo: texto, url: "/" }
        );
        if (resultado.expirada) idsExpiradas.push(s.id);
      })
    );

    // Se marca avisada aunque no tuviera ninguna suscripción activa -- si no,
    // se reintentaría en cada corrida para siempre sin que nadie la vea.
    await supabase
      .from("agenda_personal")
      .update({ notificado_push_en: new Date().toISOString() })
      .eq("id", nota.id);
    avisadas++;
  }

  if (idsExpiradas.length > 0) {
    await supabase.from("suscripciones_push").delete().in("id", idsExpiradas);
  }

  return NextResponse.json({ ok: true, avisadas, suscripcionesExpiradas: idsExpiradas.length });
}
