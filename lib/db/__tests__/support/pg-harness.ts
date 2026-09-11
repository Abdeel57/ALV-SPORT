import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import type { PoolClient } from "pg";
import { setClientFactory } from "@/lib/db/testing";

/**
 * Postgres REAL en proceso (PGlite: Postgres compilado a WASM) para probar
 * el SQL de la app sin Docker ni servidor.
 *
 * Aplica las migraciones del repo y el seed, y luego enchufa el mismo
 * ejecutor que usa la app. Así las pruebas ejercitan las consultas de
 * verdad — sintaxis, columnas, joins y políticas RLS incluidas.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");

/**
 * Lo que en producción trae la imagen de Postgres de Supabase: el esquema
 * `auth`, la función `auth.uid()` y los roles que usan las políticas.
 * Es el mismo bootstrap documentado en OPERACIONES.md para una base limpia.
 */
const BOOTSTRAP = `
create extension if not exists pgcrypto;
create schema if not exists auth;

-- Sin default en id: en producción GoTrue siempre lo provee, y la tabla real
-- tampoco lo genera. Mantenerlo fiel obliga a las pruebas a comportarse igual.
create table if not exists auth.users (
  id uuid primary key,
  instance_id uuid,
  aud text,
  role text,
  email text unique,
  encrypted_password text,
  email_confirmed_at timestamptz,
  raw_app_meta_data jsonb default '{}'::jsonb,
  raw_user_meta_data jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function auth.uid() returns uuid
language sql stable as $fn$
  select nullif(current_setting('request.jwt.claims', true)::json ->> 'sub', '')::uuid;
$fn$;

do $roles$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
end $roles$;

grant usage on schema public to anon, authenticated;
grant usage on schema auth to anon, authenticated;
alter default privileges in schema public
  grant select, insert, update, delete on tables to anon, authenticated;
alter default privileges in schema public
  grant execute on functions to anon, authenticated;
`;

/** Otorga a los roles lo que la imagen de Supabase concede por omisión. */
const GRANTS = `
grant select, insert, update, delete on all tables in schema public to anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;
grant execute on all functions in schema public to anon, authenticated;
`;

// Tipos de Postgres, igual que en lib/db/types.ts.
const INT8 = 20;
const NUMERIC = 1700;
const TIMESTAMP = 1114;
const TIMESTAMPTZ = 1184;
const DATE = 1082;

export interface Harness {
  db: PGlite;
  close: () => Promise<void>;
}

function migrationFiles(): string[] {
  const dir = join(ROOT, "supabase", "migrations");
  return readdirSync(dir)
    .filter((file) => file.endsWith(".sql"))
    .sort()
    .map((file) => join(dir, file));
}

/**
 * Adapta PGlite a la interfaz que usa lib/db (un subconjunto de PoolClient).
 */
function asPoolClient(db: PGlite): PoolClient {
  const client = {
    async query(text: string, values?: unknown[]) {
      // El preámbulo de la transacción son varias sentencias sin parámetros:
      // PGlite las acepta solo por exec().
      if (!values || values.length === 0) {
        const results = await db.exec(text);
        const last = results[results.length - 1];
        return {
          rows: (last?.rows ?? []) as Record<string, unknown>[],
          rowCount: last?.affectedRows ?? last?.rows?.length ?? 0,
        };
      }
      const result = await db.query(text, values as unknown[]);
      return {
        rows: result.rows as Record<string, unknown>[],
        rowCount: result.affectedRows ?? result.rows.length,
      };
    },
    release() {
      // Conexión única en proceso: no hay nada que devolver a un pool.
    },
  };
  return client as unknown as PoolClient;
}

export async function startHarness(options: { seed?: boolean } = {}): Promise<Harness> {
  const db = await PGlite.create({
    extensions: { pgcrypto },
    // Mismos tipos que recibe la app en producción (ver lib/db/types.ts).
    parsers: {
      [INT8]: (value: string) => Number(value),
      [NUMERIC]: (value: string) => Number(value),
      [TIMESTAMPTZ]: (value: string) => new Date(value).toISOString(),
      [TIMESTAMP]: (value: string) => new Date(`${value.replace(" ", "T")}Z`).toISOString(),
      [DATE]: (value: string) => value,
    },
  });

  await db.exec(BOOTSTRAP);

  for (const file of migrationFiles()) {
    const sql = readFileSync(file, "utf8");
    try {
      await db.exec(sql);
    } catch (error) {
      throw new Error(
        `Migración ${file.split(/[\\/]/).pop()}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  await db.exec(GRANTS);

  if (options.seed !== false) {
    const seedPath = join(ROOT, "supabase", "seed.sql");
    const seed = readFileSync(seedPath, "utf8");
    try {
      await db.exec(seed);
    } catch (error) {
      throw new Error(
        `seed.sql: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    // El seed referencia un usuario administrador semilla.
    await db.exec(GRANTS);
  }

  setClientFactory(async () => asPoolClient(db));

  return {
    db,
    close: async () => {
      setClientFactory(null);
      await db.close();
    },
  };
}
