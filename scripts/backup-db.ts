/**
 * Respaldo lógico de la base de producción con pg_dump (formato custom,
 * comprimido y restaurable). Uso:
 *
 *   DATABASE_URL="postgresql://…"; pnpm tsx scripts/backup-db.ts
 *
 * Restaurar:
 *   pg_restore --clean --if-exists --no-owner -d "$DATABASE_URL" <archivo>
 *
 * Nota: requiere el binario `pg_dump` (viene con las client tools de
 * PostgreSQL). Para respaldos automáticos gestionados, ver OPERACIONES.md.
 */
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

function timestamp(): string {
  // AAAAMMDD-HHMMSS en hora local.
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function main(): void {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("Falta DATABASE_URL");
    process.exitCode = 1;
    return;
  }

  const probe = spawnSync("pg_dump", ["--version"], { encoding: "utf8" });
  if (probe.error) {
    console.error(
      "No se encontró 'pg_dump'. Instala las client tools de PostgreSQL " +
        "(https://www.postgresql.org/download/) o usa los respaldos gestionados " +
        "de Railway (ver OPERACIONES.md).",
    );
    process.exitCode = 1;
    return;
  }
  console.log(probe.stdout.trim());

  const dir = resolve(process.cwd(), "backups");
  mkdirSync(dir, { recursive: true });
  const file = resolve(dir, `alvsport-${timestamp()}.dump`);

  console.log(`Respaldando → ${file}`);
  const dump = spawn(
    "pg_dump",
    ["--format=custom", "--no-owner", "--no-privileges", "--file", file, url],
    { stdio: ["ignore", "inherit", "inherit"] },
  );
  dump.on("close", (code) => {
    if (code === 0) {
      console.log("✓ Respaldo completo.");
      console.log(
        `Restaurar: pg_restore --clean --if-exists --no-owner -d "$DATABASE_URL" "${file}"`,
      );
    } else {
      console.error(`pg_dump terminó con código ${code}`);
      process.exitCode = code ?? 1;
    }
  });
}

main();
