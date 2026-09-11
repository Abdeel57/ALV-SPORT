/**
 * Auditoría de seguridad contra el stack REAL: intenta accesos indebidos
 * por cada rol; TODOS deben fallar por RLS o por el middleware.
 *
 *   DATABASE_URL=... APP_URL=... pnpm tsx scripts/security-audit.ts
 *
 * Habla DIRECTO con Postgres, aplicando la identidad igual que la app
 * (request.jwt.claims + SET LOCAL ROLE). Eso prueba las políticas mismas,
 * sin capas intermedias que puedan enmascarar un fallo.
 *
 * Cada intento corre dentro de una transacción que SIEMPRE se revierte: aun
 * si un acceso indebido lograra escribir, no queda nada en la base. Los
 * usuarios de prueba (…@audit.alvsport.test) se eliminan al final.
 */
import { randomUUID } from "node:crypto";
import { Client } from "pg";

const APP_URL = process.env.APP_URL ?? "";

const ORG_ID = "01000000-0000-4000-8000-000000000001";
const SEASON_SOFTBALL = "04000000-0000-4000-8000-000000000001";
const TEAM_COYOTES = "10000000-0000-4000-8000-000000000001";
const GAME_SCHEDULED = "30000000-0000-4000-8000-00000000000a"; // juego 10
const GAME_FINALIZED = "30000000-0000-4000-8000-000000000001"; // juego 1

interface Check {
  name: string;
  ok: boolean;
  detail: string;
}
const results: Check[] = [];

function record(name: string, ok: boolean, detail: string): void {
  results.push({ name, ok, detail });
  console.log(
    `${ok ? "✅ BLOQUEADO" : "❌ PERMITIDO (FALLA)"} — ${name}${detail ? ` · ${detail}` : ""}`,
  );
}

let client: Client;

/**
 * Corre una sonda con la identidad dada y REVIERTE siempre. Devuelve el
 * número de filas afectadas, o un error si la política lo impidió.
 */
async function probe(
  actor: { kind: "anon" } | { kind: "user"; userId: string },
  statement: string,
  params: unknown[] = [],
): Promise<{ ok: boolean; rows: number; error: string | null }> {
  await client.query("begin");
  try {
    if (actor.kind === "anon") {
      await client.query(
        `select set_config('request.jwt.claims', '{"role":"anon"}', true)`,
      );
      await client.query("set local role anon");
    } else {
      await client.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ sub: actor.userId, role: "authenticated" }),
      ]);
      await client.query("set local role authenticated");
    }
    const result = await client.query(statement, params);
    return { ok: true, rows: result.rowCount ?? 0, error: null };
  } catch (error) {
    return {
      ok: false,
      rows: 0,
      error: error instanceof Error ? error.message.split("\n")[0] ?? "" : String(error),
    };
  } finally {
    // Siempre se revierte: la auditoría no deja rastro.
    await client.query("rollback");
  }
}

async function cryptoSchema(): Promise<string> {
  const { rows } = await client.query<{ schema: string }>(
    `select n.nspname as schema from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
      where p.proname = 'crypt' limit 1`,
  );
  const schema = rows[0]?.schema;
  if (!schema) throw new Error("pgcrypto no está instalado.");
  return schema;
}

async function createUser(email: string, schema: string): Promise<string> {
  const id = randomUUID();
  const { rows } = await client.query<{ column_name: string }>(
    `select column_name from information_schema.columns
      where table_schema = 'auth' and table_name = 'users'`,
  );
  const columns = new Set(rows.map((row) => row.column_name));
  const all: [string, string][] = [
    ["id", "$1"],
    ["email", "$2"],
    [
      "encrypted_password",
      `"${schema}".crypt('Audit-${id.slice(0, 8)}!', "${schema}".gen_salt('bf', 10))`,
    ],
    ["instance_id", "'00000000-0000-0000-0000-000000000000'::uuid"],
    ["aud", "'authenticated'"],
    ["role", "'authenticated'"],
    ["email_confirmed_at", "now()"],
    ["created_at", "now()"],
    ["updated_at", "now()"],
    ["raw_app_meta_data", `'{"provider":"email","providers":["email"]}'::jsonb`],
    ["raw_user_meta_data", "'{}'::jsonb"],
  ];
  const candidates = all.filter(([column]) => columns.has(column));

  await client.query(
    `insert into auth.users (${candidates.map(([c]) => `"${c}"`).join(", ")})
     values (${candidates.map(([, v]) => v).join(", ")})`,
    [id, email],
  );
  return id;
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("Falta DATABASE_URL");
  if (!APP_URL) throw new Error("Falta APP_URL");

  const stamp = Date.now().toString(36);
  console.log("== Auditoría de seguridad ALV SPORT ==\n");

  client = new Client({ connectionString: databaseUrl, ssl: false });
  await client.connect();

  const schema = await cryptoSchema();
  const scorekeeperEmail = `scorekeeper-${stamp}@audit.alvsport.test`;
  const captainEmail = `captain-${stamp}@audit.alvsport.test`;
  let scorekeeperId = "";
  let captainId = "";

  try {
    // ---------- 1. Anónimo inserta en game_events ----------
    {
      const attempt = await probe(
        { kind: "anon" },
        `insert into public.game_events (game_id, event_type, period, created_by)
         values ($1, 'run', 1, '00000000-0000-4000-8000-000000000000')`,
        [GAME_SCHEDULED],
      );
      record("Anónimo inserta en game_events", !attempt.ok, attempt.error ?? "insertó");
    }

    // ---------- setup: usuarios temporales ----------
    scorekeeperId = await createUser(scorekeeperEmail, schema);
    captainId = await createUser(captainEmail, schema);
    await client.query(
      `insert into public.organization_members (organization_id, user_id, role)
       values ($1, $2, 'scorekeeper'), ($1, $3, 'team_captain')`,
      [ORG_ID, scorekeeperId, captainId],
    );
    await client.query(
      `insert into public.game_assignments (game_id, user_id, role)
       values ($1, $2, 'scorekeeper')`,
      [GAME_SCHEDULED, scorekeeperId],
    );
    // Una inscripción ajena (pedida por otro usuario) que el capitán NO debe ver.
    await client.query(
      `insert into public.registrations (season_id, team_id, amount, requested_by)
       values ($1, $2, 1500, $3)`,
      [SEASON_SOFTBALL, TEAM_COYOTES, scorekeeperId],
    );

    // ---------- 2. Scorekeeper intenta editar equipos ----------
    {
      const attempt = await probe(
        { kind: "user", userId: scorekeeperId },
        "update public.teams set name = 'HACKEADO FC' where id = $1",
        [TEAM_COYOTES],
      );
      record(
        "Scorekeeper edita el nombre de un equipo",
        !attempt.ok || attempt.rows === 0,
        attempt.error ?? `filas afectadas: ${attempt.rows}`,
      );
    }

    // ---------- 3. Scorekeeper inserta evento en juego NO asignado/cerrado ----------
    {
      const attempt = await probe(
        { kind: "user", userId: scorekeeperId },
        `insert into public.game_events (game_id, team_id, event_type, period, created_by)
         values ($1, $2, 'run', 1, $3)`,
        [GAME_FINALIZED, TEAM_COYOTES, scorekeeperId],
      );
      record(
        "Scorekeeper inserta evento en partido no asignado (y finalizado)",
        !attempt.ok,
        attempt.error ?? "insertó",
      );
    }

    // ---------- 4. Captain lee inscripciones/pagos de otros ----------
    {
      const attempt = await probe(
        { kind: "user", userId: captainId },
        "select id, amount, status from public.registrations",
      );
      record(
        "Team captain lee pagos/inscripciones ajenas",
        !attempt.ok || attempt.rows === 0,
        attempt.error ?? `filas visibles: ${attempt.rows}`,
      );
    }

    // ---------- 5. Webhooks internos sin secreto ----------
    for (const hook of ["game-status", "game-events"]) {
      let status = 0;
      try {
        const response = await fetch(`${APP_URL}/api/hooks/${hook}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "UPDATE", record: { id: GAME_FINALIZED } }),
        });
        status = response.status;
      } catch (error) {
        record(
          `Webhook /api/hooks/${hook} sin secreto (dispararía push/IA)`,
          false,
          `no se pudo contactar: ${error instanceof Error ? error.message : "error"}`,
        );
        continue;
      }
      record(
        `Webhook /api/hooks/${hook} sin secreto (dispararía push/IA)`,
        status === 401,
        `HTTP ${status}`,
      );
    }
  } finally {
    // ---------- limpieza ----------
    try {
      await client.query(
        "delete from public.registrations where season_id = $1 and team_id = $2 and requested_by = $3",
        [SEASON_SOFTBALL, TEAM_COYOTES, scorekeeperId],
      );
      await client.query("delete from auth.users where email = any($1::text[])", [
        [scorekeeperEmail, captainEmail],
      ]);
      console.log("\n(limpieza: usuarios e inscripción de prueba eliminados)");
    } catch (error) {
      console.error(
        `\n⚠️  La limpieza falló: ${error instanceof Error ? error.message : error}`,
      );
      console.error(`   Revisa a mano: ${scorekeeperEmail}, ${captainEmail}`);
    }
    await client.end();
  }

  const failed = results.filter((check) => !check.ok);
  console.log(
    `\nResultado: ${results.length - failed.length}/${results.length} intentos indebidos BLOQUEADOS`,
  );
  if (failed.length > 0) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
