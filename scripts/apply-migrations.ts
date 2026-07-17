/**
 * Aplica las migraciones de supabase/migrations (y opcionalmente el seed)
 * directo a un Postgres vía connection string — útil para Supabase
 * autoalojado (Railway) donde la CLI de Supabase exige TLS.
 *
 *   DATABASE_URL="postgresql://..." pnpm tsx scripts/apply-migrations.ts [--seed]
 *
 * Idempotente: registra lo aplicado en public._alv_migrations y el seed
 * solo corre si la tabla organizations está vacía.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Falta DATABASE_URL");
  const withSeed = process.argv.includes("--seed");

  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const dir = join(root, "supabase", "migrations");
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

  const client = new Client({ connectionString: url, ssl: false });
  await client.connect();
  try {
    await client.query(
      "create table if not exists public._alv_migrations (name text primary key, applied_at timestamptz not null default now())",
    );
    const { rows } = await client.query<{ name: string }>(
      "select name from public._alv_migrations",
    );
    const applied = new Set(rows.map((row) => row.name));

    for (const file of files) {
      if (applied.has(file)) {
        console.log(`= ${file} (ya aplicada)`);
        continue;
      }
      const sql = readFileSync(join(dir, file), "utf8");
      console.log(`> ${file}`);
      await client.query("begin");
      try {
        await client.query(sql);
        await client.query(
          "insert into public._alv_migrations (name) values ($1)",
          [file],
        );
        await client.query("commit");
      } catch (error) {
        await client.query("rollback");
        throw new Error(`${file}: ${(error as Error).message}`);
      }
    }

    if (withSeed) {
      const { rows: orgs } = await client.query(
        "select 1 from public.organizations limit 1",
      );
      if (orgs.length > 0) {
        console.log("= seed omitido (ya hay datos)");
      } else {
        console.log("> seed.sql");
        const seed = readFileSync(join(root, "supabase", "seed.sql"), "utf8");
        await client.query(seed);
      }
    }
    console.log("Listo.");
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
