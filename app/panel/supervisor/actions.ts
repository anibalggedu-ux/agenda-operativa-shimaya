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
  formatearFechaLegible,
} from "@/lib/fechas";
import { MAX_DIAS_DESCANSO } from "../coordinador/constantes";
import { obtenerClimaDiario, resumirClimaDia, type ResumenClimaDia } from "@/lib/clima";
import { enviarCorreo, URL_APP } from "@/lib/email";
import { obtenerUrlTemporalFoto, subirFotoMarcacion } from "@/lib/blob-storage";
import { calcularRutaAuto, calcularRutasEnLotes } from "@/lib/distancia";
import { resolverHoraMarcacion } from "@/lib/marcacion-offline";

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
  // false = pasaron 48h desde que el coordinador asignó esta ruta sin que se
  // enviara el reporte — la tarjeta se queda solo de lectura (para saber qué
  // tienda tenía asignada), pero ya no se puede reportar ni marcar llegada.
  puedeReportar: boolean;
  // Marcación de llegada/salida a esta tienda en particular (distinta de la
  // marcación general de asistencia del día) — con foto y ubicación.
  horaLlegada: string | null;
  ubicacionLlegada: string | null;
  fotoLlegadaUrl: string | null;
  horaSalidaTienda: string | null;
  ubicacionSalidaTienda: string | null;
  fotoSalidaTiendaUrl: string | null;
  // Tiempo/distancia estimados en auto desde el domicilio del colaborador
  // (con tráfico en tiempo real, vía Mapbox) -- solo se calcula para HOY, y
  // null si falta la dirección del colaborador o de la tienda, o si Mapbox
  // no respondió. Los enlaces sirven igual aunque no haya ETA (usan el
  // nombre de la tienda como respaldo si no hay coordenadas).
  etaMinutos: number | null;
  etaKm: number | null;
  googleMapsUrl: string;
  wazeUrl: string;
  // Coordenadas de la tienda (null si no las tiene cargadas) — se usan en
  // el celular para avisar si el GPS de una marcación de llegada/salida
  // quedó lejos de acá (ver TrazoCheckDorado/aviso en selector-tiendas.tsx).
  tiendaLat: number | null;
  tiendaLon: number | null;
};

function clasificarUrgencia(fecha: string, hoy: string, manana: string, ayer: string): Urgencia {
  if (fecha === hoy) return "HOY";
  if (fecha === manana) return "MANANA";
  if (fecha === ayer) return "AYER";
  return "ANTES_DE_AYER";
}

// Enlaces para abrir la navegación en la app elegida, con la ruta trazada
// desde la ubicación actual del celular (ninguna de las dos requiere API key,
// son enlaces públicos que cada app resuelve por su cuenta). Si la tienda no
// tiene coordenadas cargadas, se cae a buscar por nombre en vez de no
// mostrar nada.
function construirUrlGoogleMaps(lat: number | null, lon: number | null, tiendaNombre: string): string {
  const destino = lat !== null && lon !== null ? `${lat},${lon}` : tiendaNombre;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destino)}&travelmode=driving`;
}

function construirUrlWaze(lat: number | null, lon: number | null, tiendaNombre: string): string {
  if (lat !== null && lon !== null) {
    return `https://waze.com/ul?ll=${lat}%2C${lon}&navigate=yes`;
  }
  return `https://waze.com/ul?q=${encodeURIComponent(tiendaNombre)}&navigate=yes`;
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
  // OJO: acá va hoyPeru() (fecha calendario), NO diaLaboralPeru(). Esta
  // clasificación decide en qué columna (HOY/MAÑANA/AYER) aparece una tienda
  // ya planificada — y una ruta planificada para el 14 debe verse como "HOY"
  // durante TODO el 14, incluida la madrugada, no recién desde las 6am.
  // El corte de madrugada (diaLaboralPeru) es solo para decidir a qué turno
  // pertenece una MARCACIÓN que se hace entre medianoche y las 6am — eso
  // sigue aplicando más abajo, en autoasignarTienda/enviarReporte/
  // sincronizarAsistenciaGeneral. Mezclar ambos acá hacía que una ruta
  // recién asignada para hoy apareciera como "Mañana" si alguien la miraba
  // antes de las 6am.
  const hoy = hoyPeru();
  const manana = sumarDias(hoy, 1);
  const ayer = sumarDias(hoy, -1);
  const desdeVentana = sumarDias(hoy, -3); // margen de sobra para cubrir la ventana de 48h

  const [
    { data: usuario },
    { data: activas, error: errorActivas },
    { data: reportes, error: errorReportes },
  ] = await Promise.all([
    supabase.from("usuarios").select("dias_descanso, lat, lon").eq("id", sesion.id).maybeSingle(),
    supabase
      .from("rutas_activas")
      .select(
        "id, fecha_planificada, area, enfoque, autoasignada, created_at, hora_llegada, ubicacion_llegada, foto_llegada_blob, hora_salida, ubicacion_salida, foto_salida_blob, tiendas!tienda_id(id, nombre, lat, lon)"
      )
      .eq("usuario_id", sesion.id)
      .order("fecha_planificada", { ascending: false }),
    supabase
      .from("rutas_diarias")
      .select(
        "id, fecha, observacion, actividad, asignado_en, created_at, tienda_id, hora_llegada, ubicacion_llegada, foto_llegada_blob, hora_salida, ubicacion_salida, foto_salida_blob, tiendas!tienda_id(id, nombre, lat, lon)"
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
    puedeReportar: new Date(r.created_at).getTime() > limite,
    horaLlegada: r.hora_llegada ?? null,
    ubicacionLlegada: r.ubicacion_llegada ?? null,
    fotoLlegadaUrl: null,
    horaSalidaTienda: r.hora_salida ?? null,
    ubicacionSalidaTienda: r.ubicacion_salida ?? null,
    fotoSalidaTiendaUrl: null,
    etaMinutos: null,
    etaKm: null,
    googleMapsUrl: "",
    wazeUrl: "",
    // Se completan más abajo, en el mapeo final -- acá solo hace falta que
    // el literal cumpla el tipo completo de TiendaClasificada.
    tiendaLat: null,
    tiendaLon: null,
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
      // Ya pasó el filtro de arriba (dentro de la ventana de 48h), así que
      // siempre es editable en este punto.
      puedeReportar: true,
      horaLlegada: r.hora_llegada ?? null,
      ubicacionLlegada: r.ubicacion_llegada ?? null,
      fotoLlegadaUrl: null,
      horaSalidaTienda: r.hora_salida ?? null,
      ubicacionSalidaTienda: r.ubicacion_salida ?? null,
      fotoSalidaTiendaUrl: null,
      etaMinutos: null,
      etaKm: null,
      googleMapsUrl: "",
      wazeUrl: "",
      tiendaLat: null,
      tiendaLon: null,
      _fotoLlegadaBlob: r.foto_llegada_blob ?? null,
      _fotoSalidaBlob: r.foto_salida_blob ?? null,
      _lat: r.tiendas?.lat === null || r.tiendas?.lat === undefined ? null : Number(r.tiendas.lat),
      _lon: r.tiendas?.lon === null || r.tiendas?.lon === undefined ? null : Number(r.tiendas.lon),
    }));

  // Una asignación de un día ya pasado que ya no se puede reportar (pasaron
  // las 48h) no tiene nada que hacer en la lista: antes quedaba "estancada"
  // como tarjeta de "antes de ayer" para siempre. El registro no se borra
  // -- sigue contando como visita no reportada en Central Analítica y el
  // calendario --, solo deja de mostrarse aquí.
  const pendientesVigentes = pendientes.filter((t) => t.puedeReportar || t.fechaPlanificada >= hoy);
  const todas = [...pendientesVigentes, ...editables];

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

  // El tiempo estimado de llegada solo tiene sentido para HOY, sin haber
  // marcado ya la llegada a esa tienda (si ya estás ahí, "camino a..." no
  // dice nada útil), y sale desde el domicilio del colaborador -- mismo
  // origen que ya usa el cálculo de kilómetros para la primera visita del
  // día. Sin dirección propia cargada, queda sin ETA (los botones de
  // navegación igual funcionan, ver construirUrlGoogleMaps/construirUrlWaze).
  // Sin caché (revalidateSegundos: 0): a diferencia de kilómetros/correo de
  // ruta nueva, esto se muestra en pantalla y se espera que refleje el
  // tráfico de cada momento en que se abre la app, no el de hace rato.
  const etaPorUbicacion = new Map<string, { km: number; minutos: number } | null>();
  const origenLat = usuario?.lat === null || usuario?.lat === undefined ? null : Number(usuario.lat);
  const origenLon = usuario?.lon === null || usuario?.lon === undefined ? null : Number(usuario.lon);
  if (origenLat !== null && origenLon !== null) {
    const ubicacionesHoy = new Map<string, { lat: number; lon: number }>();
    todas.forEach((t) => {
      if (t.urgencia === "HOY" && !t.horaLlegada && t._lat !== null && t._lon !== null) {
        ubicacionesHoy.set(`${t._lat},${t._lon}`, { lat: t._lat, lon: t._lon });
      }
    });
    await calcularRutasEnLotes(Array.from(ubicacionesHoy.entries()), async ([clave, { lat, lon }]) => {
      const ruta = await calcularRutaAuto(origenLat, origenLon, lat, lon, undefined, 0);
      etaPorUbicacion.set(clave, ruta);
    });
  }

  const tiendasFinal: TiendaClasificada[] = await Promise.all(
    todas.map(async ({ _lat, _lon, _fotoLlegadaBlob, _fotoSalidaBlob, ...t }) => {
      const resumen = _lat !== null && _lon !== null ? climaPorUbicacion.get(`${_lat},${_lon}`) : undefined;
      const eta =
        t.urgencia === "HOY" && !t.horaLlegada && _lat !== null && _lon !== null
          ? etaPorUbicacion.get(`${_lat},${_lon}`) ?? null
          : null;
      const [fotoLlegadaUrl, fotoSalidaTiendaUrl] = await Promise.all([
        obtenerUrlTemporalFoto(_fotoLlegadaBlob),
        obtenerUrlTemporalFoto(_fotoSalidaBlob),
      ]);
      return {
        ...t,
        clima: resumen?.get(t.fechaPlanificada) ?? null,
        fotoLlegadaUrl,
        fotoSalidaTiendaUrl,
        etaMinutos: eta?.minutos ?? null,
        etaKm: eta?.km ?? null,
        googleMapsUrl: construirUrlGoogleMaps(_lat, _lon, t.tiendaNombre),
        wazeUrl: construirUrlWaze(_lat, _lon, t.tiendaNombre),
        tiendaLat: _lat,
        tiendaLon: _lon,
      };
    })
  );

  return { tiendas: tiendasFinal, diaDescansoFijo: usuario?.dias_descanso ?? null };
}

// Recalcula el tiempo/distancia estimados usando la ubicación GPS actual del
// celular como origen, en vez del domicilio registrado — se pide aparte (con
// un botón "Actualizar con mi ubicación"), no automáticamente al cargar la
// pantalla, para no pedir permiso de GPS solo por mirar la tarjeta.
export async function recalcularEtaConUbicacion(
  tiendaId: string,
  lat: number,
  lon: number
): Promise<{ etaMinutos: number | null; etaKm: number | null }> {
  const sesion = await obtenerSesion();
  if (!sesion || !tieneBitacora(sesion.rol)) {
    throw new Error("No autorizado.");
  }

  const supabase = supabaseServer();
  const { data: tienda } = await supabase
    .from("tiendas")
    .select("lat, lon")
    .eq("id", tiendaId)
    .maybeSingle();

  const destLat = tienda?.lat === null || tienda?.lat === undefined ? null : Number(tienda.lat);
  const destLon = tienda?.lon === null || tienda?.lon === undefined ? null : Number(tienda.lon);
  if (destLat === null || destLon === null) {
    return { etaMinutos: null, etaKm: null };
  }

  const ruta = await calcularRutaAuto(lat, lon, destLat, destLon, undefined, 0);
  return { etaMinutos: ruta?.minutos ?? null, etaKm: ruta?.km ?? null };
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
  const fecha = diaLaboralPeru();

  const { data: existente, error: errorExistente } = await supabase
    .from("rutas_activas")
    .select("id")
    .eq("usuario_id", sesion.id)
    .eq("tienda_id", tiendaId)
    .eq("fecha_planificada", fecha)
    .maybeSingle();
  // Si no se pudo verificar, no se continúa — de lo contrario un error
  // transitorio dejaría pasar una asignación duplicada para el mismo día.
  if (errorExistente) return { exito: false, mensaje: "No se pudo verificar tus asignaciones. Intenta de nuevo." };
  if (existente) {
    return { exito: false, mensaje: "Ya te habías asignado esa tienda hoy." };
  }

  const { data: tienda } = await supabase.from("tiendas").select("nombre").eq("id", tiendaId).maybeSingle();
  if (!tienda) {
    return { exito: false, mensaje: "Tienda no encontrada." };
  }

  // Una auto-asignación casi siempre pasa estando ya en otra tienda (la ruta
  // del día) y de ahí te mandan a esta de improviso — el kilometraje debe
  // salir desde ese punto, no desde la casa. Se infiere en este orden:
  // 1) la tienda donde ya marcaste llegada hoy y todavía no marcaste salida
  //    (ahí estás parado ahora mismo);
  // 2) si no, cualquier otra tienda ya asignada hoy (tu ruta planificada);
  // 3) si no hay ninguna, se deja sin origen y el cálculo de km usa tu casa
  //    (primera asignación del día, llegando de casa).
  const { data: otrasHoy } = await supabase
    .from("rutas_activas")
    .select("tienda_id, hora_llegada, hora_salida, autoasignada")
    .eq("usuario_id", sesion.id)
    .eq("fecha_planificada", fecha)
    .order("hora_llegada", { ascending: false, nullsFirst: false });

  const listaOtrasHoy = otrasHoy ?? [];
  // Ya viene ordenada por hora_llegada más reciente primero, así que si hay
  // más de una tienda marcada como "actual" (no debería pasar, pero por las
  // dudas) se elige la de llegada más reciente, no la que devuelva Postgres.
  const dondeEstaAhora = listaOtrasHoy.find((r) => r.hora_llegada && !r.hora_salida);
  const cualquierOtra = [...listaOtrasHoy].sort((a, b) => Number(a.autoasignada) - Number(b.autoasignada))[0];
  const origenTiendaId = dondeEstaAhora?.tienda_id ?? cualquierOtra?.tienda_id ?? null;

  const { error } = await supabase.from("rutas_activas").insert({
    usuario_id: sesion.id,
    tienda_id: tiendaId,
    fecha_planificada: fecha,
    autoasignada: true,
    origen_tienda_id: origenTiendaId,
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

  // El momento de la asignación (no el de envío) es lo que ancla la ventana
  // de 48 horas para poder editar el reporte después — se guarda tal cual
  // quedó registrada en rutas_activas antes de borrarla. La marcación de
  // llegada/salida a la tienda (si ya se hizo) también se arrastra, para no
  // perderla al pasar de "pendiente" a "reportado".
  let asignadoEn: string | null = null;
  // La visita quedó registrada el día que se PLANIFICÓ/marcó (fecha_planificada
  // de rutas_activas), no el día en que por fin se escribe la observación y
  // se aprieta "enviar" — sin esto, una visita del lunes reportada recién el
  // miércoles (dentro de la ventana de 48h) quedaba fechada como si hubiera
  // sido el miércoles, mezclándose con las visitas de ese día en el mapa y
  // en Central Analítica. Se usa diaLaboralPeru() solo como respaldo, para
  // el caso (no debería darse en el flujo normal) de un reporte sin
  // rutaActivaId detrás.
  let fecha = diaLaboralPeru();
  let marcacionTienda: {
    hora_llegada: string | null;
    ubicacion_llegada: string | null;
    foto_llegada_blob: string | null;
    hora_salida: string | null;
    ubicacion_salida: string | null;
    foto_salida_blob: string | null;
    origen_tienda_id: string | null;
  } = {
    hora_llegada: null,
    ubicacion_llegada: null,
    foto_llegada_blob: null,
    hora_salida: null,
    ubicacion_salida: null,
    foto_salida_blob: null,
    origen_tienda_id: null,
  };
  if (rutaActivaId) {
    const { data: activa } = await supabase
      .from("rutas_activas")
      .select(
        "created_at, fecha_planificada, hora_llegada, ubicacion_llegada, foto_llegada_blob, hora_salida, ubicacion_salida, foto_salida_blob, origen_tienda_id"
      )
      .eq("id", rutaActivaId)
      .maybeSingle();
    asignadoEn = activa?.created_at ?? null;
    if (activa?.fecha_planificada) fecha = activa.fecha_planificada;
    if (activa) {
      marcacionTienda = {
        hora_llegada: activa.hora_llegada,
        ubicacion_llegada: activa.ubicacion_llegada,
        foto_llegada_blob: activa.foto_llegada_blob,
        hora_salida: activa.hora_salida,
        ubicacion_salida: activa.ubicacion_salida,
        foto_salida_blob: activa.foto_salida_blob,
        origen_tienda_id: activa.origen_tienda_id,
      };
    }
  }

  // Mismo candado que editarReporte: pasadas las 48h desde que el
  // coordinador asignó esta ruta, ya no se puede enviar el reporte — la
  // tarjeta queda solo de lectura (obtenerTiendasClasificadas marca
  // puedeReportar: false para que la UI ni siquiera abra el formulario,
  // pero se valida también acá por si acaso).
  if (rutaActivaId && asignadoEn) {
    const limite = Date.now() - VENTANA_EDICION_HORAS * 3600 * 1000;
    if (new Date(asignadoEn).getTime() <= limite) {
      return {
        exito: false,
        mensaje: "Ya pasaron las 48 horas desde que se asignó esta ruta — ya no se puede reportar.",
      };
    }
  }

  // Si por algún motivo ya existe un reporte de esta misma tienda y fecha
  // (p. ej. un reenvío), se sobreescribe en vez de crear un segundo reporte.
  const { data: existente, error: errorExistente } = await supabase
    .from("rutas_diarias")
    .select("id")
    .eq("usuario_id", sesion.id)
    .eq("tienda_id", tiendaId)
    .eq("fecha", fecha)
    .maybeSingle();

  // Si no se pudo verificar, no se continúa — de lo contrario un error
  // transitorio dejaría crear un reporte duplicado para la misma visita.
  if (errorExistente) {
    return { exito: false, mensaje: "No se pudo verificar reportes existentes. Intenta de nuevo." };
  }

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
// Se marca al llegar y al irse de CADA tienda asignada ese día, con foto y
// ubicación. Vive en rutas_activas mientras no se reporta la visita, y se
// traslada a rutas_diarias al enviar el reporte (ver enviarReporte).
//
// De esta marcación por tienda (o por evento, ver app/panel/anuncios-actions.ts)
// se deriva también la asistencia general del día (antes era un botón
// aparte): la primera llegada del día cuenta como el ingreso general (no se
// pisa si ya había uno), y cada salida va actualizando la salida general —
// así la última salida del día queda como la salida definitiva, sin tener
// que adivinar de antemano cuál será.

export async function sincronizarAsistenciaGeneral(
  supabase: ReturnType<typeof supabaseServer>,
  sesion: { id: string; rol: string },
  tipo: "llegada" | "salida",
  hora: string,
  ubicacion: string,
  fotoBlob: string | null
): Promise<void> {
  const fecha = diaLaboralPeru();

  const { data: existente, error: errorExistente } = await supabase
    .from("asistencia")
    .select("id, hora_ingreso")
    .eq("usuario_id", sesion.id)
    .eq("fecha", fecha)
    .maybeSingle();

  // La marcación de llegada/salida a la tienda ya se guardó con éxito antes
  // de llamar a esta función — si acá no se puede verificar si ya existe un
  // registro de asistencia del día, es más seguro no tocar nada (evitar un
  // duplicado) que arriesgarse a insertar una segunda fila para el mismo día.
  if (errorExistente) return;

  if (tipo === "llegada") {
    if (existente) {
      if (existente.hora_ingreso) return; // ya hay ingreso del día — no se pisa
      await supabase
        .from("asistencia")
        .update({ hora_ingreso: hora, ubicacion_ingreso: ubicacion, foto_ingreso_blob: fotoBlob })
        .eq("id", existente.id);
    } else {
      await supabase.from("asistencia").insert({
        usuario_id: sesion.id,
        fecha,
        hora_ingreso: hora,
        ubicacion_ingreso: ubicacion,
        foto_ingreso_blob: fotoBlob,
      });
    }
  } else {
    if (existente) {
      await supabase
        .from("asistencia")
        .update({ hora_salida: hora, ubicacion_salida: ubicacion, foto_salida_blob: fotoBlob })
        .eq("id", existente.id);
    } else {
      await supabase.from("asistencia").insert({
        usuario_id: sesion.id,
        fecha,
        hora_salida: hora,
        ubicacion_salida: ubicacion,
        foto_salida_blob: fotoBlob,
      });
    }
  }
}

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
  fotoBase64: string,
  // Presente cuando la marcación se hizo sin señal y se está sincronizando
  // ahora -- epoch ms del momento real en que se tocó el botón. Ver
  // lib/cola-marcaciones.ts y lib/marcacion-offline.ts.
  horaCapturadaMs?: number
): Promise<ResultadoReporte> {
  const sesion = await obtenerSesion();
  if (!sesion || !tieneBitacora(sesion.rol)) return { exito: false, mensaje: "No autorizado." };
  if (!fotoBase64) return { exito: false, mensaje: "Toma una foto para marcar la llegada." };

  const supabase = supabaseServer();
  const contexto = await obtenerContextoTienda(supabase, sesion.id, rutaActivaId, reporteId);
  if (!contexto) return { exito: false, mensaje: "No se encontró la asignación." };

  const hora = await resolverHoraMarcacion(supabase, sesion, horaCapturadaMs, "llegada a tienda");
  const ubicacion = "https://www.google.com/maps?q=" + lat + "," + lng;
  const fotoBlobPath = `${sesion.id}/${contexto.tiendaId}-llegada-${Date.now()}.jpg`;

  // La foto es la prueba visual, pero la hora de llegada es lo que mueve
  // puntos y racha -- si Azure Storage falla, igual se registra la llegada
  // sin foto en vez de bloquear todo el marcado (ver conversación sobre la
  // cuenta de Azure deshabilitada, sept. 2026).
  let fotoGuardada = true;
  try {
    await subirFotoMarcacion(fotoBlobPath, fotoBase64);
  } catch (error) {
    console.error("No se pudo subir la foto de llegada:", error);
    fotoGuardada = false;
  }
  const fotoBlob = fotoGuardada ? fotoBlobPath : null;

  const { error } = await supabase
    .from(contexto.tabla)
    .update({ hora_llegada: hora, ubicacion_llegada: ubicacion, foto_llegada_blob: fotoBlob })
    .eq("id", contexto.id);

  if (error) return { exito: false, mensaje: "No se pudo registrar la llegada." };

  await sincronizarAsistenciaGeneral(supabase, sesion, "llegada", hora, ubicacion, fotoBlob);

  return fotoGuardada
    ? { exito: true, mensaje: "Llegada registrada con foto." }
    : { exito: true, mensaje: "Llegada registrada sin foto — no se pudo guardar la foto en este momento." };
}

export async function marcarSalidaTienda(
  rutaActivaId: string | null,
  reporteId: string | null,
  lat: number,
  lng: number,
  fotoBase64: string,
  horaCapturadaMs?: number
): Promise<ResultadoReporte> {
  const sesion = await obtenerSesion();
  if (!sesion || !tieneBitacora(sesion.rol)) return { exito: false, mensaje: "No autorizado." };
  if (!fotoBase64) return { exito: false, mensaje: "Toma una foto para marcar la salida." };

  const supabase = supabaseServer();
  const contexto = await obtenerContextoTienda(supabase, sesion.id, rutaActivaId, reporteId);
  if (!contexto) return { exito: false, mensaje: "No se encontró la asignación." };

  const hora = await resolverHoraMarcacion(supabase, sesion, horaCapturadaMs, "salida de tienda");
  const ubicacion = "https://www.google.com/maps?q=" + lat + "," + lng;
  const fotoBlobPath = `${sesion.id}/${contexto.tiendaId}-salida-${Date.now()}.jpg`;

  let fotoGuardada = true;
  try {
    await subirFotoMarcacion(fotoBlobPath, fotoBase64);
  } catch (error) {
    console.error("No se pudo subir la foto de salida:", error);
    fotoGuardada = false;
  }
  const fotoBlob = fotoGuardada ? fotoBlobPath : null;

  const { error } = await supabase
    .from(contexto.tabla)
    .update({ hora_salida: hora, ubicacion_salida: ubicacion, foto_salida_blob: fotoBlob })
    .eq("id", contexto.id);

  if (error) return { exito: false, mensaje: "No se pudo registrar la salida." };

  await sincronizarAsistenciaGeneral(supabase, sesion, "salida", hora, ubicacion, fotoBlob);

  return fotoGuardada
    ? { exito: true, mensaje: "Salida registrada con foto." }
    : { exito: true, mensaje: "Salida registrada sin foto — no se pudo guardar la foto en este momento." };
}

export type MiReporte = {
  id: string;
  fecha: string;
  tiendaNombre: string;
  observacion: string;
  actividad: string | null;
  respuesta: string | null;
  respuestaPor: string | null;
  leido: boolean;
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
      "id, fecha, observacion, actividad, respuesta, respuesta_por, leido, created_at, asignado_en, tiendas!tienda_id(nombre)"
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
    leido: r.leido ?? false,
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
  if (!inicioVentana || new Date(inicioVentana).getTime() <= limite) {
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

// Enlace directo a la campanita de "Solicitudes pendientes" del coordinador
// (?abrirSolicitudes=1 la abre sola al cargar — ver campanita-descansos.tsx).
const ENLACE_SOLICITUDES = `${URL_APP}/panel/coordinador?abrirSolicitudes=1`;

// Mismo patrón que notificarCoordinadoresAutoasignacion: un fallo de correo
// nunca debe romper el envío de la solicitud en sí, por eso va en su propio
// try/catch silencioso.
async function notificarCoordinadoresSolicitudDescanso(
  nombreUsuario: string,
  diasActuales: string[],
  diasSolicitados: string[],
  fechaDeseada: string,
  motivo: string | null
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
      tituloEmoji: "🛌",
      asunto: `${nombreUsuario} solicitó cambio de descanso semanal`,
      cuerpoHtml: `
        <p><strong>${nombreUsuario}</strong> pidió cambiar su descanso semanal:</p>
        <ul style="padding-left:18px; margin:0 0 16px;">
          <li><strong>Actual:</strong> ${diasActuales.length > 0 ? diasActuales.join(" y ") : "sin descanso fijo"}</li>
          <li><strong>Solicitado:</strong> ${diasSolicitados.join(" y ") || "sin días"}</li>
          <li><strong>Desde:</strong> ${formatearFechaLegible(fechaDeseada)}</li>
          ${motivo ? `<li><strong>Motivo:</strong> ${motivo}</li>` : ""}
        </ul>
        <p style="margin:0 0 16px;">
          <a href="${ENLACE_SOLICITUDES}" style="color:#e23744; font-weight:700;">Revisar y aprobar/rechazar →</a>
        </p>
      `,
    });
  } catch (error) {
    console.error("No se pudo notificar la solicitud de descanso:", error);
  }
}

async function notificarCoordinadoresSolicitudPermiso(
  nombreUsuario: string,
  fechaInicio: string,
  fechaFin: string,
  motivo: string | null,
  tipo: string
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

    const esVacaciones = tipo === "Vacaciones";
    await enviarCorreo({
      para: correos,
      tituloEmoji: esVacaciones ? "🏖️" : "📝",
      asunto: esVacaciones
        ? `${nombreUsuario} solicitó vacaciones`
        : `${nombreUsuario} solicitó un permiso`,
      cuerpoHtml: `
        <p><strong>${nombreUsuario}</strong> pidió ${esVacaciones ? "vacaciones planificadas" : "un permiso anticipado"}:</p>
        <ul style="padding-left:18px; margin:0 0 16px;">
          <li><strong>Fechas:</strong> ${formatearFechaLegible(fechaInicio)} → ${formatearFechaLegible(fechaFin)}</li>
          ${motivo ? `<li><strong>Motivo:</strong> ${motivo}</li>` : ""}
        </ul>
        <p style="margin:0 0 16px;">
          <a href="${ENLACE_SOLICITUDES}" style="color:#e23744; font-weight:700;">Revisar y aprobar/rechazar →</a>
        </p>
      `,
    });
  } catch (error) {
    console.error("No se pudo notificar la solicitud de permiso/vacaciones:", error);
  }
}

// El colaborador ya no cambia su descanso directo: queda como solicitud
// pendiente hasta que el coordinador la apruebe (ve la campanita de
// notificaciones en su panel).

export type SolicitudDescansoPropia = {
  id: string;
  diasSolicitados: string[];
  fechaDeseada: string | null;
  motivo: string | null;
  createdAt: string;
};

export async function obtenerMiSolicitudDescansoPendiente(): Promise<SolicitudDescansoPropia | null> {
  const sesion = await obtenerSesion();
  if (!sesion) throw new Error("No autorizado.");

  const supabase = supabaseServer();
  const { data } = await supabase
    .from("solicitudes_descanso")
    .select("id, dias_solicitados, fecha_deseada, motivo, created_at")
    .eq("usuario_id", sesion.id)
    .eq("estado", "pendiente")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return null;
  return {
    id: data.id,
    diasSolicitados: data.dias_solicitados ?? [],
    fechaDeseada: data.fecha_deseada,
    motivo: data.motivo,
    createdAt: data.created_at,
  };
}

export async function solicitarCambioDescanso(
  dias: string[],
  fechaDeseada: string,
  motivo: string
): Promise<ResultadoReporte> {
  const sesion = await obtenerSesion();
  if (!sesion) return { exito: false, mensaje: "No autorizado." };

  if (dias.length > MAX_DIAS_DESCANSO) {
    return { exito: false, mensaje: `Máximo ${MAX_DIAS_DESCANSO} días de descanso por semana.` };
  }
  if (dias.some((d) => !(DIAS_SEMANA as readonly string[]).includes(d))) {
    return { exito: false, mensaje: "Día inválido." };
  }
  if (!fechaDeseada) {
    return { exito: false, mensaje: "Indica desde qué fecha quieres el cambio." };
  }
  if (fechaDeseada < hoyPeru()) {
    return { exito: false, mensaje: "La fecha no puede ser anterior a hoy." };
  }

  const motivoLimpio = motivo.trim() || null;

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
      .update({
        dias_actuales: actuales,
        dias_solicitados: dias,
        fecha_deseada: fechaDeseada,
        motivo: motivoLimpio,
        created_at: new Date().toISOString(),
      })
      .eq("id", pendiente.id);
    if (error) return { exito: false, mensaje: "No se pudo actualizar tu solicitud." };
    await notificarCoordinadoresSolicitudDescanso(sesion.nombre, actuales, dias, fechaDeseada, motivoLimpio);
    return { exito: true, mensaje: "Solicitud actualizada — pendiente de aprobación del coordinador." };
  }

  const { error } = await supabase.from("solicitudes_descanso").insert({
    usuario_id: sesion.id,
    dias_actuales: actuales,
    dias_solicitados: dias,
    fecha_deseada: fechaDeseada,
    motivo: motivoLimpio,
  });
  if (error) return { exito: false, mensaje: "No se pudo enviar la solicitud." };
  await notificarCoordinadoresSolicitudDescanso(sesion.nombre, actuales, dias, fechaDeseada, motivoLimpio);
  return { exito: true, mensaje: "Solicitud enviada — queda pendiente de aprobación del coordinador." };
}

// ---------------------------------------------------------------------
// Permiso anticipado: igual que el cambio de descanso, el colaborador
// solo pide y el coordinador aprueba o rechaza (ve la misma campanita).
// Al aprobarse, el coordinador la convierte en una asignación especial
// (tipo "Permiso") — así aparece en todos lados donde ya se muestran esas
// asignaciones (calendario, alertas, advertencia al asignar rutas, etc.)
// sin duplicar esa lógica.
// ---------------------------------------------------------------------

export type TipoSolicitudPermiso = "Permiso" | "Vacaciones";

export type SolicitudPermisoPropia = {
  id: string;
  fechaInicio: string;
  fechaFin: string;
  motivo: string | null;
  createdAt: string;
};

export async function obtenerMiSolicitudPermisoPendiente(
  tipo: TipoSolicitudPermiso = "Permiso"
): Promise<SolicitudPermisoPropia | null> {
  const sesion = await obtenerSesion();
  if (!sesion) throw new Error("No autorizado.");

  const supabase = supabaseServer();
  const { data } = await supabase
    .from("solicitudes_permiso")
    .select("id, fecha_inicio, fecha_fin, motivo, created_at")
    .eq("usuario_id", sesion.id)
    .eq("tipo", tipo)
    .eq("estado", "pendiente")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return null;
  return {
    id: data.id,
    fechaInicio: data.fecha_inicio,
    fechaFin: data.fecha_fin,
    motivo: data.motivo,
    createdAt: data.created_at,
  };
}

export async function solicitarPermiso(
  fechaInicio: string,
  fechaFin: string,
  motivo: string,
  tipo: TipoSolicitudPermiso = "Permiso"
): Promise<ResultadoReporte> {
  const sesion = await obtenerSesion();
  if (!sesion) return { exito: false, mensaje: "No autorizado." };

  const etiqueta = tipo === "Vacaciones" ? "vacaciones" : "permiso";

  if (!fechaInicio || !fechaFin) {
    return { exito: false, mensaje: "Completa la fecha de inicio y de fin." };
  }
  if (fechaInicio < hoyPeru()) {
    return { exito: false, mensaje: "La fecha de inicio no puede ser anterior a hoy." };
  }
  if (fechaFin < fechaInicio) {
    return { exito: false, mensaje: "La fecha de fin no puede ser anterior a la de inicio." };
  }

  const supabase = supabaseServer();

  // Igual que con el descanso: si ya hay una pendiente de este mismo tipo, se
  // reemplaza en vez de acumular varias solicitudes del mismo colaborador.
  // Un permiso pendiente y unas vacaciones pendientes pueden coexistir, por
  // eso el filtro también va por tipo.
  const { data: pendiente } = await supabase
    .from("solicitudes_permiso")
    .select("id")
    .eq("usuario_id", sesion.id)
    .eq("tipo", tipo)
    .eq("estado", "pendiente")
    .maybeSingle();

  const motivoLimpio = motivo.trim() || null;

  if (pendiente) {
    const { error } = await supabase
      .from("solicitudes_permiso")
      .update({
        fecha_inicio: fechaInicio,
        fecha_fin: fechaFin,
        motivo: motivoLimpio,
        created_at: new Date().toISOString(),
      })
      .eq("id", pendiente.id);
    if (error) return { exito: false, mensaje: `No se pudo actualizar tu solicitud de ${etiqueta}.` };
    await notificarCoordinadoresSolicitudPermiso(sesion.nombre, fechaInicio, fechaFin, motivoLimpio, tipo);
    return { exito: true, mensaje: `Solicitud de ${etiqueta} actualizada — pendiente de aprobación del coordinador.` };
  }

  const { error } = await supabase.from("solicitudes_permiso").insert({
    usuario_id: sesion.id,
    fecha_inicio: fechaInicio,
    fecha_fin: fechaFin,
    motivo: motivoLimpio,
    tipo,
  });
  if (error) return { exito: false, mensaje: `No se pudo enviar la solicitud de ${etiqueta}.` };
  await notificarCoordinadoresSolicitudPermiso(sesion.nombre, fechaInicio, fechaFin, motivoLimpio, tipo);
  return { exito: true, mensaje: `Solicitud de ${etiqueta} enviada — queda pendiente de aprobación del coordinador.` };
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
      "id, fecha, observacion, actividad, respuesta, respuesta_por, rol, usuarios(nombre), tiendas!tienda_id(nombre)"
    )
    .in("tienda_id", tiendaIds)
    .neq("usuario_id", sesion.id)
    .or("leido.is.null,leido.eq.false")
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

// Marca la observación como leída sin necesidad de escribir una respuesta —
// para cuando no hace falta contestar nada, solo confirmar que se vio. Quien
// la escribió ve igual que ya se leyó (ver MiReporte.leido en "Mis Reportes").
export async function marcarObservacionLeida(reporteId: string): Promise<ResultadoReporte> {
  const sesion = await obtenerSesion();
  if (!sesion) return { exito: false, mensaje: "No autorizado." };

  const supabase = supabaseServer();

  const { data: reporte, error: errorReporte } = await supabase
    .from("rutas_diarias")
    .select("tienda_id")
    .eq("id", reporteId)
    .maybeSingle();

  if (errorReporte || !reporte) {
    return { exito: false, mensaje: "No se encontró el reporte." };
  }

  const { data: fija } = await supabase
    .from("tiendas_permanentes")
    .select("id")
    .eq("usuario_id", sesion.id)
    .eq("tienda_id", reporte.tienda_id)
    .maybeSingle();

  if (!fija) {
    return { exito: false, mensaje: "Solo puedes marcar como leídas observaciones de tus tiendas fijas." };
  }

  const { error } = await supabase.from("rutas_diarias").update({ leido: true }).eq("id", reporteId);
  if (error) return { exito: false, mensaje: "No se pudo marcar como leída." };
  return { exito: true };
}

// ---------------------------------------------------------------------
// Checklists de rutina de visita llenados en tus tiendas fijas -- mismo
// patrón que las observaciones de arriba: excluye lo que llenaste tú
// mismo, y solo muestra lo no leído todavía.
// ---------------------------------------------------------------------

export type ChecklistTiendaFija = {
  id: string;
  fecha: string;
  tiendaNombre: string;
  usuarioNombre: string;
  rol: string;
  porcentaje: number | null;
  clasificacion: string | null;
};

export async function obtenerChecklistsTiendasFijas(
  desde: string,
  hasta: string
): Promise<ChecklistTiendaFija[]> {
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
    .from("checklists_visita")
    .select("id, fecha, usuario_nombre, rol, porcentaje, clasificacion, tiendas(nombre)")
    .in("tienda_id", tiendaIds)
    .neq("usuario_id", sesion.id)
    .or("leido.is.null,leido.eq.false")
    .gte("fecha", desde)
    .lte("fecha", hasta)
    .order("fecha", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) throw new Error("No se pudo cargar los checklists.");

  return (data ?? []).map((c: any) => ({
    id: c.id,
    fecha: c.fecha,
    tiendaNombre: c.tiendas?.nombre ?? "—",
    usuarioNombre: c.usuario_nombre,
    rol: c.rol,
    porcentaje: c.porcentaje,
    clasificacion: c.clasificacion,
  }));
}

export async function marcarChecklistTiendaFijaLeido(checklistId: string): Promise<ResultadoReporte> {
  const sesion = await obtenerSesion();
  if (!sesion) return { exito: false, mensaje: "No autorizado." };

  const supabase = supabaseServer();

  const { data: checklist, error: errorChecklist } = await supabase
    .from("checklists_visita")
    .select("tienda_id")
    .eq("id", checklistId)
    .maybeSingle();

  if (errorChecklist || !checklist) {
    return { exito: false, mensaje: "No se encontró el checklist." };
  }

  const { data: fija } = await supabase
    .from("tiendas_permanentes")
    .select("id")
    .eq("usuario_id", sesion.id)
    .eq("tienda_id", checklist.tienda_id)
    .maybeSingle();

  if (!fija) {
    return { exito: false, mensaje: "Solo puedes marcar como leídos checklists de tus tiendas fijas." };
  }

  const { error } = await supabase.from("checklists_visita").update({ leido: true }).eq("id", checklistId);
  if (error) return { exito: false, mensaje: "No se pudo marcar como leído." };
  return { exito: true };
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