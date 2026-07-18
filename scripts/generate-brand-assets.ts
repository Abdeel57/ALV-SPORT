/**
 * Deriva TODOS los assets de marca a partir del logo oficial
 * (`logo oficial.png`, lockup "ALV SPORT / All Leagues" sobre negro):
 *
 *   - public/brand/alv-sport-logo.png   wordmark con fondo transparente
 *                                        (para header, footer, login, etc.)
 *   - public/brand/og.png               imagen social 1200×630
 *   - public/icons/icon-192.png         íconos PWA (manifest)
 *   - public/icons/icon-512.png
 *   - public/icons/icon-maskable-512.png (con zona segura)
 *   - public/icons/apple-touch-icon.png
 *   - app/favicon.ico                    favicon multi-tamaño (16/32/48)
 *
 * El fondo negro del PNG original se convierte en transparencia usando el
 * canal máximo (max(R,G,B)) como alpha: el negro puro desaparece y el texto
 * plateado + el swoosh rojo→ámbar→plata conservan su color a plena opacidad.
 *
 * Correr con: pnpm tsx scripts/generate-brand-assets.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const root = join(scriptDir, "..");
const SRC = join(root, "logo oficial.png");
const brandDir = join(root, "public", "brand");
const iconsDir = join(root, "public", "icons");
mkdirSync(brandDir, { recursive: true });
mkdirSync(iconsDir, { recursive: true });

const BG = "#0A0A0B"; // --bg base de ALV SPORT
const WORDMARK_MAX_WIDTH = 1000;

/** Recorta el marco negro y transparenta el fondo (max-canal como alpha). */
async function buildTransparentWordmark(): Promise<{
  buffer: Buffer;
  width: number;
  height: number;
}> {
  // trim() usa el pixel superior-izquierdo (negro) como fondo a recortar.
  const trimmed = sharp(SRC).trim({ threshold: 12 });
  const { data, info } = await trimmed
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const pixels = info.width * info.height;
  const rgba = Buffer.alloc(pixels * 4);
  for (let i = 0; i < pixels; i++) {
    const r = data[i * 3] ?? 0;
    const g = data[i * 3 + 1] ?? 0;
    const b = data[i * 3 + 2] ?? 0;
    // Alpha = canal más brillante; recorta el vignette/glow casi-negro.
    let a = Math.max(r, g, b);
    if (a < 12) a = 0;
    rgba[i * 4] = r;
    rgba[i * 4 + 1] = g;
    rgba[i * 4 + 2] = b;
    rgba[i * 4 + 3] = a;
  }

  let pipeline = sharp(rgba, {
    raw: { width: info.width, height: info.height, channels: 4 },
  });
  let width = info.width;
  let height = info.height;
  if (width > WORDMARK_MAX_WIDTH) {
    height = Math.round((height * WORDMARK_MAX_WIDTH) / width);
    width = WORDMARK_MAX_WIDTH;
    pipeline = pipeline.resize({ width });
  }
  const buffer = await pipeline.png({ compressionLevel: 9 }).toBuffer();
  return { buffer, width, height };
}

/** Cuadro con fondo de marca y el wordmark centrado, ocupando `fill` del ancho. */
async function squareOnBrand(
  wordmark: Buffer,
  size: number,
  fill: number,
): Promise<Buffer> {
  const logo = await sharp(wordmark)
    .resize({ width: Math.round(size * fill) })
    .toBuffer();
  return sharp({
    create: { width: size, height: size, channels: 4, background: BG },
  })
    .composite([{ input: logo, gravity: "centre" }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/** Empaqueta varios PNG cuadrados en un contenedor .ico (PNG embebido). */
function buildIco(images: { size: number; png: Buffer }[]): Buffer {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reservado
  header.writeUInt16LE(1, 2); // tipo: ícono
  header.writeUInt16LE(images.length, 4);

  const entries: Buffer[] = [];
  let offset = 6 + images.length * 16;
  for (const { size, png } of images) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0); // ancho (0 = 256)
    entry.writeUInt8(size >= 256 ? 0 : size, 1); // alto
    entry.writeUInt8(0, 2); // paleta
    entry.writeUInt8(0, 3); // reservado
    entry.writeUInt16LE(1, 4); // planos
    entry.writeUInt16LE(32, 6); // bits por pixel
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    offset += png.length;
  }
  return Buffer.concat([header, ...entries, ...images.map((i) => i.png)]);
}

async function main(): Promise<void> {
  const { buffer: wordmark, width, height } = await buildTransparentWordmark();
  writeFileSync(join(brandDir, "alv-sport-logo.png"), wordmark);
  console.log(`public/brand/alv-sport-logo.png (${width}x${height}, transparente)`);

  // Imagen social (Open Graph / Twitter).
  const ogLogo = await sharp(wordmark).resize({ width: 760 }).toBuffer();
  await sharp({
    create: { width: 1200, height: 630, channels: 4, background: BG },
  })
    .composite([{ input: ogLogo, gravity: "centre" }])
    .png({ compressionLevel: 9 })
    .toFile(join(brandDir, "og.png"));
  console.log("public/brand/og.png (1200x630)");

  // Íconos PWA.
  const icon192 = await squareOnBrand(wordmark, 192, 0.82);
  const icon512 = await squareOnBrand(wordmark, 512, 0.82);
  const iconMaskable = await squareOnBrand(wordmark, 512, 0.6); // zona segura 60%
  const apple = await squareOnBrand(wordmark, 180, 0.8);
  writeFileSync(join(iconsDir, "icon-192.png"), icon192);
  writeFileSync(join(iconsDir, "icon-512.png"), icon512);
  writeFileSync(join(iconsDir, "icon-maskable-512.png"), iconMaskable);
  writeFileSync(join(iconsDir, "apple-touch-icon.png"), apple);
  console.log("public/icons/*.png (192, 512, maskable-512, apple-touch)");

  // Favicon multi-tamaño.
  const ico = buildIco([
    { size: 16, png: await squareOnBrand(wordmark, 16, 0.9) },
    { size: 32, png: await squareOnBrand(wordmark, 32, 0.88) },
    { size: 48, png: await squareOnBrand(wordmark, 48, 0.86) },
  ]);
  writeFileSync(join(root, "app", "favicon.ico"), ico);
  console.log("app/favicon.ico (16, 32, 48)");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
