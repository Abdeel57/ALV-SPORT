import { NextResponse, type NextRequest } from "next/server";
import { reportError } from "@/lib/observability";

/**
 * Beacon de errores del navegador: los que atrapa app/error.tsx llegan aquí
 * y quedan en los logs del servidor con contexto (antes solo vivían en la
 * consola del usuario, invisibles para nosotros). Ya lo cubre el rate limit
 * de /api/* en el middleware; además acotamos el tamaño del cuerpo.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = (await request.json()) as {
      message?: unknown;
      stack?: unknown;
      digest?: unknown;
      path?: unknown;
    };
    const message = String(body.message ?? "unknown").slice(0, 500);
    const error = new Error(message);
    if (typeof body.stack === "string") error.stack = body.stack.slice(0, 4000);
    reportError(error, {
      runtime: "client",
      source: "client-error-boundary",
      digest: typeof body.digest === "string" ? body.digest : undefined,
      path: typeof body.path === "string" ? body.path.slice(0, 300) : undefined,
      userAgent: request.headers.get("user-agent") ?? undefined,
    });
  } catch {
    // Cuerpo inválido: ignorar en silencio, no es crítico.
  }
  // 204: el beacon no espera respuesta útil.
  return new NextResponse(null, { status: 204 });
}
