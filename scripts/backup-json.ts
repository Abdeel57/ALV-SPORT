/**
 * Respaldo lógico SIN `pg_dump`, usando solo la conexión a Postgres.
 *
 *   DATABASE_URL="postgresql://…" pnpm db:backup:json
 *   DATABASE_URL="postgresql://…" pnpm db:backup:json -- --restore backups/archivo.json
 *
 * Por qué existe: el equipo de desarrollo no tiene las client tools de
 * PostgreSQL, y la imagen de Postgres de este proyecto no soporta el
 * respaldo continuo de Railway. Esto garantiza una copia restaurable antes
 * de cualquier cambio de riesgo.
 *
 * Cómo conserva la fidelidad: cada fila se exporta con `row_to_json` y se
 * reimporta con `json_populate_record`, es decir, Postgres mismo serializa y
 * deserializa según el tipo real de cada columna (jsonb, arreglos, fechas,
 * enums). No hay conversiones a mano que puedan perder datos.
 *
 * La restauración es idempotente: repetirla deja el mismo resultado. Por
 * omisión SOBREESCRIBE las filas que ya existan con la versión del respaldo
 * (eso es lo que significa restaurar); con `--merge` solo agrega las que
 * falten y respeta las actuales. Nunca borra filas que no estén en el
 * respaldo. Al terminar refresca las vistas materializadas derivadas.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Client } from "pg";

interface TableRef {
  schema: string;
  name: string;
}

interface Dump {
  createdAt: string;
  database: string;
  tables: { schema: string; name: string; rows: unknown[] }[];
}

function timestamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/** Tablas de negocio, en orden de dependencias (padres primero). */
async function listTables(client: Client): Promise<TableRef[]> {
  const { rows } = await client.query<{ schema: string; name: string }>(`
    select c.relnamespace::regnamespace::text as schema, c.relname as name
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where c.relkind = 'r'
       and (n.nspname = 'public' or (n.nspname = 'auth' and c.relname = 'users'))
       and c.relname not like '\\_%'
     order by n.nspname, c.relname
  `);
  return rows;
}

/**
 * Orden topológico por llaves foráneas: al restaurar, los padres van antes
 * que los hijos.
 */
async function sortByDependencies(
  client: Client,
  tables: TableRef[],
): Promise<TableRef[]> {
  const { rows } = await client.query<{ child: string; parent: string }>(`
    select
      con.conrelid::regclass::text as child,
      con.confrelid::regclass::text as parent
    from pg_constraint con
    where con.contype = 'f'
  `);

  const key = (t: TableRef) => `${t.schema}.${t.name}`;
  const present = new Set(tables.map(key));
  const deps = new Map<string, Set<string>>();
  for (const table of tables) deps.set(key(table), new Set());

  for (const row of rows) {
    // regclass imprime sin esquema cuando está en el search_path.
    const child = row.child.includes(".") ? row.child : `public.${row.child}`;
    const parent = row.parent.includes(".") ? row.parent : `public.${row.parent}`;
    if (!present.has(child) || !present.has(parent) || child === parent) continue;
    deps.get(child)?.add(parent);
  }

  const ordered: TableRef[] = [];
  const done = new Set<string>();
  const byKey = new Map(tables.map((table) => [key(table), table]));

  // Inserción sencilla: se repite hasta que no haya avance (los ciclos, si
  // los hubiera, caen al final).
  let progress = true;
  while (progress && done.size < tables.length) {
    progress = false;
    for (const [name, parents] of deps) {
      if (done.has(name)) continue;
      if ([...parents].every((parent) => done.has(parent))) {
        const table = byKey.get(name);
        if (table) ordered.push(table);
        done.add(name);
        progress = true;
      }
    }
  }
  for (const table of tables) {
    if (!done.has(key(table))) ordered.push(table);
  }
  return ordered;
}

/**
 * Columnas de identidad GENERATED ALWAYS (p. ej. `game_events.seq`).
 * Exigen OVERRIDING SYSTEM VALUE al insertar y NO se pueden actualizar:
 * Postgres rechaza `set seq = …` con "can only be updated to DEFAULT".
 */
async function alwaysIdentityColumns(
  client: Client,
  table: TableRef,
): Promise<string[]> {
  const { rows } = await client.query<{ column_name: string }>(
    `select column_name
       from information_schema.columns
      where table_schema = $1 and table_name = $2 and is_identity = 'YES'
        and identity_generation = 'ALWAYS'`,
    [table.schema, table.name],
  );
  return rows.map((row) => row.column_name);
}

function quote(table: TableRef): string {
  return `"${table.schema}"."${table.name}"`;
}

/** Columnas de la llave primaria, para poder sobreescribir al restaurar. */
async function primaryKey(client: Client, table: TableRef): Promise<string[]> {
  const { rows } = await client.query<{ column_name: string }>(
    `select a.attname as column_name
       from pg_index i
       join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
      where i.indrelid = ($1 || '.' || $2)::regclass and i.indisprimary`,
    [`"${table.schema}"`, `"${table.name}"`],
  );
  return rows.map((row) => row.column_name);
}

/** Todas las columnas de la tabla, en orden. */
async function columns(client: Client, table: TableRef): Promise<string[]> {
  const { rows } = await client.query<{ column_name: string }>(
    `select column_name from information_schema.columns
      where table_schema = $1 and table_name = $2
      order by ordinal_position`,
    [table.schema, table.name],
  );
  return rows.map((row) => row.column_name);
}

/**
 * Las vistas materializadas son datos DERIVADOS: no se respaldan, se
 * recalculan. Sin esto, la tabla de posiciones queda vacía tras restaurar.
 */
async function refreshMaterializedViews(client: Client): Promise<void> {
  const { rows } = await client.query<{ name: string }>(
    `select c.relnamespace::regnamespace::text || '."' || c.relname || '"' as name
       from pg_class c
      where c.relkind = 'm'`,
  );
  for (const row of rows) {
    try {
      await client.query(`refresh materialized view ${row.name}`);
      console.log(`  vista ${row.name} recalculada`);
    } catch (error) {
      console.error(
        `  no se pudo recalcular ${row.name}: ${error instanceof Error ? error.message : error}`,
      );
    }
  }
}

async function dump(client: Client, outDir: string): Promise<string> {
  const tables = await sortByDependencies(client, await listTables(client));
  const result: Dump = {
    createdAt: new Date().toISOString(),
    database: (await client.query<{ d: string }>("select current_database() as d")).rows[0]!.d,
    tables: [],
  };

  let total = 0;
  for (const table of tables) {
    const { rows } = await client.query<{ row: unknown }>(
      `select row_to_json(t) as row from ${quote(table)} t`,
    );
    result.tables.push({
      schema: table.schema,
      name: table.name,
      rows: rows.map((r) => r.row),
    });
    total += rows.length;
    if (rows.length > 0) {
      console.log(`  ${quote(table)}: ${rows.length}`);
    }
  }

  mkdirSync(outDir, { recursive: true });
  const file = resolve(outDir, `alvsport-${timestamp()}.json`);
  writeFileSync(file, JSON.stringify(result, null, 0), "utf8");
  console.log(`\n${total} filas en ${result.tables.length} tablas`);
  console.log(`→ ${file}`);
  return file;
}

async function restore(
  client: Client,
  file: string,
  options: { merge: boolean },
): Promise<void> {
  const parsed = JSON.parse(readFileSync(file, "utf8")) as Dump;
  console.log(`Restaurando respaldo del ${parsed.createdAt}`);
  console.log(
    options.merge
      ? "modo --merge: solo agrega lo que falte\n"
      : "modo normal: sobreescribe lo que ya exista con la versión del respaldo\n",
  );

  // Desactiva triggers de usuario: evita que la auditoría registre la
  // restauración y que las validaciones de dominio rechacen filas históricas.
  await client.query("set session_replication_role = replica");
  await client.query("begin");
  try {
    let total = 0;
    let pendientes = 0;
    for (const table of parsed.tables) {
      if (table.rows.length === 0) continue;
      const ref: TableRef = { schema: table.schema, name: table.name };
      const generated = await alwaysIdentityColumns(client, ref);
      const overriding = generated.length > 0 ? "overriding system value" : "";

      // Sin --merge se sobreescriben las filas ya presentes (p. ej. las que
      // crea una migración con valores por omisión).
      let conflict = "on conflict do nothing";
      if (!options.merge) {
        const keys = await primaryKey(client, ref);
        const all = await columns(client, ref);
        const updatable = all.filter(
          (column) => !keys.includes(column) && !generated.includes(column),
        );
        if (keys.length > 0 && updatable.length > 0) {
          const sets = updatable.map((c) => `"${c}" = excluded."${c}"`).join(", ");
          conflict = `on conflict (${keys.map((c) => `"${c}"`).join(", ")}) do update set ${sets}`;
        }
      }

      let applied = 0;
      for (const row of table.rows) {
        const result = await client.query(
          `insert into ${quote(ref)} ${overriding}
           select * from json_populate_record(null::${quote(ref)}, $1::json)
           ${conflict}`,
          [JSON.stringify(row)],
        );
        applied += result.rowCount ?? 0;
      }
      total += applied;
      if (applied < table.rows.length) pendientes += table.rows.length - applied;
      console.log(
        `  ${applied === table.rows.length ? "ok " : "!! "}${quote(ref)}: ${applied}/${table.rows.length}`,
      );
    }
    await client.query("commit");
    console.log(`\n${total} filas restauradas`);
    if (pendientes > 0) {
      console.log(
        `${pendientes} fila(s) no se aplicaron (esperado con --merge si ya existían).`,
      );
    }
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    await client.query("set session_replication_role = origin");
  }

  console.log("\nRecalculando datos derivados:");
  await refreshMaterializedViews(client);
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Falta DATABASE_URL");

  const args = process.argv.slice(2);
  const restoreIndex = args.indexOf("--restore");
  const outDir = resolve(process.cwd(), "backups");

  const client = new Client({
    connectionString: url,
    ssl: process.env.DATABASE_SSL === "require" ? { rejectUnauthorized: false } : false,
  });
  await client.connect();

  try {
    if (restoreIndex !== -1) {
      const file = args[restoreIndex + 1];
      if (!file) throw new Error("Uso: --restore <archivo.json> [--merge]");
      await restore(client, resolve(file), { merge: args.includes("--merge") });
    } else {
      console.log("Respaldando…\n");
      await dump(client, outDir);
    }
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
