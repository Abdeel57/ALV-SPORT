import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { checkRateLimit } from "@/lib/rate-limit";

// Límites por IP y ventana de 60s. La búsqueda pega directo a Postgres
// (ilike) y los API routes disparan trabajo (push, webhooks), por eso son
// más estrictos que la navegación normal.
const WINDOW_MS = 60_000;
const LIMITS: Array<{ test: (path: string) => boolean; bucket: string; limit: number }> = [
  { test: (p) => p.startsWith("/buscar"), bucket: "buscar", limit: 20 },
  { test: (p) => p.startsWith("/inscribirse"), bucket: "inscribirse", limit: 12 },
  { test: (p) => p.startsWith("/api/"), bucket: "api", limit: 60 },
];

function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip") ?? "unknown";
}

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const rule = LIMITS.find((r) => r.test(path));
  if (rule) {
    const { allowed, retryAfterSeconds } = checkRateLimit(
      `${rule.bucket}:${clientIp(request)}`,
      rule.limit,
      WINDOW_MS,
    );
    if (!allowed) {
      return NextResponse.json(
        { error: "Demasiadas solicitudes. Intenta de nuevo en unos segundos." },
        {
          status: 429,
          headers: { "Retry-After": String(retryAfterSeconds) },
        },
      );
    }
  }

  return await updateSession(request);
}

export const config = {
  matcher: [
    // Todo excepto estáticos, imágenes, service worker, manifest e íconos.
    "/((?!_next/static|_next/image|favicon\\.ico|sw\\.js|manifest\\.webmanifest|icons/).*)",
  ],
};
