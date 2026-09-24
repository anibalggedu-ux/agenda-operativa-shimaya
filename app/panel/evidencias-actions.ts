"use server";

import { randomUUID } from "crypto";
import { supabaseServer } from "@/lib/supabase-server";
import { obtenerSesion } from "@/lib/session";
import {
  decodificarFotoBase64,
  eliminarFotoEvidencia,
  subirFotoEvidencia as subirArchivoEvidencia,
} from "@/lib/blob-storage";
import { columnaEvidencia } from "@/lib/evidencias";
import {
  MAX_FOTOS_EVIDENCIA,
  MAX_LARGO_PIE_FOTO,
  type TipoRegistroEvidencia,
} from "@/lib/evidencias-constantes";

// Las fotos se suben una por una recién después de guardar el checklist o
// la auditoría (así ya existe el id al que se asocian). Solo el autor
// puede adjuntarlas, y solo en las horas siguientes a guardarlo: no es una
// forma de agregar fotos a registros viejos.
const HORAS_PARA_ADJUNTAR = 6;
const TIPOS_IMAGEN = ["image/jpeg", "image/png", "image/webp"];

export async function subirFotoEvidencia(
  tipo: TipoRegistroEvidencia,
  registroId: string,
  dataUrl: string,
  pie: string,
  // Versión de 640px para mostrar en pantalla (opcional).
  miniDataUrl?: string
): Promise<{ exito: boolean; mensaje?: string }> {
  const sesion = await obtenerSesion();
  if (!sesion) return { exito: false, mensaje: "Tu sesión venció. Vuelve a entrar." };
  if (tipo !== "checklist" && tipo !== "auditoria") return { exito: false, mensaje: "Tipo inválido." };

  const pieLimpio = String(pie ?? "").trim().slice(0, MAX_LARGO_PIE_FOTO);

  let contentType: string;
  try {
    contentType = decodificarFotoBase64(dataUrl).contentType;
  } catch {
    return { exito: false, mensaje: "La foto no tiene un formato válido." };
  }
  if (!TIPOS_IMAGEN.includes(contentType)) return { exito: false, mensaje: "Solo se aceptan fotos." };

  const supabase = supabaseServer();

  const registro =
    tipo === "checklist"
      ? await supabase.from("checklists_visita").select("usuario_id, created_at").eq("id", registroId).maybeSingle()
      : await supabase.from("auditorias").select("supervisor_id, created_at").eq("id", registroId).maybeSingle();
  const fila = registro.data as { usuario_id?: string; supervisor_id?: string; created_at: string } | null;
  if (!fila) return { exito: false, mensaje: "No se encontró el registro." };

  const autor = fila.usuario_id ?? fila.supervisor_id;
  if (autor !== sesion.id) return { exito: false, mensaje: "Solo quien lo hizo puede adjuntar fotos." };
  if (Date.now() - new Date(fila.created_at).getTime() > HORAS_PARA_ADJUNTAR * 3600 * 1000) {
    return { exito: false, mensaje: "Ya pasó el tiempo para adjuntar fotos a este registro." };
  }

  const columna = columnaEvidencia(tipo);
  const { count } = await supabase
    .from("fotos_evidencia")
    .select("id", { count: "exact", head: true })
    .eq(columna, registroId);
  if ((count ?? 0) >= MAX_FOTOS_EVIDENCIA) {
    return { exito: false, mensaje: `Se pueden adjuntar hasta ${MAX_FOTOS_EVIDENCIA} fotos.` };
  }

  const extension = contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
  const blobPath = `${tipo}/${registroId}/${randomUUID()}.${extension}`;
  let tieneMiniatura = false;
  try {
    const miniValida = miniDataUrl && /^data:image\/(jpeg|png|webp);base64,/.test(miniDataUrl) ? miniDataUrl : null;
    tieneMiniatura = await subirArchivoEvidencia(blobPath, dataUrl, miniValida);
  } catch (error) {
    console.error("No se pudo subir la foto de evidencia:", error);
    return { exito: false, mensaje: "No se pudo subir la foto. Intenta de nuevo." };
  }

  const { error } = await supabase.from("fotos_evidencia").insert({
    checklist_id: tipo === "checklist" ? registroId : null,
    auditoria_id: tipo === "auditoria" ? registroId : null,
    usuario_id: sesion.id,
    blob_path: blobPath,
    pie: pieLimpio || null,
    tiene_miniatura: tieneMiniatura,
  });
  if (error) {
    // Sin fila en la base, el archivo quedaría huérfano (el cron no lo vería).
    await eliminarFotoEvidencia(blobPath).catch(() => {});
    return { exito: false, mensaje: "No se pudo guardar la foto. Intenta de nuevo." };
  }

  return { exito: true };
}
