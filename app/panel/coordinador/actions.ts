"use server";

import { supabaseServer } from "@/lib/supabase-server";
import { obtenerSesion } from "@/lib/session";
import { hoyPeru, diaSemanaPeru, sumarDias, DIAS_SEMANA } from "@/lib/fechas";
import {
  AREAS_RUTA,
  MAX_TIENDAS_PERMANENTES,
  MAX_DIAS_DESCANSO,
  HORA_LIMITE_TARDANZA,
} from "./constantes";
import { obtenerPuntosDeUsuario, type MisPuntos } from "../puntos-actions";

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
  usuarioId: string;
  usuarioNombre: string;
  tiendaId: string;
  tiendaNombre: string;
  horaIngreso: string | null;
  ubicacionIngreso: string | null;
  horaSalida: string | null;
  ubicacionSalida: string | null;
};

export async function obtenerRutasActivas(): Promise<RutaActiva[]> {
  await exigirCoordinador();
  const supabase = supabaseServer();

  // Solo hoy en adelante — las rutas de días ya pasados quedan como
  // historial y no deben seguir acumulándose en esta lista de trabajo.
  const { data, error } = await supabase
    .from("rutas_activas")
    .select(
      "id, fecha_planificada, area, enfoque, usuario_id, tienda_id, usuarios(nombre), tiendas(nombre)"
    )
    .gte("fecha_planificada", hoyPeru())
    .order("fecha_planificada", { ascending: true });

  if (error) throw new Error("No se pudo cargar las rutas activas.");

  const filas = data ?? [];
  if (filas.length === 0) return [];

  const usuarioIds = Array.from(new Set(filas.map((r: any) => r.usuario_id)));
  const fechas = Array.from(new Set(filas.map((r: any) => r.fecha_planificada)));

  const { data: marcaciones, error: errorMarcaciones } = await supabase
    .from("asistencia")
    .select("usuario_id, fecha, hora_ingreso, ubicacion_ingreso, hora_salida, ubicacion_salida")
    .in("usuario_id", usuarioIds)
    .in("fecha", fechas);

  if (errorMarcaciones) throw new Error("No se pudo cargar las marcaciones de asistencia.");

  const mapaMarcaciones = new Map<string, (typeof marcaciones)[number]>();
  (marcaciones ?? []).forEach((m) => {
    mapaMarcaciones.set(m.usuario_id + "|" + m.fecha, m);
  });

  return filas.map((r: any) => {
    const marcacion = mapaMarcaciones.get(r.usuario_id + "|" + r.fecha_planificada);
    return {
      id: r.id,
      fechaPlanificada: r.fecha_planificada,
      area: r.area,
      enfoque: r.enfoque,
      usuarioId: r.usuario_id,
      usuarioNombre: r.usuarios?.nombre ?? "—",
      tiendaId: r.tienda_id,
      tiendaNombre: r.tiendas?.nombre ?? "—",
      horaIngreso: marcacion?.hora_ingreso ?? null,
      ubicacionIngreso: marcacion?.ubicacion_ingreso ?? null,
      horaSalida: marcacion?.hora_salida ?? null,
      ubicacionSalida: marcacion?.ubicacion_salida ?? null,
    };
  });
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

  if (area && !(AREAS_RUTA as readonly string[]).includes(area)) {
    return { exito: false, mensaje: "Área inválida." };
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
  fechaEvento: string | null;
  ubicacion: string | null;
  vigente: boolean;
};

export async function obtenerComunicados(): Promise<Comunicado[]> {
  await exigirCoordinador();
  const supabase = supabaseServer();
  const hoy = hoyPeru();

  const { data, error } = await supabase
    .from("comunicados")
    .select("id, fecha, tipo, mensaje, autor, fecha_evento, ubicacion")
    .order("fecha", { ascending: false });

  if (error) throw new Error("No se pudo cargar los anuncios.");

  return (data ?? []).map((c) => ({
    id: c.id,
    fecha: c.fecha,
    tipo: c.tipo,
    mensaje: c.mensaje,
    autor: c.autor,
    fechaEvento: c.fecha_evento,
    ubicacion: c.ubicacion,
    vigente: !c.fecha_evento || c.fecha_evento >= hoy,
  }));
}

export async function crearComunicado(
  _prevState: ResultadoAccion,
  formData: FormData
): Promise<ResultadoAccion> {
  const sesion = await exigirCoordinador();

  const tipo = String(formData.get("tipo") || "").trim();
  const mensaje = String(formData.get("mensaje") || "").trim();
  const fechaEvento = String(formData.get("fechaEvento") || "").trim();
  const ubicacion = String(formData.get("ubicacion") || "").trim();

  if (!tipo || !mensaje) {
    return { exito: false, mensaje: "Completa el tipo y el mensaje del anuncio." };
  }

  const supabase = supabaseServer();
  const { error } = await supabase.from("comunicados").insert({
    fecha: hoyPeru(),
    tipo,
    mensaje,
    autor: sesion.nombre,
    fecha_evento: fechaEvento || null,
    ubicacion: ubicacion || null,
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

export async function obtenerReportesRecientes(
  desde: string,
  hasta: string
): Promise<ReporteBitacora[]> {
  await exigirCoordinador();
  const supabase = supabaseServer();

  const { data, error } = await supabase
    .from("rutas_diarias")
    .select(
      "id, fecha, rol, observacion, actividad, respuesta, respuesta_por, usuarios(nombre), tiendas(nombre)"
    )
    .gte("fecha", desde)
    .lte("fecha", hasta)
    .order("fecha", { ascending: false })
    .order("created_at", { ascending: false });

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

// ---------- Tiendas permanentes ----------

const ROLES_CON_RUTA = ["supervisor", "capacitador"];

export type SupervisorConTiendas = {
  usuarioId: string;
  usuarioNombre: string;
  rol: string;
  tiendas: { id: string; tiendaId: string; tiendaNombre: string }[];
};

export async function obtenerTiendasPermanentes(): Promise<SupervisorConTiendas[]> {
  await exigirCoordinador();
  const supabase = supabaseServer();

  const [{ data: usuarios, error: errorUsuarios }, { data: asignadas, error: errorAsignadas }] =
    await Promise.all([
      supabase
        .from("usuarios")
        .select("id, nombre, rol")
        .in("rol", ROLES_CON_RUTA)
        .order("nombre"),
      supabase.from("tiendas_permanentes").select("id, usuario_id, tienda_id, tiendas(nombre)"),
    ]);

  if (errorUsuarios || errorAsignadas) {
    throw new Error("No se pudo cargar las tiendas permanentes.");
  }

  const porUsuario = new Map<string, SupervisorConTiendas["tiendas"]>();
  (asignadas ?? []).forEach((a: any) => {
    const lista = porUsuario.get(a.usuario_id) ?? [];
    lista.push({ id: a.id, tiendaId: a.tienda_id, tiendaNombre: a.tiendas?.nombre ?? "—" });
    porUsuario.set(a.usuario_id, lista);
  });

  return (usuarios ?? []).map((u) => ({
    usuarioId: u.id,
    usuarioNombre: u.nombre,
    rol: u.rol,
    tiendas: porUsuario.get(u.id) ?? [],
  }));
}

export async function asignarTiendaPermanente(
  usuarioId: string,
  tiendaId: string
): Promise<ResultadoAccion> {
  await exigirCoordinador();
  const supabase = supabaseServer();

  const { data: actuales, error: errorActuales } = await supabase
    .from("tiendas_permanentes")
    .select("id, tienda_id")
    .eq("usuario_id", usuarioId);

  if (errorActuales) return { exito: false, mensaje: "No se pudo verificar las tiendas actuales." };

  if ((actuales ?? []).some((a) => a.tienda_id === tiendaId)) {
    return { exito: false, mensaje: "Esa tienda ya está asignada a esta persona." };
  }

  if ((actuales ?? []).length >= MAX_TIENDAS_PERMANENTES) {
    return { exito: false, mensaje: `Máximo ${MAX_TIENDAS_PERMANENTES} tiendas permanentes por persona.` };
  }

  const { error } = await supabase
    .from("tiendas_permanentes")
    .insert({ usuario_id: usuarioId, tienda_id: tiendaId });

  if (error) return { exito: false, mensaje: "No se pudo asignar la tienda permanente." };
  return { exito: true };
}

export async function eliminarTiendaPermanente(id: string): Promise<ResultadoAccion> {
  await exigirCoordinador();
  const supabase = supabaseServer();
  const { error } = await supabase.from("tiendas_permanentes").delete().eq("id", id);
  if (error) return { exito: false, mensaje: "No se pudo quitar la tienda permanente." };
  return { exito: true };
}

// ---------- Descansos semanales ----------

export type UsuarioDescanso = {
  usuarioId: string;
  usuarioNombre: string;
  rol: string;
  diasDescanso: string[];
};

export async function obtenerDescansosUsuarios(): Promise<UsuarioDescanso[]> {
  await exigirCoordinador();
  const supabase = supabaseServer();

  const { data, error } = await supabase
    .from("usuarios")
    .select("id, nombre, rol, dias_descanso")
    .order("nombre");

  if (error) throw new Error("No se pudo cargar los descansos.");

  return (data ?? []).map((u: any) => ({
    usuarioId: u.id,
    usuarioNombre: u.nombre,
    rol: u.rol,
    diasDescanso: u.dias_descanso ?? [],
  }));
}

export async function actualizarDiasDescanso(
  usuarioId: string,
  dias: string[]
): Promise<ResultadoAccion> {
  await exigirCoordinador();

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
    .eq("id", usuarioId);

  if (error) return { exito: false, mensaje: "No se pudo guardar el descanso." };
  return { exito: true };
}

// ---------- Estado del personal hoy ----------

export type EstadoPersonalHoy = {
  usuarioId: string;
  usuarioNombre: string;
  rol: string;
  estado: "DESCANSO_SEMANAL" | "VACACIONES" | "PERMISO" | "DESCANSO_MEDICO" | "MISION_ESPECIAL" | null;
  detalle: string | null;
};

export async function obtenerEstadoPersonalHoy(): Promise<EstadoPersonalHoy[]> {
  await exigirCoordinador();
  const supabase = supabaseServer();
  const hoy = hoyPeru();
  const diaSemana = diaSemanaPeru();

  const [{ data: usuarios, error: errorUsuarios }, { data: especiales, error: errorEspeciales }] =
    await Promise.all([
      supabase.from("usuarios").select("id, nombre, rol, dias_descanso").order("nombre"),
      supabase
        .from("asignaciones_especiales")
        .select("usuario_id, tipo, fecha_inicio, fecha_fin")
        .lte("fecha_inicio", hoy)
        .gte("fecha_fin", hoy),
    ]);

  if (errorUsuarios || errorEspeciales) {
    throw new Error("No se pudo cargar el estado del personal.");
  }

  const especialPorUsuario = new Map<string, string>();
  (especiales ?? []).forEach((e) => {
    especialPorUsuario.set(e.usuario_id, e.tipo);
  });

  const tipoAEstado: Record<string, EstadoPersonalHoy["estado"]> = {
    Vacaciones: "VACACIONES",
    Permiso: "PERMISO",
    "Descanso Médico": "DESCANSO_MEDICO",
    "Misión Especial": "MISION_ESPECIAL",
  };

  return (usuarios ?? []).map((u: any) => {
    const tipoEspecial = especialPorUsuario.get(u.id);
    if (tipoEspecial) {
      return {
        usuarioId: u.id,
        usuarioNombre: u.nombre,
        rol: u.rol,
        estado: tipoAEstado[tipoEspecial] ?? null,
        detalle: tipoEspecial,
      };
    }
    if ((u.dias_descanso ?? []).includes(diaSemana)) {
      return {
        usuarioId: u.id,
        usuarioNombre: u.nombre,
        rol: u.rol,
        estado: "DESCANSO_SEMANAL",
        detalle: "Descanso semanal",
      };
    }
    return { usuarioId: u.id, usuarioNombre: u.nombre, rol: u.rol, estado: null, detalle: null };
  });
}

// ---------- Historial por tienda ----------

export type ObservacionTienda = {
  fecha: string;
  usuarioNombre: string;
  rol: string;
  observacion: string;
  actividad: string | null;
};

export type VisitanteTienda = { usuarioNombre: string; rol: string; visitas: number };

export type SupervisorPermanenteTienda = { usuarioNombre: string; rol: string };

export type HistorialTienda = {
  tiendaNombre: string;
  totalVisitas: number;
  observaciones: ObservacionTienda[];
  visitantes: VisitanteTienda[];
  // Solo se usa para el PDF, no se muestra en la vista previa en pantalla.
  supervisoresPermanentes: SupervisorPermanenteTienda[];
};

export async function obtenerHistorialTienda(
  tiendaId: string,
  desde: string,
  hasta: string
): Promise<HistorialTienda> {
  await exigirCoordinador();
  const supabase = supabaseServer();

  const [
    { data: tienda, error: errorTienda },
    { data, error },
    { data: permanentes, error: errorPermanentes },
  ] = await Promise.all([
    supabase.from("tiendas").select("nombre").eq("id", tiendaId).maybeSingle(),
    supabase
      .from("rutas_diarias")
      .select("fecha, usuario_id, rol, observacion, actividad, usuarios(nombre)")
      .eq("tienda_id", tiendaId)
      .gte("fecha", desde)
      .lte("fecha", hasta)
      .order("fecha", { ascending: false }),
    supabase
      .from("tiendas_permanentes")
      .select("usuarios(nombre, rol)")
      .eq("tienda_id", tiendaId),
  ]);

  if (errorTienda || error || errorPermanentes) {
    throw new Error("No se pudo cargar el historial de la tienda.");
  }

  const filas = data ?? [];

  // "Total visitas" y el conteo por colaborador cuentan visitas, no
  // reportes: si la misma persona escribió más de un reporte de esta tienda
  // el mismo día, eso sigue siendo UNA visita (aunque abajo se muestren
  // todas las observaciones escritas, esas sí completas, una por una).
  const visitasUnicas = new Set(filas.map((r: any) => `${r.usuario_id}|${r.fecha}`));

  const visitantesMap = new Map<string, VisitanteTienda>();
  const usuarioFechaContado = new Set<string>();
  filas.forEach((r: any) => {
    const clave = `${r.usuario_id}|${r.fecha}`;
    const nombre = r.usuarios?.nombre ?? "—";
    if (!usuarioFechaContado.has(clave)) {
      usuarioFechaContado.add(clave);
      const existente = visitantesMap.get(nombre);
      if (existente) existente.visitas += 1;
      else visitantesMap.set(nombre, { usuarioNombre: nombre, rol: r.rol ?? "—", visitas: 1 });
    }
  });

  return {
    tiendaNombre: tienda?.nombre ?? "—",
    totalVisitas: visitasUnicas.size,
    observaciones: filas.map((r: any) => ({
      fecha: r.fecha,
      usuarioNombre: r.usuarios?.nombre ?? "—",
      rol: r.rol,
      observacion: r.observacion,
      actividad: r.actividad,
    })),
    visitantes: Array.from(visitantesMap.values()).sort((a, b) => b.visitas - a.visitas),
    supervisoresPermanentes: (permanentes ?? []).map((p: any) => ({
      usuarioNombre: p.usuarios?.nombre ?? "—",
      rol: p.usuarios?.rol ?? "—",
    })),
  };
}

// ---------- Historial por persona ----------

export type TiendaVisitada = { fecha: string; tiendaNombre: string; observacion: string };

export type MarcacionPersona = {
  fecha: string;
  horaIngreso: string | null;
  horaSalida: string | null;
  tarde: boolean;
};

export type HistorialPersona = {
  usuarioNombre: string;
  rol: string;
  tiendasVisitadas: TiendaVisitada[];
  marcaciones: MarcacionPersona[];
  puntos: MisPuntos;
  // Los siguientes campos solo se usan para el PDF, no se muestran en la
  // vista previa en pantalla.
  tiendasPermanentes: string[];
  diasDescanso: string[];
  fechasDescansoEnRango: string[];
  antiguedad: { anios: number; meses: number } | null;
  proximoAniversario: { fecha: string; diasFaltantes: number } | null;
  proximoCumpleanos: { fecha: string; diasFaltantes: number; edadQueCumple: number | null } | null;
};

export async function obtenerHistorialPersona(
  usuarioId: string,
  desde: string,
  hasta: string
): Promise<HistorialPersona> {
  await exigirCoordinador();
  const supabase = supabaseServer();

  const [
    { data: usuario, error: errorUsuario },
    { data: rutas, error: errorRutas },
    { data: marcaciones, error: errorMarcaciones },
    { data: permanentes, error: errorPermanentes },
    puntos,
  ] = await Promise.all([
    supabase
      .from("usuarios")
      .select("nombre, rol, dias_descanso, fecha_ingreso, fecha_nacimiento")
      .eq("id", usuarioId)
      .maybeSingle(),
    supabase
      .from("rutas_diarias")
      .select("fecha, observacion, tiendas(nombre)")
      .eq("usuario_id", usuarioId)
      .gte("fecha", desde)
      .lte("fecha", hasta)
      .order("fecha", { ascending: false }),
    supabase
      .from("asistencia")
      .select("fecha, hora_ingreso, hora_salida")
      .eq("usuario_id", usuarioId)
      .gte("fecha", desde)
      .lte("fecha", hasta)
      .order("fecha", { ascending: false }),
    supabase.from("tiendas_permanentes").select("tiendas(nombre)").eq("usuario_id", usuarioId),
    obtenerPuntosDeUsuario(usuarioId),
  ]);

  if (errorUsuario || errorRutas || errorMarcaciones || errorPermanentes) {
    throw new Error("No se pudo cargar el historial de la persona.");
  }

  const rol = usuario?.rol ?? "";
  const limite = HORA_LIMITE_TARDANZA[rol];
  const diasDescanso: string[] = usuario?.dias_descanso ?? [];

  const fechasDescansoEnRango: string[] = [];
  if (diasDescanso.length > 0) {
    let cursor = desde;
    while (cursor <= hasta) {
      if (diasDescanso.includes(diaSemanaPeru(cursor))) fechasDescansoEnRango.push(cursor);
      cursor = sumarDias(cursor, 1);
    }
  }

  const fechaIngreso = usuario?.fecha_ingreso ?? null;
  const fechaNacimiento = usuario?.fecha_nacimiento ?? null;
  const hoy = hoyPeru();

  let antiguedad: HistorialPersona["antiguedad"] = null;
  let proximoAniversario: HistorialPersona["proximoAniversario"] = null;
  if (fechaIngreso) {
    antiguedad = calcularAntiguedad(fechaIngreso, hoy);
    const [, mIng, dIng] = fechaIngreso.split("-").map(Number);
    proximoAniversario = calcularProximaFechaAnual(mIng, dIng, hoy);
  }

  let proximoCumpleanos: HistorialPersona["proximoCumpleanos"] = null;
  if (fechaNacimiento) {
    const [yNac, mNac, dNac] = fechaNacimiento.split("-").map(Number);
    const { fecha, diasFaltantes } = calcularProximaFechaAnual(mNac, dNac, hoy);
    const [yProximo] = fecha.split("-").map(Number);
    proximoCumpleanos = { fecha, diasFaltantes, edadQueCumple: yProximo - yNac };
  }

  return {
    usuarioNombre: usuario?.nombre ?? "—",
    rol,
    tiendasVisitadas: (rutas ?? []).map((r: any) => ({
      fecha: r.fecha,
      tiendaNombre: r.tiendas?.nombre ?? "—",
      observacion: r.observacion,
    })),
    marcaciones: (marcaciones ?? []).map((m) => ({
      fecha: m.fecha,
      horaIngreso: m.hora_ingreso,
      horaSalida: m.hora_salida,
      tarde: !!(limite && m.hora_ingreso && m.hora_ingreso > limite),
    })),
    puntos,
    tiendasPermanentes: (permanentes ?? []).map((p: any) => p.tiendas?.nombre ?? "—"),
    diasDescanso,
    fechasDescansoEnRango,
    antiguedad,
    proximoAniversario,
    proximoCumpleanos,
  };
}

// ---------- Perfil del coordinador ----------

function diasEntreFechas(desdeISO: string, hastaISO: string): number {
  const [y1, m1, d1] = desdeISO.split("-").map(Number);
  const [y2, m2, d2] = hastaISO.split("-").map(Number);
  const t1 = Date.UTC(y1, m1 - 1, d1);
  const t2 = Date.UTC(y2, m2 - 1, d2);
  return Math.round((t2 - t1) / 86400000);
}

function calcularAntiguedad(fechaIngreso: string, hoy: string): { anios: number; meses: number } {
  const [yIng, mIng, dIng] = fechaIngreso.split("-").map(Number);
  const [yHoy, mHoy, dHoy] = hoy.split("-").map(Number);

  let anios = yHoy - yIng;
  let meses = mHoy - mIng;
  if (dHoy < dIng) meses -= 1;
  if (meses < 0) {
    anios -= 1;
    meses += 12;
  }
  return { anios, meses };
}

function calcularProximaFechaAnual(
  mes: number,
  dia: number,
  hoy: string
): { fecha: string; diasFaltantes: number } {
  const pad = (n: number) => String(n).padStart(2, "0");
  const [yHoy] = hoy.split("-").map(Number);
  const esteAnio = `${yHoy}-${pad(mes)}-${pad(dia)}`;
  const anio = esteAnio < hoy ? yHoy + 1 : yHoy;
  const fecha = `${anio}-${pad(mes)}-${pad(dia)}`;
  return { fecha, diasFaltantes: diasEntreFechas(hoy, fecha) };
}

export type PerfilCoordinador = {
  nombre: string;
  diasDescanso: string[];
  fechaIngreso: string | null;
  antiguedad: { anios: number; meses: number } | null;
  proximoAniversario: { fecha: string; diasFaltantes: number } | null;
};

export async function obtenerPerfilCoordinador(): Promise<PerfilCoordinador> {
  const sesion = await exigirCoordinador();
  const supabase = supabaseServer();

  const { data: usuario, error } = await supabase
    .from("usuarios")
    .select("nombre, dias_descanso, fecha_ingreso")
    .eq("id", sesion.id)
    .maybeSingle();

  if (error) throw new Error("No se pudo cargar el perfil.");

  const fechaIngreso = usuario?.fecha_ingreso ?? null;
  let antiguedad: PerfilCoordinador["antiguedad"] = null;
  let proximoAniversario: PerfilCoordinador["proximoAniversario"] = null;

  if (fechaIngreso) {
    const hoy = hoyPeru();
    const [yIng, mIng, dIng] = fechaIngreso.split("-").map(Number);
    const [yHoy, mHoy, dHoy] = hoy.split("-").map(Number);

    let anios = yHoy - yIng;
    let meses = mHoy - mIng;
    if (dHoy < dIng) meses -= 1;
    if (meses < 0) {
      anios -= 1;
      meses += 12;
    }
    antiguedad = { anios, meses };

    const pad = (n: number) => String(n).padStart(2, "0");
    const aniversarioEsteAnio = `${yHoy}-${pad(mIng)}-${pad(dIng)}`;
    const anioAniversario = aniversarioEsteAnio < hoy ? yHoy + 1 : yHoy;
    const fechaAniversario = `${anioAniversario}-${pad(mIng)}-${pad(dIng)}`;

    proximoAniversario = {
      fecha: fechaAniversario,
      diasFaltantes: diasEntreFechas(hoy, fechaAniversario),
    };
  }

  return {
    nombre: usuario?.nombre ?? sesion.nombre,
    diasDescanso: usuario?.dias_descanso ?? [],
    fechaIngreso,
    antiguedad,
    proximoAniversario,
  };
}

// ---------- Historial y monitoreo operativo ----------

export type AsistenciaGeneral = {
  fecha: string;
  usuarioNombre: string;
  rol: string;
  horaIngreso: string | null;
  ubicacionIngreso: string | null;
  horaSalida: string | null;
  ubicacionSalida: string | null;
  tarde: boolean;
};

export async function obtenerAsistenciaGeneral(
  desde: string,
  hasta: string
): Promise<AsistenciaGeneral[]> {
  await exigirCoordinador();
  const supabase = supabaseServer();

  const { data, error } = await supabase
    .from("asistencia")
    .select("fecha, hora_ingreso, ubicacion_ingreso, hora_salida, ubicacion_salida, usuarios(nombre, rol)")
    .gte("fecha", desde)
    .lte("fecha", hasta)
    .order("fecha", { ascending: false });

  if (error) throw new Error("No se pudo cargar la asistencia general.");

  return (data ?? []).map((a: any) => {
    const rol = a.usuarios?.rol ?? "";
    const limite = HORA_LIMITE_TARDANZA[rol];
    return {
      fecha: a.fecha,
      usuarioNombre: a.usuarios?.nombre ?? "—",
      rol,
      horaIngreso: a.hora_ingreso,
      ubicacionIngreso: a.ubicacion_ingreso,
      horaSalida: a.hora_salida,
      ubicacionSalida: a.ubicacion_salida,
      tarde: !!(limite && a.hora_ingreso && a.hora_ingreso > limite),
    };
  });
}

// Una "visita" cuenta desde dos fuentes, sin duplicar:
// 1) rutas_diarias — reportes con observación ya enviados (dato histórico,
//    incluye los 723 registros migrados de la hoja original).
// 2) rutas_activas — asignaciones hechas por el Coordinador que todavía no
//    tienen un reporte para ese mismo usuario+tienda+fecha. Así, a partir de
//    hoy, una ruta asignada cuenta como visitada aunque el colaborador no
//    deje observación.
type VisitaTienda = {
  fecha: string;
  tiendaId: string;
  usuarioId: string;
  usuarioNombre: string;
  rol: string;
  tieneObservacion: boolean;
  observacion: string | null;
};

async function obtenerVisitasEnRango(
  desde: string,
  hasta: string,
  tiendaId?: string
): Promise<VisitaTienda[]> {
  const supabase = supabaseServer();

  let consultaReportes = supabase
    .from("rutas_diarias")
    .select("fecha, tienda_id, usuario_id, rol, observacion, usuarios(nombre)")
    .gte("fecha", desde)
    .lte("fecha", hasta);
  if (tiendaId) consultaReportes = consultaReportes.eq("tienda_id", tiendaId);

  let consultaAsignaciones = supabase
    .from("rutas_activas")
    .select("fecha_planificada, tienda_id, usuario_id, usuarios(nombre, rol)")
    .gte("fecha_planificada", desde)
    .lte("fecha_planificada", hasta);
  if (tiendaId) consultaAsignaciones = consultaAsignaciones.eq("tienda_id", tiendaId);

  const [{ data: reportes, error: errorReportes }, { data: asignaciones, error: errorAsignaciones }] =
    await Promise.all([consultaReportes, consultaAsignaciones]);

  if (errorReportes || errorAsignaciones) {
    throw new Error("No se pudo cargar las visitas.");
  }

  // Una misma persona puede enviar más de un reporte para la misma tienda el
  // mismo día (reportes duplicados legítimos en los datos). Para efectos de
  // "cuántas veces se visitó", eso cuenta como UNA sola visita, no varias —
  // se agrupa por usuario+tienda+fecha antes de contar.
  const reportesUnicos = new Map<string, any>();
  (reportes ?? []).forEach((r: any) => {
    const clave = `${r.usuario_id}|${r.tienda_id}|${r.fecha}`;
    if (!reportesUnicos.has(clave)) reportesUnicos.set(clave, r);
  });

  const clavesReportadas = new Set(reportesUnicos.keys());

  const visitas: VisitaTienda[] = Array.from(reportesUnicos.values()).map((r: any) => ({
    fecha: r.fecha,
    tiendaId: r.tienda_id,
    usuarioId: r.usuario_id,
    usuarioNombre: r.usuarios?.nombre ?? "—",
    rol: r.rol ?? "—",
    tieneObservacion: true,
    observacion: r.observacion,
  }));

  (asignaciones ?? []).forEach((a: any) => {
    const clave = `${a.usuario_id}|${a.tienda_id}|${a.fecha_planificada}`;
    if (clavesReportadas.has(clave)) return; // ya contada vía el reporte
    visitas.push({
      fecha: a.fecha_planificada,
      tiendaId: a.tienda_id,
      usuarioId: a.usuario_id,
      usuarioNombre: a.usuarios?.nombre ?? "—",
      rol: a.usuarios?.rol ?? "—",
      tieneObservacion: false,
      observacion: null,
    });
  });

  return visitas;
}

export type RankingTiendaCompleto = { tiendaId: string; tiendaNombre: string; visitas: number };

export type RankingTiendasCompleto = {
  top20: RankingTiendaCompleto[];
  resto: RankingTiendaCompleto[];
  sinVisitas: RankingTiendaCompleto[];
};

export async function obtenerRankingTiendasCompleto(
  desde: string,
  hasta: string
): Promise<RankingTiendasCompleto> {
  await exigirCoordinador();
  const supabase = supabaseServer();

  const [{ data: tiendas, error: errorTiendas }, visitas] = await Promise.all([
    supabase.from("tiendas").select("id, nombre").order("nombre"),
    obtenerVisitasEnRango(desde, hasta),
  ]);

  if (errorTiendas) throw new Error("No se pudo cargar el ranking de tiendas.");

  const conteo = new Map<string, number>();
  visitas.forEach((v) => {
    conteo.set(v.tiendaId, (conteo.get(v.tiendaId) ?? 0) + 1);
  });

  const ranking = (tiendas ?? [])
    .map((t) => ({ tiendaId: t.id, tiendaNombre: t.nombre, visitas: conteo.get(t.id) ?? 0 }))
    .sort((a, b) => b.visitas - a.visitas);

  const conVisitas = ranking.filter((r) => r.visitas > 0);
  const sinVisitas = ranking.filter((r) => r.visitas === 0);

  return {
    top20: conVisitas.slice(0, 20),
    resto: conVisitas.slice(20),
    sinVisitas,
  };
}

export type VisitaTiendaDetalle = {
  fecha: string;
  usuarioNombre: string;
  rol: string;
  tieneObservacion: boolean;
};

export async function obtenerVisitasTienda(
  tiendaId: string,
  desde: string,
  hasta: string
): Promise<VisitaTiendaDetalle[]> {
  await exigirCoordinador();
  const visitas = await obtenerVisitasEnRango(desde, hasta, tiendaId);
  return visitas
    .map((v) => ({
      fecha: v.fecha,
      usuarioNombre: v.usuarioNombre,
      rol: v.rol,
      tieneObservacion: v.tieneObservacion,
    }))
    .sort((a, b) => b.fecha.localeCompare(a.fecha));
}
