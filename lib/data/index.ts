import { postgresProvider } from "./postgres-provider";
import { seedProvider } from "./seed-provider";
import type { PublicDataProvider } from "./types";
import { hasDatabaseEnv } from "@/lib/db/pool";

export * from "./types";

/**
 * Con base configurada, el sitio público lee de Postgres (con marcador en
 * vivo). Sin ella, se sirve la temporada seed calculada con el motor
 * — misma UI, misma lógica, cero red.
 */
export function getPublicData(): PublicDataProvider {
  return hasDatabaseEnv() ? postgresProvider : seedProvider;
}
