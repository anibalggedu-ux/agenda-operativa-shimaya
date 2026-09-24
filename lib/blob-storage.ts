import { put, del, head, issueSignedToken, presignUrl } from "@vercel/blob";

// Reemplaza a Azure Blob Storage (cuenta deshabilitada por Microsoft en
// sept. 2026 -- ver conversación). Vercel Blob no tiene "contenedores" como
// Azure: son solo prefijos de carpeta dentro de un mismo Blob Store privado.
// El store es privado -- para mostrar una foto se firma un enlace temporal
// (mismo rol que cumplía el SAS token de Azure) en vez de guardar una URL
// pública permanente.

const CARPETA_MARCACIONES = "marcaciones";
const CARPETA_HISTORIAS = "historias";
const CARPETA_PERFILES = "perfiles";
const CARPETA_EVIDENCIAS = "evidencias";

// Convierte un data URL ("data:image/jpeg;base64,...") en el buffer y el
// content-type reales, tal como los produce el input de cámara del celular.
export function decodificarFotoBase64(dataUrl: string): { buffer: Buffer; contentType: string } {
  const match = dataUrl.match(/^data:(.+);base64,(.+)$/);
  if (!match) throw new Error("Formato de foto inválido.");
  return { buffer: Buffer.from(match[2], "base64"), contentType: match[1] };
}

async function subirFoto(carpeta: string, blobPath: string, dataUrl: string, permitirSobrescribir = false): Promise<void> {
  const { buffer, contentType } = decodificarFotoBase64(dataUrl);
  await put(`${carpeta}/${blobPath}`, buffer, {
    access: "private",
    contentType,
    addRandomSuffix: false,
    allowOverwrite: permitirSobrescribir,
  });
}

async function eliminarFoto(carpeta: string, blobPath: string): Promise<void> {
  // del() no falla si el blob ya no existe -- mismo comportamiento que el
  // deleteIfExists de Azure (ej. una segunda corrida sobre el mismo rango).
  await del(`${carpeta}/${blobPath}`);
}

// Versión liviana (640-800px, 50-80 KB) que se guarda junto a la foto completa
// para mostrar en pantalla: "equipo/123.jpg" -> "equipo/123-mini.jpg". La
// completa (~200 KB) queda para descargar o ampliar.
export function rutaMiniatura(blobPath: string): string {
  return /\.[a-z0-9]+$/i.test(blobPath)
    ? blobPath.replace(/(\.[a-z0-9]+)$/i, "-mini$1")
    : `${blobPath}-mini`;
}

// Sube la foto y, si viene, su miniatura. Devuelve si la miniatura quedó
// guardada: si falla, la foto igual sirve (se muestra la completa).
async function subirFotoConMiniatura(
  carpeta: string,
  blobPath: string,
  dataUrl: string,
  miniDataUrl?: string | null
): Promise<boolean> {
  await subirFoto(carpeta, blobPath, dataUrl);
  if (!miniDataUrl) return false;
  try {
    await subirFoto(carpeta, rutaMiniatura(blobPath), miniDataUrl);
    return true;
  } catch (error) {
    console.error("No se pudo subir la miniatura:", error);
    return false;
  }
}

async function eliminarFotoConMiniatura(carpeta: string, blobPath: string): Promise<void> {
  await del([`${carpeta}/${blobPath}`, `${carpeta}/${rutaMiniatura(blobPath)}`]);
}

// Los enlaces firmados vencen en bloques fijos de 30 minutos en vez de
// "ahora + N minutos": así, al volver a abrir una pantalla dentro del mismo
// bloque, el enlace puede salir igual y el celular reutiliza la foto que ya
// descargó en vez de bajarla de nuevo. Siempre dura al menos lo pedido.
const VENTANA_ENLACES_MS = 30 * 60 * 1000;

function vencimientoEstable(minutos: number): number {
  return Math.ceil((Date.now() + minutos * 60 * 1000) / VENTANA_ENLACES_MS) * VENTANA_ENLACES_MS;
}

// Enlace temporal firmado para leer una foto privada -- lo que antes hacía
// el SAS token de Azure. issueSignedToken() pide el permiso al control plane
// de Vercel y presignUrl() firma la URL en sí, ambos con el mismo
// vencimiento (en minutos) que ya usaba cada llamador.
async function generarUrlTemporal(carpeta: string, blobPath: string | null, minutos: number): Promise<string | null> {
  if (!blobPath) return null;
  try {
    const pathname = `${carpeta}/${blobPath}`;
    const validUntil = vencimientoEstable(minutos);
    const token = await issueSignedToken({ pathname, operations: ["get"], validUntil });
    const { presignedUrl } = await presignUrl(token, {
      operation: "get",
      pathname,
      access: "private",
      validUntil,
    });
    return presignedUrl;
  } catch (error) {
    console.error("No se pudo generar el enlace temporal de la foto:", error);
    return null;
  }
}

// --- Marcaciones (asistencia GPS) ---

export async function subirFotoMarcacion(blobPath: string, dataUrl: string): Promise<void> {
  await subirFoto(CARPETA_MARCACIONES, blobPath, dataUrl);
}

// Borrado real e irreversible del archivo -- usado por la depuración manual
// y automática de fotos antiguas (ver app/panel/registro/actions.ts).
export async function eliminarFotoMarcacion(blobPath: string): Promise<void> {
  await eliminarFoto(CARPETA_MARCACIONES, blobPath);
}

export async function obtenerUrlTemporalFoto(blobPath: string | null, minutos = 120): Promise<string | null> {
  return generarUrlTemporal(CARPETA_MARCACIONES, blobPath, minutos);
}

// --- Historias ---

export async function subirFotoHistoria(
  blobPath: string,
  dataUrl: string,
  miniDataUrl?: string | null
): Promise<boolean> {
  return subirFotoConMiniatura(CARPETA_HISTORIAS, blobPath, dataUrl, miniDataUrl);
}

// Borrado real del archivo -- lo usa el cron diario que limpia las historias
// vencidas (más de 7 días), además del borrado manual por moderación.
export async function eliminarFotoHistoria(blobPath: string): Promise<void> {
  await eliminarFotoConMiniatura(CARPETA_HISTORIAS, blobPath);
}

export async function obtenerUrlTemporalFotoHistoria(
  blobPath: string | null,
  minutos = 180,
  // true = que el navegador la descargue directo al tocar "Descargar" en Mi
  // Galería, en vez de solo abrirla. Vercel Blob no deja fijar
  // Content-Disposition en una URL firmada (a diferencia del SAS de Azure),
  // así que la descarga pasa por una ruta propia de la app que sí puede
  // fijar ese header -- ver app/api/blob/descargar/route.ts. Esa ruta la
  // protege la sesión del usuario (misma cookie, mismo dominio), no un
  // token de Vercel.
  forzarDescarga = false,
  // true = la versión liviana para mostrar en pantalla (solo si la historia
  // la tiene, ver historias.tiene_miniatura). La descarga siempre es la
  // completa.
  miniatura = false
): Promise<string | null> {
  if (!blobPath) return null;
  if (forzarDescarga) {
    return `/api/blob/descargar?carpeta=${CARPETA_HISTORIAS}&archivo=${encodeURIComponent(blobPath)}`;
  }
  return generarUrlTemporal(CARPETA_HISTORIAS, miniatura ? rutaMiniatura(blobPath) : blobPath, minutos);
}

// --- Fotos de perfil ---

// El nombre del blob es siempre el id del usuario -- subir una foto nueva
// simplemente sobrescribe la anterior, así que no hace falta guardar ninguna
// referencia en la base de datos ni limpiar archivos huérfanos.
function blobPerfil(usuarioId: string): string {
  return `${usuarioId}.jpg`;
}

export async function subirFotoPerfil(usuarioId: string, dataUrl: string): Promise<void> {
  await subirFoto(CARPETA_PERFILES, blobPerfil(usuarioId), dataUrl, true);
}

// Enlace a la foto de perfil. Quien llama ya sabe si existe
// (usuarios.tiene_foto_perfil), así que no se gasta una operación de Blob
// en cada vista. Solo cuando ese dato todavía es null se consulta con head()
// -- ver existeFotoPerfil.
export async function obtenerUrlTemporalFotoPerfil(usuarioId: string, minutos = 180): Promise<string | null> {
  return generarUrlTemporal(CARPETA_PERFILES, blobPerfil(usuarioId), minutos);
}

export async function existeFotoPerfil(usuarioId: string): Promise<boolean> {
  try {
    await head(`${CARPETA_PERFILES}/${blobPerfil(usuarioId)}`);
    return true;
  } catch {
    return false; // BlobNotFoundError -- nunca subió foto
  }
}

// --- Fotos de evidencia (checklist de visita y auditorías) ---

// blobPath = "<checklist|auditoria>/<id del registro>/<id de la foto>.jpg".
// Se borran a los 60 días desde el cron de depuración (ver lib/evidencias.ts).
export async function subirFotoEvidencia(
  blobPath: string,
  dataUrl: string,
  miniDataUrl?: string | null
): Promise<boolean> {
  return subirFotoConMiniatura(CARPETA_EVIDENCIAS, blobPath, dataUrl, miniDataUrl);
}

export async function eliminarFotoEvidencia(blobPath: string): Promise<void> {
  await eliminarFotoConMiniatura(CARPETA_EVIDENCIAS, blobPath);
}

export async function obtenerUrlTemporalFotoEvidencia(
  blobPath: string,
  minutos = 120,
  miniatura = false
): Promise<string | null> {
  return generarUrlTemporal(CARPETA_EVIDENCIAS, miniatura ? rutaMiniatura(blobPath) : blobPath, minutos);
}
