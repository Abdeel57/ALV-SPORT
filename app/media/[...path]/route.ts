import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { extname } from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import { contentTypeFor, resolveMediaPath } from "@/lib/media/store";

/**
 * Sirve los logos y fotos desde el volumen de la app — el papel que hacían
 * Supabase Storage e Imgproxy. El nombre de cada archivo es un UUID que no
 * cambia nunca, así que se puede cachear de forma agresiva.
 */

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ path: string[] }>;
}

export async function GET(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  const { path } = await context.params;
  const filePath = resolveMediaPath(path);
  if (!filePath) {
    return new NextResponse("No encontrado", { status: 404 });
  }

  try {
    const info = await stat(filePath);
    if (!info.isFile()) return new NextResponse("No encontrado", { status: 404 });

    const etag = `"${createHash("sha1")
      .update(`${info.size}-${info.mtimeMs}`)
      .digest("hex")}"`;
    if (request.headers.get("if-none-match") === etag) {
      return new NextResponse(null, { status: 304, headers: { ETag: etag } });
    }

    const body = await readFile(filePath);
    return new NextResponse(new Uint8Array(body), {
      headers: {
        "Content-Type": contentTypeFor(extname(filePath).slice(1)),
        "Content-Length": String(info.size),
        "Cache-Control": "public, max-age=31536000, immutable",
        ETag: etag,
      },
    });
  } catch {
    return new NextResponse("No encontrado", { status: 404 });
  }
}
