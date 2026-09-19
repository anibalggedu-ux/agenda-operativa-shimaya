"use server";

import { supabaseServer } from "@/lib/supabase-server";
import { exigirSesion } from "@/lib/session";
import { subirFotoHistoria, obtenerUrlTemporalFotoHistoria } from "@/lib/azure-storage";

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
