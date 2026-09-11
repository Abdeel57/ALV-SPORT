import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import {
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  cookieOptions,
  signSession,
  verifySession,
  type SessionClaims,
} from "./token";

/**
 * Sesión del lado del servidor. La identidad vive en una cookie firmada;
 * leerla NO cuesta una llamada de red (antes, cada request preguntaba a
 * GoTrue por HTTP). `cache` la resuelve una sola vez por request aunque la
 * consulten diez componentes.
 */

export const getSessionClaims = cache(
  async (): Promise<SessionClaims | null> => {
    const store = await cookies();
    return verifySession(store.get(SESSION_COOKIE)?.value);
  },
);

export interface SessionUser {
  id: string;
  email: string;
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const claims = await getSessionClaims();
  return claims ? { id: claims.sub, email: claims.email } : null;
}

/** Emite la cookie de sesión. Solo desde Server Actions o Route Handlers. */
export async function startSession(user: SessionUser): Promise<void> {
  const token = await signSession({ sub: user.id, email: user.email });
  const store = await cookies();
  store.set(SESSION_COOKIE, token, cookieOptions(SESSION_TTL_SECONDS));
}

export async function endSession(): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, "", cookieOptions(0));
}
