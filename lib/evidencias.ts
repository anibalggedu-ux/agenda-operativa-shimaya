import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { eliminarFotoEvidencia, obtenerUrlTemporalFotoEvidencia } from "./blob-storage";
import { DIAS_RETENCION_EVIDENCIAS, type FotoEvidencia, type TipoRegistroEvidencia } from "./evidencias-constantes";

// Solo servidor: lectura y depuración de las fotos de evidencia (tabla
// fotos_evidencia + carpeta evidencias/ de Vercel Blob).

export function columnaEvidencia(tipo: TipoRegistroEvidencia): "checklist_id" | "auditoria_id" {
  return tipo === "checklist" ? "checklist_id" : "auditoria_id";
}

// Fotos de un registro con enlaces temporales firmados. Quien llama ya
// validó que la sesión puede ver ese checklist o auditoría.
export async function cargarFotosEvidencia(
  supabase: SupabaseClient<Database>,
  tipo: TipoRegistroEvidencia,
  registroId: string
): Promise<FotoEvidencia[]> {
  const { data } = await supabase
    .from("fotos_evidencia")
    .select("id, blob_path, pie, tiene_miniatura")
    .eq(columnaEvidencia(tipo), registroId)
    .order("created_at", { ascending: true });

  return Promise.all(
    (data ?? []).map(async (f) => {
      const [urlCompleta, urlMini] = await Promise.all([
        obtenerUrlTemporalFotoEvidencia(f.blob_path),
        f.tiene_miniatura ? obtenerUrlTemporalFotoEvidencia(f.blob_path, 120, true) : Promise.resolve(null),
      ]);
      return { id: f.id, url: urlMini ?? urlCompleta, urlCompleta, pie: f.pie };
    })
  );
}

// Borra archivo y fila de las fotos con más de DIAS_RETENCION_EVIDENCIAS.
// El checklist o la auditoría en sí quedan intactos.
export async function depurarFotosEvidencia(
  supabase: SupabaseClient<Database>,
  limiteLote: number
): Promise<{ borradas: number; pendientes: number }> {
  const corte = new Date(Date.now() - DIAS_RETENCION_EVIDENCIAS * 24 * 3600 * 1000).toISOString();

  const { data, count } = await supabase
    .from("fotos_evidencia")
    .select("id, blob_path", { count: "exact" })
    .lt("created_at", corte)
    .order("created_at", { ascending: true })
    .limit(limiteLote);

  const borradasIds: string[] = [];
  for (const f of data ?? []) {
    try {
      await eliminarFotoEvidencia(f.blob_path);
      borradasIds.push(f.id);
    } catch (error) {
      console.error(`No se pudo borrar la foto de evidencia ${f.blob_path}:`, error);
    }
  }
  if (borradasIds.length > 0) {
    await supabase.from("fotos_evidencia").delete().in("id", borradasIds);
  }

  return { borradas: borradasIds.length, pendientes: Math.max(0, (count ?? 0) - borradasIds.length) };
}
