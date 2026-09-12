"use server";

import { supabaseServer } from "@/lib/supabase-server";
import { obtenerSesion, type SesionUsuario } from "@/lib/session";
import {
  hoyPeru,
  diaSemanaPeru,
  sumarDias,
  formatearFechaLegible,
  DIAS_SEMANA,
  calcularAntiguedad,
  calcularProximaFechaAnual,
} from "@/lib/fechas";
import {
  AREAS_RUTA,
  MAX_TIENDAS_PERMANENTES,
  MAX_DIAS_DESCANSO,
  HORA_LIMITE_TARDANZA,
} from "./constantes";
import { obtenerPuntosDeUsuario, type MisPuntos } from "../puntos-actions";
import { enviarCorreo, URL_APP, type ContactoCorreo } from "@/lib/email";
import { obtenerClimaDiario, resumirClimaDia, type ResumenClimaDia } from "@/lib/clima";
import { calcularRutaAuto, formatearMinutos } from "@/lib/distancia";
import { obtenerUrlTemporalFoto } from "@/lib/azure-storage";

async function exigirCoordinador() {
  const sesion = await obtenerSesion();
  if (!sesion || sesion.rol !== "coordinador") {
    throw new Error("No autorizado.");
  }
  return sesion;
}

// ---------- Notificaciones por correo ----------
//
// El correo sale siempre de la cuenta configurada en GMAIL_USER (no se puede
// enviar "como si fuera" el Gmail personal del coordinador — los proveedores
// de correo bloquean ese tipo de suplantación). En su lugar, se deja al
// coordinador como "Responder a": si el destinatario responde el correo, le
// escribe directo a él. Un fallo al enviar nunca debe romper la acción
// principal, por eso cada llamado va en su propio try/catch silencioso.

type ContactoUsuario = { nombre: string; email: string | null };

async function obtenerContacto(
  supabase: ReturnType<typeof supabaseServer>,
  usuarioId: string
): Promise<ContactoUsuario | null> {
  const { data } = await supabase
    .from("usuarios")
    .select("nombre, email")
    .eq("id", usuarioId)
    .maybeSingle();
  return data;
}

async function obtenerReplyTo(
  supabase: ReturnType<typeof supabaseServer>,
  sesion: SesionUsuario
): Promise<ContactoCorreo | null> {
  const contacto = await obtenerContacto(supabase, sesion.id);
  return contacto?.email ? { nombre: sesion.nombre, email: contacto.email } : null;
}

async function notificarPorCorreo(tarea: () => Promise<void>): Promise<void> {
  try {
    await tarea();
  } catch (error) {
    console.error("No se pudo enviar la notificación por correo:", error);
  }
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
  fotoIngresoUrl: string | null;
  fotoSalidaUrl: string | null;
  clima: ResumenClimaDia | null;
  autoasignada: boolean;
  // Marcación de llegada/salida a ESTA tienda en particular (distinta de la
  // asistencia general del día, arriba).
  horaLlegadaTienda: string | null;
  ubicacionLlegadaTienda: string | null;
  fotoLlegadaTiendaUrl: string | null;
  horaSalidaTienda: string | null;
  ubicacionSalidaTienda: string | null;
  fotoSalidaTiendaUrl: string | null;
};

export async function obtenerRutasActivas(): Promise<RutaActiva[]> {
  await exigirCoordinador();
  const supabase = supabaseServer();

  // Solo hoy en adelante — las rutas de días ya pasados quedan como
  // historial y no deben seguir acumulándose en esta lista de trabajo.
  const { data, error } = await supabase
    .from("rutas_activas")
    .select(
      "id, fecha_planificada, area, enfoque, autoasignada, usuario_id, tienda_id, hora_llegada, ubicacion_llegada, foto_llegada_blob, hora_salida, ubicacion_salida, foto_salida_blob, usuarios(nombre), tiendas(nombre, lat, lon)"
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
    .select(
      "usuario_id, fecha, hora_ingreso, ubicacion_ingreso, hora_salida, ubicacion_salida, foto_ingreso_blob, foto_salida_blob"
    )
    .in("usuario_id", usuarioIds)
    .in("fecha", fechas);

  if (errorMarcaciones) throw new Error("No se pudo cargar las marcaciones de asistencia.");

  const mapaMarcaciones = new Map<string, (typeof marcaciones)[number]>();
  (marcaciones ?? []).forEach((m) => {
    mapaMarcaciones.set(m.usuario_id + "|" + m.fecha, m);
  });

  const mapaFotos = new Map<string, { ingreso: string | null; salida: string | null }>();
  await Promise.all(
    (marcaciones ?? []).map(async (m) => {
      mapaFotos.set(m.usuario_id + "|" + m.fecha, {
        ingreso: await obtenerUrlTemporalFoto(m.foto_ingreso_blob),
        salida: await obtenerUrlTemporalFoto(m.foto_salida_blob),
      });
    })
  );

  // Clima de cada ruta ya asignada, para que el coordinador pueda reconsiderar
  // una asignación si el pronóstico lo amerita — una sola llamada por
  // ubicación única, sin importar cuántas rutas compartan esa tienda.
  const ubicacionesUnicas = new Map<string, { lat: number; lon: number }>();
  filas.forEach((r: any) => {
    const lat = r.tiendas?.lat;
    const lon = r.tiendas?.lon;
    if (lat !== null && lat !== undefined && lon !== null && lon !== undefined) {
      ubicacionesUnicas.set(`${lat},${lon}`, { lat: Number(lat), lon: Number(lon) });
    }
  });

  const climaPorUbicacion = new Map<string, Map<string, ReturnType<typeof resumirClimaDia>>>();
  await Promise.all(
    Array.from(ubicacionesUnicas.entries()).map(async ([clave, { lat, lon }]) => {
      const diario = await obtenerClimaDiario(lat, lon);
      const resumen = new Map<string, ReturnType<typeof resumirClimaDia>>();
      diario.forEach((dia, fecha) => resumen.set(fecha, resumirClimaDia(dia)));
      climaPorUbicacion.set(clave, resumen);
    })
  );

  return Promise.all(
    filas.map(async (r: any) => {
      const marcacion = mapaMarcaciones.get(r.usuario_id + "|" + r.fecha_planificada);
      const lat = r.tiendas?.lat;
      const lon = r.tiendas?.lon;
      const climaMapa =
        lat !== null && lat !== undefined && lon !== null && lon !== undefined
          ? climaPorUbicacion.get(`${lat},${lon}`)
          : undefined;
      const [fotoLlegadaTiendaUrl, fotoSalidaTiendaUrl] = await Promise.all([
        obtenerUrlTemporalFoto(r.foto_llegada_blob),
        obtenerUrlTemporalFoto(r.foto_salida_blob),
      ]);
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
        fotoIngresoUrl: mapaFotos.get(r.usuario_id + "|" + r.fecha_planificada)?.ingreso ?? null,
        fotoSalidaUrl: mapaFotos.get(r.usuario_id + "|" + r.fecha_planificada)?.salida ?? null,
        clima: climaMapa?.get(r.fecha_planificada) ?? null,
        autoasignada: !!r.autoasignada,
        horaLlegadaTienda: r.hora_llegada ?? null,
        ubicacionLlegadaTienda: r.ubicacion_llegada ?? null,
        fotoLlegadaTiendaUrl,
        horaSalidaTienda: r.hora_salida ?? null,
        ubicacionSalidaTienda: r.ubicacion_salida ?? null,
        fotoSalidaTiendaUrl,
      };
    })
  );
}

export type ResultadoAccion = { exito: boolean; mensaje?: string };

export async function asignarRuta(
  _prevState: ResultadoAccion,
  formData: FormData
): Promise<ResultadoAccion> {
  const sesion = await exigirCoordinador();

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

  await notificarPorCorreo(async () => {
    const [contacto, { data: tienda }, { data: colaborador }, responderA] = await Promise.all([
      obtenerContacto(supabase, usuarioId),
      supabase.from("tiendas").select("nombre, direccion, lat, lon").eq("id", tiendaId).maybeSingle(),
      supabase.from("usuarios").select("lat, lon, rol").eq("id", usuarioId).maybeSingle(),
      obtenerReplyTo(supabase, sesion),
    ]);
    if (!contacto?.email) return;

    const tiendaLat = tienda?.lat === null || tienda?.lat === undefined ? null : Number(tienda.lat);
    const tiendaLon = tienda?.lon === null || tienda?.lon === undefined ? null : Number(tienda.lon);

    let climaHtml = "";
    if (tiendaLat !== null && tiendaLon !== null) {
      const diario = await obtenerClimaDiario(tiendaLat, tiendaLon);
      const dia = diario.get(fechaPlanificada);
      if (dia) {
        const resumen = resumirClimaDia(dia);
        climaHtml = `<li><strong>Clima previsto:</strong> ${resumen.icono} ${resumen.descripcion} · ${resumen.tempMax}°/${resumen.tempMin}°${
          resumen.avisoTexto ? ` — ⚠️ ${resumen.avisoTexto}` : ""
        }</li>`;
      }
    }

    let distanciaHtml = "";
    const colabLat = colaborador?.lat === null || colaborador?.lat === undefined ? null : Number(colaborador.lat);
    const colabLon = colaborador?.lon === null || colaborador?.lon === undefined ? null : Number(colaborador.lon);
    if (colabLat !== null && colabLon !== null && tiendaLat !== null && tiendaLon !== null) {
      const ruta = await calcularRutaAuto(colabLat, colabLon, tiendaLat, tiendaLon);
      if (ruta) {
        distanciaHtml = `<li><strong>Distancia desde tu domicilio:</strong> ${ruta.km} km (~${formatearMinutos(
          ruta.minutos
        )} en auto)</li>`;
      }
    }

    const direccionHtml = tienda?.direccion
      ? `<li><strong>Dirección:</strong> ${tienda.direccion}</li>`
      : "";

    const enlaceBitacora = `${URL_APP}/panel/${colaborador?.rol ?? "supervisor"}?seccion=bitacora`;

    await enviarCorreo({
      para: contacto.email,
      tituloEmoji: "📍",
      asunto: `Nueva ruta asignada — ${formatearFechaLegible(fechaPlanificada)}`,
      responderA,
      cuerpoHtml: `
        <p>Hola ${contacto.nombre},</p>
        <p>Se te asignó una nueva ruta:</p>
        <ul style="padding-left:18px; margin:0 0 16px;">
          <li><strong>Tienda:</strong> ${tienda?.nombre ?? "—"}</li>
          <li><strong>Fecha:</strong> ${formatearFechaLegible(fechaPlanificada)}</li>
          ${area ? `<li><strong>Área:</strong> ${area}</li>` : ""}
          ${enfoque ? `<li><strong>Enfoque:</strong> ${enfoque}</li>` : ""}
          ${direccionHtml}
          ${climaHtml}
          ${distanciaHtml}
        </ul>
        <p style="margin:0 0 16px;">
          <a href="${enlaceBitacora}" style="color:#e23744; font-weight:700;">Ir a la Bitácora de Campo →</a>
        </p>
        <p style="color:#8b8d92; font-size:12px;">Asignado por ${sesion.nombre}.</p>
      `,
    });
  });

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
  const sesion = await exigirCoordinador();

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

  await notificarPorCorreo(async () => {
    const [contacto, responderA] = await Promise.all([
      obtenerContacto(supabase, usuarioId),
      obtenerReplyTo(supabase, sesion),
    ]);
    if (!contacto?.email) return;

    await enviarCorreo({
      para: contacto.email,
      tituloEmoji: "🗓️",
      asunto: `${tipo} registrado(a): ${formatearFechaLegible(fechaInicio)} al ${formatearFechaLegible(fechaFin)}`,
      responderA,
      cuerpoHtml: `
        <p>Hola ${contacto.nombre},</p>
        <p>Se registró lo siguiente a tu nombre:</p>
        <ul style="padding-left:18px; margin:0 0 16px;">
          <li><strong>Tipo:</strong> ${tipo}</li>
          <li><strong>Desde:</strong> ${formatearFechaLegible(fechaInicio)}</li>
          <li><strong>Hasta:</strong> ${formatearFechaLegible(fechaFin)}</li>
          ${motivo ? `<li><strong>Motivo:</strong> ${motivo}</li>` : ""}
        </ul>
        <p style="color:#8b8d92; font-size:12px;">Registrado por ${sesion.nombre}.</p>
      `,
    });
  });

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

  await notificarPorCorreo(async () => {
    const [{ data: destinatarios }, responderA] = await Promise.all([
      supabase
        .from("usuarios")
        .select("email")
        .in("rol", ["supervisor", "capacitador"])
        .eq("activo", true)
        .not("email", "is", null),
      obtenerReplyTo(supabase, sesion),
    ]);
    const correos = (destinatarios ?? []).map((u) => u.email).filter((e): e is string => !!e);
    if (correos.length === 0) return;

    await enviarCorreo({
      para: [],
      cco: correos,
      tituloEmoji: "📣",
      asunto: `Nuevo comunicado: ${tipo}`,
      responderA,
      cuerpoHtml: `
        <p>${mensaje}</p>
        ${fechaEvento ? `<p><strong>Fecha del evento:</strong> ${formatearFechaLegible(fechaEvento)}</p>` : ""}
        ${
          ubicacion
            ? `<p><strong>Ubicación:</strong> <a href="${ubicacion}" style="color:#e23744;">Ver en Google Maps</a></p>`
            : ""
        }
        <p style="color:#8b8d92; font-size:12px;">Publicado por ${sesion.nombre}.</p>
      `,
    });
  });

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
  tiendas: { id: string; tiendaId: string; tiendaNombre: string; desde: string }[];
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
      // Solo las vigentes (fecha_fin nula) — las que ya terminaron quedan en
      // la tabla como historial, pero no se muestran aquí como "actuales".
      supabase
        .from("tiendas_permanentes")
        .select("id, usuario_id, tienda_id, created_at, tiendas(nombre)")
        .is("fecha_fin", null),
    ]);

  if (errorUsuarios || errorAsignadas) {
    throw new Error("No se pudo cargar las tiendas permanentes.");
  }

  const porUsuario = new Map<string, SupervisorConTiendas["tiendas"]>();
  (asignadas ?? []).forEach((a: any) => {
    const lista = porUsuario.get(a.usuario_id) ?? [];
    lista.push({
      id: a.id,
      tiendaId: a.tienda_id,
      tiendaNombre: a.tiendas?.nombre ?? "—",
      desde: a.created_at,
    });
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
  const sesion = await exigirCoordinador();
  const supabase = supabaseServer();

  const { data: actuales, error: errorActuales } = await supabase
    .from("tiendas_permanentes")
    .select("id, tienda_id")
    .eq("usuario_id", usuarioId)
    .is("fecha_fin", null);

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

  await notificarPorCorreo(async () => {
    const [contacto, { data: tienda }, responderA] = await Promise.all([
      obtenerContacto(supabase, usuarioId),
      supabase.from("tiendas").select("nombre").eq("id", tiendaId).maybeSingle(),
      obtenerReplyTo(supabase, sesion),
    ]);
    if (!contacto?.email) return;

    await enviarCorreo({
      para: contacto.email,
      tituloEmoji: "🏬",
      asunto: `Tienda permanente asignada: ${tienda?.nombre ?? "—"}`,
      responderA,
      cuerpoHtml: `
        <p>Hola ${contacto.nombre},</p>
        <p>Se te asignó <strong>${tienda?.nombre ?? "una tienda"}</strong> como tienda permanente.</p>
        <p style="color:#8b8d92; font-size:12px;">Asignado por ${sesion.nombre}.</p>
      `,
    });
  });

  return { exito: true };
}

// No borra el registro — le pone fecha de fin. Así, más adelante se puede
// calcular cuánto tiempo estuvo cada persona a cargo de cada tienda, en vez
// de perder ese historial apenas se reasigna a alguien.
export async function eliminarTiendaPermanente(id: string): Promise<ResultadoAccion> {
  await exigirCoordinador();
  const supabase = supabaseServer();
  const { error } = await supabase
    .from("tiendas_permanentes")
    .update({ fecha_fin: hoyPeru() })
    .eq("id", id);
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
  const sesion = await exigirCoordinador();

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

  await notificarPorCorreo(async () => {
    const [contacto, responderA] = await Promise.all([
      obtenerContacto(supabase, usuarioId),
      obtenerReplyTo(supabase, sesion),
    ]);
    if (!contacto?.email) return;

    await enviarCorreo({
      para: contacto.email,
      tituloEmoji: "🛌",
      asunto: "Tu día de descanso semanal fue actualizado",
      responderA,
      cuerpoHtml: `
        <p>Hola ${contacto.nombre},</p>
        <p>Tu día(s) de descanso semanal ahora ${dias.length === 1 ? "es" : "son"}:</p>
        <p style="font-size:16px; font-weight:700;">${
          dias.length > 0 ? dias.join(" y ") : "Sin día de descanso asignado"
        }</p>
        <p style="color:#8b8d92; font-size:12px;">Actualizado por ${sesion.nombre}.</p>
      `,
    });
  });

  return { exito: true };
}

// ---------- Solicitudes de cambio de descanso (campanita) ----------

export type SolicitudDescansoPendiente = {
  id: string;
  usuarioId: string;
  usuarioNombre: string;
  diasActuales: string[];
  diasSolicitados: string[];
  createdAt: string;
};

export async function contarSolicitudesDescansoPendientes(): Promise<number> {
  await exigirCoordinador();
  const supabase = supabaseServer();

  const { count, error } = await supabase
    .from("solicitudes_descanso")
    .select("id", { count: "exact", head: true })
    .eq("estado", "pendiente");

  if (error) return 0;
  return count ?? 0;
}

export async function obtenerSolicitudesDescansoPendientes(): Promise<SolicitudDescansoPendiente[]> {
  await exigirCoordinador();
  const supabase = supabaseServer();

  const { data, error } = await supabase
    .from("solicitudes_descanso")
    .select("id, usuario_id, dias_actuales, dias_solicitados, created_at, usuarios(nombre)")
    .eq("estado", "pendiente")
    .order("created_at", { ascending: true });

  if (error) throw new Error("No se pudo cargar las solicitudes de descanso.");

  return (data ?? []).map((s: any) => ({
    id: s.id,
    usuarioId: s.usuario_id,
    usuarioNombre: s.usuarios?.nombre ?? "—",
    diasActuales: s.dias_actuales ?? [],
    diasSolicitados: s.dias_solicitados ?? [],
    createdAt: s.created_at,
  }));
}

export async function responderSolicitudDescanso(
  id: string,
  aprobar: boolean
): Promise<ResultadoAccion> {
  const sesion = await exigirCoordinador();
  const supabase = supabaseServer();

  const { data: solicitud, error: errorSolicitud } = await supabase
    .from("solicitudes_descanso")
    .select("usuario_id, dias_solicitados, estado")
    .eq("id", id)
    .maybeSingle();

  if (errorSolicitud || !solicitud) {
    return { exito: false, mensaje: "No se encontró la solicitud." };
  }
  if (solicitud.estado !== "pendiente") {
    return { exito: false, mensaje: "Esta solicitud ya fue respondida." };
  }

  if (aprobar) {
    const dias: string[] = solicitud.dias_solicitados ?? [];
    const { error: errorUpdate } = await supabase
      .from("usuarios")
      .update({ dias_descanso: dias.length > 0 ? dias : null })
      .eq("id", solicitud.usuario_id);
    if (errorUpdate) return { exito: false, mensaje: "No se pudo aplicar el nuevo descanso." };
  }

  const { error } = await supabase
    .from("solicitudes_descanso")
    .update({
      estado: aprobar ? "aprobado" : "rechazado",
      respondido_en: new Date().toISOString(),
      respondido_por: sesion.nombre,
    })
    .eq("id", id);

  if (error) return { exito: false, mensaje: "No se pudo guardar la respuesta." };

  await notificarPorCorreo(async () => {
    const contacto = await obtenerContacto(supabase, solicitud.usuario_id);
    if (!contacto?.email) return;

    const dias: string[] = solicitud.dias_solicitados ?? [];
    await enviarCorreo({
      para: contacto.email,
      tituloEmoji: aprobar ? "✅" : "❌",
      asunto: aprobar ? "Tu solicitud de descanso fue aprobada" : "Tu solicitud de descanso fue rechazada",
      cuerpoHtml: `
        <p>Hola ${contacto.nombre},</p>
        <p>Tu solicitud de descanso (${dias.join(" y ") || "sin día"}) fue <strong>${
        aprobar ? "aprobada" : "rechazada"
      }</strong> por ${sesion.nombre}.</p>
      `,
    });
  });

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
      .eq("tienda_id", tiendaId)
      .is("fecha_fin", null),
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
    supabase
      .from("tiendas_permanentes")
      .select("tiendas(nombre)")
      .eq("usuario_id", usuarioId)
      .is("fecha_fin", null),
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
    antiguedad = calcularAntiguedad(fechaIngreso, hoy);
    const [, mIng, dIng] = fechaIngreso.split("-").map(Number);
    proximoAniversario = calcularProximaFechaAnual(mIng, dIng, hoy);
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
