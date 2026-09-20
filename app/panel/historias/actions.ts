"use server";

import { supabaseServer } from "@/lib/supabase-server";
import { exigirSesion } from "@/lib/session";
import { subirFotoHistoria, obtenerUrlTemporalFotoHistoria, eliminarFotoHistoria } from "@/lib/azure-storage";
import { obtenerSaldoDisponibleParaRegalo, obtenerTotalDonado, obtenerTotalRecibido } from "../puntos-actions";
import { hoyPeru } from "@/lib/fechas";

// Las historias se muestran mientras tengan menos de 24 horas -- el borrado
// real (fila + blob en Azure) lo hace un cron aparte, este filtro solo
// decide qué se sigue mostrando en el feed mientras tanto.
const HORAS_VISIBLE = 24;
const TEXTO_MAXIMO = 200;

export type ResultadoHistoria = { exito: boolean; mensaje?: string };

export type FotoGaleria = {
  id: string;
  url: string;
  urlDescarga: string;
  texto: string | null;
  creadoEn: string;
  minutosRestantes: number;
};

// Solo las fotos propias -- "Mi Galería" es un espacio personal, distinto
// del feed de Historias del equipo que muestra las de todos.
export async function obtenerMiGaleria(): Promise<FotoGaleria[]> {
  const sesion = await exigirSesion();
  const supabase = supabaseServer();
  const desde = new Date(Date.now() - HORAS_VISIBLE * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("historias")
    .select("id, foto_blob, texto, created_at")
    .eq("usuario_id", sesion.id)
    .gte("created_at", desde)
    .order("created_at", { ascending: false });

  if (error || !data) return [];

  const conUrls = await Promise.all(
    data.map(async (fila) => {
      const [url, urlDescarga] = await Promise.all([
        obtenerUrlTemporalFotoHistoria(fila.foto_blob, 180),
        obtenerUrlTemporalFotoHistoria(fila.foto_blob, 180, true),
      ]);
      if (!url || !urlDescarga) return null;

      const minutosTranscurridos = Math.floor((Date.now() - new Date(fila.created_at).getTime()) / 60000);
      return {
        id: fila.id,
        url,
        urlDescarga,
        texto: fila.texto,
        creadoEn: fila.created_at,
        minutosRestantes: Math.max(HORAS_VISIBLE * 60 - minutosTranscurridos, 0),
      };
    })
  );

  return conUrls.filter((f): f is FotoGaleria => f !== null);
}

export async function crearHistoria(fotoDataUrl: string, texto?: string): Promise<ResultadoHistoria> {
  try {
    const sesion = await exigirSesion();

    if (!fotoDataUrl || !fotoDataUrl.startsWith("data:image/")) {
      return { exito: false, mensaje: "La foto no tiene un formato válido." };
    }

    const textoLimpio = texto?.trim().slice(0, TEXTO_MAXIMO) || null;

    const blobPath = `${sesion.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
    await subirFotoHistoria(blobPath, fotoDataUrl);

    const supabase = supabaseServer();
    const { error } = await supabase.from("historias").insert({
      usuario_id: sesion.id,
      foto_blob: blobPath,
      texto: textoLimpio,
    });

    if (error) {
      return { exito: false, mensaje: "No se pudo guardar la historia." };
    }

    // Para la racha de publicación -- no se borra cuando la foto vence a
    // las 24 horas, así que no importa si ya existía la fila de hoy.
    await supabase
      .from("historia_publicaciones")
      .upsert({ usuario_id: sesion.id, fecha: hoyPeru() }, { onConflict: "usuario_id,fecha", ignoreDuplicates: true });

    return { exito: true };
  } catch (err: any) {
    return { exito: false, mensaje: err?.message || "No se pudo publicar la foto." };
  }
}

// El propio autor puede borrar su historia (ej. la subió por error), y
// coordinador/gerente pueden borrar la de cualquiera por moderación.
function puedeModerar(rol: string): boolean {
  return rol === "coordinador" || rol === "gerente";
}

export async function eliminarHistoria(historiaId: string): Promise<ResultadoHistoria> {
  try {
    const sesion = await exigirSesion();
    const supabase = supabaseServer();

    const { data, error: errorLectura } = await supabase
      .from("historias")
      .select("id, usuario_id, foto_blob")
      .eq("id", historiaId)
      .single();

    if (errorLectura || !data) {
      return { exito: false, mensaje: "La historia ya no existe." };
    }
    if (data.usuario_id !== sesion.id && !puedeModerar(sesion.rol)) {
      return { exito: false, mensaje: "No puedes borrar la historia de otra persona." };
    }

    const { error: errorBorrado } = await supabase.from("historias").delete().eq("id", historiaId);
    if (errorBorrado) {
      return { exito: false, mensaje: "No se pudo borrar la historia." };
    }

    await eliminarFotoHistoria(data.foto_blob);
    return { exito: true };
  } catch (err: any) {
    return { exito: false, mensaje: err?.message || "No se pudo borrar la historia." };
  }
}

export type ComentarioHistoria = {
  id: string;
  usuarioId: string;
  nombre: string;
  rol: string;
  texto: string;
  creadoEn: string;
};

export type ReaccionResumen = {
  emoji: string;
  cantidad: number;
  // Solo viene con datos si quien pregunta es el autor de la historia o
  // puede moderar -- a los demás se les muestra la cantidad, no quién.
  nombres?: string[];
};

export type VistaHistoria = { usuarioId: string; nombre: string; rol: string; creadoEn: string };

export type DetalleHistoria = {
  comentarios: ComentarioHistoria[];
  reacciones: ReaccionResumen[];
  miReaccion: string | null;
  // Solo viene con datos si quien pregunta es el autor de la historia o
  // puede moderar -- a los demás no se les muestra quién más la vio.
  vistas: VistaHistoria[];
};

const TEXTO_COMENTARIO_MAXIMO = 300;

export async function obtenerDetalleHistoria(historiaId: string): Promise<DetalleHistoria> {
  const sesion = await exigirSesion();
  const supabase = supabaseServer();

  const [comentariosRes, reaccionesRes, historiaRes] = await Promise.all([
    supabase
      .from("historia_comentarios")
      .select("id, usuario_id, texto, created_at, usuarios(nombre, rol)")
      .eq("historia_id", historiaId)
      .order("created_at", { ascending: true }),
    supabase.from("historia_reacciones").select("usuario_id, emoji, usuarios(nombre)").eq("historia_id", historiaId),
    supabase.from("historias").select("usuario_id").eq("id", historiaId).single(),
  ]);

  const comentarios: ComentarioHistoria[] = ((comentariosRes.data ?? []) as any[]).map((c) => ({
    id: c.id,
    usuarioId: c.usuario_id,
    nombre: c.usuarios?.nombre ?? "—",
    rol: c.usuarios?.rol ?? "",
    texto: c.texto,
    creadoEn: c.created_at,
  }));

  const esDueno = historiaRes.data?.usuario_id === sesion.id;
  const puedeVerQuienes = esDueno || puedeModerar(sesion.rol);

  const conteo = new Map<string, number>();
  const nombresPorEmoji = new Map<string, string[]>();
  let miReaccion: string | null = null;
  ((reaccionesRes.data ?? []) as any[]).forEach((r) => {
    conteo.set(r.emoji, (conteo.get(r.emoji) ?? 0) + 1);
    if (r.usuario_id === sesion.id) miReaccion = r.emoji;
    if (puedeVerQuienes) {
      const lista = nombresPorEmoji.get(r.emoji) ?? [];
      lista.push(r.usuarios?.nombre ?? "—");
      nombresPorEmoji.set(r.emoji, lista);
    }
  });

  let vistas: VistaHistoria[] = [];
  if (puedeVerQuienes) {
    const { data: vistasData } = await supabase
      .from("historia_vistas")
      .select("usuario_id, created_at, usuarios(nombre, rol)")
      .eq("historia_id", historiaId)
      .order("created_at", { ascending: true });

    vistas = ((vistasData ?? []) as any[]).map((v) => ({
      usuarioId: v.usuario_id,
      nombre: v.usuarios?.nombre ?? "—",
      rol: v.usuarios?.rol ?? "",
      creadoEn: v.created_at,
    }));
  }

  return {
    comentarios,
    reacciones: Array.from(conteo.entries()).map(([emoji, cantidad]) => ({
      emoji,
      cantidad,
      nombres: puedeVerQuienes ? nombresPorEmoji.get(emoji) : undefined,
    })),
    miReaccion,
    vistas,
  };
}

// Se llama al abrir una historia ajena -- la propia no se marca como vista
// por su autor. upsert con ignoreDuplicates conserva el momento de la
// PRIMERA vista si la persona la vuelve a abrir después.
export async function registrarVista(historiaId: string): Promise<void> {
  const sesion = await exigirSesion();
  const supabase = supabaseServer();
  await supabase
    .from("historia_vistas")
    .upsert({ historia_id: historiaId, usuario_id: sesion.id }, { onConflict: "historia_id,usuario_id", ignoreDuplicates: true });
}

export async function agregarComentario(historiaId: string, texto: string): Promise<ResultadoHistoria> {
  try {
    const sesion = await exigirSesion();
    const limpio = texto.trim().slice(0, TEXTO_COMENTARIO_MAXIMO);
    if (!limpio) {
      return { exito: false, mensaje: "Escribe algo antes de enviar." };
    }

    const supabase = supabaseServer();
    const { error } = await supabase
      .from("historia_comentarios")
      .insert({ historia_id: historiaId, usuario_id: sesion.id, texto: limpio });

    if (error) {
      return { exito: false, mensaje: "No se pudo publicar el comentario." };
    }
    return { exito: true };
  } catch (err: any) {
    return { exito: false, mensaje: err?.message || "No se pudo publicar el comentario." };
  }
}

export async function eliminarComentario(comentarioId: string): Promise<ResultadoHistoria> {
  try {
    const sesion = await exigirSesion();
    const supabase = supabaseServer();

    const { data, error: errorLectura } = await supabase
      .from("historia_comentarios")
      .select("id, usuario_id")
      .eq("id", comentarioId)
      .single();

    if (errorLectura || !data) {
      return { exito: false, mensaje: "El comentario ya no existe." };
    }
    if (data.usuario_id !== sesion.id && !puedeModerar(sesion.rol)) {
      return { exito: false, mensaje: "No puedes borrar el comentario de otra persona." };
    }

    const { error } = await supabase.from("historia_comentarios").delete().eq("id", comentarioId);
    if (error) {
      return { exito: false, mensaje: "No se pudo borrar el comentario." };
    }
    return { exito: true };
  } catch (err: any) {
    return { exito: false, mensaje: err?.message || "No se pudo borrar el comentario." };
  }
}

export type ResultadoReaccion = {
  exito: boolean;
  mensaje?: string;
  reacciones?: ReaccionResumen[];
  miReaccion?: string | null;
};

// Una reacción por persona por historia: tocar el mismo emoji la quita,
// tocar otro la reemplaza -- igual que WhatsApp.
export async function alternarReaccion(historiaId: string, emoji: string): Promise<ResultadoReaccion> {
  try {
    const sesion = await exigirSesion();
    const supabase = supabaseServer();

    const { data: actual } = await supabase
      .from("historia_reacciones")
      .select("id, emoji")
      .eq("historia_id", historiaId)
      .eq("usuario_id", sesion.id)
      .maybeSingle();

    if (actual && actual.emoji === emoji) {
      await supabase.from("historia_reacciones").delete().eq("id", actual.id);
    } else if (actual) {
      await supabase.from("historia_reacciones").update({ emoji }).eq("id", actual.id);
    } else {
      await supabase.from("historia_reacciones").insert({ historia_id: historiaId, usuario_id: sesion.id, emoji });
    }

    const detalle = await obtenerDetalleHistoria(historiaId);
    return { exito: true, reacciones: detalle.reacciones, miReaccion: detalle.miReaccion };
  } catch (err: any) {
    return { exito: false, mensaje: err?.message || "No se pudo reaccionar." };
  }
}

export type HistoriaFoto = {
  id: string;
  url: string;
  texto: string | null;
  creadoEn: string;
  // Comentarios + reacciones combinados -- se muestra como un badge chico
  // sobre el círculo del feed, sin tener que abrir la foto.
  interacciones: number;
  // Si quien pregunta ya vio esta foto -- pinta el anillo del círculo del
  // feed gris (vista) o rojo (sin ver), igual que WhatsApp/Instagram.
  vistoPorMi: boolean;
};

export type GrupoHistorias = {
  usuarioId: string;
  nombre: string;
  rol: string;
  // De la más antigua a la más reciente -- se navegan en el orden en que se
  // publicaron, igual que WhatsApp/Instagram.
  historias: HistoriaFoto[];
};

export async function obtenerFeedHistorias(): Promise<GrupoHistorias[]> {
  const sesion = await exigirSesion();

  const supabase = supabaseServer();
  const desde = new Date(Date.now() - HORAS_VISIBLE * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("historias")
    .select("id, usuario_id, foto_blob, texto, created_at, usuarios(nombre, rol)")
    .gte("created_at", desde)
    .order("created_at", { ascending: false });

  if (error || !data) return [];

  const idsHistorias = (data as any[]).map((f) => f.id);
  const [reaccionesRes, comentariosRes, vistasRes] = await Promise.all([
    supabase.from("historia_reacciones").select("historia_id").in("historia_id", idsHistorias),
    supabase.from("historia_comentarios").select("historia_id").in("historia_id", idsHistorias),
    supabase
      .from("historia_vistas")
      .select("historia_id")
      .in("historia_id", idsHistorias)
      .eq("usuario_id", sesion.id),
  ]);
  const conteoInteracciones = new Map<string, number>();
  (reaccionesRes.data ?? []).forEach((r: any) =>
    conteoInteracciones.set(r.historia_id, (conteoInteracciones.get(r.historia_id) ?? 0) + 1)
  );
  (comentariosRes.data ?? []).forEach((c: any) =>
    conteoInteracciones.set(c.historia_id, (conteoInteracciones.get(c.historia_id) ?? 0) + 1)
  );
  const idsVistas = new Set((vistasRes.data ?? []).map((v: any) => v.historia_id));

  const filasConUrl = await Promise.all(
    (data as any[]).map(async (fila) => ({
      fila,
      url: await obtenerUrlTemporalFotoHistoria(fila.foto_blob, 180),
    }))
  );

  const porUsuario = new Map<string, GrupoHistorias>();
  for (const { fila, url } of filasConUrl) {
    if (!url) continue; // no se pudo generar el enlace (ej. Azure no configurado)
    const grupo: GrupoHistorias = porUsuario.get(fila.usuario_id) ?? {
      usuarioId: fila.usuario_id,
      nombre: fila.usuarios?.nombre ?? "—",
      rol: fila.usuarios?.rol ?? "",
      historias: [],
    };
    grupo.historias.push({
      id: fila.id,
      url,
      texto: fila.texto,
      creadoEn: fila.created_at,
      interacciones: conteoInteracciones.get(fila.id) ?? 0,
      vistoPorMi: idsVistas.has(fila.id),
    });
    porUsuario.set(fila.usuario_id, grupo);
  }

  const grupos = Array.from(porUsuario.values());
  grupos.forEach((g) => g.historias.reverse()); // veníamos de más reciente a más antigua

  grupos.sort((a, b) => {
    const masRecienteA = a.historias[a.historias.length - 1].creadoEn;
    const masRecienteB = b.historias[b.historias.length - 1].creadoEn;
    return masRecienteB.localeCompare(masRecienteA);
  });

  return grupos;
}

const MONTOS_REGALO_VALIDOS = [5, 10, 15, 20, 50];

export type SaldoRegalo = { saldo: number; totalDonado: number; totalRecibido: number };

// Para pintar el panel de "Regalar puntos" y el resumen de Mi Galería:
// cuánto tiene disponible ahora mismo, cuánto ha donado y cuánto ha recibido
// en total.
export async function obtenerMiSaldoDeRegalo(): Promise<SaldoRegalo> {
  await exigirSesion();
  const [saldo, totalDonado, totalRecibido] = await Promise.all([
    obtenerSaldoDisponibleParaRegalo(),
    obtenerTotalDonado(),
    obtenerTotalRecibido(),
  ]);
  return { saldo, totalDonado, totalRecibido };
}

export type ResultadoRegalo = ResultadoHistoria & { saldo?: number };

export async function regalarPuntos(historiaId: string, monto: number): Promise<ResultadoRegalo> {
  try {
    const sesion = await exigirSesion();

    if (!MONTOS_REGALO_VALIDOS.includes(monto)) {
      return { exito: false, mensaje: "Monto inválido." };
    }

    const supabase = supabaseServer();
    const { data: historia, error: errorHistoria } = await supabase
      .from("historias")
      .select("id, usuario_id")
      .eq("id", historiaId)
      .single();

    if (errorHistoria || !historia) {
      return { exito: false, mensaje: "La historia ya no existe." };
    }
    if (historia.usuario_id === sesion.id) {
      return { exito: false, mensaje: "No puedes regalarte puntos a ti mismo." };
    }

    const saldo = await obtenerSaldoDisponibleParaRegalo();
    if (saldo < monto) {
      return { exito: false, mensaje: `No te alcanza -- tienes ${saldo} pts disponibles.`, saldo };
    }

    const { error } = await supabase.from("historia_regalos").insert({
      historia_id: historiaId,
      usuario_id_regala: sesion.id,
      usuario_id_recibe: historia.usuario_id,
      puntos: monto,
    });

    if (error) {
      return { exito: false, mensaje: "No se pudo enviar el regalo." };
    }

    return { exito: true, saldo: saldo - monto };
  } catch (err: any) {
    return { exito: false, mensaje: err?.message || "No se pudo enviar el regalo." };
  }
}
