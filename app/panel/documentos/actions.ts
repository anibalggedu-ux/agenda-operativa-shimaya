"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { obtenerSesion } from "@/lib/session";
import { tieneAccesoRegistro } from "@/lib/permisos";

const BUCKET = "documentos";
const CATEGORIAS_VALIDAS = ["checklists", "formatos", "manuales"] as const;
type Categoria = (typeof CATEGORIAS_VALIDAS)[number];

async function exigirSesion() {
  const sesion = await obtenerSesion();
  if (!sesion) throw new Error("No autorizado.");
  return sesion;
}

async function exigirAccesoDocumentos() {
  const sesion = await exigirSesion();
  const permitido = await tieneAccesoRegistro(sesion.id, sesion.rol);
  if (!permitido) throw new Error("No autorizado.");
  return sesion;
}

export type ResultadoAccion = { exito: boolean; mensaje?: string };

export type Documento = {
  id: string;
  nombre: string;
  categoria: Categoria;
  extension: string;
  tamanoBytes: number;
  subidoPor: string;
  actualizadoEn: string;
};

export async function obtenerDocumentos(): Promise<Documento[]> {
  await exigirSesion();
  const supabase = supabaseServer();

  const { data, error } = await supabase
    .from("documentos")
    .select("id, nombre, categoria, extension, tamano_bytes, subido_por, actualizado_en")
    .order("nombre");

  if (error) throw new Error("No se pudo cargar los documentos.");

  return (data ?? []).map((d) => ({
    id: d.id,
    nombre: d.nombre,
    categoria: d.categoria,
    extension: d.extension,
    tamanoBytes: d.tamano_bytes,
    subidoPor: d.subido_por,
    actualizadoEn: d.actualizado_en,
  }));
}

export async function obtenerUrlDescarga(
  documentoId: string
): Promise<{ url?: string; error?: string }> {
  await exigirSesion();
  const supabase = supabaseServer();

  const { data: doc } = await supabase
    .from("documentos")
    .select("ruta_storage")
    .eq("id", documentoId)
    .maybeSingle();

  if (!doc) return { error: "El documento ya no existe." };

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(doc.ruta_storage, 60);

  if (error || !data) return { error: "No se pudo generar el enlace de descarga." };
  return { url: data.signedUrl };
}

function extraerExtension(nombreArchivo: string): string {
  const partes = nombreArchivo.split(".");
  return partes.length > 1 ? partes.pop()!.toLowerCase() : "";
}

export async function subirDocumento(
  _prevState: ResultadoAccion,
  formData: FormData
): Promise<ResultadoAccion> {
  const sesion = await exigirAccesoDocumentos();

  const nombre = String(formData.get("nombre") || "").trim();
  const categoria = String(formData.get("categoria") || "");
  const archivo = formData.get("archivo") as File | null;

  if (!nombre || !archivo || archivo.size === 0) {
    return { exito: false, mensaje: "Completa el nombre y selecciona un archivo." };
  }
  if (!(CATEGORIAS_VALIDAS as readonly string[]).includes(categoria)) {
    return { exito: false, mensaje: "Categoría inválida." };
  }
  if (archivo.size > 20 * 1024 * 1024) {
    return { exito: false, mensaje: "El archivo supera el límite de 20 MB." };
  }

  const extension = extraerExtension(archivo.name);
  const rutaStorage = `${categoria}/${crypto.randomUUID()}.${extension}`;

  const supabase = supabaseServer();
  const bytes = Buffer.from(await archivo.arrayBuffer());

  const { error: errorSubida } = await supabase.storage
    .from(BUCKET)
    .upload(rutaStorage, bytes, { contentType: archivo.type || undefined });

  if (errorSubida) return { exito: false, mensaje: "No se pudo subir el archivo." };

  const { error: errorInsert } = await supabase.from("documentos").insert({
    nombre,
    categoria,
    ruta_storage: rutaStorage,
    extension,
    tamano_bytes: archivo.size,
    subido_por: sesion.nombre,
  });

  if (errorInsert) {
    await supabase.storage.from(BUCKET).remove([rutaStorage]);
    return { exito: false, mensaje: "No se pudo registrar el documento." };
  }

  revalidatePath("/panel/documentos");
  return { exito: true, mensaje: `${nombre} se subió correctamente.` };
}

export async function actualizarDocumento(formData: FormData): Promise<ResultadoAccion> {
  await exigirAccesoDocumentos();

  const id = String(formData.get("id") || "");
  const nombre = String(formData.get("nombre") || "").trim();
  const categoria = String(formData.get("categoria") || "");
  const archivo = formData.get("archivo") as File | null;

  if (!id || !nombre) return { exito: false, mensaje: "Completa el nombre del documento." };
  if (!(CATEGORIAS_VALIDAS as readonly string[]).includes(categoria)) {
    return { exito: false, mensaje: "Categoría inválida." };
  }

  const supabase = supabaseServer();
  const { data: actual } = await supabase
    .from("documentos")
    .select("ruta_storage")
    .eq("id", id)
    .maybeSingle();

  if (!actual) return { exito: false, mensaje: "El documento ya no existe." };

  const cambios: Record<string, unknown> = {
    nombre,
    categoria,
    actualizado_en: new Date().toISOString(),
  };

  if (archivo && archivo.size > 0) {
    if (archivo.size > 20 * 1024 * 1024) {
      return { exito: false, mensaje: "El archivo supera el límite de 20 MB." };
    }
    const extension = extraerExtension(archivo.name);
    const rutaNueva = `${categoria}/${crypto.randomUUID()}.${extension}`;
    const bytes = Buffer.from(await archivo.arrayBuffer());

    const { error: errorSubida } = await supabase.storage
      .from(BUCKET)
      .upload(rutaNueva, bytes, { contentType: archivo.type || undefined });

    if (errorSubida) return { exito: false, mensaje: "No se pudo subir el nuevo archivo." };

    cambios.ruta_storage = rutaNueva;
    cambios.extension = extension;
    cambios.tamano_bytes = archivo.size;
  }

  const { error } = await supabase.from("documentos").update(cambios).eq("id", id);
  if (error) return { exito: false, mensaje: "No se pudo actualizar el documento." };

  if (cambios.ruta_storage) {
    await supabase.storage.from(BUCKET).remove([actual.ruta_storage]);
  }

  revalidatePath("/panel/documentos");
  return { exito: true };
}

export async function eliminarDocumento(documentoId: string): Promise<ResultadoAccion> {
  await exigirAccesoDocumentos();
  const supabase = supabaseServer();

  const { data: doc } = await supabase
    .from("documentos")
    .select("ruta_storage")
    .eq("id", documentoId)
    .maybeSingle();

  if (!doc) return { exito: false, mensaje: "El documento ya no existe." };

  await supabase.storage.from(BUCKET).remove([doc.ruta_storage]);
  const { error } = await supabase.from("documentos").delete().eq("id", documentoId);

  if (error) return { exito: false, mensaje: "No se pudo eliminar el documento." };

  revalidatePath("/panel/documentos");
  return { exito: true };
}
