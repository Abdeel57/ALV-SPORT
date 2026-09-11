import "server-only";
import sharp from "sharp";
import { MediaError } from "./store";

/**
 * Quita el fondo blanco de un logo y devuelve un PNG con transparencia.
 *
 * Solo se borra el blanco que toca el borde de la imagen (relleno por
 * inundación desde las orillas): el blanco que forma parte del logo —
 * letras, huecos cerrados— se conserva. Al final se recorta el aire
 * transparente para que todos los logos ocupen su tile por igual.
 */

/** Lado máximo del resultado; suficiente para un logo y acota la memoria. */
const MAX_SIDE = 1000;
/** Distancia máxima al blanco puro por canal (tolera compresión JPEG). */
const WHITE_TOLERANCE = 28;
/** Pixeles claros pegados al recorte se atenúan para no dejar un halo. */
const HALO_MIN = 200;
/** Debajo de esto un pixel ya transparente cuenta como fondo. */
const ALPHA_BACKGROUND = 10;

const SUPPORTED = new Set(["image/png", "image/jpeg", "image/webp"]);

/** Formatos que se pueden limpiar; SVG y GIF se dejan tal cual. */
export function canRemoveBackground(contentType: string): boolean {
  return SUPPORTED.has(contentType.toLowerCase());
}

export async function removeWhiteBackground(input: Uint8Array): Promise<Uint8Array> {
  const { data, info } = await sharp(input)
    .rotate()
    .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: "inside", withoutEnlargement: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height } = info;
  const pixels = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  const total = width * height;
  const minWhite = 255 - WHITE_TOLERANCE;

  const isBackground = (p: number): boolean => {
    const i = p * 4;
    if (pixels[i + 3]! < ALPHA_BACKGROUND) return true;
    return pixels[i]! >= minWhite && pixels[i + 1]! >= minWhite && pixels[i + 2]! >= minWhite;
  };

  // Inundación desde los cuatro bordes, 4-conectada.
  const removed = new Uint8Array(total);
  const queue = new Int32Array(total);
  let tail = 0;
  const visit = (p: number) => {
    if (removed[p] || !isBackground(p)) return;
    removed[p] = 1;
    queue[tail++] = p;
  };
  for (let x = 0; x < width; x += 1) {
    visit(x);
    visit((height - 1) * width + x);
  }
  for (let y = 0; y < height; y += 1) {
    visit(y * width);
    visit(y * width + width - 1);
  }
  for (let head = 0; head < tail; head += 1) {
    const p = queue[head]!;
    const x = p % width;
    if (x > 0) visit(p - 1);
    if (x < width - 1) visit(p + 1);
    if (p >= width) visit(p - width);
    if (p + width < total) visit(p + width);
  }

  // Aplica el recorte y suaviza la orilla: pixeles casi blancos junto al
  // fondo bajan su opacidad según qué tan claros sean.
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let p = 0; p < total; p += 1) {
    const i = p * 4;
    if (removed[p]) {
      pixels[i + 3] = 0;
      continue;
    }
    const x = p % width;
    const y = (p - x) / width;
    const touchesBackground =
      (x > 0 && removed[p - 1]) ||
      (x < width - 1 && removed[p + 1]) ||
      (y > 0 && removed[p - width]) ||
      (y < height - 1 && removed[p + width]);
    if (touchesBackground) {
      const lightest = Math.min(pixels[i]!, pixels[i + 1]!, pixels[i + 2]!);
      if (lightest >= HALO_MIN) {
        const alpha = Math.round((255 * (255 - lightest)) / (255 - HALO_MIN));
        pixels[i + 3] = Math.min(pixels[i + 3]!, Math.max(alpha, 0));
      }
    }
    if (pixels[i + 3]! > 0) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  if (maxX < 0) {
    throw new MediaError("El logo quedó vacío: parece que toda la imagen es blanca");
  }

  const output = await sharp(pixels, { raw: { width, height, channels: 4 } })
    .extract({ left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 })
    .png({ compressionLevel: 9 })
    .toBuffer();
  return new Uint8Array(output.buffer, output.byteOffset, output.byteLength);
}
