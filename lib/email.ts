import nodemailer from "nodemailer";
import { supabaseServer } from "./supabase-server";

const transportador = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

const NOMBRE_REMITENTE = "Agenda Operativa Shimaya";

// URL pública de la app, para enlaces directos dentro de los correos (ej.
// "ir a la Bitácora de Campo"). Se puede sobreescribir con una variable de
// entorno si el dominio cambia.
export const URL_APP = process.env.NEXT_PUBLIC_URL_APP || "https://agenda-operativa-shimaya.vercel.app";

// Gmail penaliza a las cuentas nuevas que mandan un solo correo con muchos
// destinatarios en copia oculta (patrón típico de spam). Los comunicados
// masivos se dividen en lotes pequeños con una pausa entre cada uno para
// que se vean como envíos normales en vez de una explosión de correo.
const TAMANO_LOTE_CCO = 10;
const PAUSA_ENTRE_LOTES_MS = 1200;

function dormir(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function dividirEnLotes<T>(items: T[], tamano: number): T[][] {
  const lotes: T[][] = [];
  for (let i = 0; i < items.length; i += tamano) {
    lotes.push(items.slice(i, i + tamano));
  }
  return lotes;
}

function plantillaCorreo(tituloEmoji: string, titulo: string, cuerpoHtml: string): string {
  return `
  <div style="font-family: -apple-system, 'Segoe UI', Arial, sans-serif; background:#0d0e10; padding:24px 12px;">
    <div style="max-width:520px; margin:0 auto; background:#18191d; border-radius:6px; overflow:hidden; border:1px solid #2a2c31;">
      <div style="background:#d31e2b; padding:16px 24px;">
        <p style="margin:0; color:#f7f5f2; font-size:11px; font-weight:700; letter-spacing:.1em; text-transform:uppercase;">
          SHIMAYA · Agenda Operativa
        </p>
      </div>
      <div style="padding:24px;">
        <h1 style="margin:0 0 16px; color:#f7f5f2; font-size:18px;">${tituloEmoji} ${titulo}</h1>
        <div style="color:#f1eee6; font-size:14px; line-height:1.7;">${cuerpoHtml}</div>
      </div>
    </div>
  </div>`;
}

export type ContactoCorreo = { nombre: string; email: string };
export type ResultadoEnvioCorreo = { exito: boolean };

// Un correo que falla queda anotado en la misma bitácora de "Historial de
// cambios" que ya usa Registro — así el fallo se ve en la app en vez de
// perderse en logs de servidor que en el plan actual de Vercel se borran a
// la hora. Es un registro "del sistema" (usuario_id null), y esta inserción
// es en sí misma best-effort: si falla, no debe tumbar nada más.
async function registrarFalloCorreo(asunto: string, destinatarios: string[], detalleError: string): Promise<void> {
  try {
    const supabase = supabaseServer();
    await supabase.from("auditoria_cambios").insert({
      usuario_id: null,
      usuario_nombre: "Sistema (correo)",
      accion: "No se pudo enviar un correo",
      detalle: `"${asunto}" → ${destinatarios.join(", ") || "(sin destinatarios directos)"}: ${detalleError}`,
    });
  } catch (error) {
    console.error("No se pudo registrar el fallo de correo en la bitácora:", error);
  }
}

export async function enviarCorreo(opciones: {
  para: string | string[];
  cco?: string[];
  asunto: string;
  tituloEmoji?: string;
  cuerpoHtml: string;
  responderA?: ContactoCorreo | null;
}): Promise<ResultadoEnvioCorreo> {
  const destinatarios = (Array.isArray(opciones.para) ? opciones.para : [opciones.para]).filter(
    Boolean
  );
  const copiaOculta = (opciones.cco ?? []).filter(Boolean);

  if (destinatarios.length === 0 && copiaOculta.length === 0) return { exito: false };

  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    console.error(
      "No se pudo enviar el correo: faltan las variables GMAIL_USER / GMAIL_APP_PASSWORD."
    );
    await registrarFalloCorreo(opciones.asunto, destinatarios, "Faltan las variables GMAIL_USER / GMAIL_APP_PASSWORD.");
    return { exito: false };
  }

  try {
    const lotesCco = dividirEnLotes(copiaOculta, TAMANO_LOTE_CCO);
    const lotes = lotesCco.length > 0 ? lotesCco : [[]];

    for (let i = 0; i < lotes.length; i++) {
      await transportador.sendMail({
        from: `"${NOMBRE_REMITENTE}" <${process.env.GMAIL_USER}>`,
        // Si solo hay copia oculta (envíos masivos tipo comunicado), el "para"
        // queda como la propia cuenta remitente para no dejar el campo vacío.
        to: destinatarios.length > 0 ? destinatarios : process.env.GMAIL_USER,
        bcc: lotes[i].length > 0 ? lotes[i] : undefined,
        replyTo: opciones.responderA
          ? `"${opciones.responderA.nombre}" <${opciones.responderA.email}>`
          : undefined,
        subject: opciones.asunto,
        html: plantillaCorreo(opciones.tituloEmoji ?? "📋", opciones.asunto, opciones.cuerpoHtml),
      });
      if (i < lotes.length - 1) await dormir(PAUSA_ENTRE_LOTES_MS);
    }
    return { exito: true };
  } catch (error) {
    // Un correo que falla nunca debe tumbar la acción principal (asignar una
    // ruta, un descanso, etc.) — pero sí debe quedar anotado en algún lado.
    console.error("Error al enviar correo:", error);
    await registrarFalloCorreo(
      opciones.asunto,
      destinatarios,
      error instanceof Error ? error.message : String(error)
    );
    return { exito: false };
  }
}
