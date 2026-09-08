"use server";

import { supabaseServer } from "@/lib/supabase-server";
import { obtenerSesion, tieneBitacora } from "@/lib/session";
import {
  sumarDias,
  diaLaboralPeru,
  hoyPeru,
  DIAS_SEMANA,
  calcularAntiguedad,
  calcularProximaFechaAnual,
} from "@/lib/fechas";
import { MAX_DIAS_DESCANSO } from "../coordinador/constantes";

// Ventana en la que un colaborador puede corregir su propio reporte después
// de haberlo enviado (p. ej. si se equivocó al escribir la observación).
const VENTANA_EDICION_HORAS = 48;

export type Urgencia = "HOY" | "MANANA" | "AYER" | "ANTES_DE_AYER";

export type TiendaClasificada = {
  rutaActivaId: string;
  tiendaId: string;
  tiendaNombre: string;
  fechaPlanificada: string;
  area: string | null;
  enfoque: string | null;
  urgencia: Urgencia;
  yaReportado: boolean;
};

export async function obtenerTiendasClasificadas(): Promise<{
  tiendas: TiendaClasificada[];
  diaDescansoFijo: string[] | null;
}> {
  const sesion = await obtenerSesion();
  if (!sesion || !tieneBitacora(sesion.rol)) {
    throw new Error("No autorizado.");
  }

  const supabase = supabaseServer();
  const hoy = diaLaboralPeru(sesion.rol === "capacitador");
  const manana = sumarDias(hoy, 1);
  const ayer = sumarDias(hoy, -1);

  const { data: usuario } = await supabase
    .from("usuarios")
    .select("dias_descanso")
    .eq("id", sesion.id)
    .maybeSingle();

  const { data: activas, error } = await supabase
    .from("rutas_activas")
    .select("id, fecha_planificada, area, enfoque, tiendas(id, nombre)")
    .eq("usuario_id", sesion.id)
    .order("fecha_planificada", { ascending: false });

  if (error) throw new Error("No se pudo cargar las tiendas asignadas.");

  const { data: reportadas } = await supabase
    .from("rutas_diarias")
    .select("tienda_id")
    .eq("usuario_id", sesion.id);

  const idsReportados = new Set((reportadas ?? []).map((r) => r.tienda_id));

  const tiendas: TiendaClasificada[] = (activas ?? []).map((r: any) => {
    let urgencia: Urgencia;
    if (r.fecha_planificada === hoy) urgencia = "HOY";
    else if (r.fecha_planificada === manana) urgencia = "MANANA";
    else if (r.fecha_planificada === ayer) urgencia = "AYER";
    else urgencia = "ANTES_DE_AYER";

    return {
      rutaActivaId: r.id,
      tiendaId: r.tiendas.id,
      tiendaNombre: r.tiendas.nombre,
      fechaPlanificada: r.fecha_planificada,
      area: r.area,
      enfoque: r.enfoque,
      urgencia,
      yaReportado: idsReportados.has(r.tiendas.id),
    };
  });

  return { tiendas, diaDescansoFijo: usuario?.dias_descanso ?? null };
}

export type ResultadoReporte = { exito: boolean; mensaje?: string };

export async function enviarReporte(
  _prevState: ResultadoReporte,
  formData: FormData
): Promise<ResultadoReporte> {
  const sesion = await obtenerSesion();
  if (!sesion || !tieneBitacora(sesion.rol)) {
    return { exito: false, mensaje: "No autorizado." };
  }

  const rutaActivaId = String(formData.get("rutaActivaId") || "");
  const tiendaId = String(formData.get("tiendaId") || "");
  const observacion = String(formData.get("observacion") || "").trim();
  const actividad = String(formData.get("actividad") || "").trim();

  if (!tiendaId || !observacion) {
    return { exito: false, mensaje: "Completa la observación antes de enviar." };
  }

  const supabase = supabaseServer();

  const { error: errorInsert } = await supabase.from("rutas_diarias").insert({
    fecha: diaLaboralPeru(sesion.rol === "capacitador"),
    usuario_id: sesion.id,
    tienda_id: tiendaId,
    rol: sesion.rol,
    observacion,
    actividad,
  });

  if (errorInsert) {
    return { exito: false, mensaje: "No se pudo guardar el reporte. Intenta de nuevo." };
  }

  if (rutaActivaId) {
    await supabase.from("rutas_activas").delete().eq("id", rutaActivaId);
  }

  return { exito: true, mensaje: "Reporte enviado correctamente." };
}

export type MiReporte = {
  id: string;
  fecha: string;
  tiendaNombre: string;
  observacion: string;
  actividad: string | null;
  respuesta: string | null;
  respuestaPor: string | null;
  puedeEditar: boolean;
};

export async function obtenerMisReportesRecientes(): Promise<MiReporte[]> {
  const sesion = await obtenerSesion();
  if (!sesion || !tieneBitacora(sesion.rol)) {
    throw new Error("No autorizado.");
  }

  const supabase = supabaseServer();
  const { data, error } = await supabase
    .from("rutas_diarias")
    .select("id, fecha, observacion, actividad, respuesta, respuesta_por, created_at, tiendas(nombre)")
    .eq("usuario_id", sesion.id)
    .order("fecha", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(15);

  if (error) throw new Error("No se pudo cargar tus reportes.");

  const limite = Date.now() - VENTANA_EDICION_HORAS * 3600 * 1000;

  return (data ?? []).map((r: any) => ({
    id: r.id,
    fecha: r.fecha,
    tiendaNombre: r.tiendas?.nombre ?? "—",
    observacion: r.observacion,
    actividad: r.actividad,
    respuesta: r.respuesta,
    respuestaPor: r.respuesta_por,
    puedeEditar: new Date(r.created_at).getTime() > limite,
  }));
}

export async function editarReporte(
  _prevState: ResultadoReporte,
  formData: FormData
): Promise<ResultadoReporte> {
  const sesion = await obtenerSesion();
  if (!sesion || !tieneBitacora(sesion.rol)) {
    return { exito: false, mensaje: "No autorizado." };
  }

  const reporteId = String(formData.get("reporteId") || "");
  const observacion = String(formData.get("observacion") || "").trim();
  const actividad = String(formData.get("actividad") || "").trim();

  if (!reporteId || !observacion) {
    return { exito: false, mensaje: "La observación no puede quedar vacía." };
  }

  const supabase = supabaseServer();

  const { data: reporte, error: errorReporte } = await supabase
    .from("rutas_diarias")
    .select("usuario_id, created_at")
    .eq("id", reporteId)
    .maybeSingle();

  if (errorReporte || !reporte) {
    return { exito: false, mensaje: "No se encontró el reporte." };
  }
  if (reporte.usuario_id !== sesion.id) {
    return { exito: false, mensaje: "No puedes editar un reporte que no es tuyo." };
  }

  const limite = Date.now() - VENTANA_EDICION_HORAS * 3600 * 1000;
  if (new Date(reporte.created_at).getTime() <= limite) {
    return { exito: false, mensaje: "Ya pasaron las 48 horas para editar este reporte." };
  }

  const { error } = await supabase
    .from("rutas_diarias")
    .update({ observacion, actividad: actividad || null })
    .eq("id", reporteId);

  if (error) return { exito: false, mensaje: "No se pudo guardar los cambios." };
  return { exito: true, mensaje: "Reporte actualizado correctamente." };
}

// ---------- Perfil personal (antigüedad, aniversario, descanso) ----------

export type PerfilPersonal = {
  nombre: string;
  rol: string;
  diasDescanso: string[];
  antiguedad: { anios: number; meses: number } | null;
  proximoAniversario: { fecha: string; diasFaltantes: number } | null;
};

export async function obtenerMiPerfil(): Promise<PerfilPersonal> {
  const sesion = await obtenerSesion();
  if (!sesion) throw new Error("No autorizado.");

  const supabase = supabaseServer();
  const { data: usuario, error } = await supabase
    .from("usuarios")
    .select("nombre, rol, dias_descanso, fecha_ingreso")
    .eq("id", sesion.id)
    .maybeSingle();

  if (error) throw new Error("No se pudo cargar tu perfil.");

  const fechaIngreso = usuario?.fecha_ingreso ?? null;
  let antiguedad: PerfilPersonal["antiguedad"] = null;
  let proximoAniversario: PerfilPersonal["proximoAniversario"] = null;

  if (fechaIngreso) {
    const hoy = hoyPeru();
    antiguedad = calcularAntiguedad(fechaIngreso, hoy);
    const [, mIng, dIng] = fechaIngreso.split("-").map(Number);
    proximoAniversario = calcularProximaFechaAnual(mIng, dIng, hoy);
  }

  return {
    nombre: usuario?.nombre ?? sesion.nombre,
    rol: usuario?.rol ?? sesion.rol,
    diasDescanso: usuario?.dias_descanso ?? [],
    antiguedad,
    proximoAniversario,
  };
}

export async function actualizarMiDescanso(dias: string[]): Promise<ResultadoReporte> {
  const sesion = await obtenerSesion();
  if (!sesion) return { exito: false, mensaje: "No autorizado." };

  if (dias.length > MAX_DIAS_DESCANSO) {
    return { exito: false, mensaje: `Máximo ${MAX_DIAS_DESCANSO} días de descanso por semana.` };
  }
  if (dias.some((d) => !(DIAS_SEMANA as readonly string[]).includes(d))) {
    return { exito: false, mensaje: "Día inválido." };
  }

  const supabase = supabaseServer();
  const { error } = await supabase
    .from("usuarios")
    .update({ dias_descanso: dias.length > 0 ? dias : null })
    .eq("id", sesion.id);

  if (error) return { exito: false, mensaje: "No se pudo guardar tu descanso." };
  return { exito: true, mensaje: "Descanso actualizado correctamente." };
}

// ---------- Tiendas fijas y sus observaciones ----------

export type TiendaFija = { id: string; nombre: string };

export async function obtenerMisTiendasFijas(): Promise<TiendaFija[]> {
  const sesion = await obtenerSesion();
  if (!sesion) throw new Error("No autorizado.");

  const supabase = supabaseServer();
  const { data, error } = await supabase
    .from("tiendas_permanentes")
    .select("tiendas(id, nombre)")
    .eq("usuario_id", sesion.id);

  if (error) throw new Error("No se pudo cargar tus tiendas fijas.");

  return (data ?? []).map((t: any) => ({
    id: t.tiendas?.id ?? "",
    nombre: t.tiendas?.nombre ?? "—",
  }));
}

export type ObservacionTiendaFija = {
  id: string;
  fecha: string;
  tiendaNombre: string;
  usuarioNombre: string;
  rol: string;
  observacion: string;
  actividad: string | null;
  respuesta: string | null;
  respuestaPor: string | null;
};

export async function obtenerObservacionesTiendasFijas(): Promise<ObservacionTiendaFija[]> {
  const sesion = await obtenerSesion();
  if (!sesion) throw new Error("No autorizado.");

  const supabase = supabaseServer();

  const { data: fijas, error: errorFijas } = await supabase
    .from("tiendas_permanentes")
    .select("tienda_id")
    .eq("usuario_id", sesion.id);

  if (errorFijas) throw new Error("No se pudo cargar tus tiendas fijas.");

  const tiendaIds = (fijas ?? []).map((f) => f.tienda_id);
  if (tiendaIds.length === 0) return [];

  const { data, error } = await supabase
    .from("rutas_diarias")
    .select(
      "id, fecha, observacion, actividad, respuesta, respuesta_por, rol, usuarios(nombre), tiendas(nombre)"
    )
    .in("tienda_id", tiendaIds)
    .neq("usuario_id", sesion.id)
    .order("fecha", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) throw new Error("No se pudo cargar las observaciones.");

  return (data ?? []).map((r: any) => ({
    id: r.id,
    fecha: r.fecha,
    tiendaNombre: r.tiendas?.nombre ?? "—",
    usuarioNombre: r.usuarios?.nombre ?? "—",
    rol: r.rol,
    observacion: r.observacion,
    actividad: r.actividad,
    respuesta: r.respuesta,
    respuestaPor: r.respuesta_por,
  }));
}

export async function responderObservacionTiendaFija(
  _prevState: ResultadoReporte,
  formData: FormData
): Promise<ResultadoReporte> {
  const sesion = await obtenerSesion();
  if (!sesion) return { exito: false, mensaje: "No autorizado." };

  const reporteId = String(formData.get("reporteId") || "");
  const respuesta = String(formData.get("respuesta") || "").trim();

  if (!reporteId || !respuesta) {
    return { exito: false, mensaje: "Escribe una respuesta antes de enviar." };
  }

  const supabase = supabaseServer();

  const { data: reporte, error: errorReporte } = await supabase
    .from("rutas_diarias")
    .select("tienda_id")
    .eq("id", reporteId)
    .maybeSingle();

  if (errorReporte || !reporte) {
    return { exito: false, mensaje: "No se encontró el reporte." };
  }

  // Seguridad: solo se puede responder si la tienda del reporte es una de
  // las tiendas fijas de quien responde — evita contestar reportes ajenos.
  const { data: fija } = await supabase
    .from("tiendas_permanentes")
    .select("id")
    .eq("usuario_id", sesion.id)
    .eq("tienda_id", reporte.tienda_id)
    .maybeSingle();

  if (!fija) {
    return { exito: false, mensaje: "Solo puedes responder observaciones de tus tiendas fijas." };
  }

  const { error } = await supabase
    .from("rutas_diarias")
    .update({
      respuesta,
      respuesta_por: sesion.nombre,
      respuesta_fecha: new Date().toISOString(),
      leido: true,
    })
    .eq("id", reporteId);

  if (error) return { exito: false, mensaje: "No se pudo guardar la respuesta." };
  return { exito: true, mensaje: "Respuesta enviada." };
}

// ---------- Historial de marcaciones GPS propias ----------

export type MiMarcacion = {
  fecha: string;
  horaIngreso: string | null;
  ubicacionIngreso: string | null;
  horaSalida: string | null;
  ubicacionSalida: string | null;
};

export async function obtenerMisMarcaciones(desde: string, hasta: string): Promise<MiMarcacion[]> {
  const sesion = await obtenerSesion();
  if (!sesion) throw new Error("No autorizado.");

  const supabase = supabaseServer();
  const { data, error } = await supabase
    .from("asistencia")
    .select("fecha, hora_ingreso, ubicacion_ingreso, hora_salida, ubicacion_salida")
    .eq("usuario_id", sesion.id)
    .gte("fecha", desde)
    .lte("fecha", hasta)
    .order("fecha", { ascending: false });

  if (error) throw new Error("No se pudo cargar tus marcaciones.");

  return (data ?? []).map((a) => ({
    fecha: a.fecha,
    horaIngreso: a.hora_ingreso,
    ubicacionIngreso: a.ubicacion_ingreso,
    horaSalida: a.hora_salida,
    ubicacionSalida: a.ubicacion_salida,
  }));
}