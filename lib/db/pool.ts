import "server-only";
import { Pool, type PoolClient } from "pg";
import { applyTypeParsers } from "./types";
import { getClientFactory } from "./testing";

/**
 * Pool único de conexiones a Postgres para todo el proceso.
 *
 * La app habla directo con la base: no hay PostgREST ni Kong en medio. El
 * aislamiento por usuario NO depende de la conexión sino de la transacción
 * (ver session.ts), por eso un solo pool compartido es correcto y barato.
 */

const GLOBAL_KEY = "__alvSportPool";

interface PoolHolder {
  [GLOBAL_KEY]?: Pool;
}

function connectionString(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "Falta DATABASE_URL. Es la cadena de conexión a Postgres (Railway → servicio Postgres → Variables).",
    );
  }
  return url;
}

/** true cuando hay base configurada (la landing renderiza sin ella). */
export function hasDatabaseEnv(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

function createPool(): Pool {
  applyTypeParsers();
  const max = Number(process.env.DATABASE_POOL_MAX ?? "10");
  // La red privada de Railway no usa TLS; contra un Postgres externo se
  // activa con DATABASE_SSL=require.
  const ssl =
    process.env.DATABASE_SSL === "require"
      ? { rejectUnauthorized: false }
      : false;

  const pool = new Pool({
    connectionString: connectionString(),
    ssl,
    max: Number.isFinite(max) && max > 0 ? max : 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    application_name: "alv-sport",
  });

  // Un error de conexión inactiva no debe tumbar el proceso.
  pool.on("error", (error) => {
    console.error(
      JSON.stringify({ level: "error", event: "db_pool_error", message: error.message }),
    );
  });

  return pool;
}

export function getPool(): Pool {
  const holder = globalThis as unknown as PoolHolder;
  // En desarrollo el hot reload reevalúa los módulos: sin esta caché se
  // abriría un pool nuevo en cada recarga hasta agotar max_connections.
  const existing = holder[GLOBAL_KEY];
  if (existing) return existing;
  const pool = createPool();
  holder[GLOBAL_KEY] = pool;
  return pool;
}

export async function acquire(): Promise<PoolClient> {
  // Las pruebas de integración inyectan un Postgres en proceso; en
  // producción esto nunca está registrado y se usa el pool real.
  const factory = getClientFactory();
  if (factory) return factory();
  return getPool().connect();
}

/** Cierra el pool. Solo para scripts y pruebas; el servidor no lo llama. */
export async function closePool(): Promise<void> {
  const holder = globalThis as unknown as PoolHolder;
  const pool = holder[GLOBAL_KEY];
  if (!pool) return;
  holder[GLOBAL_KEY] = undefined;
  await pool.end();
}
