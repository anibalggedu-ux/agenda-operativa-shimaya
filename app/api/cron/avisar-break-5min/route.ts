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

  // Sin el embed "usuarios(nombre, email)" a propósito: si esa segunda tabla
  // falla por cualquier motivo (ej. el caché de relaciones de PostgREST
  // desactualizado tras una migración), antes se perdía el aviso ENTERO en
  // silencio -- el error quedaba atrapado en la rama de abajo y el cron
  // reportaba "avisados: 0" como si simplemente no hubiera nadie por avisar.
  // Caso real: Anibal Garrido, 22-23 oct, el cron corrió cada minuto sin
  // fallar nunca de forma visible, pero jamás detectó su break -- recién le
  // llegó el aviso ~4 horas tarde, cuando volvió a abrir la app y el chequeo
  // del lado del cliente (break-widget.tsx) lo disparó él mismo. El nombre/
  // correo del usuario, que si puede fallar sin perder el aviso en sí, se
  // busca aparte más abajo.
  const { data: candidatos, error } = await supabase
    .from("marcaciones_break")
    .select("id, usuario_id, hora_limite")
    .eq("fecha", diaLaboralPeru())
    .eq("aviso_5min_enviado", false)
    .eq("no_salio", false)
    .is("hora_entrada", null)
    .not("hora_limite", "is", null);

  if (error) {
    console.error("avisar-break-5min: no se pudo consultar marcaciones_break:", error);
    return NextResponse.json({ ok: false, avisados: 0, error: error.message }, { status: 500 });
  }
  if (!candidatos || candidatos.length === 0) {
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

    // El push (lo urgente) ya se manda igual aunque esto falle -- el nombre/
    // correo solo hace falta para el correo de respaldo, que es secundario.
    let nombre = "";
    let email: string | null = null;
    try {
      const { data: usuario } = await supabase.from("usuarios").select("nombre, email").eq("id", b.usuario_id).maybeSingle();
      nombre = usuario?.nombre ?? "";
      email = usuario?.email ?? null;
    } catch (errorUsuario) {
      console.error("avisar-break-5min: no se pudo obtener nombre/correo del usuario:", errorUsuario);
    }
    const horaLimiteTexto = formatearHora(b.hora_limite!);

    // Envuelto en try/catch -- ya se marcó aviso_5min_enviado arriba, así
    // que si el envío en sí falla (push o correo caídos), al menos no corta
    // el resto de la corrida ni deja la excepción sin registrar: antes una
    // falla acá habría tirado toda la función (y con ella, cualquier otro
    // break pendiente en el mismo lote) sin dejar rastro.
    try {
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
    } catch (errorAviso) {
      console.error(`avisar-break-5min: no se pudo avisar al usuario ${b.usuario_id}:`, errorAviso);
    }
  }

  return NextResponse.json({ ok: true, avisados });
}
