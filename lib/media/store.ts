import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { isAbsolute, join, normalize, resolve, sep } from "node:path";

/**
 * Almacén de imágenes en disco — reemplaza a Supabase Storage.
 *
 * Los archivos viven en un volumen montado en el propio servicio de la app
 * (`MEDIA_ROOT`), con la misma forma de ruta que tenían en Storage
 * (`<bucket>/<organización>/<uuid>.<ext>`), así que la migración de las URLs
 * existentes es un simple cambio de prefijo.
 */

/** Prefijo público bajo el que se sirven los archivos. */
export const MEDIA_URL_PREFIX = "/media";

/** Carpetas válidas. Cerrado a propósito: nada de rutas arbitrarias. */
export const BUCKETS = [
  "team-logos",
  "player-photos",
  "news-images",
  "sponsor-logos",
  "league-logos",
] as const;

export type MediaBucket = (typeof BUCKETS)[number];

export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

const EXTENSION_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  avif: "image/avif",
  svg: "image/svg+xml",
};

export function isBucket(value: string): value is MediaBucket {
  return (BUCKETS as readonly string[]).includes(value);
}

export function mediaRoot(): string {
  const configured = process.env.MEDIA_ROOT;
  if (configured && configured.trim()) return resolve(configured.trim());
  // En desarrollo basta una carpeta del repo; en producción es el volumen.
  return resolve(process.env.NODE_ENV === "production" ? "/var/lib/alv-media" : ".media");
}

export function contentTypeFor(extension: string): string {
  return EXTENSION_TYPES[extension.toLowerCase()] ?? "application/octet-stream";
}

function extensionFor(file: File): string {
  const fromName = (file.name.split(".").pop() ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (fromName && fromName in EXTENSION_TYPES) return fromName;
  const fromType = Object.entries(EXTENSION_TYPES).find(([, type]) => type === file.type);
  return fromType?.[0] ?? "png";
}

export class MediaError extends Error {}

/**
 * Guarda una imagen y devuelve su URL pública. El nombre es un UUID nuevo,
 * así que nunca se pisa un archivo existente ni se puede adivinar una ruta.
 */
export async function saveImage(
  bucket: MediaBucket,
  organizationId: string,
  file: File,
): Promise<string> {
  if (file.size > MAX_IMAGE_BYTES) {
    throw new MediaError("La imagen no debe exceder 4 MB");
  }
  if (!file.type.startsWith("image/")) {
    throw new MediaError("El archivo debe ser una imagen");
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  return saveImageBytes(bucket, organizationId, bytes, extensionFor(file));
}

/** Guarda bytes ya procesados (por ejemplo un PNG recién generado). */
export async function saveImageBytes(
  bucket: MediaBucket,
  organizationId: string,
  bytes: Uint8Array,
  extension: string,
): Promise<string> {
  if (!/^[0-9a-f-]{36}$/i.test(organizationId)) {
    throw new MediaError("Organización inválida");
  }
  if (!(extension in EXTENSION_TYPES)) {
    throw new MediaError("Formato de imagen no admitido");
  }
  if (bytes.byteLength > MAX_IMAGE_BYTES) {
    throw new MediaError("La imagen no debe exceder 4 MB");
  }

  const name = `${randomUUID()}.${extension}`;
  const directory = join(mediaRoot(), bucket, organizationId);
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, name), bytes);

  return `${MEDIA_URL_PREFIX}/${bucket}/${organizationId}/${name}`;
}

/**
 * Lee un archivo a partir de su URL pública (`/media/<bucket>/…`).
 * Devuelve null si la URL no es nuestra o el archivo no existe.
 */
export async function readImage(
  publicUrl: string,
): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  if (!publicUrl.startsWith(`${MEDIA_URL_PREFIX}/`)) return null;
  const segments = publicUrl.slice(MEDIA_URL_PREFIX.length + 1).split("/");
  const target = resolveMediaPath(segments);
  if (!target) return null;
  try {
    const bytes = await readFile(target);
    const extension = target.split(".").pop() ?? "";
    return {
      bytes: new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength),
      contentType: contentTypeFor(extension),
    };
  } catch {
    return null;
  }
}

/**
 * Traduce una ruta pública a una ruta en disco, o null si intenta salirse
 * del directorio de medios (`..`, rutas absolutas, buckets desconocidos).
 */
export function resolveMediaPath(segments: readonly string[]): string | null {
  if (segments.length < 2) return null;
  const [bucket, ...rest] = segments;
  if (!bucket || !isBucket(bucket)) return null;
  if (rest.some((part) => !part || part === "." || part === ".." || isAbsolute(part))) {
    return null;
  }

  const root = mediaRoot();
  const target = resolve(join(root, bucket, ...rest));
  const normalizedRoot = normalize(root + sep);
  return target.startsWith(normalizedRoot) ? target : null;
}
