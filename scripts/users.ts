/**
 * Alta de cuentas y cambio de contraseña — reemplaza lo que antes hacías
 * desde el panel de Supabase (Studio / GoTrue).
 *
 *   DATABASE_URL="postgresql://..." pnpm users list
 *   DATABASE_URL="postgresql://..." pnpm users create correo@liga.mx 'ContraseñaLarga'
 *   DATABASE_URL="postgresql://..." pnpm users password correo@liga.mx 'NuevaContraseña'
 *
 * Escribe en la MISMA tabla auth.users y con el mismo formato de hash
 * (bcrypt vía pgcrypto), así que las cuentas creadas aquí son idénticas a
 * las que creó GoTrue.
 */
import { randomUUID } from "node:crypto";
import { Client } from "pg";

type Command = "list" | "create" | "password";

function usage(): never {
  console.error(
    [
      "Uso:",
      "  pnpm users list",
      "  pnpm users create <correo> <contraseña>",
      "  pnpm users password <correo> <contraseña>",
    ].join("\n"),
  );
  process.exit(1);
}

async function cryptoSchema(client: Client): Promise<string> {
  const { rows } = await client.query<{ schema: string }>(
    `select n.nspname as schema
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where p.proname = 'crypt' limit 1`,
  );
  const schema = rows[0]?.schema;
  if (!schema) throw new Error("pgcrypto no está instalado (falta la función crypt).");
  return schema;
}

async function userColumns(client: Client): Promise<Set<string>> {
  const { rows } = await client.query<{ column_name: string }>(
    `select column_name from information_schema.columns
      where table_schema = 'auth' and table_name = 'users'`,
  );
  return new Set(rows.map((row) => row.column_name));
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Falta DATABASE_URL");

  const [command, email, password] = process.argv.slice(2) as [
    Command | undefined,
    string | undefined,
    string | undefined,
  ];
  if (!command || !["list", "create", "password"].includes(command)) usage();

  const client = new Client({ connectionString: url, ssl: false });
  await client.connect();

  try {
    if (command === "list") {
      const { rows } = await client.query<{
        email: string;
        role: string | null;
        created_at: string;
      }>(
        `select u.email,
                (select m.role::text from public.organization_members m
                  where m.user_id = u.id limit 1) as role,
                to_char(u.created_at, 'YYYY-MM-DD') as created_at
           from auth.users u
          order by u.created_at`,
      );
      if (rows.length === 0) {
        console.log("No hay cuentas.");
        return;
      }
      console.log(`${rows.length} cuenta(s):\n`);
      for (const row of rows) {
        console.log(
          `  ${row.email.padEnd(34)} ${(row.role ?? "sin rol").padEnd(16)} ${row.created_at}`,
        );
      }
      return;
    }

    if (!email || !password) usage();
    if (password.length < 8) {
      throw new Error("La contraseña debe tener al menos 8 caracteres.");
    }
    const normalized = email.trim().toLowerCase();
    if (!normalized.includes("@")) throw new Error("Correo inválido.");

    const schema = await cryptoSchema(client);
    const hash = `"${schema}".crypt($1, "${schema}".gen_salt('bf', 10))`;

    if (command === "password") {
      const { rowCount } = await client.query(
        `update auth.users
            set encrypted_password = ${hash}, updated_at = now()
          where lower(email) = $2`,
        [password, normalized],
      );
      if (rowCount === 0) throw new Error(`No existe la cuenta ${normalized}.`);
      console.log(`Contraseña actualizada para ${normalized}.`);
      return;
    }

    const { rows: existing } = await client.query(
      "select 1 from auth.users where lower(email) = $1",
      [normalized],
    );
    if (existing.length > 0) {
      throw new Error(`Ya existe una cuenta con el correo ${normalized}.`);
    }

    const columns = await userColumns(client);
    const candidates: [string, string][] = [
      ["id", "$3"],
      ["email", "$2"],
      ["encrypted_password", hash],
      ["instance_id", "'00000000-0000-0000-0000-000000000000'::uuid"],
      ["aud", "'authenticated'"],
      ["role", "'authenticated'"],
      ["email_confirmed_at", "now()"],
      ["created_at", "now()"],
      ["updated_at", "now()"],
      ["raw_app_meta_data", `'{"provider":"email","providers":["email"]}'::jsonb`],
      ["raw_user_meta_data", "'{}'::jsonb"],
    ];
    const present = candidates.filter(([column]) => columns.has(column));
    const id = randomUUID();

    await client.query(
      `insert into auth.users (${present.map(([c]) => `"${c}"`).join(", ")})
       values (${present.map(([, v]) => v).join(", ")})`,
      [password, normalized, id],
    );
    console.log(`Cuenta creada: ${normalized}`);
    console.log(
      "Para volverla administradora, entra a /activar con esa sesión, o agrégala desde el panel.",
    );
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
