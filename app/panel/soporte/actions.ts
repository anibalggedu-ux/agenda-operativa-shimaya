"use server";

import { supabaseServer } from "@/lib/supabase-server";
import { exigirSesion } from "@/lib/session";
import { notificarPush } from "@/lib/notificar-push";
import { enviarCorreo, escaparHtml } from "@/lib/email";

// El creador de la app (Anibal Garrido) es quien recibe todo lo que llega
// por este canal y puede responder cualquier ticket, no solo los suyos --
// no hay un rol "admin" aparte en usuarios, así que se identifica por su
// propio id (conocido, no cambia). El resto de la app no necesita saber
// esto; vive acá porque es el único lugar que lo usa.
const ID_CREADOR_APP = "03d347c0-98fd-4060-ace9-b27da0fa47f8";

export type TipoTicket = "duda" | "sugerencia" | "falla";
export type EstadoTicket = "abierto" | "respondido" | "cerrado";

export type MensajeTicket = {
  id: string;
  esAdmin: boolean;
  autorNombre: string;
  mensaje: string;
  creadoEn: string;
};

export type TicketSoporte = {
  id: string;
  usuarioId: string;
  usuarioNombre: string;
  rol: string;
  tipo: TipoTicket;
  estado: EstadoTicket;
  creadoEn: string;
  actualizadoEn: string;
  mensajes: MensajeTicket[];
};

export type ResultadoSoporte = { exito: boolean; mensaje?: string };

const ETIQUETA_TIPO: Record<TipoTicket, string> = {
  duda: "Duda",
  sugerencia: "Sugerencia",
  falla: "Falla",
};

async function notificarCreador(asunto: string, cuerpo: string): Promise<void> {
  await notificarPush([ID_CREADOR_APP], { titulo: "🛟 Soporte y sugerencias", cuerpo });
  const supabase = supabaseServer();
  const { data: creador } = await supabase.from("usuarios").select("email").eq("id", ID_CREADOR_APP).maybeSingle();
  if (creador?.email) {
    await enviarCorreo({
      para: creador.email,
      tituloEmoji: "🛟",
      asunto,
      cuerpoHtml: `<p>${escaparHtml(cuerpo)}</p><p style="color:#8b8d92; font-size:12px;">Respóndele desde la pestaña "Soporte" de la app.</p>`,
    });
  }
}

// Crea un ticket nuevo con su primer mensaje -- avisa al creador de la app
// por push y correo al instante.
export async function crearTicketSoporte(tipo: TipoTicket, mensaje: string): Promise<ResultadoSoporte> {
  const sesion = await exigirSesion();
  const mensajeLimpio = mensaje.trim();
  if (!mensajeLimpio) return { exito: false, mensaje: "Escribe tu duda, sugerencia o falla." };

  const supabase = supabaseServer();
  const { data: ticket, error: errorTicket } = await supabase
    .from("soporte_tickets")
    .insert({ usuario_id: sesion.id, usuario_nombre: sesion.nombre, rol: sesion.rol, tipo })
    .select("id")
    .single();

  if (errorTicket || !ticket) return { exito: false, mensaje: "No se pudo enviar. Intenta de nuevo." };

  const { error: errorMensaje } = await supabase.from("soporte_mensajes").insert({
    ticket_id: ticket.id,
    es_admin: false,
    autor_nombre: sesion.nombre,
    mensaje: mensajeLimpio,
  });
  if (errorMensaje) return { exito: false, mensaje: "No se pudo enviar. Intenta de nuevo." };

  // El propio creador también puede escribirse un ticket (ej. para probar el
  // canal) -- no tiene sentido auto-notificarse a sí mismo en ese caso.
  if (sesion.id !== ID_CREADOR_APP) {
    await notificarCreador(
      `Nuevo ${ETIQUETA_TIPO[tipo].toLowerCase()} de ${sesion.nombre}`,
      `${sesion.nombre} (${sesion.rol}): ${mensajeLimpio}`
    );
  }

  return { exito: true };
}

function mapearTicket(t: any): TicketSoporte {
  return {
    id: t.id,
    usuarioId: t.usuario_id,
    usuarioNombre: t.usuario_nombre,
    rol: t.rol,
    tipo: t.tipo,
    estado: t.estado,
    creadoEn: t.creado_en,
    actualizadoEn: t.actualizado_en,
    mensajes: (t.soporte_mensajes ?? [])
      .map((m: any) => ({
        id: m.id,
        esAdmin: m.es_admin,
        autorNombre: m.autor_nombre,
        mensaje: m.mensaje,
        creadoEn: m.creado_en,
      }))
      .sort((a: MensajeTicket, b: MensajeTicket) => a.creadoEn.localeCompare(b.creadoEn)),
  };
}

const SELECT_TICKET_CON_MENSAJES =
  "id, usuario_id, usuario_nombre, rol, tipo, estado, creado_en, actualizado_en, soporte_mensajes(id, es_admin, autor_nombre, mensaje, creado_en)";

// Mis propios tickets (cualquier rol, incluido el creador cuando escribe
// los suyos) -- de más reciente actividad a más antigua.
export async function obtenerMisTickets(): Promise<TicketSoporte[]> {
  const sesion = await exigirSesion();
  const supabase = supabaseServer();
  const { data, error } = await supabase
    .from("soporte_tickets")
    .select(SELECT_TICKET_CON_MENSAJES)
    .eq("usuario_id", sesion.id)
    .order("actualizado_en", { ascending: false });

  if (error) throw new Error("No se pudo cargar tus consultas.");
  return (data ?? []).map(mapearTicket);
}

// true si la sesión actual es la del creador de la app -- determina si se
// muestra además la bandeja con los tickets de todo el equipo.
export async function obtenerEsCreadorApp(): Promise<boolean> {
  const sesion = await exigirSesion();
  return sesion.id === ID_CREADOR_APP;
}

// Bandeja completa (todos los usuarios) -- solo el creador de la app puede
// verla, sin importar su rol.
export async function obtenerBandejaSoporte(): Promise<TicketSoporte[]> {
  const sesion = await exigirSesion();
  if (sesion.id !== ID_CREADOR_APP) throw new Error("No autorizado.");

  const supabase = supabaseServer();
  const { data, error } = await supabase
    .from("soporte_tickets")
    .select(SELECT_TICKET_CON_MENSAJES)
    .order("actualizado_en", { ascending: false });

  if (error) throw new Error("No se pudo cargar la bandeja de soporte.");
  return (data ?? []).map(mapearTicket);
}

// Responder un ticket -- lo puede hacer tanto el autor original (sigue
// agregando contexto a su propia duda) como el creador de la app (cualquier
// ticket, no solo los suyos). Cualquier otra persona queda afuera.
export async function responderTicket(ticketId: string, mensaje: string): Promise<ResultadoSoporte> {
  const sesion = await exigirSesion();
  const mensajeLimpio = mensaje.trim();
  if (!mensajeLimpio) return { exito: false, mensaje: "Escribe una respuesta." };

  const supabase = supabaseServer();
  const { data: ticket } = await supabase
    .from("soporte_tickets")
    .select("id, usuario_id, usuario_nombre, tipo")
    .eq("id", ticketId)
    .maybeSingle();
  if (!ticket) return { exito: false, mensaje: "No se encontró esa consulta." };

  const esCreador = sesion.id === ID_CREADOR_APP;
  if (!esCreador && ticket.usuario_id !== sesion.id) return { exito: false, mensaje: "No autorizado." };

  const { error } = await supabase.from("soporte_mensajes").insert({
    ticket_id: ticketId,
    es_admin: esCreador,
    autor_nombre: sesion.nombre,
    mensaje: mensajeLimpio,
  });
  if (error) return { exito: false, mensaje: "No se pudo enviar. Intenta de nuevo." };

  // Quien responde, "pasa la pelota" al otro lado: si responde el creador,
  // el ticket queda "respondido" (ya lo atendió); si responde el autor
  // original, vuelve a "abierto" (necesita que el creador lo mire de nuevo).
  await supabase
    .from("soporte_tickets")
    .update({ estado: esCreador ? "respondido" : "abierto", actualizado_en: new Date().toISOString() })
    .eq("id", ticketId);

  if (esCreador) {
    await notificarPush([ticket.usuario_id], {
      titulo: "🛟 Te respondieron en Soporte",
      cuerpo: mensajeLimpio,
    });
  } else {
    await notificarCreador(
      `${ticket.usuario_nombre} respondió en soporte`,
      `${sesion.nombre}: ${mensajeLimpio}`
    );
  }

  return { exito: true };
}

// Cerrar un ticket -- solo el creador de la app, para limpiar la bandeja
// una vez que la duda/sugerencia/falla ya quedó resuelta.
export async function cerrarTicketSoporte(ticketId: string): Promise<ResultadoSoporte> {
  const sesion = await exigirSesion();
  if (sesion.id !== ID_CREADOR_APP) return { exito: false, mensaje: "No autorizado." };

  const { error } = await supabaseServer().from("soporte_tickets").update({ estado: "cerrado" }).eq("id", ticketId);
  if (error) return { exito: false, mensaje: "No se pudo cerrar." };
  return { exito: true };
}
