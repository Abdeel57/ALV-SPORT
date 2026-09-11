/**
 * Copia las imágenes de Supabase Storage al volumen de la app y reescribe
 * las URLs guardadas en la base.
 *
 *   DATABASE_URL="postgresql://..." \
 *   STORAGE_BASE_URL="https://kong-production-xxxx.up.railway.app" \
 *   MEDIA_ROOT="/var/lib/alv-media" \
 *   pnpm tsx scripts/migrate-media.ts [--apply | --download-only]
 *
 * SIN banderas solo reporta qué haría (no toca nada).
 * `--download-only` baja los archivos a MEDIA_ROOT y NO toca la base: sirve
 * para dejar las imágenes en su destino ANTES de cambiar las URLs, de modo
 * que el sitio nunca quede unos minutos con imágenes rotas.
 * `--apply` hace lo mismo y además actualiza cada fila.
 *
 * NUNCA borra nada: los archivos siguen en Storage después de correrlo, así
 * que se puede repetir y se puede volver atrás restaurando las URLs.
 * Es idempotente: una fila ya migrada se salta.
 */
import { mkdir, writeFile, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { Client } from "pg";

interface Target {
  table: string;
  column: string;
}

/** Cada columna que guarda una URL pública de Storage. */
const TARGETS: Target[] = [
  { table: "teams", column: "logo_url" },
  { table: "leagues", column: "logo_url" },
  { table: "players", column: "photo_url" },
  { table: "news", column: "image_url" },
  { table: "sponsors", column: "logo_url" },
];

const PUBLIC_PREFIX = "/storage/v1/object/public/";

interface Row {
  id: string;
  url: string;
}

function mediaRoot(): string {
  const configured = process.env.MEDIA_ROOT;
  if (configured && configured.trim()) return resolve(configured.trim());
  return resolve(process.env.NODE_ENV === "production" ? "/var/lib/alv-media" : ".media");
}

/**
 * De una URL pública de Storage saca la ruta relativa `<bucket>/<...>`.
 * Devuelve null si la URL no es de Storage (ya migrada, o externa).
 */
function storagePath(url: string): string | null {
  const index = url.indexOf(PUBLIC_PREFIX);
  if (index === -1) return null;
  const relative = url.slice(index + PUBLIC_PREFIX.length);
  if (!relative || relative.includes("..")) return null;
  // Sin query string ni fragmento.
  return decodeURIComponent(relative.split(/[?#]/)[0] ?? "");
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("Falta DATABASE_URL");
  const downloadOnly = process.argv.includes("--download-only");
  const apply = process.argv.includes("--apply") || downloadOnly;
  const rewrite = process.argv.includes("--apply");
  const root = mediaRoot();

  const client = new Client({ connectionString: databaseUrl, ssl: false });
  await client.connect();

  let found = 0;
  let copied = 0;
  let skipped = 0;
  const failures: string[] = [];

  try {
    for (const target of TARGETS) {
      const { rows } = await client.query<Row>(
        `select id, ${target.column} as url
           from public.${target.table}
          where ${target.column} like '%${PUBLIC_PREFIX}%'`,
      );
      if (rows.length === 0) continue;
      console.log(`\n${target.table}.${target.column}: ${rows.length} por migrar`);

      for (const row of rows) {
        const relative = storagePath(row.url);
        if (!relative) {
          skipped += 1;
          continue;
        }
        found += 1;
        const destination = join(root, relative);
        const newUrl = `/media/${relative}`;

        if (!apply) {
          console.log(`  [simulación] ${row.url}\n            → ${newUrl}`);
          continue;
        }

        try {
          if (!(await exists(destination))) {
            const response = await fetch(row.url);
            if (!response.ok) {
              throw new Error(`descarga HTTP ${response.status}`);
            }
            const bytes = Buffer.from(await response.arrayBuffer());
            await mkdir(dirname(destination), { recursive: true });
            await writeFile(destination, bytes);
          }
          if (rewrite) {
            await client.query(
              `update public.${target.table} set ${target.column} = $1 where id = $2`,
              [newUrl, row.id],
            );
          }
          copied += 1;
          console.log(`  ✓ ${newUrl}`);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          failures.push(`${target.table}/${row.id}: ${message}`);
          console.error(`  ✗ ${row.url} — ${message}`);
        }
      }
    }
  } finally {
    await client.end();
  }

  console.log("\n---");
  console.log(`Archivos de Storage encontrados: ${found}`);
  if (apply) {
    console.log(rewrite ? `Copiados y reescritos: ${copied}` : `Copiados (sin tocar la base): ${copied}`);
    console.log(`Fallidos: ${failures.length}`);
    if (failures.length > 0) {
      console.log("\nRevisa estos a mano (el original sigue en Storage):");
      for (const failure of failures) console.log(`  - ${failure}`);
    }
  } else {
    console.log("Simulación: no se modificó nada. Repite con --apply.");
  }
  if (skipped > 0) console.log(`URLs no reconocidas (sin tocar): ${skipped}`);
  if (failures.length > 0) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
