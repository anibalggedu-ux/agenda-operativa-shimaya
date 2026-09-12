"use server";

import { supabaseServer } from "@/lib/supabase-server";
import { obtenerSesion, tieneBitacora } from "@/lib/session";
import {
  sumarDias,
  diaLaboralPeru,
  hoyPeru,
  horaPeru,
  DIAS_SEMANA,
  calcularAntiguedad,
  calcularProximaFechaAnual,
  formatearFechaLegible,
} from "@/lib/fechas";
import { MAX_DIAS_DESCANSO } from "../coordinador/constantes";
import { obtenerClimaDiario, resumirClimaDia, type ResumenClimaDia } from "@/lib/clima";
import { enviarCorreo } from "@/lib/email";
import { obtenerUrlTemporalFoto, subirFotoMarcacion } from "@/lib/azure-storage";

// Ventana en la que un colaborador puede corregir su propio reporte después
// de haberlo enviado (p. ej. si se equivocó al escribir la observación).
const VENTANA_EDICION_HORAS = 48;

export type Urgencia = "HOY" | "MANANA" | "AYER" | "ANTES_DE_AYER";

export type TiendaClasificada = {
  id: string;
  tiendaId: string;
  tiendaNombre: string;
  fechaPlanificada: string;
  area: string | null;
  enfoque: string | null;
  urgencia: Urgencia;
  // Si viene de una asignación sin reportar aún.
  rutaActivaId: string | null;
  // Si ya tiene un reporte enviado (editable mientras dure la ventana de 48h).
  reporteId: string | null;
  observacionActual: string;
  actividadActual: string;
  clima: ResumenClimaDia | null;
  autoasignada: boolean;
  // Marcación de llegada/salida a esta tienda en particular (distinta de la
  // marcación general de asistencia del día) — con foto y ubicación.
  horaLlegada: string | null;
  ubicacionLlegada: string | null;
  fotoLlegadaUrl: string | null;
  horaSalidaTienda: string | null;
  ubicacionSalidaTienda: string | null;
  fotoSalidaTiendaUrl: string | null;
};

function clasificarUrgencia(fecha: string, hoy: string, manana: string, ayer: string): Urgencia {
  if (fecha === hoy) return "HOY";
  if (fecha === manana) return "MANANA";
  if (fecha === ayer) return "AYER";
  return "ANTES_DE_AYER";
}

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
  const desdeVentana = sumarDias(hoy, -3); // margen de sobra para cubrir la ventana de 48h

  const [
    { data: usuario },
    { data: activas, error: errorActivas },
    { data: reportes, error: errorReportes },
  ] = await Promise.all([
    supabase.from("usuarios").select("dias_descanso").eq("id", sesion.id).maybeSingle(),
    supabase
      .from("rutas_activas")
      .select(
        "id, fecha_planificada, area, enfoque, autoasignada, hora_llegada, ubicacion_llegada, foto_llegada_blob, hora_salida, ubicacion_salida, foto_salida_blob, tiendas(id, nombre, lat, lon)"
      )
      .eq("usuario_id", sesion.id)
      .order("fecha_planificada", { ascending: false }),
    supabase
      .from("rutas_diarias")
      .select(
        "id, fecha, observacion, actividad, asignado_en, created_at, tienda_id, hora_llegada, ubicacion_llegada, foto_llegada_blob, hora_salida, ubicacion_salida, foto_salida_blob, tiendas(id, nombre, lat, lon)"
      )
      .eq("usuario_id", sesion.id)
      .gte("fecha", desdeVentana)
      .order("fecha", { ascending: false }),
  ]);

  if (errorActivas) throw new Error("No se pudo cargar las tiendas asignadas.");
  if (errorReportes) throw new Error("No se pudo cargar tus reportes recientes.");

  const limite = Date.now() - VENTANA_EDICION_HORAS * 3600 * 1000;

  type TiendaInterna = TiendaClasificada & {
    _lat: number | null;
    _lon: number | null;
    _fotoLlegadaBlob: string | null;
    _fotoSalidaBlob: string | null;
  };

  // Tarjetas pendientes: asignaciones sin reportar todavía.
  const pendientes: TiendaInterna[] = (activas ?? []).map((r: any) => ({
    id: `pendiente-${r.id}`,
    tiendaId: r.tiendas.id,
    tiendaNombre: r.tiendas.nombre,
    fechaPlanificada: r.fecha_planificada,
    area: r.area,
    enfoque: r.enfoque,
    urgencia: clasificarUrgencia(r.fecha_planificada, hoy, manana, ayer),
    rutaActivaId: r.id,
    reporteId: null,
    observacionActual: "",
    actividadActual: "",
    clima: null,
    autoasignada: !!r.autoasignada,
    horaLlegada: r.hora_llegada ?? null,
    ubicacionLlegada: r.ubicacion_llegada ?? null,
    fotoLlegadaUrl: null,
    horaSalidaTienda: r.hora_salida ?? null,
    ubicacionSalidaTienda: r.ubicacion_salida ?? null,
    fotoSalidaTiendaUrl: null,
    _fotoLlegadaBlob: r.foto_llegada_blob ?? null,
    _fotoSalidaBlob: r.foto_salida_blob ?? null,
    _lat: r.tiendas.lat === null ? null : Number(r.tiendas.lat),
    _lon: r.tiendas.lon === null ? null : Number(r.tiendas.lon),
  }));

  // Tarjetas ya reportadas, pero todavía dentro de las 48h desde la
  // asignación — se mantienen visibles y editables, cada una por su cuenta
  // (si te asignan otra tienda, aparece como una tarjeta aparte).
  const editables: TiendaInterna[] = (reportes ?? [])
    .filter((r: any) => new Date(r.asignado_en ?? r.created_at).getTime() > limite)
    .map((r: any) => ({
      id: `reporte-${r.id}`,
      tiendaId: r.tiendas?.id ?? r.tienda_id,
      tiendaNombre: r.tiendas?.nombre ?? "—",
      fechaPlanificada: r.fecha,
      area: null,
      enfoque: null,
      urgencia: clasificarUrgencia(r.fecha, hoy, manana, ayer),
      rutaActivaId: null,
      reporteId: r.id,
      observacionActual: r.observacion ?? "",
      actividadActual: r.actividad ?? "",
      clima: null,
      autoasignada: false,
      horaLlegada: r.hora_llegada ?? null,
      ubicacionLlegada: r.ubicacion_llegada ?? null,
      fotoLlegadaUrl: null,
      horaSalidaTienda: r.hora_salida ?? null,
      ubicacionSalidaTienda: r.ubicacion_salida ?? null,
      fotoSalidaTiendaUrl: null,
      _fotoLlegadaBlob: r.foto_llegada_blob ?? null,
      _fotoSalidaBlob: r.foto_salida_blob ?? null,
      _lat: r.tiendas?.lat === null || r.tiendas?.lat === undefined ? null : Number(r.tiendas.lat),
      _lon: r.tiendas?.lon === null || r.tiendas?.lon === undefined ? null : Number(r.tiendas.lon),
    }));

  const todas = [...pendientes, ...editables];

  // Se pide el pronóstico una sola vez por ubicación única (varias tarjetas
  // pueden compartir tienda) y se reparte a cada tarjeta según su fecha.
  const ubicacionesUnicas = new Map<string, { lat: number; lon: number }>();
  todas.forEach((t) => {
    if (t._lat !== null && t._lon !== null) {
      ubicacionesUnicas.set(`${t._lat},${t._lon}`, { lat: t._lat, lon: t._lon });
    }
  });

  const climaPorUbicacion = new Map<string, Map<string, ReturnType<typeof resumirClimaDia>> | null>();
  await Promise.all(
    Array.from(ubicacionesUnicas.entries()).map(async ([clave, { lat, lon }]) => {
      const diario = await obtenerClimaDiario(lat, lon);
      const resumen = new Map<string, ReturnType<typeof resumirClimaDia>>();
      diario.forEach((dia, fecha) => resumen.set(fecha, resumirClimaDia(dia)));
      climaPorUbicacion.set(clave, resumen);
    })
  );

  const tiendasFinal: TiendaClasificada[] = await Promise.all(
    todas.map(async ({ _lat, _lon, _fotoLlegadaBlob, _fotoSalidaBlob, ...t }) => {
      const resumen = _lat !== null && _lon !== null ? climaPorUbicacion.get(`${_lat},${_lon}`) : undefined;
      const [fotoLlegadaUrl, fotoSalidaTiendaUrl] = await Promise.all([
        obtenerUrlTemporalFoto(_fotoLlegadaBlob),
        obtenerUrlTemporalFoto(_fotoSalidaBlob),
      ]);
      return {
        ...t,
        clima: resumen?.get(t.fechaPlanificada) ?? null,
        fotoLlegadaUrl,
        fotoSalidaTiendaUrl,
      };
    })
  );

  return { tiendas: tiendasFinal, diaDescansoFijo: usuario?.dias_descanso ?? null };
}

export type ResultadoReporte = { exito: boolean; mensaje?: string };

// ---------- Auto-asignación (cuando el coordinador cambió la ruta a último
// momento y aún no lo actualizó en el sistema) ----------

export type TiendaBasicaBitacora = { id: string; nombre: string };

export async function obtenerTodasLasTiendas(): Promise<TiendaBasicaBitacora[]> {
  const sesion = await obtenerSesion();
  if (!sesion || !tieneBitacora(sesion.rol)) throw new Error("No autorizado.");

  const supabase = supabaseServer();
  const { data, error } = await supabase.from("tiendas").select("id, nombre").order("nombre");
  if (error) throw new Error("No se pudo cargar las tiendas.");
  return data ?? [];
}

async function notificarCoordinadoresAutoasignacion(
  nombreUsuario: string,
  tiendaNombre: string,
  fecha: string
): Promise<void> {
  try {
    const supabase = supabaseServer();
    const { data: coordinadores } = await supabase
      .from("usuarios")
      .select("email")
      .eq("rol", "coordinador")
      .eq("activo", true);

    const correos = (coordinadores ?? []).map((c) => c.email).filter((e): e is string => !!e);
    if (correos.length === 0) return;

    await enviarCorreo({
      para: correos,
      tituloEmoji: "⚡",
      asunto: `${nombreUsuario} se auto-asignó una tienda`,
      cuerpoHtml: `
        <p><strong>${nombreUsuario}</strong> se asignó la tienda <strong>${tiendaNombre}</strong> para
        ${formatearFechaLegible(fecha)} directamente desde su panel — no fue una asignación tuya.</p>
        <p style="color:#8b8d92; font-size:12px;">Úsalo solo como aviso; ya puede reportar la visita con normalidad.</p>
      `,
    });
  } catch (error) {
    console.error("No se pudo notificar la auto-asignación:", error);
  }
}

export async function autoasignarTienda(tiendaId: string): Promise<ResultadoReporte> {
  const sesion = await obtenerSesion();
  if (!sesion || !tieneBitacora(sesion.rol)) {
    return { exito: false, mensaje: "No autorizado." };
  }
  if (!tiendaId) {
    return { exito: false, mensaje: "Selecciona una tienda." };
  }

  const supabase = supabaseServer();
  const fecha = diaLaboralPeru(sesion.rol === "capacitador");

  const { data: existente } = await supabase
    .from("rutas_activas")
    .select("id")
    .eq("usuario_id", sesion.id)
    .eq("tienda_id", tiendaId)
    .eq("fecha_planificada", fecha)
    .maybeSingle();
  if (existente) {
    return { exito: false, mensaje: "Ya te habías asignado esa tienda hoy." };
  }

  const { data: tienda } = await supabase.from("tiendas").select("nombre").eq("id", tiendaId).maybeSingle();
  if (!tienda) {
    return { exito: false, mensaje: "Tienda no encontrada." };
  }

  const { error } = await supabase.from("rutas_activas").insert({
    usuario_id: sesion.id,
    tienda_id: tiendaId,
    fecha_planificada: fecha,
    autoasignada: true,
  });
  if (error) return { exito: false, mensaje: "No se pudo asignar la tienda." };

  await notificarCoordinadoresAutoasignacion(sesion.nombre, tienda.nombre, fecha);

  return { exito: true, mensaje: `Te asignaste ${tienda.nombre} para hoy. Ya puedes reportar la visita.` };
}

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
  const fecha = diaLaboralPeru(sesion.rol === "capacitador");

  // El momento de la asignación (no el de envío) es lo que ancla la ventana
  // de 48 horas para poder editar el reporte después — se guarda tal cual
  // quedó registrada en rutas_activas antes de borrarla. La marcación de
  // llegada/salida a la tienda (si ya se hizo) también se arrastra, para no
  // perderla al pasar de "pendiente" a "reportado".
  let asignadoEn: string | null = null;
  let marcacionTienda: {
    hora_llegada: string | null;
    ubicacion_llegada: string | null;
    foto_llegada_blob: string | null;
    hora_salida: string | null;
    ubicacion_salida: string | null;
    foto_salida_blob: string | null;
  } = {
    hora_llegada: null,
    ubicacion_llegada: null,
    foto_llegada_blob: null,
    hora_salida: null,
    ubicacion_salida: null,
    foto_salida_blob: null,
  };
  if (rutaActivaId) {
    const { data: activa } = await supabase
      .from("rutas_activas")
      .select(
        "created_at, hora_llegada, ubicacion_llegada, foto_llegada_blob, hora_salida, ubicacion_salida, foto_salida_blob"
      )
      .eq("id", rutaActivaId)
      .maybeSingle();
    asignadoEn = activa?.created_at ?? null;
    if (activa) {
      marcacionTienda = {
        hora_llegada: activa.hora_llegada,
        ubicacion_llegada: activa.ubicacion_llegada,
        foto_llegada_blob: activa.foto_llegada_blob,
        hora_salida: activa.hora_salida,
        ubicacion_salida: activa.ubicacion_salida,
        foto_salida_blob: activa.foto_salida_blob,
      };
    }
  }

  // Si por algún motivo ya existe un reporte de esta misma tienda y fecha
  // (p. ej. un reenvío), se sobreescribe en vez de crear un segundo reporte.
  const { data: existente } = await supabase
    .from("rutas_diarias")
    .select("id")
    .eq("usuario_id", sesion.id)
    .eq("tienda_id", tiendaId)
    .eq("fecha", fecha)
    .maybeSingle();

  if (existente) {
    const { error } = await supabase
      .from("rutas_diarias")
      .update({ observacion, actividad, ...marcacionTienda })
      .eq("id", existente.id);
    if (error) {
      return { exito: false, mensaje: "No se pudo actualizar el reporte. Intenta de nuevo." };
    }
  } else {
    const { error: errorInsert } = await supabase.from("rutas_diarias").insert({
      fecha,
      usuario_id: sesion.id,
      tienda_id: tiendaId,
      rol: sesion.rol,
      observacion,
      actividad,
      asignado_en: asignadoEn,
      ...marcacionTienda,
    });
    if (errorInsert) {
      return { exito: false, mensaje: "No se pudo guardar el reporte. Intenta de nuevo." };
    }
  }

  if (rutaActivaId) {
    await supabase.from("rutas_activas").delete().eq("id", rutaActivaId);
  }

  return { exito: true, mensaje: "Reporte enviado correctamente." };
}

// ---------- Marcación de llegada/salida a cada tienda del día ----------
//
// Distinta de la marcación general de asistencia (GpsMarcador): esta es por
// cada tienda asignada ese día, para cuando a alguien le tocan 2 o 3 rutas
// — se marca al llegar y al irse de CADA una, con foto y ubicación. Vive en
// rutas_activas mientras no se reporta la visita, y se traslada a
// rutas_diarias al enviar el reporte (ver enviarReporte).

type ContextoTienda = { tabla: "rutas_activas" | "rutas_diarias"; id: string; tiendaId: string };

async function obtenerContextoTienda(
  supabase: ReturnType<typeof supabaseServer>,
  usuarioId: string,
  rutaActivaId: string | null,
  reporteId: string | null
): Promise<ContextoTienda | null> {
  if (rutaActivaId) {
    const { data } = await supabase
      .from("rutas_activas")
      .select("id, tienda_id, usuario_id")
      .eq("id", rutaActivaId)
      .maybeSingle();
    if (!data || data.usuario_id !== usuarioId) return null;
    return { tabla: "rutas_activas", id: data.id, tiendaId: data.tienda_id };
  }
  if (reporteId) {
    const { data } = await supabase
      .from("rutas_diarias")
      .select("id, tienda_id, usuario_id")
      .eq("id", reporteId)
      .maybeSingle();
    if (!data || data.usuario_id !== usuarioId) return null;
    return { tabla: "rutas_diarias", id: data.id, tiendaId: data.tienda_id };
  }
  return null;
}

export async function marcarLlegadaTienda(
  rutaActivaId: string | null,
  reporteId: string | null,
  lat: number,
  lng: number,
  fotoBase64: string
): Promise<ResultadoReporte> {
  const sesion = await obtenerSesion();
  if (!sesion || !tieneBitacora(sesion.rol)) return { exito: false, mensaje: "No autorizado." };
  if (!fotoBase64) return { exito: false, mensaje: "Toma una foto para marcar la llegada." };

  const supabase = supabaseServer();
  const contexto = await obtenerContextoTienda(supabase, sesion.id, rutaActivaId, reporteId);
  if (!contexto) return { exito: false, mensaje: "No se encontró la asignación." };

  const hora = horaPeru();
  const ubicacion = "https://www.google.com/maps?q=" + lat + "," + lng;
  const fotoBlob = `${sesion.id}/${contexto.tiendaId}-llegada-${Date.now()}.jpg`;

  try {
    await subirFotoMarcacion(fotoBlob, fotoBase64);
  } catch (error) {
    console.error("No se pudo subir la foto de llegada:", error);
    return { exito: false, mensaje: "No se pudo guardar la foto. Intenta de nuevo." };
  }

  const { error } = await supabase
    .from(contexto.tabla)
    .update({ hora_llegada: hora, ubicacion_llegada: ubicacion, foto_llegada_blob: fotoBlob })
    .eq("id", contexto.id);

  if (error) return { exito: false, mensaje: "No se pudo registrar la llegada." };
  return { exito: true, mensaje: "Llegada registrada con foto." };
}

export async function marcarSalidaTienda(
  rutaActivaId: string | null,
  reporteId: string | null,
  lat: number,
  lng: number,
  fotoBase64: string
): Promise<ResultadoReporte> {
  const sesion = await obtenerSesion();
  if (!sesion || !tieneBitacora(sesion.rol)) return { exito: false, mensaje: "No autorizado." };
  if (!fotoBase64) return { exito: false, mensaje: "Toma una foto para marcar la salida." };

  const supabase = supabaseServer();
  const contexto = await obtenerContextoTienda(supabase, sesion.id, rutaActivaId, reporteId);
  if (!contexto) return { exito: false, mensaje: "No se encontró la asignación." };

  const hora = horaPeru();
  const ubicacion = "https://www.google.com/maps?q=" + lat + "," + lng;
  const fotoBlob = `${sesion.id}/${contexto.tiendaId}-salida-${Date.now()}.jpg`;

  try {
    await subirFotoMarcacion(fotoBlob, fotoBase64);
  } catch (error) {
    console.error("No se pudo subir la foto de salida:", error);
    return { exito: false, mensaje: "No se pudo guardar la foto. Intenta de nuevo." };
  }

  const { error } = await supabase
    .from(contexto.tabla)
    .update({ hora_salida: hora, ubicacion_salida: ubicacion, foto_salida_blob: fotoBlob })
    .eq("id", contexto.id);

  if (error) return { exito: false, mensaje: "No se pudo registrar la salida." };
  return { exito: true, mensaje: "Salida registrada con foto." };
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

// Sin fechas, se muestran solo los últimos N — evitando una lista larga por
// defecto. Con fechas, se muestran todos los que caigan en ese rango (el
// colaborador las usa cuando quiere ver más que los últimos registros).
const ULTIMOS_REPORTES_SIN_FILTRO = 3;

export async function obtenerMisReportesRecientes(
  desde?: string,
  hasta?: string
): Promise<MiReporte[]> {
  const sesion = await obtenerSesion();
  if (!sesion || !tieneBitacora(sesion.rol)) {
    throw new Error("No autorizado.");
  }

  const supabase = supabaseServer();
  let consulta = supabase
    .from("rutas_diarias")
    .select(
      "id, fecha, observacion, actividad, respuesta, respuesta_por, created_at, asignado_en, tiendas(nombre)"
    )
    .eq("usuario_id", sesion.id);

  if (desde) consulta = consulta.gte("fecha", desde);
  if (hasta) consulta = consulta.lte("fecha", hasta);

  consulta = consulta
    .order("fecha", { ascending: false })
    .order("created_at", { ascending: false });

  if (!desde && !hasta) consulta = consulta.limit(ULTIMOS_REPORTES_SIN_FILTRO);

  const { data, error } = await consulta;

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
    // Ancla la ventana a cuando el coordinador asignó la ruta/tienda, no a
    // cuando se envió el reporte. Si no hay ese dato (reportes viejos), se
    // usa la fecha de envío como respaldo.
    puedeEditar: new Date(r.asignado_en ?? r.created_at).getTime() > limite,
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
    .select("usuario_id, created_at, asignado_en")
    .eq("id", reporteId)
    .maybeSingle();

  if (errorReporte || !reporte) {
    return { exito: false, mensaje: "No se encontró el reporte." };
  }
  if (reporte.usuario_id !== sesion.id) {
    return { exito: false, mensaje: "No puedes editar un reporte que no es tuyo." };
  }

  // La ventana se cuenta desde que el coordinador asignó la ruta/tienda, no
  // desde que se envió el reporte (si no hay ese dato, se usa el envío como
  // respaldo — reportes viejos o cargados sin pasar por una asignación).
  const limite = Date.now() - VENTANA_EDICION_HORAS * 3600 * 1000;
  const inicioVentana = reporte.asignado_en ?? reporte.created_at;
  if (new Date(inicioVentana).getTime() <= limite) {
    return {
      exito: false,
      mensaje: "Ya pasaron las 48 horas desde que se asignó esta ruta — no se puede editar el reporte.",
    };
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

// El colaborador ya no cambia su descanso directo: queda como solicitud
// pendiente hasta que el coordinador la apruebe (ve la campanita de
// notificaciones en su panel).

export type SolicitudDescansoPropia = {
  id: string;
  diasSolicitados: string[];
  createdAt: string;
};

export async function obtenerMiSolicitudDescansoPendiente(): Promise<SolicitudDescansoPropia | null> {
  const sesion = await obtenerSesion();
  if (!sesion) throw new Error("No autorizado.");

  const supabase = supabaseServer();
  const { data } = await supabase
    .from("solicitudes_descanso")
    .select("id, dias_solicitados, created_at")
    .eq("usuario_id", sesion.id)
    .eq("estado", "pendiente")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return null;
  return { id: data.id, diasSolicitados: data.dias_solicitados ?? [], createdAt: data.created_at };
}

export async function solicitarCambioDescanso(dias: string[]): Promise<ResultadoReporte> {
  const sesion = await obtenerSesion();
  if (!sesion) return { exito: false, mensaje: "No autorizado." };

  if (dias.length > MAX_DIAS_DESCANSO) {
    return { exito: false, mensaje: `Máximo ${MAX_DIAS_DESCANSO} días de descanso por semana.` };
  }
  if (dias.some((d) => !(DIAS_SEMANA as readonly string[]).includes(d))) {
    return { exito: false, mensaje: "Día inválido." };
  }

  const supabase = supabaseServer();

  const { data: usuario } = await supabase
    .from("usuarios")
    .select("dias_descanso")
    .eq("id", sesion.id)
    .maybeSingle();
  const actuales: string[] = usuario?.dias_descanso ?? [];

  const sinCambios = actuales.length === dias.length && actuales.every((d) => dias.includes(d));
  if (sinCambios) {
    return { exito: false, mensaje: "Ya tienes ese día de descanso." };
  }

  // Si ya hay una solicitud pendiente, se actualiza en vez de crear otra.
  const { data: pendiente } = await supabase
    .from("solicitudes_descanso")
    .select("id")
    .eq("usuario_id", sesion.id)
    .eq("estado", "pendiente")
    .maybeSingle();

  if (pendiente) {
    const { error } = await supabase
      .from("solicitudes_descanso")
      .update({ dias_actuales: actuales, dias_solicitados: dias, created_at: new Date().toISOString() })
      .eq("id", pendiente.id);
    if (error) return { exito: false, mensaje: "No se pudo actualizar tu solicitud." };
    return { exito: true, mensaje: "Solicitud actualizada — pendiente de aprobación del coordinador." };
  }

  const { error } = await supabase.from("solicitudes_descanso").insert({
    usuario_id: sesion.id,
    dias_actuales: actuales,
    dias_solicitados: dias,
  });
  if (error) return { exito: false, mensaje: "No se pudo enviar la solicitud." };
  return { exito: true, mensaje: "Solicitud enviada — queda pendiente de aprobación del coordinador." };
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

export async function obtenerObservacionesTiendasFijas(
  desde: string,
  hasta: string
): Promise<ObservacionTiendaFija[]> {
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
    .gte("fecha", desde)
    .lte("fecha", hasta)
    .order("fecha", { ascending: false })
    .order("created_at", { ascending: false });

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
  fotoIngresoUrl: string | null;
  fotoSalidaUrl: string | null;
};

export async function obtenerMisMarcaciones(desde: string, hasta: string): Promise<MiMarcacion[]> {
  const sesion = await obtenerSesion();
  if (!sesion) throw new Error("No autorizado.");

  const supabase = supabaseServer();
  const { data, error } = await supabase
    .from("asistencia")
    .select(
      "fecha, hora_ingreso, ubicacion_ingreso, hora_salida, ubicacion_salida, foto_ingreso_blob, foto_salida_blob"
    )
    .eq("usuario_id", sesion.id)
    .gte("fecha", desde)
    .lte("fecha", hasta)
    .order("fecha", { ascending: false });

  if (error) throw new Error("No se pudo cargar tus marcaciones.");

  return Promise.all(
    (data ?? []).map(async (a) => ({
      fecha: a.fecha,
      horaIngreso: a.hora_ingreso,
      ubicacionIngreso: a.ubicacion_ingreso,
      horaSalida: a.hora_salida,
      ubicacionSalida: a.ubicacion_salida,
      fotoIngresoUrl: await obtenerUrlTemporalFoto(a.foto_ingreso_blob),
      fotoSalidaUrl: await obtenerUrlTemporalFoto(a.foto_salida_blob),
    }))
  );
}