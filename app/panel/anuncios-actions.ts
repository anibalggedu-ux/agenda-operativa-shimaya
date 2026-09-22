"use server";

import { supabaseServer } from "@/lib/supabase-server";
import { obtenerSesion, tieneBitacora } from "@/lib/session";
import { hoyPeru, diaLaboralPeru, horaPeru, calcularProximaFechaAnual } from "@/lib/fechas";
import { subirFotoMarcacion, obtenerUrlTemporalFoto } from "@/lib/azure-storage";
import { sincronizarAsistenciaGeneral } from "./supervisor/actions";

const DIAS_ANTICIPACION_CUMPLEANOS = 2;

export type ComunicadoPublico = {
  id: string;
  fecha: string;
  tipo: string;
  mensaje: string;
  autor: string | null;
  fechaEvento: string | null;
  ubicacion: string | null;
};

// Lectura de anuncios para cualquier rol autenticado — a diferencia de
// app/panel/coordinador/actions.ts, que además permite crear/eliminar y
// está restringido a Coordinador. Solo muestra los vigentes: si tienen
// fecha de evento, desaparecen de aquí al día siguiente del evento (pero
// el registro se conserva en la base de datos para historial).
//
// También filtra por destinatario: si el comunicado tiene usuarios_destino,
// solo lo ve quien esté en esa lista — sin restricción (null/vacío), lo ve
// cualquiera, que es el comportamiento de siempre.
export async function obtenerAnunciosRecientes(): Promise<ComunicadoPublico[]> {
  const sesion = await obtenerSesion();
  if (!sesion) throw new Error("No autorizado.");

  const supabase = supabaseServer();
  const hoy = hoyPeru();

  // Se piden más de los 10 que se muestran porque algunos se descartan acá
  // mismo por destinatario — filtrar antes en SQL con array-contains sobre
  // una columna nullable es más frágil que filtrar los pocos que trae esto.
  const { data, error } = await supabase
    .from("comunicados")
    .select("id, fecha, tipo, mensaje, autor, fecha_evento, ubicacion, usuarios_destino")
    .or(`fecha_evento.is.null,fecha_evento.gte.${hoy}`)
    .order("fecha", { ascending: false })
    .limit(30);

  if (error) throw new Error("No se pudo cargar los anuncios.");

  return (data ?? [])
    .filter((c) => !c.usuarios_destino || c.usuarios_destino.length === 0 || c.usuarios_destino.includes(sesion.id))
    .slice(0, 10)
    .map((c) => ({
      id: c.id,
      fecha: c.fecha,
      tipo: c.tipo,
      mensaje: c.mensaje,
      autor: c.autor,
      fechaEvento: c.fecha_evento,
      ubicacion: c.ubicacion,
    }));
}

export type ProximoCumpleanos = {
  usuarioNombre: string;
  rol: string;
  fecha: string;
  diasFaltantes: number;
  edadQueCumple: number | null;
};

// Cumpleaños de cualquier colaborador que caiga dentro de los próximos
// DIAS_ANTICIPACION_CUMPLEANOS días (incluye el día de hoy) — visible para
// cualquier rol autenticado, igual que el resto de Anuncios.
export async function obtenerProximosCumpleanos(): Promise<ProximoCumpleanos[]> {
  const sesion = await obtenerSesion();
  if (!sesion) throw new Error("No autorizado.");

  const supabase = supabaseServer();
  const { data, error } = await supabase
    .from("usuarios")
    .select("nombre, rol, fecha_nacimiento")
    .eq("activo", true)
    .not("fecha_nacimiento", "is", null);

  if (error) throw new Error("No se pudo cargar los cumpleaños.");

  const hoy = hoyPeru();

  const proximos: ProximoCumpleanos[] = [];
  (data ?? []).forEach((u) => {
    if (!u.fecha_nacimiento) return;
    const [yNac, mNac, dNac] = u.fecha_nacimiento.split("-").map(Number);
    const { fecha, diasFaltantes } = calcularProximaFechaAnual(mNac, dNac, hoy);
    if (diasFaltantes > DIAS_ANTICIPACION_CUMPLEANOS) return;

    const [yProximo] = fecha.split("-").map(Number);
    proximos.push({
      usuarioNombre: u.nombre,
      rol: u.rol,
      fecha,
      diasFaltantes,
      edadQueCumple: yProximo - yNac,
    });
  });

  return proximos.sort((a, b) => a.diasFaltantes - b.diasFaltantes);
}

// ---------------------------------------------------------------------
// Marcar entrada/salida a un ANUNCIO/EVENTO (ej. una reunión en una sede
// distinta), como tarjeta independiente de la bitácora de tiendas -- para
// que asistir a un evento no obligue a marcar la llegada en la tienda que
// sí tenías asignada ese día (esa asignación queda intacta). Vive en
// asistencia_eventos, una fila por (comunicado, usuario), creada recién al
// marcar la primera llegada. También cuenta para la asistencia general del
// día (mismo mecanismo que las tiendas) y para el cálculo de kilómetros
// (ver app/panel/kilometros-actions.ts), usando el lat/lon geocodificado de
// comunicados.ubicacion al publicar el anuncio.
// ---------------------------------------------------------------------

export type EventoDeHoy = {
  comunicadoId: string;
  tipo: string;
  mensaje: string;
  ubicacion: string;
  horaLlegada: string | null;
  ubicacionLlegadaMapa: string | null;
  fotoLlegadaUrl: string | null;
  horaSalida: string | null;
  ubicacionSalidaMapa: string | null;
  fotoSalidaUrl: string | null;
};

export async function obtenerEventosDeHoyParaMi(): Promise<EventoDeHoy[]> {
  const sesion = await obtenerSesion();
  if (!sesion || !tieneBitacora(sesion.rol)) return [];

  const supabase = supabaseServer();
  const hoy = hoyPeru();

  const { data: comunicados, error } = await supabase
    .from("comunicados")
    .select("id, tipo, mensaje, ubicacion, usuarios_destino")
    .eq("fecha_evento", hoy)
    .not("ubicacion", "is", null);

  if (error) throw new Error("No se pudo cargar los eventos de hoy.");

  const relevantes = (comunicados ?? []).filter(
    (c) => !c.usuarios_destino || c.usuarios_destino.length === 0 || c.usuarios_destino.includes(sesion.id)
  );
  if (relevantes.length === 0) return [];

  const { data: asistencias } = await supabase
    .from("asistencia_eventos")
    .select(
      "comunicado_id, hora_llegada, ubicacion_llegada, foto_llegada_blob, hora_salida, ubicacion_salida, foto_salida_blob"
    )
    .eq("usuario_id", sesion.id)
    .in(
      "comunicado_id",
      relevantes.map((c) => c.id)
    );

  const mapaAsistencia = new Map((asistencias ?? []).map((a) => [a.comunicado_id, a]));

  return Promise.all(
    relevantes.map(async (c) => {
      const a = mapaAsistencia.get(c.id);
      const [fotoLlegadaUrl, fotoSalidaUrl] = await Promise.all([
        obtenerUrlTemporalFoto(a?.foto_llegada_blob ?? null),
        obtenerUrlTemporalFoto(a?.foto_salida_blob ?? null),
      ]);
      return {
        comunicadoId: c.id,
        tipo: c.tipo,
        mensaje: c.mensaje,
        ubicacion: c.ubicacion as string,
        horaLlegada: a?.hora_llegada ?? null,
        ubicacionLlegadaMapa: a?.ubicacion_llegada ?? null,
        fotoLlegadaUrl,
        horaSalida: a?.hora_salida ?? null,
        ubicacionSalidaMapa: a?.ubicacion_salida ?? null,
        fotoSalidaUrl,
      };
    })
  );
}

export type ResultadoAsistenciaEvento = { exito: boolean; mensaje?: string };

// Un comunicado es válido para marcar asistencia si existe, tiene ubicación,
// y (sin destinatarios específicos, o la sesión está entre ellos) -- mismo
// criterio que obtenerEventosDeHoyParaMi, para que nadie marque asistencia a
// un evento que no le corresponde solo por conocer su id.
async function validarEventoParaUsuario(
  supabase: ReturnType<typeof supabaseServer>,
  comunicadoId: string,
  usuarioId: string
): Promise<boolean> {
  const { data } = await supabase
    .from("comunicados")
    .select("ubicacion, usuarios_destino")
    .eq("id", comunicadoId)
    .maybeSingle();
  if (!data || !data.ubicacion) return false;
  return !data.usuarios_destino || data.usuarios_destino.length === 0 || data.usuarios_destino.includes(usuarioId);
}

// Mismo criterio de origen que autoasignarTienda (ver supervisor/actions.ts):
// si ya estás parado en una tienda (llegada sin salida hoy), el viaje al
// evento sale de ahí -- si no, el cálculo de km usará tu domicilio.
async function inferirOrigenTienda(
  supabase: ReturnType<typeof supabaseServer>,
  usuarioId: string,
  fecha: string
): Promise<string | null> {
  const { data } = await supabase
    .from("rutas_activas")
    .select("tienda_id")
    .eq("usuario_id", usuarioId)
    .eq("fecha_planificada", fecha)
    .not("hora_llegada", "is", null)
    .is("hora_salida", null)
    .order("hora_llegada", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.tienda_id ?? null;
}

export async function marcarLlegadaEvento(
  comunicadoId: string,
  lat: number,
  lng: number,
  fotoBase64: string
): Promise<ResultadoAsistenciaEvento> {
  const sesion = await obtenerSesion();
  if (!sesion || !tieneBitacora(sesion.rol)) return { exito: false, mensaje: "No autorizado." };
  if (!fotoBase64) return { exito: false, mensaje: "Toma una foto para marcar la llegada." };

  const supabase = supabaseServer();
  const valido = await validarEventoParaUsuario(supabase, comunicadoId, sesion.id);
  if (!valido) return { exito: false, mensaje: "No se encontró el evento." };

  const fecha = diaLaboralPeru();
  const origenTiendaId = await inferirOrigenTienda(supabase, sesion.id, fecha);

  const hora = horaPeru();
  const ubicacion = "https://www.google.com/maps?q=" + lat + "," + lng;
  const fotoBlobPath = `${sesion.id}/evento-${comunicadoId}-llegada-${Date.now()}.jpg`;

  let fotoGuardada = true;
  try {
    await subirFotoMarcacion(fotoBlobPath, fotoBase64);
  } catch (error) {
    console.error("No se pudo subir la foto de llegada al evento:", error);
    fotoGuardada = false;
  }
  const fotoBlob = fotoGuardada ? fotoBlobPath : null;

  const { data: existente } = await supabase
    .from("asistencia_eventos")
    .select("id")
    .eq("comunicado_id", comunicadoId)
    .eq("usuario_id", sesion.id)
    .maybeSingle();

  const { error } = existente
    ? await supabase
        .from("asistencia_eventos")
        .update({
          hora_llegada: hora,
          ubicacion_llegada: ubicacion,
          foto_llegada_blob: fotoBlob,
          origen_tienda_id: origenTiendaId,
        })
        .eq("id", existente.id)
    : await supabase.from("asistencia_eventos").insert({
        comunicado_id: comunicadoId,
        usuario_id: sesion.id,
        fecha,
        origen_tienda_id: origenTiendaId,
        hora_llegada: hora,
        ubicacion_llegada: ubicacion,
        foto_llegada_blob: fotoBlob,
      });

  if (error) return { exito: false, mensaje: "No se pudo registrar la llegada al evento." };

  await sincronizarAsistenciaGeneral(supabase, sesion, "llegada", hora, ubicacion, fotoBlob);

  return fotoGuardada
    ? { exito: true, mensaje: "Llegada al evento registrada." }
    : { exito: true, mensaje: "Llegada al evento registrada sin foto — no se pudo guardar la foto en este momento." };
}

export async function marcarSalidaEvento(
  comunicadoId: string,
  lat: number,
  lng: number,
  fotoBase64: string
): Promise<ResultadoAsistenciaEvento> {
  const sesion = await obtenerSesion();
  if (!sesion || !tieneBitacora(sesion.rol)) return { exito: false, mensaje: "No autorizado." };
  if (!fotoBase64) return { exito: false, mensaje: "Toma una foto para marcar la salida." };

  const supabase = supabaseServer();

  const { data: existente } = await supabase
    .from("asistencia_eventos")
    .select("id")
    .eq("comunicado_id", comunicadoId)
    .eq("usuario_id", sesion.id)
    .maybeSingle();
  if (!existente) return { exito: false, mensaje: "Primero marca la llegada al evento." };

  const hora = horaPeru();
  const ubicacion = "https://www.google.com/maps?q=" + lat + "," + lng;
  const fotoBlobPath = `${sesion.id}/evento-${comunicadoId}-salida-${Date.now()}.jpg`;

  let fotoGuardada = true;
  try {
    await subirFotoMarcacion(fotoBlobPath, fotoBase64);
  } catch (error) {
    console.error("No se pudo subir la foto de salida del evento:", error);
    fotoGuardada = false;
  }
  const fotoBlob = fotoGuardada ? fotoBlobPath : null;

  const { error } = await supabase
    .from("asistencia_eventos")
    .update({ hora_salida: hora, ubicacion_salida: ubicacion, foto_salida_blob: fotoBlob })
    .eq("id", existente.id);

  if (error) return { exito: false, mensaje: "No se pudo registrar la salida del evento." };

  await sincronizarAsistenciaGeneral(supabase, sesion, "salida", hora, ubicacion, fotoBlob);

  return fotoGuardada
    ? { exito: true, mensaje: "Salida del evento registrada." }
    : { exito: true, mensaje: "Salida del evento registrada sin foto — no se pudo guardar la foto en este momento." };
}
