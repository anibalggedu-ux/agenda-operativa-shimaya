"use server";

import { supabaseServer } from "@/lib/supabase-server";
import { exigirSesion } from "@/lib/session";
import { diaLaboralPeru, horaPeru, formatearHora, diaSemanaPeru } from "@/lib/fechas";
import { subirFotoMarcacion, obtenerUrlTemporalFoto } from "@/lib/blob-storage";
import { enviarCorreo } from "@/lib/email";
import { notificarPush } from "@/lib/notificar-push";

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
  horaSalida: string | null;
  horaLimite: string | null;
  horaEntrada: string | null;
  fotoSalidaUrl: string | null;
  fotoEntradaUrl: string | null;
  sePaso: boolean;
  minutosPasados: number;
  noSalio: boolean;
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
    .select("id, hora_salida, hora_limite, hora_entrada, foto_salida_blob, foto_entrada_blob, no_salio")
    .eq("usuario_id", sesion.id)
    .eq("fecha", diaLaboralPeru())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return null;
  const minutosPasados =
    data.hora_entrada && data.hora_limite ? Math.max(0, minutosEntreHoras(data.hora_limite, data.hora_entrada)) : 0;
  return {
    id: data.id,
    horaSalida: data.hora_salida,
    horaLimite: data.hora_limite,
    horaEntrada: data.hora_entrada,
    fotoSalidaUrl: await obtenerUrlTemporalFoto(data.foto_salida_blob),
    fotoEntradaUrl: await obtenerUrlTemporalFoto(data.foto_entrada_blob),
    sePaso: minutosPasados > 0,
    minutosPasados,
    noSalio: data.no_salio,
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
      // El filtro .not("hora_entrada", "is", null) de arriba ya excluye los
      // registros de "no salí al break" (que siempre tienen hora_entrada
      // null) -- acá hora_salida/hora_limite siempre vienen con valor.
      const minutosPasados = b.hora_entrada ? Math.max(0, minutosEntreHoras(b.hora_limite!, b.hora_entrada)) : 0;
      return {
        id: b.id,
        fecha: b.fecha,
        horaSalida: b.hora_salida!,
        horaLimite: b.hora_limite!,
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
  // o ya cerrado), no se le deja abrir otro. Un registro de "no salí al
  // break" (ver marcarNoSalioBreak) no cuenta como break real: si cambia de
  // opinión y sí quiere salir, ese mismo registro se convierte en uno real
  // en vez de bloquearlo.
  const [{ data: existente }, { data: usuario }] = await Promise.all([
    supabase
      .from("marcaciones_break")
      .select("id, hora_entrada, no_salio")
      .eq("usuario_id", sesion.id)
      .eq("fecha", fecha)
      .maybeSingle(),
    supabase.from("usuarios").select("duracion_break_min").eq("id", sesion.id).maybeSingle(),
  ]);
  if (existente && !existente.no_salio) {
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

  const { error } = existente
    ? await supabase
        .from("marcaciones_break")
        .update({
          hora_salida: horaSalida,
          hora_limite: horaLimite,
          foto_salida_blob: fotoGuardada ? fotoBlobPath : null,
          no_salio: false,
        })
        .eq("id", existente.id)
    : await supabase.from("marcaciones_break").insert({
        usuario_id: sesion.id,
        fecha,
        hora_salida: horaSalida,
        hora_limite: horaLimite,
        foto_salida_blob: fotoGuardada ? fotoBlobPath : null,
      });
  if (error) return { exito: false, mensaje: "No se pudo marcar tu salida a break." };

  return { exito: true, mensaje: `Break iniciado. Vuelve antes de las ${formatearHora(horaLimite)}.` };
}

// Para cuando de verdad no se sale a break ese día -- deja un registro
// explícito en vez de que la ausencia de fila sea ambigua (¿no le tocaba
// break, o se le olvidó marcar?). No bloquea salir a break después si
// cambia de opinión (ver marcarSalidaBreak).
export async function marcarNoSalioBreak(): Promise<ResultadoBreak> {
  const sesion = await exigirSesion();
  const supabase = supabaseServer();
  const fecha = diaLaboralPeru();

  const { data: existente } = await supabase
    .from("marcaciones_break")
    .select("id, hora_salida")
    .eq("usuario_id", sesion.id)
    .eq("fecha", fecha)
    .maybeSingle();

  if (existente?.hora_salida) {
    return { exito: false, mensaje: "Ya marcaste tu break de hoy." };
  }
  if (existente) {
    return { exito: true, mensaje: "Ya estaba registrado que hoy no saliste a break." };
  }

  const { error } = await supabase.from("marcaciones_break").insert({
    usuario_id: sesion.id,
    fecha,
    hora_salida: null,
    hora_limite: null,
    no_salio: true,
  });
  if (error) return { exito: false, mensaje: "No se pudo registrar." };

  return { exito: true, mensaje: "Quedó registrado que hoy no saliste a break." };
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

  const minutosPasados = minutosEntreHoras(actual.hora_limite!, horaEntrada);
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

  await notificarPush([sesion.id], {
    titulo: "⏰ Te quedan 5 minutos de break",
    cuerpo: `Marca tu entrada antes de las ${formatearHora(actualizado.hora_limite!)}.`,
  });

  const { data: usuario } = await supabase.from("usuarios").select("email").eq("id", sesion.id).maybeSingle();
  if (!usuario?.email) return;

  await enviarCorreo({
    para: usuario.email,
    asunto: "Te quedan 5 minutos de tu break",
    tituloEmoji: "⏰",
    cuerpoHtml: `<p>Hola ${sesion.nombre.split(" ")[0]},</p>
      <p>Te quedan <strong>${AVISO_ANTES_MIN} minutos</strong> de tu break. Tienes que marcar tu entrada antes de las
      <strong>${formatearHora(actualizado.hora_limite!)}</strong>.</p>`,
  });
}

// ---------- Vista de equipo (Coordinador/Gerente) ----------

export type BreakEquipoItem = Omit<BreakHistorial, "horaSalida" | "horaLimite"> & {
  horaSalida: string | null;
  horaLimite: string | null;
  usuarioId: string;
  usuarioNombre: string;
  rol: string;
  enCurso: boolean;
  noSalio: boolean;
};

export async function obtenerMarcacionesBreakEquipo(fecha?: string): Promise<BreakEquipoItem[]> {
  const sesion = await exigirSesion();
  if (sesion.rol !== "coordinador" && sesion.rol !== "gerente") throw new Error("No autorizado.");

  const supabase = supabaseServer();
  const { data } = await supabase
    .from("marcaciones_break")
    .select(
      "id, fecha, hora_salida, hora_limite, hora_entrada, foto_salida_blob, foto_entrada_blob, no_salio, usuarios(id, nombre, rol)"
    )
    .eq("fecha", fecha ?? diaLaboralPeru())
    .order("hora_salida", { ascending: false });

  return Promise.all(
    (data ?? []).map(async (b: any) => {
      const enCurso = !b.hora_entrada && !b.no_salio;
      const minutosPasados =
        b.hora_entrada && b.hora_limite ? Math.max(0, minutosEntreHoras(b.hora_limite, b.hora_entrada)) : 0;
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
        noSalio: b.no_salio,
      };
    })
  );
}

export type BreakPendiente = { usuarioId: string; usuarioNombre: string; rol: string };
type PendienteConContacto = BreakPendiente & { email: string | null };

// Quién todavía no tiene ningún registro de break ese día (ni salió, ni
// declaró "no salí"). Se excluye a quien ese día tiene descanso semanal o
// una asignación especial (vacaciones, permiso, licencia, misión) vigente
// -- no le corresponde marcar nada. Reutilizada por obtenerPendientesBreakEquipo
// (solo lectura) y avisarPendientesBreak (push + correo).
async function calcularPendientesBreak(fecha: string): Promise<PendienteConContacto[]> {
  const supabase = supabaseServer();
  const diaSemana = diaSemanaPeru(fecha);

  const [{ data: usuarios }, { data: marcados }, { data: especiales }] = await Promise.all([
    // Las cuentas de prueba (sup-generico, cap-generico, coor-generico) no
    // marcan break de verdad -- se excluyen igual que en Índice de
    // Interacción, por nombre.
    supabase.from("usuarios").select("id, nombre, rol, dias_descanso, email").eq("activo", true).not("nombre", "ilike", "%generico%"),
    supabase.from("marcaciones_break").select("usuario_id").eq("fecha", fecha),
    supabase.from("asignaciones_especiales").select("usuario_id").lte("fecha_inicio", fecha).gte("fecha_fin", fecha),
  ]);

  const marcadosSet = new Set((marcados ?? []).map((m) => m.usuario_id));
  const especialesSet = new Set((especiales ?? []).map((e) => e.usuario_id));

  return (usuarios ?? [])
    .filter((u) => !marcadosSet.has(u.id))
    .filter((u) => !especialesSet.has(u.id))
    .filter((u) => !(u.dias_descanso ?? []).includes(diaSemana))
    .map((u) => ({ usuarioId: u.id, usuarioNombre: u.nombre, rol: u.rol, email: u.email }))
    .sort((a, b) => a.usuarioNombre.localeCompare(b.usuarioNombre));
}

export async function obtenerPendientesBreakEquipo(fecha?: string): Promise<BreakPendiente[]> {
  const sesion = await exigirSesion();
  if (sesion.rol !== "coordinador" && sesion.rol !== "gerente") throw new Error("No autorizado.");
  return calcularPendientesBreak(fecha ?? diaLaboralPeru());
}

// Manda push + correo a todos los pendientes de hoy de una sola vez --
// botón "Avisar a los pendientes" en la vista de equipo. También la usa
// /api/admin/avisar-pendientes-break (protegida por secreto) para poder
// dispararla fuera de una sesión de coordinador/gerente.
export async function avisarPendientesBreak(): Promise<{ exito: boolean; avisados: number }> {
  const sesion = await exigirSesion();
  if (sesion.rol !== "coordinador" && sesion.rol !== "gerente") throw new Error("No autorizado.");
  return enviarAvisosPendientesBreak(diaLaboralPeru());
}

export async function enviarAvisosPendientesBreak(fecha: string): Promise<{ exito: boolean; avisados: number }> {
  const pendientes = await calcularPendientesBreak(fecha);

  for (const p of pendientes) {
    await notificarPush([p.usuarioId], {
      titulo: "⏰ No has marcado tu break",
      cuerpo: "Marca tu salida a break cuando puedas, o avisa si hoy no vas a salir.",
    });
    if (p.email) {
      await enviarCorreo({
        para: p.email,
        asunto: "No has marcado tu break hoy",
        tituloEmoji: "⏰",
        cuerpoHtml: `<p>Hola ${p.usuarioNombre.split(" ")[0]},</p>
          <p>Todavía no registras tu break de hoy. Marca tu salida desde la app cuando puedas, o toca
          "No salí al break" si hoy no vas a tomarlo.</p>`,
      });
    }
  }

  return { exito: true, avisados: pendientes.length };
}
