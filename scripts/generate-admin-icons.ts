/**
 * Íconos de la PWA de ADMINISTRADOR (app separada de la pública). Reutiliza el
 * wordmark ALV ya generado (`public/brand/alv-sport-logo.png`) pero lo marca
 * como "PANEL" en ámbar sobre un fondo cálido, para que en la pantalla de
 * inicio se distinga a simple vista de la app pública.
 *
 *   - public/icons/admin-icon-192.png
 *   - public/icons/admin-icon-512.png
 *   - public/icons/admin-icon-maskable-512.png (contenido en zona segura)
 *   - public/icons/admin-apple-touch-icon.png
 *
 * Correr con: pnpm tsx scripts/generate-admin-icons.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const root = join(scriptDir, "..");
const iconsDir = join(root, "public", "icons");
const WORDMARK = join(iconsDir, "..", "brand", "alv-sport-logo.png");

const BG = "#140D0A"; // dark cálido: diferencia el ícono admin del negro público

/** Etiqueta "PANEL" + regla de marca, en SVG (sobrevive el masking central). */
function panelLabel(size: number, safe: number): Buffer {
  const cx = size / 2;
  const barW = size * 0.34 * safe * 1.6;
  const barY = size * 0.66;
  const svg = `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#E32B1E"/>
        <stop offset="55%" stop-color="#F5A50B"/>
        <stop offset="100%" stop-color="#C9CDD3"/>
      </linearGradient>
    </defs>
    <rect x="${cx - barW / 2}" y="${barY}" width="${barW}" height="${size * 0.011}" rx="${size * 0.006}" fill="url(#g)"/>
    <text x="${cx}" y="${size * 0.76}" text-anchor="middle"
      font-family="Arial, Helvetica, sans-serif" font-weight="800" font-style="italic"
      font-size="${size * 0.135}" letter-spacing="${size * 0.012}" fill="#F5A50B">PANEL</text>
  </svg>`;
  return Buffer.from(svg);
}

/**
 * Cuadro admin: fondo cálido + wordmark ALV (arriba) + etiqueta PANEL (abajo).
 * `fill` = ancho del wordmark; `safe` = 1 normal, <1 para maskable (zona segura).
 */
async function adminSquare(size: number, fill: number, safe = 1): Promise<Buffer> {
  const wmWidth = Math.round(size * fill);
  const wm = await sharp(WORDMARK).resize({ width: wmWidth }).toBuffer();
  const meta = await sharp(wm).metadata();
  const wmHeight = meta.height ?? Math.round(wmWidth * 0.323);
  const top = Math.round(size * (safe < 1 ? 0.34 : 0.3) - wmHeight / 2);
  const left = Math.round((size - wmWidth) / 2);
  return sharp({
    create: { width: size, height: size, channels: 4, background: BG },
  })
    .composite([
      { input: wm, top, left },
      { input: panelLabel(size, safe), top: 0, left: 0 },
    ])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

async function main(): Promise<void> {
  // Confirma que el wordmark base existe (lo genera generate-brand-assets).
  readFileSync(WORDMARK);

  writeFileSync(join(iconsDir, "admin-icon-192.png"), await adminSquare(192, 0.6));
  writeFileSync(join(iconsDir, "admin-icon-512.png"), await adminSquare(512, 0.6));
  writeFileSync(
    join(iconsDir, "admin-icon-maskable-512.png"),
    await adminSquare(512, 0.46, 0.8),
  );
  writeFileSync(
    join(iconsDir, "admin-apple-touch-icon.png"),
    await adminSquare(180, 0.62),
  );
  console.log("public/icons/admin-*.png (192, 512, maskable-512, apple-touch)");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
