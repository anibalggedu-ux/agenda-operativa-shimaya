"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { exigirSesion } from "@/lib/session";
import {
  subirFotoAgenda,
  subirDocumentoAgenda,
  eliminarArchivoAgenda,
  obtenerUrlTemporalAgenda,
} from "@/lib/blob-storage";

export type Prioridad = "normal" | "urgente";

export type NotaAgenda = {
  id: string;
  texto: string;
  prioridad: Prioridad;
  recordatorioEn: string | null;
  cumplida: boolean;
  fotoUrl: string | null;
  // Enlace que fuerza la descarga al celular (Content-Disposition:
  // attachment) en vez de solo abrir la vista previa -- ver
  // app/api/blob/descargar/route.ts.
  fotoDescargaUrl: string | null;
  documentoNombre: string | null;
  documentoUrl: string | null;
  creadoEn: string;
};

export type ResultadoAccion = { exito: boolean; mensaje?: string };

const TAMANO_MAXIMO_DOCUMENTO = 10 * 1024 * 1024; // 10 MB

function extraerExtension(nombreArchivo: string): string {
  const partes = nombreArchivo.split(".");
  return partes.length > 1 ? partes.pop()!.toLowerCase() : "";
}

export async function obtenerAgenda(): Promise<NotaAgenda[]> {
  const sesion = await exigirSesion();
  const supabase = supabaseServer();

  const { data, error } = await supabase
    .from("agenda_personal")
    .select("id, texto, prioridad, recordatorio_en, cumplida, foto_blob, documento_blob, documento_nombre, creado_en")
    .eq("usuario_id", sesion.id)
    // Pendientes primero (y entre ellas, la más nueva arriba); las cumplidas
    // quedan al final ordenadas por cuándo se crearon.
    .order("cumplida", { ascending: true })
    .order("creado_en", { ascending: false });

  if (error) throw new Error("No se pudo cargar tu agenda.");

  return Promise.all(
    (data ?? []).map(async (n) => ({
      id: n.id,
      texto: n.texto,
      prioridad: (n.prioridad === "urgente" ? "urgente" : "normal") as Prioridad,
      recordatorioEn: n.recordatorio_en,
      cumplida: n.cumplida,
      fotoUrl: await obtenerUrlTemporalAgenda(n.foto_blob),
      fotoDescargaUrl: n.foto_blob
        ? `/api/blob/descargar?carpeta=agenda&archivo=${encodeURIComponent(n.foto_blob)}&nombre=${encodeURIComponent("foto-agenda.jpg")}`
        : null,
      documentoNombre: n.documento_nombre,
      documentoUrl: n.documento_blob
        ? `/api/blob/descargar?carpeta=agenda&archivo=${encodeURIComponent(n.documento_blob)}&nombre=${encodeURIComponent(n.documento_nombre ?? "adjunto")}`
        : null,
      creadoEn: n.creado_en,
    }))
  );
}

export async function crearNota(formData: FormData): Promise<ResultadoAccion> {
  const sesion = await exigirSesion();

  const texto = String(formData.get("texto") || "").trim();
  const prioridad = formData.get("prioridad") === "urgente" ? "urgente" : "normal";
  const recordatorioEn = String(formData.get("recordatorioEn") || "").trim() || null;
  const fotoDataUrl = String(formData.get("fotoDataUrl") || "").trim() || null;
  const documento = formData.get("documento") as File | null;

  if (!texto) return { exito: false, mensaje: "Escribe algo para tu agenda." };
  if (texto.length > 500) return { exito: false, mensaje: "Máximo 500 caracteres." };
  if (documento && documento.size > TAMANO_MAXIMO_DOCUMENTO) {
    return { exito: false, mensaje: "El documento supera el límite de 10 MB." };
  }

  const supabase = supabaseServer();
  let fotoBlob: string | null = null;
  let documentoBlob: string | null = null;
  let documentoNombre: string | null = null;

  try {
    if (fotoDataUrl) {
      fotoBlob = `${sesion.id}/${crypto.randomUUID()}.jpg`;
      await subirFotoAgenda(fotoBlob, fotoDataUrl);
    }
    if (documento && documento.size > 0) {
      const extension = extraerExtension(documento.name);
      documentoBlob = `${sesion.id}/${crypto.randomUUID()}${extension ? `.${extension}` : ""}`;
      const buffer = Buffer.from(await documento.arrayBuffer());
      await subirDocumentoAgenda(documentoBlob, buffer, documento.type || "application/octet-stream");
      documentoNombre = documento.name;
    }
  } catch (error: any) {
    return { exito: false, mensaje: error.message || "No se pudo subir el adjunto." };
  }

  const { error } = await supabase.from("agenda_personal").insert({
    usuario_id: sesion.id,
    texto,
    prioridad,
    recordatorio_en: recordatorioEn,
    foto_blob: fotoBlob,
    documento_blob: documentoBlob,
    documento_nombre: documentoNombre,
  });

  if (error) {
    if (fotoBlob) await eliminarArchivoAgenda(fotoBlob).catch(() => {});
    if (documentoBlob) await eliminarArchivoAgenda(documentoBlob).catch(() => {});
    return { exito: false, mensaje: "No se pudo guardar la nota." };
  }

  revalidatePath("/panel");
  return { exito: true };
}

// Alternar cumplida/pendiente -- no se usa para "deshacer el borrado", solo
// para tachar o destachar. Compueba que la nota sea del usuario de la sesión
// antes de tocarla.
export async function alternarCumplida(id: string, cumplida: boolean): Promise<ResultadoAccion> {
  const sesion = await exigirSesion();
  const supabase = supabaseServer();

  const { error } = await supabase
    .from("agenda_personal")
    .update({ cumplida, cumplida_en: cumplida ? new Date().toISOString() : null })
    .eq("id", id)
    .eq("usuario_id", sesion.id);

  if (error) return { exito: false, mensaje: "No se pudo actualizar la nota." };
  revalidatePath("/panel");
  return { exito: true };
}

// Borra los adjuntos (foto y/o documento) de notas con más de `hasta` --
// la nota y su texto quedan intactos, solo se limpia el archivo. Llamado por
// el cron diario que ya depura marcaciones (ver app/api/cron/depurar-marcaciones).
export async function ejecutarDepuracionAdjuntosAgenda(
  hasta: string,
  limiteLote: number
): Promise<{ borrados: number; pendientes: number }> {
  const supabase = supabaseServer();

  const { data: filas, error } = await supabase
    .from("agenda_personal")
    .select("id, foto_blob, documento_blob")
    .lt("creado_en", hasta)
    .or("foto_blob.not.is.null,documento_blob.not.is.null")
    .limit(limiteLote + 1);

  if (error || !filas) return { borrados: 0, pendientes: 0 };

  const pendientes = filas.length > limiteLote ? filas.length - limiteLote : 0;
  const lote = filas.slice(0, limiteLote);

  let borrados = 0;
  for (const fila of lote) {
    try {
      if (fila.foto_blob) await eliminarArchivoAgenda(fila.foto_blob);
      if (fila.documento_blob) await eliminarArchivoAgenda(fila.documento_blob);
      await supabase
        .from("agenda_personal")
        .update({ foto_blob: null, documento_blob: null, documento_nombre: null })
        .eq("id", fila.id);
      borrados++;
    } catch (err) {
      console.error(`No se pudo depurar el adjunto de la nota ${fila.id}:`, err);
    }
  }

  return { borrados, pendientes };
}

export async function eliminarNota(id: string): Promise<ResultadoAccion> {
  const sesion = await exigirSesion();
  const supabase = supabaseServer();

  const { data: nota } = await supabase
    .from("agenda_personal")
    .select("foto_blob, documento_blob")
    .eq("id", id)
    .eq("usuario_id", sesion.id)
    .maybeSingle();

  if (!nota) return { exito: false, mensaje: "La nota ya no existe." };

  const { error } = await supabase.from("agenda_personal").delete().eq("id", id).eq("usuario_id", sesion.id);
  if (error) return { exito: false, mensaje: "No se pudo eliminar la nota." };

  if (nota.foto_blob) await eliminarArchivoAgenda(nota.foto_blob).catch(() => {});
  if (nota.documento_blob) await eliminarArchivoAgenda(nota.documento_blob).catch(() => {});

  revalidatePath("/panel");
  return { exito: true };
}
