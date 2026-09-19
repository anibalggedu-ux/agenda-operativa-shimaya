import {
  BlobServiceClient,
  StorageSharedKeyCredential,
  generateBlobSASQueryParameters,
  BlobSASPermissions,
} from "@azure/storage-blob";

// Las fotos de marcación (ingreso/salida) van a Azure Blob Storage en vez de
// la base de datos, para no llenarla de archivos binarios. El contenedor es
// privado — para mostrar una foto se genera un enlace temporal (SAS) en vez
// de guardar una URL pública permanente.

function obtenerConnectionString(): string {
  const cs = process.env.AZURE_STORAGE_CONNECTION_STRING;
  if (!cs) throw new Error("Falta configurar AZURE_STORAGE_CONNECTION_STRING.");
  return cs;
}

function obtenerNombreContenedor(): string {
  return process.env.AZURE_STORAGE_CONTAINER || "marcaciones";
}

// Las fotos de Historias van a un contenedor aparte de las de marcación: se
// borran automáticamente a los 7 días (ver cron de limpieza), así que
// conviene tenerlas separadas de las fotos de asistencia, que se conservan.
function obtenerNombreContenedorHistorias(): string {
  return process.env.AZURE_STORAGE_CONTAINER_HISTORIAS || "historias";
}

function obtenerCredencial(connectionString: string): StorageSharedKeyCredential | null {
  const match = connectionString.match(/AccountName=([^;]+);AccountKey=([^;]+)/);
  if (!match) return null;
  return new StorageSharedKeyCredential(match[1], match[2]);
}

// Convierte un data URL ("data:image/jpeg;base64,...") en el buffer y el
// content-type reales, tal como los produce el input de cámara del celular.
export function decodificarFotoBase64(dataUrl: string): { buffer: Buffer; contentType: string } {
  const match = dataUrl.match(/^data:(.+);base64,(.+)$/);
  if (!match) throw new Error("Formato de foto inválido.");
  return { buffer: Buffer.from(match[2], "base64"), contentType: match[1] };
}

export async function subirFotoMarcacion(blobPath: string, dataUrl: string): Promise<void> {
  const connectionString = obtenerConnectionString();
  const { buffer, contentType } = decodificarFotoBase64(dataUrl);

  const cliente = BlobServiceClient.fromConnectionString(connectionString);
  const contenedor = cliente.getContainerClient(obtenerNombreContenedor());
  await contenedor.createIfNotExists();

  const blockBlob = contenedor.getBlockBlobClient(blobPath);
  await blockBlob.uploadData(buffer, { blobHTTPHeaders: { blobContentType: contentType } });
}

// Borrado real e irreversible del archivo -- usado solo por la depuración
// manual de fotos antiguas desde Registro (ver app/panel/registro/actions.ts).
// deleteIfExists no falla si el blob ya no existe (ej. una segunda corrida
// sobre el mismo rango, o una referencia que ya estaba huérfana).
export async function eliminarFotoMarcacion(blobPath: string): Promise<void> {
  const connectionString = obtenerConnectionString();
  const cliente = BlobServiceClient.fromConnectionString(connectionString);
  const contenedor = cliente.getContainerClient(obtenerNombreContenedor());
  const blockBlob = contenedor.getBlockBlobClient(blobPath);
  await blockBlob.deleteIfExists();
}

export async function obtenerUrlTemporalFoto(
  blobPath: string | null,
  minutos = 120
): Promise<string | null> {
  if (!blobPath) return null;
  try {
    const connectionString = obtenerConnectionString();
    const credencial = obtenerCredencial(connectionString);
    if (!credencial) return null;

    const cliente = BlobServiceClient.fromConnectionString(connectionString);
    const contenedor = cliente.getContainerClient(obtenerNombreContenedor());
    const blockBlob = contenedor.getBlockBlobClient(blobPath);

    const sas = generateBlobSASQueryParameters(
      {
        containerName: obtenerNombreContenedor(),
        blobName: blobPath,
        permissions: BlobSASPermissions.parse("r"),
        expiresOn: new Date(Date.now() + minutos * 60 * 1000),
      },
      credencial
    ).toString();

    return `${blockBlob.url}?${sas}`;
  } catch (error) {
    console.error("No se pudo generar el enlace temporal de la foto:", error);
    return null;
  }
}

export async function subirFotoHistoria(blobPath: string, dataUrl: string): Promise<void> {
  const connectionString = obtenerConnectionString();
  const { buffer, contentType } = decodificarFotoBase64(dataUrl);

  const cliente = BlobServiceClient.fromConnectionString(connectionString);
  const contenedor = cliente.getContainerClient(obtenerNombreContenedorHistorias());
  await contenedor.createIfNotExists();

  const blockBlob = contenedor.getBlockBlobClient(blobPath);
  await blockBlob.uploadData(buffer, { blobHTTPHeaders: { blobContentType: contentType } });
}

// Borrado real del archivo -- lo usa el cron diario que limpia las historias
// vencidas (más de 7 días), además del borrado manual por moderación.
export async function eliminarFotoHistoria(blobPath: string): Promise<void> {
  const connectionString = obtenerConnectionString();
  const cliente = BlobServiceClient.fromConnectionString(connectionString);
  const contenedor = cliente.getContainerClient(obtenerNombreContenedorHistorias());
  const blockBlob = contenedor.getBlockBlobClient(blobPath);
  await blockBlob.deleteIfExists();
}

export async function obtenerUrlTemporalFotoHistoria(
  blobPath: string | null,
  minutos = 180,
  // true = agrega Content-Disposition: attachment al enlace, para que el
  // navegador la descargue directo al tocar el botón "Descargar" en Mi
  // Galería, en vez de solo abrirla en una pestaña.
  forzarDescarga = false
): Promise<string | null> {
  if (!blobPath) return null;
  try {
    const connectionString = obtenerConnectionString();
    const credencial = obtenerCredencial(connectionString);
    if (!credencial) return null;

    const cliente = BlobServiceClient.fromConnectionString(connectionString);
    const contenedor = cliente.getContainerClient(obtenerNombreContenedorHistorias());
    const blockBlob = contenedor.getBlockBlobClient(blobPath);

    const sas = generateBlobSASQueryParameters(
      {
        containerName: obtenerNombreContenedorHistorias(),
        blobName: blobPath,
        permissions: BlobSASPermissions.parse("r"),
        expiresOn: new Date(Date.now() + minutos * 60 * 1000),
        contentDisposition: forzarDescarga ? 'attachment; filename="historia-shimaya.jpg"' : undefined,
      },
      credencial
    ).toString();

    return `${blockBlob.url}?${sas}`;
  } catch (error) {
    console.error("No se pudo generar el enlace temporal de la foto de historia:", error);
    return null;
  }
}
