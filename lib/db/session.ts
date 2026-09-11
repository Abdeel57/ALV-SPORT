import "server-only";
import type { PoolClient, QueryResultRow } from "pg";
import { acquire } from "./pool";
import { isQuery, type SqlQuery } from "./sql";

/**
 * Ejecución de consultas con la identidad del usuario aplicada en Postgres.
 *
 * LA REGLA: cada consulta corre dentro de una transacción que primero fija
 * `request.jwt.claims` y el rol (`anon` / `authenticated`) con SET LOCAL.
 * Es exactamente lo que hacía PostgREST, así que las políticas RLS y
 * `auth.uid()` siguen funcionando SIN UN SOLO CAMBIO en las migraciones.
 *
 * SET LOCAL muere con la transacción: una conexión devuelta al pool nunca
 * arrastra la identidad del request anterior.
 */

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type DbActor =
  /** Visitante sin sesión: solo ve lo que las políticas abren a `anon`. */
  | { readonly kind: "anon" }
  /** Usuario autenticado: `auth.uid()` devuelve su id dentro de la consulta. */
  | { readonly kind: "user"; readonly userId: string }
  /**
   * Omite RLS. Exclusivo de tareas del servidor sin usuario (webhooks,
   * envío de push, activación inicial). Nunca a partir de datos del cliente.
   */
  | { readonly kind: "service" };

export const ANON: DbActor = { kind: "anon" };
export const SERVICE: DbActor = { kind: "service" };

export function actorForUser(userId: string): DbActor {
  if (!UUID.test(userId)) throw new Error("userId no es un UUID válido");
  return { kind: "user", userId };
}

const STATEMENT_TIMEOUT_MS = Number(
  process.env.DATABASE_STATEMENT_TIMEOUT_MS ?? "15000",
);

/**
 * Preámbulo de la transacción. Se manda como una sola consulta simple para
 * no gastar viajes de ida y vuelta. Es seguro construirlo por concatenación
 * porque lo único variable es un UUID ya validado contra `UUID`.
 */
function preamble(actor: DbActor): string {
  const timeout = `set local statement_timeout = ${
    Number.isFinite(STATEMENT_TIMEOUT_MS) && STATEMENT_TIMEOUT_MS > 0
      ? Math.floor(STATEMENT_TIMEOUT_MS)
      : 15000
  };`;

  if (actor.kind === "service") {
    // Sin SET ROLE: la conexión es dueña del esquema y omite RLS, igual que
    // la service-role key de Supabase.
    return `begin; ${timeout}`;
  }

  if (actor.kind === "anon") {
    return `begin; ${timeout} select set_config('request.jwt.claims', '{"role":"anon"}', true); set local role anon;`;
  }

  if (!UUID.test(actor.userId)) {
    throw new Error("userId no es un UUID válido");
  }
  const claims = `{"sub":"${actor.userId}","role":"authenticated"}`;
  return `begin; ${timeout} select set_config('request.jwt.claims', '${claims}', true); set local role authenticated;`;
}

export interface Db {
  /** Todas las filas. */
  rows<T extends QueryResultRow>(query: SqlQuery): Promise<T[]>;
  /** Primera fila o null. */
  maybeOne<T extends QueryResultRow>(query: SqlQuery): Promise<T | null>;
  /** Primera fila; lanza si no hay ninguna. */
  one<T extends QueryResultRow>(query: SqlQuery): Promise<T>;
  /** Filas afectadas (insert/update/delete). */
  exec(query: SqlQuery): Promise<number>;
  /** Varias consultas en una sola transacción atómica. */
  tx<T>(run: (tx: Tx) => Promise<T>): Promise<T>;
}

/** Igual que Db pero dentro de una transacción ya abierta (sin `tx` anidado). */
export type Tx = Omit<Db, "tx">;

async function runInTransaction<T>(
  actor: DbActor,
  run: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await acquire();
  let open = false;
  try {
    await client.query(preamble(actor));
    open = true;
    const result = await run(client);
    await client.query("commit");
    open = false;
    return result;
  } catch (error) {
    if (open) {
      // Si el rollback falla la conexión ya no sirve: se descarta al soltarla.
      try {
        await client.query("rollback");
      } catch {
        client.release(true);
        throw error;
      }
    }
    throw error;
  } finally {
    client.release();
  }
}

function assertQuery(query: SqlQuery): SqlQuery {
  if (!isQuery(query)) {
    throw new Error(
      "Se esperaba una consulta construida con la plantilla sql`…` (nunca concatenes SQL a mano).",
    );
  }
  return query;
}

function boundTo(client: PoolClient): Tx {
  return {
    async rows<T extends QueryResultRow>(query: SqlQuery): Promise<T[]> {
      const { text, values } = assertQuery(query);
      const result = await client.query<T>(text, [...values]);
      return result.rows;
    },
    async maybeOne<T extends QueryResultRow>(query: SqlQuery): Promise<T | null> {
      const { text, values } = assertQuery(query);
      const result = await client.query<T>(text, [...values]);
      return result.rows[0] ?? null;
    },
    async one<T extends QueryResultRow>(query: SqlQuery): Promise<T> {
      const { text, values } = assertQuery(query);
      const result = await client.query<T>(text, [...values]);
      const row = result.rows[0];
      if (!row) throw new Error("La consulta no devolvió ninguna fila");
      return row;
    },
    async exec(query: SqlQuery): Promise<number> {
      const { text, values } = assertQuery(query);
      const result = await client.query(text, [...values]);
      return result.rowCount ?? 0;
    },
  };
}

/** Crea un ejecutor de consultas con la identidad indicada. */
export function dbFor(actor: DbActor): Db {
  return {
    rows: (query) => runInTransaction(actor, (c) => boundTo(c).rows(query)),
    maybeOne: (query) => runInTransaction(actor, (c) => boundTo(c).maybeOne(query)),
    one: (query) => runInTransaction(actor, (c) => boundTo(c).one(query)),
    exec: (query) => runInTransaction(actor, (c) => boundTo(c).exec(query)),
    tx: (run) => runInTransaction(actor, (c) => run(boundTo(c))),
  };
}

/** Ejecutor que omite RLS. Solo servidor, solo tareas sin usuario. */
export function serviceDb(): Db {
  return dbFor(SERVICE);
}

/** Ejecutor público (sin sesión). Para el sitio de lectura. */
export function anonDb(): Db {
  return dbFor(ANON);
}
