import "server-only";
import { randomUUID } from "node:crypto";
import { serviceDb } from "@/lib/db/session";
import { ident, join, sql, type SqlQuery } from "@/lib/db/sql";

/**
 * Cuentas de usuario sobre la tabla `auth.users` que ya existe.
 *
 * No se migra ni se recrea nada: son las MISMAS filas y los MISMOS hashes
 * bcrypt que escribió GoTrue, así que todo el mundo entra con su contraseña
 * de siempre. La verificación ocurre dentro de Postgres con pgcrypto
 * (`crypt`), que compara en tiempo constante y nunca saca el hash de la base.
 */

export interface AuthUser {
  id: string;
  email: string;
}

interface UserRow {
  id: string;
  email: string;
}

/**
 * pgcrypto puede estar instalado en `public` o en `extensions` según cómo se
 * haya provisionado la base. Se resuelve una vez y se recuerda.
 */
let cryptSchema: Promise<string> | null = null;

async function pgcryptoSchema(): Promise<string> {
  if (cryptSchema) return cryptSchema;
  cryptSchema = (async () => {
    const row = await serviceDb().maybeOne<{ schema: string }>(sql`
      select n.nspname as schema
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
       where p.proname = 'crypt'
       limit 1
    `);
    if (!row) {
      throw new Error(
        "pgcrypto no está disponible en la base: no se encontró la función crypt().",
      );
    }
    return row.schema;
  })();
  try {
    return await cryptSchema;
  } catch (error) {
    cryptSchema = null;
    throw error;
  }
}

async function cryptCall(password: string, against: SqlQuery): Promise<SqlQuery> {
  const schema = ident(await pgcryptoSchema(), "crypt");
  return sql`${schema}(${password}, ${against})`;
}

/**
 * Comprueba correo + contraseña. Devuelve el usuario o null, sin distinguir
 * "no existe" de "contraseña incorrecta" (no filtra qué correos hay dados de alta).
 */
export async function verifyCredentials(
  email: string,
  password: string,
): Promise<AuthUser | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized || !password) return null;

  const compare = await cryptCall(password, sql`encrypted_password`);
  const row = await serviceDb().maybeOne<UserRow>(sql`
    select id, email
      from auth.users
     where lower(email) = ${normalized}
       -- Solo hashes bcrypt ($2a$/$2b$/$2y$). Hay cuentas sin contraseña
       -- establecida (el usuario semilla la tiene vacía): sin este filtro,
       -- crypt() lanzaría "invalid salt" en vez de rechazar limpiamente, y
       -- el mensaje de error distinto delataría qué correos existen.
       and encrypted_password like '$2%'
       and encrypted_password = ${compare}
     limit 1
  `);
  return row ? { id: row.id, email: row.email } : null;
}

export async function findUserById(userId: string): Promise<AuthUser | null> {
  const row = await serviceDb().maybeOne<UserRow>(sql`
    select id, email from auth.users where id = ${userId} limit 1
  `);
  return row ? { id: row.id, email: row.email } : null;
}

export async function findUserByEmail(email: string): Promise<AuthUser | null> {
  const row = await serviceDb().maybeOne<UserRow>(sql`
    select id, email from auth.users where lower(email) = ${email.trim().toLowerCase()} limit 1
  `);
  return row ? { id: row.id, email: row.email } : null;
}

/** Columnas realmente presentes en auth.users (el esquema de GoTrue varía por versión). */
async function userColumns(): Promise<Set<string>> {
  const rows = await serviceDb().rows<{ column_name: string }>(sql`
    select column_name
      from information_schema.columns
     where table_schema = 'auth' and table_name = 'users'
  `);
  return new Set(rows.map((row) => row.column_name));
}

async function hashed(password: string): Promise<SqlQuery> {
  const schema = await pgcryptoSchema();
  return sql`${ident(schema, "crypt")}(${password}, ${ident(schema, "gen_salt")}('bf', 10))`;
}

export function assertStrongPassword(password: string): void {
  if (password.length < 8) {
    throw new Error("La contraseña debe tener al menos 8 caracteres.");
  }
}

/**
 * Da de alta una cuenta. Solo escribe las columnas que existan en esta
 * versión del esquema; el resto queda en sus valores por omisión.
 */
export async function createUser(
  email: string,
  password: string,
): Promise<AuthUser> {
  assertStrongPassword(password);
  const normalized = email.trim().toLowerCase();
  if (!normalized.includes("@")) throw new Error("Correo inválido.");
  if (await findUserByEmail(normalized)) {
    throw new Error(`Ya existe una cuenta con el correo ${normalized}.`);
  }

  const columns = await userColumns();
  const id = randomUUID();
  const encrypted = await hashed(password);

  const candidates: [string, SqlQuery][] = [
    ["id", sql`${id}`],
    ["email", sql`${normalized}`],
    ["encrypted_password", encrypted],
    ["instance_id", sql`'00000000-0000-0000-0000-000000000000'::uuid`],
    ["aud", sql`'authenticated'`],
    ["role", sql`'authenticated'`],
    ["email_confirmed_at", sql`now()`],
    ["created_at", sql`now()`],
    ["updated_at", sql`now()`],
    ["raw_app_meta_data", sql`'{"provider":"email","providers":["email"]}'::jsonb`],
    ["raw_user_meta_data", sql`'{}'::jsonb`],
  ];
  const present = candidates.filter(([column]) => columns.has(column));

  const columnList = join(present.map(([column]) => ident(column)), ", ");
  const valueList = join(present.map(([, value]) => value), ", ");

  const row = await serviceDb().one<UserRow>(sql`
    insert into auth.users (${columnList}) values (${valueList})
    returning id, email
  `);
  return { id: row.id, email: row.email };
}

/** Cambia la contraseña de una cuenta existente. */
export async function setPassword(userId: string, password: string): Promise<void> {
  assertStrongPassword(password);
  const columns = await userColumns();
  const encrypted = await hashed(password);
  const updates: SqlQuery[] = [sql`encrypted_password = ${encrypted}`];
  if (columns.has("updated_at")) updates.push(sql`updated_at = now()`);

  const changed = await serviceDb().exec(sql`
    update auth.users set ${join(updates, ", ")} where id = ${userId}
  `);
  if (changed === 0) throw new Error("No existe esa cuenta.");
}
