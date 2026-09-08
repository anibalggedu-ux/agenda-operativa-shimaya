"use server";

import { supabaseServer } from "@/lib/supabase-server";
import { obtenerSesion } from "@/lib/session";
import { hoyPeru } from "@/lib/fechas";

async function exigirCoordinador() {
  const sesion = await obtenerSesion();
  if (!sesion || sesion.rol !== "coordinador") {
    throw new Error("No autorizado.");
  }
  return sesion;
}

export type UsuarioBasico = { id: string; nombre: string; rol: string };
export type TiendaBasica = { id: string; nombre: string };

export async function obtenerUsuariosYTiendas(): Promise<{
  usuarios: UsuarioBasico[];
  tiendas: TiendaBasica[];
}> {
  await exigirCoordinador();
  const supabase = supabaseServer();

  const [{ data: usuarios, error: errorUsuarios }, { data: tiendas, error: errorTiendas }] =
    await Promise.all([
      supabase.from("usuarios").select("id, nombre, rol").order("nombre"),
      supabase.from("tiendas").select("id, nombre").order("nombre"),
    ]);

  if (errorUsuarios || errorTiendas) {
    throw new Error("No se pudo cargar usuarios y tiendas.");
  }

  return { usuarios: usuarios ?? [], tiendas: tiendas ?? [] };
}

// ---------- Rutas / asignaciones ----------

export type RutaActiva = {
  id: string;
  fechaPlanificada: string;
  area: string | null;
  enfoque: string | null;
  usuarioNombre: string;
  tiendaNombre: string;
};

export async function obtenerRutasActivas(): Promise<RutaActiva[]> {
  await exigirCoordinador();
  const supabase = supabaseServer();

  const { data, error } = await supabase
    .from("rutas_activas")
    .select("id, fecha_planificada, area, enfoque, usuarios(nombre), tiendas(nombre)")
    .order("fecha_planificada", { ascending: true });

  if (error) throw new Error("No se pudo cargar las rutas activas.");

  return (data ?? []).map((r: any) => ({
    id: r.id,
    fechaPlanificada: r.fecha_planificada,
    area: r.area,
    enfoque: r.enfoque,
    usuarioNombre: r.usuarios?.nombre ?? "—",
    tiendaNombre: r.tiendas?.nombre ?? "—",
  }));
}

export type ResultadoAccion = { exito: boolean; mensaje?: string };

export async function asignarRuta(
  _prevState: ResultadoAccion,
  formData: FormData
): Promise<ResultadoAccion> {
  await exigirCoordinador();

  const usuarioId = String(formData.get("usuarioId") || "");
  const tiendaId = String(formData.get("tiendaId") || "");
  const fechaPlanificada = String(formData.get("fechaPlanificada") || "");
  const area = String(formData.get("area") || "").trim();
  const enfoque = String(formData.get("enfoque") || "").trim();

  if (!usuarioId || !tiendaId || !fechaPlanificada) {
    return { exito: false, mensaje: "Selecciona usuario, tienda y fecha." };
  }

  const supabase = supabaseServer();
  const { error } = await supabase.from("rutas_activas").insert({
    usuario_id: usuarioId,
    tienda_id: tiendaId,
    fecha_planificada: fechaPlanificada,
    area: area || null,
    enfoque: enfoque || null,
  });

  if (error) return { exito: false, mensaje: "No se pudo asignar la ruta." };
  return { exito: true, mensaje: "Ruta asignada correctamente." };
}

export async function eliminarRutaActiva(id: string): Promise<ResultadoAccion> {
  await exigirCoordinador();
  const supabase = supabaseServer();
  const { error } = await supabase.from("rutas_activas").delete().eq("id", id);
  if (error) return { exito: false, mensaje: "No se pudo cancelar la ruta." };
  return { exito: true };
}

// ---------- Asignaciones especiales ----------

export type TipoAsignacionEspecial =
  | "Vacaciones"
  | "Permiso"
  | "Descanso Médico"
  | "Misión Especial";

export type AsignacionEspecial = {
  id: string;
  usuarioNombre: string;
  tipo: TipoAsignacionEspecial;
  fechaInicio: string;
  fechaFin: string;
  motivo: string | null;
};

export async function obtenerAsignacionesEspeciales(): Promise<AsignacionEspecial[]> {
  await exigirCoordinador();
  const supabase = supabaseServer();

  const { data, error } = await supabase
    .from("asignaciones_especiales")
    .select("id, tipo, fecha_inicio, fecha_fin, motivo, usuarios(nombre)")
    .gte("fecha_fin", hoyPeru())
    .order("fecha_inicio", { ascending: true });

  if (error) throw new Error("No se pudo cargar las asignaciones especiales.");

  return (data ?? []).map((a: any) => ({
    id: a.id,
    usuarioNombre: a.usuarios?.nombre ?? "—",
    tipo: a.tipo,
    fechaInicio: a.fecha_inicio,
    fechaFin: a.fecha_fin,
    motivo: a.motivo,
  }));
}

export async function crearAsignacionEspecial(
  _prevState: ResultadoAccion,
  formData: FormData
): Promise<ResultadoAccion> {
  await exigirCoordinador();

  const usuarioId = String(formData.get("usuarioId") || "");
  const tipo = String(formData.get("tipo") || "");
  const fechaInicio = String(formData.get("fechaInicio") || "");
  const fechaFin = String(formData.get("fechaFin") || "");
  const motivo = String(formData.get("motivo") || "").trim();

  if (!usuarioId || !tipo || !fechaInicio || !fechaFin) {
    return { exito: false, mensaje: "Completa usuario, tipo y rango de fechas." };
  }

  if (fechaFin < fechaInicio) {
    return { exito: false, mensaje: "La fecha de fin no puede ser anterior a la de inicio." };
  }

  const supabase = supabaseServer();
  const { error } = await supabase.from("asignaciones_especiales").insert({
    usuario_id: usuarioId,
    tipo,
    fecha_inicio: fechaInicio,
    fecha_fin: fechaFin,
    motivo: motivo || null,
  });

  if (error) return { exito: false, mensaje: "No se pudo registrar la asignación." };
  return { exito: true, mensaje: "Asignación registrada correctamente." };
}

export async function eliminarAsignacionEspecial(id: string): Promise<ResultadoAccion> {
  await exigirCoordinador();
  const supabase = supabaseServer();
  const { error } = await supabase.from("asignaciones_especiales").delete().eq("id", id);
  if (error) return { exito: false, mensaje: "No se pudo eliminar la asignación." };
  return { exito: true };
}

// ---------- Anuncios / comunicados ----------

export type Comunicado = {
  id: string;
  fecha: string;
  tipo: string;
  mensaje: string;
  autor: string | null;
};

export async function obtenerComunicados(): Promise<Comunicado[]> {
  await exigirCoordinador();
  const supabase = supabaseServer();

  const { data, error } = await supabase
    .from("comunicados")
    .select("id, fecha, tipo, mensaje, autor")
    .order("fecha", { ascending: false })
    .limit(30);

  if (error) throw new Error("No se pudo cargar los anuncios.");
  return data ?? [];
}

export async function crearComunicado(
  _prevState: ResultadoAccion,
  formData: FormData
): Promise<ResultadoAccion> {
  const sesion = await exigirCoordinador();

  const tipo = String(formData.get("tipo") || "").trim();
  const mensaje = String(formData.get("mensaje") || "").trim();

  if (!tipo || !mensaje) {
    return { exito: false, mensaje: "Completa el tipo y el mensaje del anuncio." };
  }

  const supabase = supabaseServer();
  const { error } = await supabase.from("comunicados").insert({
    fecha: hoyPeru(),
    tipo,
    mensaje,
    autor: sesion.nombre,
  });

  if (error) return { exito: false, mensaje: "No se pudo publicar el anuncio." };
  return { exito: true, mensaje: "Anuncio publicado correctamente." };
}

export async function eliminarComunicado(id: string): Promise<ResultadoAccion> {
  await exigirCoordinador();
  const supabase = supabaseServer();
  const { error } = await supabase.from("comunicados").delete().eq("id", id);
  if (error) return { exito: false, mensaje: "No se pudo eliminar el anuncio." };
  return { exito: true };
}

// ---------- Reportes de campo (bitácora) ----------

export type ReporteBitacora = {
  id: string;
  fecha: string;
  usuarioNombre: string;
  tiendaNombre: string;
  rol: string;
  observacion: string;
  actividad: string | null;
  respuesta: string | null;
  respuestaPor: string | null;
};

export async function obtenerReportesRecientes(): Promise<ReporteBitacora[]> {
  await exigirCoordinador();
  const supabase = supabaseServer();

  const { data, error } = await supabase
    .from("rutas_diarias")
    .select(
      "id, fecha, rol, observacion, actividad, respuesta, respuesta_por, usuarios(nombre), tiendas(nombre)"
    )
    .order("fecha", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) throw new Error("No se pudo cargar los reportes.");

  return (data ?? []).map((r: any) => ({
    id: r.id,
    fecha: r.fecha,
    usuarioNombre: r.usuarios?.nombre ?? "—",
    tiendaNombre: r.tiendas?.nombre ?? "—",
    rol: r.rol,
    observacion: r.observacion,
    actividad: r.actividad,
    respuesta: r.respuesta,
    respuestaPor: r.respuesta_por,
  }));
}

export async function responderReporte(
  _prevState: ResultadoAccion,
  formData: FormData
): Promise<ResultadoAccion> {
  const sesion = await exigirCoordinador();

  const reporteId = String(formData.get("reporteId") || "");
  const respuesta = String(formData.get("respuesta") || "").trim();

  if (!reporteId || !respuesta) {
    return { exito: false, mensaje: "Escribe una respuesta antes de enviar." };
  }

  const supabase = supabaseServer();
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
