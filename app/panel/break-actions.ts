"use server";

import { supabaseServer } from "@/lib/supabase-server";
import { exigirSesion } from "@/lib/session";
import { diaLaboralPeru, horaPeru, formatearHora } from "@/lib/fechas";
import { subirFotoMarcacion, obtenerUrlTemporalFoto } from "@/lib/blob-storage";
import { enviarCorreo } from "@/lib/email";

// Marcación de salida/entrada del break, disponible para cualquier rol (a
// diferencia de la Bitácora de Campo, que es solo para quien tiene
// tieneBitacora). Un break dura 1 hora desde que se marca la salida --
// hora_limite se guarda ya calculada para no tener que rehacer la cuenta en
// cada lugar que la muestra.

const DURACION_BREAK_MIN = 60;
const AVISO_ANTES_MIN = 5;

export type ResultadoBreak = { exito: boolean; mensaje?: string };

// El break de hoy, cualquiera sea su estado: en curso (horaEntrada null) o
// ya completado (horaEntrada presente). Un usuario solo puede tener UNO por
// día -- si ya lo completó, no se le deja marcar una salida nueva.
export type BreakHoy = {
  id: string;
  horaSalida: string;
  horaLimite: string;
  horaEntrada: string | null;
  fotoSalidaUrl: string | null;
  fotoEntradaUrl: string | null;
  sePaso: boolean;
  minutosPasados: number;
};

export type BreakHistorial = {
  id: string;
  fecha: string;
  horaSalida: string;
  horaLimite: string;
  horaEntrada: string | null;
  fotoSalidaUrl: string | null;
  fotoEntradaUrl: string | null;
  sePaso: boolean;
  minutosPasados: number;
};

function sumarMinutosAHora(horaHHMMSS: string, minutos: number): string {
  const [h, m, s] = horaHHMMSS.split(":").map(Number);
  const totalMin = h * 60 + m + minutos;
  const hh = Math.floor(totalMin / 60) % 24;
  const mm = totalMin % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// Minutos de diferencia (b - a), ambas "HH:MM:SS" del mismo día.
function minutosEntreHoras(a: string, b: string): number {
  const [ha, ma] = a.split(":").map(Number);
  const [hb, mb] = b.split(":").map(Number);
  return hb * 60 + mb - (ha * 60 + ma);
}

// El break de hoy (en curso o ya completado), o null si todavía no marcó
// ninguno -- de ahí sale si el botón de "Salir a break" debe mostrarse o
// quedar bloqueado por hoy.
export async function obtenerMiBreakDeHoy(): Promise<BreakHoy | null> {
  const sesion = await exigirSesion();
  const supabase = supabaseServer();
  const { data } = await supabase
    .from("marcaciones_break")
    .select("id, hora_salida, hora_limite, hora_entrada, foto_salida_blob, foto_entrada_blob")
    .eq("usuario_id", sesion.id)
    .eq("fecha", diaLaboralPeru())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return null;
  const minutosPasados = data.hora_entrada ? Math.max(0, minutosEntreHoras(data.hora_limite, data.hora_entrada)) : 0;
  return {
    id: data.id,
    horaSalida: data.hora_salida,
    horaLimite: data.hora_limite,
    horaEntrada: data.hora_entrada,
    fotoSalidaUrl: await obtenerUrlTemporalFoto(data.foto_salida_blob),
    fotoEntradaUrl: await obtenerUrlTemporalFoto(data.foto_entrada_blob),
    sePaso: minutosPasados > 0,
    minutosPasados,
  };
}

// Historial de días ANTERIORES a hoy -- el de hoy, si ya está completo, lo
// muestra aparte obtenerMiBreakDeHoy (evita mostrarlo duplicado).
export async function obtenerMisUltimosBreaks(limite = 10): Promise<BreakHistorial[]> {
  const sesion = await exigirSesion();
  const supabase = supabaseServer();
  const { data } = await supabase
    .from("marcaciones_break")
    .select("id, fecha, hora_salida, hora_limite, hora_entrada, foto_salida_blob, foto_entrada_blob")
    .eq("usuario_id", sesion.id)
    .not("hora_entrada", "is", null)
    .lt("fecha", diaLaboralPeru())
    .order("fecha", { ascending: false })
    .order("hora_salida", { ascending: false })
    .limit(limite);

  return Promise.all(
    (data ?? []).map(async (b) => {
      const minutosPasados = b.hora_entrada ? Math.max(0, minutosEntreHoras(b.hora_limite, b.hora_entrada)) : 0;
      return {
        id: b.id,
        fecha: b.fecha,
        horaSalida: b.hora_salida,
        horaLimite: b.hora_limite,
        horaEntrada: b.hora_entrada,
        fotoSalidaUrl: await obtenerUrlTemporalFoto(b.foto_salida_blob),
        fotoEntradaUrl: await obtenerUrlTemporalFoto(b.foto_entrada_blob),
        sePaso: minutosPasados > 0,
        minutosPasados,
      };
    })
  );
}

export async function marcarSalidaBreak(fotoBase64: string): Promise<ResultadoBreak> {
  const sesion = await exigirSesion();
  if (!fotoBase64) return { exito: false, mensaje: "Toma una foto para marcar tu salida a break." };

  const supabase = supabaseServer();
  const fecha = diaLaboralPeru();

  // Un solo break por día, completado o no -- si ya marcó uno hoy (en curso
  // o ya cerrado), no se le deja abrir otro.
  const [{ data: existente }, { data: usuario }] = await Promise.all([
    supabase
      .from("marcaciones_break")
      .select("id, hora_entrada")
      .eq("usuario_id", sesion.id)
      .eq("fecha", fecha)
      .maybeSingle(),
    supabase.from("usuarios").select("duracion_break_min").eq("id", sesion.id).maybeSingle(),
  ]);
  if (existente) {
    return {
      exito: false,
      mensaje: existente.hora_entrada ? "Ya usaste tu break de hoy." : "Ya tienes un break en curso.",
    };
  }

  const duracionMin = usuario?.duracion_break_min ?? DURACION_BREAK_MIN;
  const horaSalida = horaPeru();
  const horaLimite = sumarMinutosAHora(horaSalida, duracionMin);
  const fotoBlobPath = `${sesion.id}/break-salida-${Date.now()}.jpg`;

  let fotoGuardada = true;
  try {
    await subirFotoMarcacion(fotoBlobPath, fotoBase64);
  } catch (error) {
    console.error("No se pudo subir la foto de salida a break:", error);
    fotoGuardada = false;
  }

  const { error } = await supabase.from("marcaciones_break").insert({
    usuario_id: sesion.id,
    fecha,
    hora_salida: horaSalida,
    hora_limite: horaLimite,
    foto_salida_blob: fotoGuardada ? fotoBlobPath : null,
  });
  if (error) return { exito: false, mensaje: "No se pudo marcar tu salida a break." };

  return { exito: true, mensaje: `Break iniciado. Vuelve antes de las ${formatearHora(horaLimite)}.` };
}

export async function marcarEntradaBreak(breakId: string, fotoBase64: string): Promise<ResultadoBreak> {
  const sesion = await exigirSesion();
  if (!fotoBase64) return { exito: false, mensaje: "Toma una foto para marcar tu entrada." };

  const supabase = supabaseServer();
  const { data: actual } = await supabase
    .from("marcaciones_break")
    .select("id, usuario_id, hora_limite")
    .eq("id", breakId)
    .maybeSingle();
  if (!actual || actual.usuario_id !== sesion.id) return { exito: false, mensaje: "No se encontró tu break." };

  const horaEntrada = horaPeru();
  const fotoBlobPath = `${sesion.id}/break-entrada-${Date.now()}.jpg`;

  let fotoGuardada = true;
  try {
    await subirFotoMarcacion(fotoBlobPath, fotoBase64);
  } catch (error) {
    console.error("No se pudo subir la foto de entrada de break:", error);
    fotoGuardada = false;
  }

  const { error } = await supabase
    .from("marcaciones_break")
    .update({ hora_entrada: horaEntrada, foto_entrada_blob: fotoGuardada ? fotoBlobPath : null })
    .eq("id", breakId);
  if (error) return { exito: false, mensaje: "No se pudo marcar tu entrada." };

  const minutosPasados = minutosEntreHoras(actual.hora_limite, horaEntrada);
  return minutosPasados > 0
    ? { exito: true, mensaje: `Entrada marcada. Te pasaste ${minutosPasados} min del break.` }
    : { exito: true, mensaje: "Entrada marcada a tiempo." };
}

// El cliente lo llama una sola vez, apenas el cronómetro visible llega a los
// últimos 5 minutos -- evita tener que correr un cron cada minuto solo para
// esto. aviso_5min_enviado evita un segundo correo si la pestaña se recarga
// pasado ese punto.
export async function avisarCincoMinutosBreak(breakId: string): Promise<void> {
  const sesion = await exigirSesion();
  const supabase = supabaseServer();

  const { data: actualizado } = await supabase
    .from("marcaciones_break")
    .update({ aviso_5min_enviado: true })
    .eq("id", breakId)
    .eq("usuario_id", sesion.id)
    .eq("aviso_5min_enviado", false)
    .is("hora_entrada", null)
    .select("hora_limite")
    .maybeSingle();
  if (!actualizado) return; // ya se había avisado, o ya marcó entrada

  const { data: usuario } = await supabase.from("usuarios").select("email").eq("id", sesion.id).maybeSingle();
  if (!usuario?.email) return;

  await enviarCorreo({
    para: usuario.email,
    asunto: "Te quedan 5 minutos de tu break",
    tituloEmoji: "⏰",
    cuerpoHtml: `<p>Hola ${sesion.nombre.split(" ")[0]},</p>
      <p>Te quedan <strong>${AVISO_ANTES_MIN} minutos</strong> de tu break. Tienes que marcar tu entrada antes de las
      <strong>${formatearHora(actualizado.hora_limite)}</strong>.</p>`,
  });
}

// ---------- Vista de equipo (Coordinador/Gerente) ----------

export type BreakEquipoItem = BreakHistorial & {
  usuarioId: string;
  usuarioNombre: string;
  rol: string;
  enCurso: boolean;
};

export async function obtenerMarcacionesBreakEquipo(fecha?: string): Promise<BreakEquipoItem[]> {
  const sesion = await exigirSesion();
  if (sesion.rol !== "coordinador" && sesion.rol !== "gerente") throw new Error("No autorizado.");

  const supabase = supabaseServer();
  const { data } = await supabase
    .from("marcaciones_break")
    .select(
      "id, fecha, hora_salida, hora_limite, hora_entrada, foto_salida_blob, foto_entrada_blob, usuarios(id, nombre, rol)"
    )
    .eq("fecha", fecha ?? diaLaboralPeru())
    .order("hora_salida", { ascending: false });

  return Promise.all(
    (data ?? []).map(async (b: any) => {
      const enCurso = !b.hora_entrada;
      const minutosPasados = b.hora_entrada ? Math.max(0, minutosEntreHoras(b.hora_limite, b.hora_entrada)) : 0;
      return {
        id: b.id,
        fecha: b.fecha,
        horaSalida: b.hora_salida,
        horaLimite: b.hora_limite,
        horaEntrada: b.hora_entrada,
        fotoSalidaUrl: await obtenerUrlTemporalFoto(b.foto_salida_blob),
        fotoEntradaUrl: await obtenerUrlTemporalFoto(b.foto_entrada_blob),
        sePaso: minutosPasados > 0,
        minutosPasados,
        usuarioId: b.usuarios?.id ?? "",
        usuarioNombre: b.usuarios?.nombre ?? "—",
        rol: b.usuarios?.rol ?? "",
        enCurso,
      };
    })
  );
}
