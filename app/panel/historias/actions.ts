"use server";

import { supabaseServer } from "@/lib/supabase-server";
import { exigirSesion } from "@/lib/session";
import { subirFotoHistoria, obtenerUrlTemporalFotoHistoria, eliminarFotoHistoria } from "@/lib/azure-storage";

// Las historias se muestran mientras tengan menos de 7 días -- el borrado
// real (fila + blob en Azure) lo hace un cron aparte, este filtro solo
// decide qué se sigue mostrando en el feed mientras tanto.
const DIAS_VISIBLE = 7;
const TEXTO_MAXIMO = 200;

export type ResultadoHistoria = { exito: boolean; mensaje?: string };

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

export type ReaccionResumen = { emoji: string; cantidad: number };

export type DetalleHistoria = {
  comentarios: ComentarioHistoria[];
  reacciones: ReaccionResumen[];
  miReaccion: string | null;
};

const TEXTO_COMENTARIO_MAXIMO = 300;

export async function obtenerDetalleHistoria(historiaId: string): Promise<DetalleHistoria> {
  const sesion = await exigirSesion();
  const supabase = supabaseServer();

  const [comentariosRes, reaccionesRes] = await Promise.all([
    supabase
      .from("historia_comentarios")
      .select("id, usuario_id, texto, created_at, usuarios(nombre, rol)")
      .eq("historia_id", historiaId)
      .order("created_at", { ascending: true }),
    supabase.from("historia_reacciones").select("usuario_id, emoji").eq("historia_id", historiaId),
  ]);

  const comentarios: ComentarioHistoria[] = ((comentariosRes.data ?? []) as any[]).map((c) => ({
    id: c.id,
    usuarioId: c.usuario_id,
    nombre: c.usuarios?.nombre ?? "—",
    rol: c.usuarios?.rol ?? "",
    texto: c.texto,
    creadoEn: c.created_at,
  }));

  const conteo = new Map<string, number>();
  let miReaccion: string | null = null;
  ((reaccionesRes.data ?? []) as any[]).forEach((r) => {
    conteo.set(r.emoji, (conteo.get(r.emoji) ?? 0) + 1);
    if (r.usuario_id === sesion.id) miReaccion = r.emoji;
  });

  return {
    comentarios,
    reacciones: Array.from(conteo.entries()).map(([emoji, cantidad]) => ({ emoji, cantidad })),
    miReaccion,
  };
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

export type HistoriaFoto = { id: string; url: string; texto: string | null; creadoEn: string };

export type GrupoHistorias = {
  usuarioId: string;
  nombre: string;
  rol: string;
  // De la más antigua a la más reciente -- se navegan en el orden en que se
  // publicaron, igual que WhatsApp/Instagram.
  historias: HistoriaFoto[];
};

export async function obtenerFeedHistorias(): Promise<GrupoHistorias[]> {
  await exigirSesion();

  const supabase = supabaseServer();
  const desde = new Date(Date.now() - DIAS_VISIBLE * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("historias")
    .select("id, usuario_id, foto_blob, texto, created_at, usuarios(nombre, rol)")
    .gte("created_at", desde)
    .order("created_at", { ascending: false });

  if (error || !data) return [];

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
    grupo.historias.push({ id: fila.id, url, texto: fila.texto, creadoEn: fila.created_at });
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
