"use server";

import { supabaseServer } from "@/lib/supabase-server";
import { exigirSesion } from "@/lib/session";
import { enviarCorreo } from "@/lib/email";

// Consentimiento de tratamiento de datos personales (Ley N.° 29733) — se
// pide una sola vez por usuario, la primera vez que entra a la app después
// de este cambio. Queda registrado en usuarios.consentimiento_datos_en
// (NULL = todavía no aceptó) y, al aceptar, se le manda copia del aviso a
// su correo si tiene uno registrado.

export async function obtenerEstadoConsentimiento(): Promise<{ requiere: boolean }> {
  const sesion = await exigirSesion();
  const supabase = supabaseServer();
  const { data } = await supabase
    .from("usuarios")
    .select("consentimiento_datos_en")
    .eq("id", sesion.id)
    .maybeSingle();
  return { requiere: !data?.consentimiento_datos_en };
}

const CUERPO_CORREO_AVISO = `
  <p>Hola,</p>
  <p>Esta es la copia del Aviso de Privacidad que aceptaste dentro de Agenda Operativa Shimaya.</p>
  <p><strong>Datos que recolecta la app:</strong> ubicación GPS al marcar llegada y salida, fotos tomadas en ese momento,
  fotos y videos que publiques en el feed interno, fotos de evidencia en checklists de visita, tu horario y días de
  descanso, y tu fecha de nacimiento (opcional, solo para mostrar tu cumpleaños en el feed).</p>
  <p><strong>Finalidad:</strong> verificar tu asistencia y ubicación en tus puntos de trabajo, coordinar rutas y turnos,
  auditar checklists de visita, y habilitar funciones internas de comunicación entre colaboradores.</p>
  <p><strong>Responsable:</strong> Shimaya S.A.C. (RUC 20600603460).</p>
  <p><strong>Derechos ARCO:</strong> puedes pedir acceder, rectificar, cancelar u oponerte al tratamiento de tus datos
  escribiendo a <a href="mailto:anibalggedu@gmail.com" style="color:#f1c86b;">anibalggedu@gmail.com</a>.</p>
  <p><strong>Uso responsable de tu cuenta:</strong> tu usuario y clave son personales e intransferibles. El contenido
  interno de la app (fotos, videos, reportes, checklists y auditorías) es de uso exclusivo del equipo y no debe
  compartirse, descargarse ni difundirse fuera de la empresa.</p>
`;

export async function aceptarAvisoPrivacidad(): Promise<{ exito: boolean }> {
  const sesion = await exigirSesion();
  const supabase = supabaseServer();

  const { error } = await supabase
    .from("usuarios")
    .update({ consentimiento_datos_en: new Date().toISOString() })
    .eq("id", sesion.id);

  if (error) return { exito: false };

  // El correo es un plus (evidencia del consentimiento) — que falle no debe
  // impedir que la persona siga usando la app, el consentimiento ya quedó
  // registrado en la base de datos igual.
  try {
    const { data: usuario } = await supabase.from("usuarios").select("email").eq("id", sesion.id).maybeSingle();
    if (usuario?.email) {
      await enviarCorreo({
        para: usuario.email,
        asunto: "Copia del Aviso de Privacidad — Shimaya",
        tituloEmoji: "🔒",
        cuerpoHtml: CUERPO_CORREO_AVISO,
      });
    }
  } catch (error) {
    console.error("No se pudo enviar la copia del Aviso de Privacidad por correo:", error);
  }

  return { exito: true };
}
