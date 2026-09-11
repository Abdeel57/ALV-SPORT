import "server-only";
import type { PoolClient } from "pg";

/**
 * Punto de inyección para pruebas de integración.
 *
 * Permite correr el MISMO código de consultas de la app contra un Postgres
 * de prueba (PGlite, en proceso y sin Docker) en vez del pool real. Solo lo
 * usan las pruebas; en producción nunca se registra nada aquí.
 */

export type ClientFactory = () => Promise<PoolClient>;

const GLOBAL_KEY = "__alvSportClientFactory";

interface FactoryHolder {
  [GLOBAL_KEY]?: ClientFactory;
}

export function setClientFactory(factory: ClientFactory | null): void {
  const holder = globalThis as unknown as FactoryHolder;
  if (factory) holder[GLOBAL_KEY] = factory;
  else delete holder[GLOBAL_KEY];
}

export function getClientFactory(): ClientFactory | undefined {
  return (globalThis as unknown as FactoryHolder)[GLOBAL_KEY];
}
