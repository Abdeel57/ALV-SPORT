/**
 * Genera los íconos placeholder de la PWA (marca ALV sobre negro con el
 * swoosh de gradiente). Correr con: pnpm tsx scripts/generate-icons.ts
 * Cuando exista el logo definitivo, basta reemplazar los PNG en public/icons.
 */
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const outDir = join(scriptDir, "..", "public", "icons");
mkdirSync(outDir, { recursive: true });

function iconSvg(size: number, safeZone: boolean): string {
  // Los íconos maskable deben mantener el contenido dentro del 80% central.
  const scale = safeZone ? 0.68 : 1;
  const fontSize = Math.round(size * 0.3 * scale);
  const barWidth = Math.round(size * 0.55 * scale);
  const barHeight = Math.max(4, Math.round(size * 0.04 * scale));
  const barX = Math.round((size - barWidth) / 2);
  const barY = Math.round(size * (0.5 + 0.13 * scale));
  const textY = Math.round(size * 0.47);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="swoosh" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#E32B1E"/>
      <stop offset="0.55" stop-color="#F5A50B"/>
      <stop offset="1" stop-color="#C9CDD3"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" fill="#0A0A0B"/>
  <text x="50%" y="${textY}" text-anchor="middle" dominant-baseline="middle"
    font-family="Arial, Helvetica, sans-serif" font-style="italic" font-weight="800"
    font-size="${fontSize}" fill="#F5F6F7" letter-spacing="-1">ALV</text>
  <rect x="${barX}" y="${barY}" width="${barWidth}" height="${barHeight}" rx="${Math.round(barHeight / 2)}" fill="url(#swoosh)" transform="skewX(-12) translate(${Math.round(size * 0.07)} 0)"/>
</svg>`;
}

async function render(name: string, size: number, safeZone: boolean): Promise<void> {
  await sharp(Buffer.from(iconSvg(size, safeZone))).png().toFile(join(outDir, name));
  console.log(`public/icons/${name} (${size}x${size})`);
}

async function main(): Promise<void> {
  await render("icon-192.png", 192, false);
  await render("icon-512.png", 512, false);
  await render("icon-maskable-512.png", 512, true);
  await render("apple-touch-icon.png", 180, false);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
