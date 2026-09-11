import "server-only";
import { cache } from "react";
import { getSessionClaims } from "@/lib/auth/session";
import { anonDb, actorForUser, dbFor, type Db } from "./session";

/**
 * Ejecutor de consultas ligado al usuario del request en curso.
 *
 * Es el reemplazo directo de `getSupabaseServerClient()`: mismo lugar en el
 * código, misma garantía de aislamiento. Si hay sesión, las consultas corren
 * como `authenticated` con `auth.uid()` resuelto; si no, como `anon`.
 */
export const getDb = cache(async (): Promise<Db> => {
  const claims = await getSessionClaims();
  if (!claims) return anonDb();
  try {
    return dbFor(actorForUser(claims.sub));
  } catch {
    // Cookie con un sub que no es UUID: se trata como visitante.
    return anonDb();
  }
});
