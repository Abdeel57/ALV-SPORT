import { NextResponse, type NextRequest } from "next/server";
import {
  SESSION_COOKIE,
  SESSION_REFRESH_SECONDS,
  SESSION_TTL_SECONDS,
  cookieOptions,
  nowSeconds,
  signSession,
  verifySession,
} from "@/lib/auth/token";
import { checkRateLimit } from "@/lib/rate-limit";

// Límites por IP y ventana de 60s. La búsqueda pega directo a Postgres
// (ilike) y los API routes disparan trabajo (push, webhooks), por eso son
// más estrictos que la navegación normal. El login se limita para que no
// se pueda probar contraseñas a ciegas.
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

/**
 * Mantiene viva la sesión sin salir del proceso: verifica la cookie firmada
 * y la reemite cuando le queda poca vida. Antes esto costaba una llamada
 * HTTP a GoTrue en CADA request; ahora es una verificación HMAC local.
 */
async function refreshSession(
  request: NextRequest,
  response: NextResponse,
): Promise<void> {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return;

  try {
    const claims = await verifySession(token);
    if (!claims) {
      // Firma inválida o expirada: se limpia para no reintentarla en cada request.
      response.cookies.set(SESSION_COOKIE, "", cookieOptions(0));
      return;
    }
    if (claims.exp - nowSeconds() < SESSION_REFRESH_SECONDS) {
      const renewed = await signSession({ sub: claims.sub, email: claims.email });
      response.cookies.set(SESSION_COOKIE, renewed, cookieOptions(SESSION_TTL_SECONDS));
    }
  } catch {
    // Sin AUTH_SECRET configurado la app sigue sirviendo el sitio público.
  }
}

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // El login se limita por intentos (POST de la Server Action incluido).
  const isLoginAttempt = path === "/login" && request.method === "POST";
  const rule = isLoginAttempt
    ? { bucket: "login", limit: 10 }
    : LIMITS.find((item) => item.test(path));

  if (rule) {
    const { allowed, retryAfterSeconds } = checkRateLimit(
      `${rule.bucket}:${clientIp(request)}`,
      rule.limit,
      WINDOW_MS,
    );
    if (!allowed) {
      return NextResponse.json(
        { error: "Demasiadas solicitudes. Intenta de nuevo en unos segundos." },
        { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } },
      );
    }
  }

  const response = NextResponse.next({ request });
  await refreshSession(request, response);
  return response;
}

export const config = {
  matcher: [
    // Todo excepto estáticos, imágenes, service worker, manifest e íconos.
    "/((?!_next/static|_next/image|favicon\\.ico|sw\\.js|manifest\\.webmanifest|icons/).*)",
  ],
};
