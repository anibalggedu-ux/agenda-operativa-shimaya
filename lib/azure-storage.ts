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
