import { put, del, head, get, issueSignedToken, presignUrl } from "@vercel/blob";
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectsCommand,
  HeadObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Dónde viven los archivos de fotos. Con las variables R2_* configuradas se
// usa Cloudflare R2 (10 GB, 1M subidas/mes y descargas sin costo en su plan
// gratuito); sin ellas, Vercel Blob como hasta ahora. lib/blob-storage.ts
// arma las rutas ("carpeta/archivo") y usa solo esta interfaz, así que el
// cambio de proveedor no toca el resto de la app.

export type ArchivoLeido = { stream: ReadableStream<Uint8Array>; contentType: string };

export type AlmacenFotos = {
  nombre: "r2" | "vercel-blob";
  subir(ruta: string, contenido: Buffer, contentType: string, sobrescribir: boolean): Promise<void>;
  // No falla si alguno ya no existe.
  borrar(rutas: string[]): Promise<void>;
  existe(ruta: string): Promise<boolean>;
  // Enlace de lectura firmado, válido hasta venceEnMs (epoch). firmadoEnMs
  // fija el momento de la firma para que el enlace se repita dentro de una
  // misma ventana y el navegador pueda reutilizar la foto (ver
  // vencimientoEstable en lib/blob-storage.ts).
  urlFirmada(ruta: string, firmadoEnMs: number, venceEnMs: number): Promise<string>;
  leer(ruta: string): Promise<ArchivoLeido | null>;
};

// ---------- Vercel Blob ----------

const almacenVercel: AlmacenFotos = {
  nombre: "vercel-blob",
  async subir(ruta, contenido, contentType, sobrescribir) {
    await put(ruta, contenido, { access: "private", contentType, addRandomSuffix: false, allowOverwrite: sobrescribir });
  },
  async borrar(rutas) {
    if (rutas.length > 0) await del(rutas);
  },
  async existe(ruta) {
    try {
      await head(ruta);
      return true;
    } catch {
      return false;
    }
  },
  async urlFirmada(ruta, _firmadoEnMs, venceEnMs) {
    const token = await issueSignedToken({ pathname: ruta, operations: ["get"], validUntil: venceEnMs });
    const { presignedUrl } = await presignUrl(token, {
      operation: "get",
      pathname: ruta,
      access: "private",
      validUntil: venceEnMs,
    });
    return presignedUrl;
  },
  async leer(ruta) {
    const resultado = await get(ruta, { access: "private" });
    if (!resultado || resultado.statusCode !== 200 || !resultado.stream) return null;
    return { stream: resultado.stream as ReadableStream<Uint8Array>, contentType: resultado.blob.contentType };
  },
};

// ---------- Cloudflare R2 (API compatible con S3) ----------

export function r2Configurado(): boolean {
  return !!(
    process.env.R2_ACCOUNT_ID &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY &&
    process.env.R2_BUCKET
  );
}

let clienteR2: S3Client | null = null;

function obtenerClienteR2(): S3Client {
  if (!clienteR2) {
    clienteR2 = new S3Client({
      region: "auto",
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID as string,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY as string,
      },
      // Las versiones nuevas del SDK agregan checksums CRC32 a cada subida
      // por defecto; R2 no los acepta en todos los casos. Solo cuando la
      // operación los exige (ej. borrar varios).
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    });
  }
  return clienteR2;
}

function bucketR2(): string {
  return process.env.R2_BUCKET as string;
}

const almacenR2: AlmacenFotos = {
  nombre: "r2",
  async subir(ruta, contenido, contentType, sobrescribir) {
    await obtenerClienteR2().send(
      new PutObjectCommand({
        Bucket: bucketR2(),
        Key: ruta,
        Body: contenido,
        ContentType: contentType,
        // Mismo comportamiento que Vercel Blob con allowOverwrite: false.
        ...(sobrescribir ? {} : { IfNoneMatch: "*" }),
        CacheControl: "private, max-age=2592000",
      })
    );
  },
  async borrar(rutas) {
    if (rutas.length === 0) return;
    await obtenerClienteR2().send(
      new DeleteObjectsCommand({
        Bucket: bucketR2(),
        Delete: { Objects: rutas.map((Key) => ({ Key })), Quiet: true },
      })
    );
  },
  async existe(ruta) {
    try {
      await obtenerClienteR2().send(new HeadObjectCommand({ Bucket: bucketR2(), Key: ruta }));
      return true;
    } catch {
      return false;
    }
  },
  async urlFirmada(ruta, firmadoEnMs, venceEnMs) {
    const expiresIn = Math.max(60, Math.round((venceEnMs - firmadoEnMs) / 1000));
    return getSignedUrl(obtenerClienteR2(), new GetObjectCommand({ Bucket: bucketR2(), Key: ruta }), {
      expiresIn,
      signingDate: new Date(firmadoEnMs),
    });
  },
  async leer(ruta) {
    try {
      const r = await obtenerClienteR2().send(new GetObjectCommand({ Bucket: bucketR2(), Key: ruta }));
      if (!r.Body) return null;
      return {
        stream: (r.Body as any).transformToWebStream() as ReadableStream<Uint8Array>,
        contentType: r.ContentType || "image/jpeg",
      };
    } catch {
      return null;
    }
  },
};

export function almacenActivo(): AlmacenFotos {
  return r2Configurado() ? almacenR2 : almacenVercel;
}

// Para la migración de Vercel Blob a R2 (ver app/api/migrar-fotos-r2).
export const almacenes = { vercel: almacenVercel, r2: almacenR2 };
