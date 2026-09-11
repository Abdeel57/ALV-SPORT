import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { canRemoveBackground, removeWhiteBackground } from "../transparent";

/** Imagen sintética: fondo blanco, cuadro rojo con un hueco blanco al centro. */
async function logoOnWhite(): Promise<Uint8Array> {
  const size = 60;
  const raw = Buffer.alloc(size * size * 3, 255);
  const paint = (x: number, y: number, rgb: [number, number, number]) => {
    const i = (y * size + x) * 3;
    raw[i] = rgb[0];
    raw[i + 1] = rgb[1];
    raw[i + 2] = rgb[2];
  };
  for (let y = 20; y <= 40; y += 1) {
    for (let x = 15; x <= 45; x += 1) {
      const hole = x >= 27 && x <= 33 && y >= 27 && y <= 33;
      paint(x, y, hole ? [255, 255, 255] : [227, 43, 30]);
    }
  }
  return sharp(raw, { raw: { width: size, height: size, channels: 3 } }).png().toBuffer();
}

async function readPixels(png: Uint8Array) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const at = (x: number, y: number) => {
    const i = (y * info.width + x) * 4;
    return { r: data[i]!, g: data[i + 1]!, b: data[i + 2]!, a: data[i + 3]! };
  };
  return { width: info.width, height: info.height, at };
}

describe("removeWhiteBackground", () => {
  it("vuelve transparente el blanco que toca el borde y recorta el aire", async () => {
    const out = await removeWhiteBackground(await logoOnWhite());
    const img = await readPixels(out);
    // Recortado al cuadro rojo: 31 × 21.
    expect(img.width).toBe(31);
    expect(img.height).toBe(21);
    const corner = img.at(0, 0);
    expect(corner.a).toBe(255);
    expect(corner.r).toBe(227);
  });

  it("conserva el blanco encerrado dentro del logo", async () => {
    const out = await removeWhiteBackground(await logoOnWhite());
    const img = await readPixels(out);
    // El hueco queda en (27-15, 27-20) = (12, 7) … (18, 13) del recorte.
    const hole = img.at(15, 10);
    expect(hole.a).toBe(255);
    expect(hole.r).toBe(255);
  });

  it("tolera el ruido de JPEG en el fondo", async () => {
    const jpeg = await sharp(await logoOnWhite()).jpeg({ quality: 80 }).toBuffer();
    const out = await removeWhiteBackground(jpeg);
    const img = await readPixels(out);
    expect(img.width).toBeLessThanOrEqual(33);
    expect(img.height).toBeLessThanOrEqual(23);
    expect(img.at(Math.floor(img.width / 2), 2).a).toBe(255);
  });

  it("rechaza una imagen completamente blanca", async () => {
    const white = await sharp({ create: { width: 10, height: 10, channels: 3, background: "#fff" } })
      .png()
      .toBuffer();
    await expect(removeWhiteBackground(white)).rejects.toThrow(/vacío/);
  });

  it("solo admite formatos rasterizados comunes", () => {
    expect(canRemoveBackground("image/png")).toBe(true);
    expect(canRemoveBackground("image/jpeg")).toBe(true);
    expect(canRemoveBackground("image/svg+xml")).toBe(false);
    expect(canRemoveBackground("image/gif")).toBe(false);
  });
});
