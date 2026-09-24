"use server";

import { supabaseServer } from "@/lib/supabase-server";
import { exigirCoordinador, type SesionUsuario } from "@/lib/session";
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
} from "./constantes";
import { resolverHoraLimite } from "@/lib/puntualidad";
import { obtenerPuntosDeUsuario, type MisPuntos } from "../puntos-actions";
import { obtenerResumenKilometros } from "../kilometros-actions";
import { enviarCorreo, URL_APP, type ContactoCorreo } from "@/lib/email";
import { obtenerClimaDiario, resumirClimaDia, type ResumenClimaDia } from "@/lib/clima";
import { calcularRutaAuto, calcularRutasEnLotes, formatearMinutos } from "@/lib/distancia";
import { cargarHistorialTienda } from "@/lib/historial-tienda";
import { obtenerUrlTemporalFoto } from "@/lib/blob-storage";
import { geocodificarDireccion } from "@/lib/geocodificar";
import {
  cargarVotosEncuestas,
  contarVotos,
  encuestaCerrada,
  estaEnPublicoEncuesta,
  MAX_LARGO_OPCION,
  MAX_LARGO_PREGUNTA,
  MAX_OPCIONES_ENCUESTA,
  MIN_OPCIONES_ENCUESTA,
} from "@/lib/encuestas";


// ---------- Notificaciones por correo ----------
//
// El correo sale siempre del remitente configurado en SENDGRID_FROM_EMAIL (no
// se puede enviar "como si fuera" el Gmail personal del coordinador — los
// proveedores de correo bloquean ese tipo de suplantación). En su lugar, se
// deja al coordinador como "Responder a": si el destinatario responde el
// correo, le escribe directo a él. Un fallo al enviar nunca debe romper la
// acción principal, por eso cada llamado va en su propio try/catch silencioso.

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

async function notificarPorCorreo(tarea: () => Promise<unknown>): Promise<void> {
  try {
    await tarea();
  } catch (error) {
    console.error("No se pudo enviar la notificación por correo:", error);
  }
}

export type UsuarioBasico = { id: string; nombre: string; rol: string; diasDescanso: string[] };
export type TiendaBasica = { id: string; nombre: string };

export async function obtenerUsuariosYTiendas(): Promise<{
  usuarios: UsuarioBasico[];
  tiendas: TiendaBasica[];
}> {
  await exigirCoordinador();
  const supabase = supabaseServer();

  const [{ data: usuarios, error: errorUsuarios }, { data: tiendas, error: errorTiendas }] =
    await Promise.all([
      supabase.from("usuarios").select("id, nombre, rol, dias_descanso").order("nombre"),
      supabase.from("tiendas").select("id, nombre").order("nombre"),
    ]);

  if (errorUsuarios || errorTiendas) {
    throw new Error("No se pudo cargar usuarios y tiendas.");
  }

  return {
    usuarios: (usuarios ?? []).map((u) => ({
      id: u.id,
      nombre: u.nombre,
      rol: u.rol,
      diasDescanso: u.dias_descanso ?? [],
    })),
    tiendas: tiendas ?? [],
  };
}

// ---------- Sugerencias de cercanía (para decidir mejor cada asignación) ----------
//
// El coordinador no siempre sabe qué colaborador vive más cerca de una
// tienda, o qué tiendas le convienen más a un colaborador en particular.
// Reutiliza el mismo motor de distancia real por calles que ya usa el
// contador de kilómetros (OSRM, cacheado 30 días por par de coordenadas).

const MAX_SUGERENCIAS = 8;

export type ColaboradorCercano = {
  usuarioId: string;
  usuarioNombre: string;
  rol: string;
  km: number;
  minutos: number;
};

export async function obtenerColaboradoresCercanos(tiendaId: string): Promise<ColaboradorCercano[]> {
  await exigirCoordinador();
  if (!tiendaId) return [];
  const supabase = supabaseServer();

  const [{ data: tienda, error: errorTienda }, { data: usuarios, error: errorUsuarios }] = await Promise.all([
    supabase.from("tiendas").select("lat, lon").eq("id", tiendaId).maybeSingle(),
    supabase
      .from("usuarios")
      .select("id, nombre, rol, lat, lon")
      .eq("activo", true)
      .in("rol", ROLES_CON_RUTA),
  ]);

  if (errorTienda || errorUsuarios) throw new Error("No se pudo cargar colaboradores cercanos.");
  if (!tienda?.lat || !tienda?.lon) return [];

  const candidatos = (usuarios ?? []).filter((u) => u.lat && u.lon);
  const resultados: ColaboradorCercano[] = [];

  await calcularRutasEnLotes(candidatos, async (u: any) => {
    const ruta = await calcularRutaAuto(Number(u.lat), Number(u.lon), Number(tienda.lat), Number(tienda.lon));
    if (ruta) resultados.push({ usuarioId: u.id, usuarioNombre: u.nombre, rol: u.rol, km: ruta.km, minutos: ruta.minutos });
  });

  return resultados.sort((a, b) => a.km - b.km).slice(0, MAX_SUGERENCIAS);
}

export type DistanciaSeleccion = { km: number; minutos: number };

export async function obtenerDistanciaColaboradorTienda(
  usuarioId: string,
  tiendaId: string
): Promise<DistanciaSeleccion | null> {
  await exigirCoordinador();
  if (!usuarioId || !tiendaId) return null;
  const supabase = supabaseServer();

  const [{ data: usuario, error: errorUsuario }, { data: tienda, error: errorTienda }] = await Promise.all([
    supabase.from("usuarios").select("lat, lon").eq("id", usuarioId).maybeSingle(),
    supabase.from("tiendas").select("lat, lon").eq("id", tiendaId).maybeSingle(),
  ]);

  if (errorUsuario || errorTienda) throw new Error("No se pudo calcular la distancia.");
  if (!usuario?.lat || !usuario?.lon || !tienda?.lat || !tienda?.lon) return null;

  return calcularRutaAuto(Number(usuario.lat), Number(usuario.lon), Number(tienda.lat), Number(tienda.lon));
}

export type TiendaCercana = { tiendaId: string; tiendaNombre: string; km: number; minutos: number };

export async function obtenerTiendasCercanas(usuarioId: string): Promise<TiendaCercana[]> {
  await exigirCoordinador();
  if (!usuarioId) return [];
  const supabase = supabaseServer();

  const [{ data: usuario, error: errorUsuario }, { data: tiendas, error: errorTiendas }] = await Promise.all([
    supabase.from("usuarios").select("lat, lon").eq("id", usuarioId).maybeSingle(),
    supabase.from("tiendas").select("id, nombre, lat, lon"),
  ]);

  if (errorUsuario || errorTiendas) throw new Error("No se pudo cargar tiendas cercanas.");
  if (!usuario?.lat || !usuario?.lon) return [];

  const candidatas = (tiendas ?? []).filter((t) => t.lat && t.lon);
  const resultados: TiendaCercana[] = [];

  await calcularRutasEnLotes(candidatas, async (t: any) => {
    const ruta = await calcularRutaAuto(Number(usuario.lat), Number(usuario.lon), Number(t.lat), Number(t.lon));
    if (ruta) resultados.push({ tiendaId: t.id, tiendaNombre: t.nombre, km: ruta.km, minutos: ruta.minutos });
  });

  return resultados.sort((a, b) => a.km - b.km).slice(0, MAX_SUGERENCIAS);
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
      "id, fecha_planificada, area, enfoque, autoasignada, usuario_id, tienda_id, hora_llegada, ubicacion_llegada, foto_llegada_blob, hora_salida, ubicacion_salida, foto_salida_blob, usuarios(nombre, activo), tiendas!tienda_id(nombre, lat, lon)"
    )
    .gte("fecha_planificada", hoyPeru())
    .order("fecha_planificada", { ascending: true });

  if (error) throw new Error("No se pudo cargar las rutas activas.");

  // Al dar de baja a alguien, sus rutas pendientes quedaban para siempre en
  // esta cola aunque ya no pueda entrar a reportarlas. No se borran (si se
  // reactiva, vuelven a aparecer solas), solo dejan de ensuciar el trabajo
  // del día. Se filtra acá y no en la consulta para no estrenar un join
  // "!inner" —sintaxis que no se usa en ninguna otra parte del proyecto—
  // justo en la pantalla principal del coordinador.
  const filas = (data ?? []).filter((r: any) => r.usuarios?.activo !== false);
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

  await notificarPorCorreo(() =>
    enviarCorreoNuevaRuta(supabase, sesion, usuarioId, tiendaId, fechaPlanificada, area || null, enfoque || null)
  );

  return { exito: true, mensaje: "Ruta asignada correctamente." };
}

type ResultadoEnvioRuta = { enviado: boolean; motivo?: string };

// Extraído de asignarRuta() para poder reutilizarlo también desde
// reenviarCorreoRuta() (botón "Reenviar correo" en la lista de rutas
// activas) cuando el correo original no le llegó a la persona.
async function enviarCorreoNuevaRuta(
  supabase: ReturnType<typeof supabaseServer>,
  sesion: SesionUsuario,
  usuarioId: string,
  tiendaId: string,
  fechaPlanificada: string,
  area: string | null,
  enfoque: string | null
): Promise<ResultadoEnvioRuta> {
  const [contacto, { data: tienda }, { data: colaborador }, responderA] = await Promise.all([
    obtenerContacto(supabase, usuarioId),
    supabase.from("tiendas").select("nombre, direccion, lat, lon, es_provincia").eq("id", tiendaId).maybeSingle(),
    supabase
      .from("usuarios")
      .select("lat, lon, rol, hora_limite_ingreso, horario_por_dia")
      .eq("id", usuarioId)
      .maybeSingle(),
    obtenerReplyTo(supabase, sesion),
  ]);
  if (!contacto?.email) return { enviado: false, motivo: "Esa persona no tiene un correo registrado." };

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
  if (tienda?.es_provincia) {
    // Tienda de provincia: se viaja en avión y se hospeda cerca de la sede,
    // así que una distancia en auto desde el domicilio en Lima no tiene
    // sentido (y de paso ahorra la consulta a Mapbox).
    distanciaHtml = `<li>🏆 <strong>Tienda de provincia</strong> — viaje aéreo, no aplica cálculo de distancia en auto.</li>`;
  } else if (colabLat !== null && colabLon !== null && tiendaLat !== null && tiendaLon !== null) {
    // El tráfico se predice para la hora en que la persona debería estar
    // saliendo de casa (su hora límite de ingreso ese día), no para el
    // momento en que el coordinador asigna la ruta — si no, una ruta
    // asignada de noche para mañana en la mañana saldría con el tráfico
    // (casi nulo) de esa misma noche.
    const diaSemanaRuta = diaSemanaPeru(fechaPlanificada);
    const horaLimiteRuta = resolverHoraLimite(
      colaborador?.rol ?? "supervisor",
      colaborador?.hora_limite_ingreso,
      colaborador?.horario_por_dia as Record<string, string> | null,
      diaSemanaRuta
    );
    const horaSalida = horaLimiteRuta ? new Date(`${fechaPlanificada}T${horaLimiteRuta}-05:00`) : undefined;

    const ruta = await calcularRutaAuto(colabLat, colabLon, tiendaLat, tiendaLon, horaSalida);
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

  const resultado = await enviarCorreo({
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

  return resultado.exito
    ? { enviado: true }
    : { enviado: false, motivo: "El envío falló — revisa Historial de cambios en Registro." };
}

// Reenvía el correo de "Nueva ruta asignada" sin volver a crear la
// asignación — para cuando a alguien no le llegó (buzón lleno, filtro de
// spam, etc.) y no hace falta reasignarle la ruta.
export async function reenviarCorreoRuta(rutaActivaId: string): Promise<ResultadoAccion> {
  const sesion = await exigirCoordinador();
  const supabase = supabaseServer();

  const { data: ruta, error } = await supabase
    .from("rutas_activas")
    .select("usuario_id, tienda_id, fecha_planificada, area, enfoque")
    .eq("id", rutaActivaId)
    .maybeSingle();

  if (error || !ruta) return { exito: false, mensaje: "No se encontró la ruta." };

  const resultado = await enviarCorreoNuevaRuta(
    supabase,
    sesion,
    ruta.usuario_id,
    ruta.tienda_id,
    ruta.fecha_planificada,
    ruta.area,
    ruta.enfoque
  );

  return resultado.enviado
    ? { exito: true, mensaje: "Correo reenviado correctamente." }
    : { exito: false, mensaje: resultado.motivo || "No se pudo reenviar el correo." };
}

// Avisa por correo que una ruta ya no vale -- para que quien la tenía
// asignada no se guíe por el correo viejo de "Nueva ruta asignada" cuando
// se le cambia a último momento (ver eliminarRutaActiva).
async function enviarCorreoRutaCancelada(
  supabase: ReturnType<typeof supabaseServer>,
  sesion: SesionUsuario,
  usuarioId: string,
  tiendaId: string,
  fechaPlanificada: string
): Promise<void> {
  const [contacto, { data: tienda }, { data: colaborador }, responderA] = await Promise.all([
    obtenerContacto(supabase, usuarioId),
    supabase.from("tiendas").select("nombre").eq("id", tiendaId).maybeSingle(),
    supabase.from("usuarios").select("rol").eq("id", usuarioId).maybeSingle(),
    obtenerReplyTo(supabase, sesion),
  ]);
  if (!contacto?.email) return;

  const enlaceBitacora = `${URL_APP}/panel/${colaborador?.rol ?? "supervisor"}?seccion=bitacora`;

  await enviarCorreo({
    para: contacto.email,
    tituloEmoji: "🚫",
    asunto: `Ruta cancelada — ${formatearFechaLegible(fechaPlanificada)}`,
    responderA,
    cuerpoHtml: `
      <p>Hola ${contacto.nombre},</p>
      <p>Tu ruta del <strong>${formatearFechaLegible(fechaPlanificada)}</strong> a <strong>${
      tienda?.nombre ?? "—"
    }</strong> fue cancelada.</p>
      <p style="margin:0 0 16px;">Si tienes otro correo de una ruta asignada para ese mismo día, ese es el que vale ahora — revisa la app para confirmar tu ruta actualizada.</p>
      <p style="margin:0 0 16px;">
        <a href="${enlaceBitacora}" style="color:#e23744; font-weight:700;">Ir a la Bitácora de Campo →</a>
      </p>
      <p style="color:#8b8d92; font-size:12px;">Cancelado por ${sesion.nombre}.</p>
    `,
  });
}

export async function eliminarRutaActiva(id: string): Promise<ResultadoAccion> {
  const sesion = await exigirCoordinador();
  const supabase = supabaseServer();

  const { data: ruta } = await supabase
    .from("rutas_activas")
    .select("usuario_id, tienda_id, fecha_planificada")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase.from("rutas_activas").delete().eq("id", id);
  if (error) return { exito: false, mensaje: "No se pudo cancelar la ruta." };

  if (ruta) {
    await notificarPorCorreo(() =>
      enviarCorreoRutaCancelada(supabase, sesion, ruta.usuario_id, ruta.tienda_id, ruta.fecha_planificada)
    );
  }

  return { exito: true };
}

// ---------- Asignaciones especiales ----------

export type TipoAsignacionEspecial =
  | "Vacaciones"
  | "Permiso"
  | "Descanso Semanal"
  | "Licencia"
  | "Misión Especial";

export type AsignacionEspecial = {
  id: string;
  usuarioId: string;
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
    .select("id, usuario_id, tipo, fecha_inicio, fecha_fin, motivo, usuarios(nombre)")
    .gte("fecha_fin", hoyPeru())
    .order("fecha_inicio", { ascending: true });

  if (error) throw new Error("No se pudo cargar las asignaciones especiales.");

  return (data ?? []).map((a: any) => ({
    id: a.id,
    usuarioId: a.usuario_id,
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
  // null/vacío = sin restricción, visible para todos.
  usuariosDestino: string[] | null;
  // null = anuncio normal.
  encuesta: ResultadosEncuesta | null;
};

export type ResultadosEncuesta = {
  opciones: string[];
  multiple: boolean;
  anonima: boolean;
  cierra: string | null;
  cerrada: boolean;
  conteos: number[];
  votantes: number;
  // Tamaño del público de la encuesta (activos a los que les llega).
  publico: number;
  // Nombres de quienes todavía no votan.
  pendientes: string[];
  // Nombres por opción — null si la encuesta es anónima.
  nombresPorOpcion: string[][] | null;
};

export async function obtenerComunicados(): Promise<Comunicado[]> {
  await exigirCoordinador();
  const supabase = supabaseServer();
  const hoy = hoyPeru();

  const { data, error } = await supabase
    .from("comunicados")
    .select(
      "id, fecha, tipo, mensaje, autor, fecha_evento, ubicacion, usuarios_destino, encuesta_opciones, encuesta_multiple, encuesta_anonima, encuesta_cierra"
    )
    .order("fecha", { ascending: false });

  if (error) throw new Error("No se pudo cargar los anuncios.");

  const encuestas = (data ?? []).filter((c) => c.encuesta_opciones);
  const [votos, { data: activos }] = await Promise.all([
    cargarVotosEncuestas(
      supabase,
      encuestas.map((c) => c.id)
    ),
    encuestas.length > 0
      ? supabase.from("usuarios").select("id, nombre, rol").eq("activo", true).order("nombre")
      : Promise.resolve({ data: [] as { id: string; nombre: string; rol: string }[] }),
  ]);
  const nombrePorId = new Map((activos ?? []).map((u) => [u.id, u.nombre]));

  return (data ?? []).map((c) => {
    let encuesta: ResultadosEncuesta | null = null;
    if (c.encuesta_opciones) {
      const votosDeEsta = votos.filter((v) => v.comunicado_id === c.id);
      const { conteos, votantes, votantesIds } = contarVotos(c.encuesta_opciones.length, votosDeEsta);
      const publico = (activos ?? []).filter((u) => estaEnPublicoEncuesta(u, c.usuarios_destino));
      encuesta = {
        opciones: c.encuesta_opciones,
        multiple: c.encuesta_multiple,
        anonima: c.encuesta_anonima,
        cierra: c.encuesta_cierra,
        cerrada: encuestaCerrada(c.encuesta_cierra, hoy),
        conteos,
        votantes,
        publico: publico.length,
        pendientes: publico.filter((u) => !votantesIds.has(u.id)).map((u) => u.nombre),
        nombresPorOpcion: c.encuesta_anonima
          ? null
          : c.encuesta_opciones.map((_, i) =>
              votosDeEsta
                .filter((v) => v.opcion === i)
                .map((v) => nombrePorId.get(v.usuario_id) ?? "Ex colaborador")
            ),
      };
    }

    return {
      id: c.id,
      fecha: c.fecha,
      tipo: c.tipo,
      mensaje: c.mensaje,
      autor: c.autor,
      fechaEvento: c.fecha_evento,
      ubicacion: c.ubicacion,
      vigente: (!c.fecha_evento || c.fecha_evento >= hoy) && !encuesta?.cerrada,
      usuariosDestino: c.usuarios_destino,
      encuesta,
    };
  });
}

function escaparHtml(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Encuesta rápida: la pregunta va en `mensaje` y el tipo queda fijo en
// "Encuesta", así el resto de la app (correo, listados) la trata como un
// anuncio más. No lleva fecha de evento ni ubicación, para que no aparezca
// en el calendario ni pida marcar asistencia.
async function crearEncuesta(sesion: SesionUsuario, formData: FormData): Promise<ResultadoAccion> {
  const pregunta = String(formData.get("mensaje") || "").trim();
  const opciones = formData
    .getAll("opcion")
    .map((o) => String(o).trim())
    .filter(Boolean);
  const anonima = formData.get("anonima") === "on";
  const multiple = formData.get("multiple") === "on";
  const cierra = String(formData.get("encuestaCierra") || "").trim();
  const usuariosDestino = formData.getAll("usuariosDestino").map(String).filter(Boolean);
  const hoy = hoyPeru();

  if (!pregunta) return { exito: false, mensaje: "Escribe la pregunta de la encuesta." };
  if (pregunta.length > MAX_LARGO_PREGUNTA) {
    return { exito: false, mensaje: `La pregunta puede tener hasta ${MAX_LARGO_PREGUNTA} caracteres.` };
  }
  if (opciones.length < MIN_OPCIONES_ENCUESTA || opciones.length > MAX_OPCIONES_ENCUESTA) {
    return {
      exito: false,
      mensaje: `La encuesta necesita entre ${MIN_OPCIONES_ENCUESTA} y ${MAX_OPCIONES_ENCUESTA} opciones.`,
    };
  }
  if (opciones.some((o) => o.length > MAX_LARGO_OPCION)) {
    return { exito: false, mensaje: `Cada opción puede tener hasta ${MAX_LARGO_OPCION} caracteres.` };
  }
  if (new Set(opciones.map((o) => o.toLowerCase())).size !== opciones.length) {
    return { exito: false, mensaje: "Hay dos opciones iguales." };
  }
  if (cierra && (!/^\d{4}-\d{2}-\d{2}$/.test(cierra) || cierra < hoy)) {
    return { exito: false, mensaje: "La fecha de cierre no puede ser anterior a hoy." };
  }

  const supabase = supabaseServer();
  const { error } = await supabase.from("comunicados").insert({
    fecha: hoy,
    tipo: "Encuesta",
    mensaje: pregunta,
    autor: sesion.nombre,
    usuarios_destino: usuariosDestino.length > 0 ? usuariosDestino : null,
    encuesta_opciones: opciones,
    encuesta_anonima: anonima,
    encuesta_multiple: multiple,
    encuesta_cierra: cierra || null,
  });

  if (error) return { exito: false, mensaje: "No se pudo publicar la encuesta." };

  await notificarPorCorreo(async () => {
    let consultaDestinatarios = supabase
      .from("usuarios")
      .select("email")
      .eq("activo", true)
      .not("email", "is", null);
    consultaDestinatarios =
      usuariosDestino.length > 0
        ? consultaDestinatarios.in("id", usuariosDestino)
        : consultaDestinatarios.in("rol", ["supervisor", "capacitador"]);

    const [{ data: destinatarios }, responderA] = await Promise.all([
      consultaDestinatarios,
      obtenerReplyTo(supabase, sesion),
    ]);
    const correos = (destinatarios ?? []).map((u) => u.email).filter((e): e is string => !!e);
    if (correos.length === 0) return;

    await enviarCorreo({
      para: [],
      cco: correos,
      tituloEmoji: "📊",
      asunto: "Nueva encuesta para el equipo",
      responderA,
      cuerpoHtml: `
        <p><strong>${escaparHtml(pregunta)}</strong></p>
        <ul>${opciones.map((o) => `<li>${escaparHtml(o)}</li>`).join("")}</ul>
        ${cierra ? `<p>Puedes votar hasta el <strong>${formatearFechaLegible(cierra)}</strong>.</p>` : ""}
        <p><a href="${URL_APP}" style="color:#e23744;">Responde en la Agenda Operativa</a>, en el apartado Anuncios.</p>
        <p style="color:#8b8d92; font-size:12px;">Publicado por ${escaparHtml(sesion.nombre)}${
          anonima ? " · Encuesta anónima" : ""
        }.</p>
      `,
    });
  });

  return { exito: true, mensaje: "Encuesta publicada correctamente." };
}

// Cierra la encuesta hoy mismo: el cierre es "último día para votar", así
// que se pone ayer.
export async function cerrarEncuesta(id: string): Promise<ResultadoAccion> {
  await exigirCoordinador();
  const supabase = supabaseServer();
  const { error } = await supabase
    .from("comunicados")
    .update({ encuesta_cierra: sumarDias(hoyPeru(), -1) })
    .eq("id", id)
    .not("encuesta_opciones", "is", null);
  if (error) return { exito: false, mensaje: "No se pudo cerrar la encuesta." };
  return { exito: true };
}

export async function crearComunicado(
  _prevState: ResultadoAccion,
  formData: FormData
): Promise<ResultadoAccion> {
  const sesion = await exigirCoordinador();

  if (formData.get("esEncuesta") === "1") return crearEncuesta(sesion, formData);

  const tipo = String(formData.get("tipo") || "").trim();
  const mensaje = String(formData.get("mensaje") || "").trim();
  const fechaEvento = String(formData.get("fechaEvento") || "").trim();
  const ubicacion = String(formData.get("ubicacion") || "").trim();
  const usuariosDestino = formData.getAll("usuariosDestino").map(String).filter(Boolean);

  if (!tipo || !mensaje) {
    return { exito: false, mensaje: "Completa el tipo y el mensaje del anuncio." };
  }

  // Geocodificar la ubicación (si se dio) para poder mostrar el evento en el
  // mapa y, sobre todo, para que la tarjeta de "marcar entrada/salida al
  // evento" (ver app/panel/eventos-hoy.tsx) pueda sumar kilómetros — si
  // falla, el anuncio igual se publica, solo sin coordenadas.
  let lat: number | null = null;
  let lon: number | null = null;
  if (ubicacion) {
    const resultado = await geocodificarDireccion(ubicacion);
    if (resultado) {
      lat = resultado.lat;
      lon = resultado.lon;
    }
  }

  const supabase = supabaseServer();
  const { error } = await supabase.from("comunicados").insert({
    fecha: hoyPeru(),
    tipo,
    mensaje,
    autor: sesion.nombre,
    fecha_evento: fechaEvento || null,
    ubicacion: ubicacion || null,
    lat,
    lon,
    usuarios_destino: usuariosDestino.length > 0 ? usuariosDestino : null,
  });

  if (error) return { exito: false, mensaje: "No se pudo publicar el anuncio." };

  await notificarPorCorreo(async () => {
    let consultaDestinatarios = supabase
      .from("usuarios")
      .select("email")
      .eq("activo", true)
      .not("email", "is", null);

    // Sin destinatarios específicos: el público de siempre (supervisores y
    // capacitadores). Con destinatarios elegidos, solo a esas personas —
    // sin importar su rol, por si algún día se elige a alguien más.
    consultaDestinatarios =
      usuariosDestino.length > 0
        ? consultaDestinatarios.in("id", usuariosDestino)
        : consultaDestinatarios.in("rol", ["supervisor", "capacitador"]);

    const [{ data: destinatarios }, responderA] = await Promise.all([
      consultaDestinatarios,
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
      "id, fecha, rol, observacion, actividad, respuesta, respuesta_por, usuarios(nombre), tiendas!tienda_id(nombre)"
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
  fechaDeseada: string | null;
  motivo: string | null;
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
    .select("id, usuario_id, dias_actuales, dias_solicitados, fecha_deseada, motivo, created_at, usuarios(nombre)")
    .eq("estado", "pendiente")
    .order("created_at", { ascending: true });

  if (error) throw new Error("No se pudo cargar las solicitudes de descanso.");

  return (data ?? []).map((s: any) => ({
    id: s.id,
    usuarioId: s.usuario_id,
    usuarioNombre: s.usuarios?.nombre ?? "—",
    diasActuales: s.dias_actuales ?? [],
    diasSolicitados: s.dias_solicitados ?? [],
    fechaDeseada: s.fecha_deseada,
    motivo: s.motivo,
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

// ---------- Solicitudes de permiso anticipado ----------
//
// Mismo patrón que las de descanso: el colaborador pide, el coordinador
// aprueba o rechaza desde la campanita. A diferencia del descanso (que
// actualiza usuarios.dias_descanso), aprobar un permiso crea una fila en
// asignaciones_especiales (tipo "Permiso") — así hereda gratis todo lo que
// ya existe para esas asignaciones (advertencia al asignar rutas, "estado
// del personal hoy", calendario, etc.).

export type SolicitudPermisoPendiente = {
  id: string;
  usuarioId: string;
  usuarioNombre: string;
  tipo: string;
  fechaInicio: string;
  fechaFin: string;
  motivo: string | null;
  createdAt: string;
};

export async function contarSolicitudesPermisoPendientes(): Promise<number> {
  await exigirCoordinador();
  const supabase = supabaseServer();

  const { count, error } = await supabase
    .from("solicitudes_permiso")
    .select("id", { count: "exact", head: true })
    .eq("estado", "pendiente");

  if (error) return 0;
  return count ?? 0;
}

export async function obtenerSolicitudesPermisoPendientes(): Promise<SolicitudPermisoPendiente[]> {
  await exigirCoordinador();
  const supabase = supabaseServer();

  const { data, error } = await supabase
    .from("solicitudes_permiso")
    .select("id, usuario_id, fecha_inicio, fecha_fin, motivo, tipo, created_at, usuarios(nombre)")
    .eq("estado", "pendiente")
    .order("created_at", { ascending: true });

  if (error) throw new Error("No se pudo cargar las solicitudes de permiso.");

  return (data ?? []).map((s: any) => ({
    id: s.id,
    usuarioId: s.usuario_id,
    usuarioNombre: s.usuarios?.nombre ?? "—",
    tipo: s.tipo ?? "Permiso",
    fechaInicio: s.fecha_inicio,
    fechaFin: s.fecha_fin,
    motivo: s.motivo,
    createdAt: s.created_at,
  }));
}

export async function responderSolicitudPermiso(
  id: string,
  aprobar: boolean
): Promise<ResultadoAccion> {
  const sesion = await exigirCoordinador();
  const supabase = supabaseServer();

  const { data: solicitud, error: errorSolicitud } = await supabase
    .from("solicitudes_permiso")
    .select("usuario_id, fecha_inicio, fecha_fin, motivo, estado, tipo")
    .eq("id", id)
    .maybeSingle();

  if (errorSolicitud || !solicitud) {
    return { exito: false, mensaje: "No se encontró la solicitud." };
  }
  if (solicitud.estado !== "pendiente") {
    return { exito: false, mensaje: "Esta solicitud ya fue respondida." };
  }

  const tipoSolicitud = solicitud.tipo ?? "Permiso";
  const esVacaciones = tipoSolicitud === "Vacaciones";

  if (aprobar) {
    const { error: errorAsignacion } = await supabase.from("asignaciones_especiales").insert({
      usuario_id: solicitud.usuario_id,
      tipo: tipoSolicitud,
      fecha_inicio: solicitud.fecha_inicio,
      fecha_fin: solicitud.fecha_fin,
      motivo: solicitud.motivo,
    });
    if (errorAsignacion)
      return { exito: false, mensaje: `No se pudo registrar ${esVacaciones ? "las vacaciones" : "el permiso"}.` };
  }

  const { error } = await supabase
    .from("solicitudes_permiso")
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

    const etiqueta = esVacaciones ? "vacaciones" : "permiso";
    await enviarCorreo({
      para: contacto.email,
      tituloEmoji: aprobar ? "✅" : "❌",
      asunto: aprobar ? `Tu solicitud de ${etiqueta} fue aprobada` : `Tu solicitud de ${etiqueta} fue rechazada`,
      cuerpoHtml: `
        <p>Hola ${contacto.nombre},</p>
        <p>Tu solicitud de ${etiqueta} (${formatearFechaLegible(solicitud.fecha_inicio)} → ${formatearFechaLegible(
        solicitud.fecha_fin
      )}) fue <strong>${aprobar ? "aprobada" : "rechazada"}</strong> por ${sesion.nombre}.</p>
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
  estado: "DESCANSO_SEMANAL" | "VACACIONES" | "PERMISO" | "LICENCIA" | "MISION_ESPECIAL" | null;
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
    "Descanso Semanal": "DESCANSO_SEMANAL",
    Licencia: "LICENCIA",
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
  return cargarHistorialTienda(tiendaId, desde, hasta);
}

// ---------- Historial por persona ----------

export type TiendaVisitada = { fecha: string; tiendaNombre: string; observacion: string };

export type MarcacionPersona = {
  fecha: string;
  horaIngreso: string | null;
  horaSalida: string | null;
  tarde: boolean;
};

export type KilometrosPorTienda = { tiendaNombre: string; km: number; minutos: number; visitas: number };
export type AsignacionEspecialInfo = {
  tipo: string;
  fechaInicio: string;
  fechaFin: string;
  motivo: string | null;
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
  totalKm: number;
  totalMinutos: number;
  kmPorTienda: KilometrosPorTienda[];
  rachaActual: number;
  autoasignaciones: number;
  asignacionesEspeciales: AsignacionEspecialInfo[];
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
    kilometros,
    { count: autoasignaciones, error: errorAutoasignaciones },
    { data: asignacionesEspecialesRaw, error: errorAsignacionesEspeciales },
  ] = await Promise.all([
    supabase
      .from("usuarios")
      .select(
        "nombre, rol, dias_descanso, fecha_ingreso, fecha_nacimiento, hora_limite_ingreso, horario_por_dia"
      )
      .eq("id", usuarioId)
      .maybeSingle(),
    supabase
      .from("rutas_diarias")
      .select("fecha, observacion, tiendas!tienda_id(nombre)")
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
    obtenerResumenKilometros(desde, hasta, usuarioId),
    supabase
      .from("rutas_diarias")
      .select("id", { count: "exact", head: true })
      .eq("usuario_id", usuarioId)
      .not("origen_tienda_id", "is", null)
      .gte("fecha", desde)
      .lte("fecha", hasta),
    supabase
      .from("asignaciones_especiales")
      .select("tipo, fecha_inicio, fecha_fin, motivo")
      .eq("usuario_id", usuarioId)
      .lte("fecha_inicio", hasta)
      .gte("fecha_fin", desde)
      .order("fecha_inicio", { ascending: true }),
  ]);

  if (
    errorUsuario ||
    errorRutas ||
    errorMarcaciones ||
    errorPermanentes ||
    errorAutoasignaciones ||
    errorAsignacionesEspeciales
  ) {
    throw new Error("No se pudo cargar el historial de la persona.");
  }

  const rol = usuario?.rol ?? "";
  const horarioPorDia = (usuario?.horario_por_dia as Record<string, string> | null) ?? null;
  function limiteDe(fecha: string): string | undefined {
    return resolverHoraLimite(rol, usuario?.hora_limite_ingreso, horarioPorDia, diaSemanaPeru(fecha));
  }
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
    marcaciones: (marcaciones ?? []).map((m) => {
      const limite = limiteDe(m.fecha);
      return {
        fecha: m.fecha,
        horaIngreso: m.hora_ingreso,
        horaSalida: m.hora_salida,
        tarde: !!(limite && m.hora_ingreso && m.hora_ingreso > limite),
      };
    }),
    puntos,
    tiendasPermanentes: (permanentes ?? []).map((p: any) => p.tiendas?.nombre ?? "—"),
    diasDescanso,
    fechasDescansoEnRango,
    antiguedad,
    proximoAniversario,
    proximoCumpleanos,
    totalKm: kilometros.filas[0]?.totalKm ?? 0,
    totalMinutos: kilometros.filas[0]?.totalMinutos ?? 0,
    kmPorTienda: kilometros.detalle.map((d) => ({
      tiendaNombre: d.origenNombre ? `${d.origenNombre} -> ${d.tiendaNombre}` : d.tiendaNombre,
      km: d.kmAcumulado,
      minutos: d.minutos * d.visitas,
      visitas: d.visitas,
    })),
    rachaActual: puntos.rachaActual,
    autoasignaciones: autoasignaciones ?? 0,
    asignacionesEspeciales: (asignacionesEspecialesRaw ?? []).map((a) => ({
      tipo: a.tipo,
      fechaInicio: a.fecha_inicio,
      fechaFin: a.fecha_fin,
      motivo: a.motivo ?? null,
    })),
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
    .select(
      "fecha, hora_ingreso, ubicacion_ingreso, hora_salida, ubicacion_salida, usuarios(nombre, rol, hora_limite_ingreso, horario_por_dia)"
    )
    .gte("fecha", desde)
    .lte("fecha", hasta)
    .order("fecha", { ascending: false });

  if (error) throw new Error("No se pudo cargar la asistencia general.");

  return (data ?? []).map((a: any) => {
    const rol = a.usuarios?.rol ?? "";
    const limite = resolverHoraLimite(
      rol,
      a.usuarios?.hora_limite_ingreso,
      a.usuarios?.horario_por_dia,
      diaSemanaPeru(a.fecha)
    );
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

// El ranking de tiendas visitadas (antes duplicado acá y en Central
// Analítica → Tiendas, cada uno con su propio selector de fechas) vive
// ahora solo en app/panel/analitica/actions.ts — ver obtenerRankingTiendasCompleto
// allá.
