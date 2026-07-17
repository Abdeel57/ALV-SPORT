/**
 * Auditoría de seguridad contra el stack REAL (Fase 5): intenta accesos
 * indebidos por cada rol; TODOS deben fallar por RLS o middleware.
 *
 *   SUPABASE_URL=... ANON_KEY=... SERVICE_ROLE_KEY=... APP_URL=... \
 *     pnpm tsx scripts/security-audit.ts
 *
 * Crea usuarios temporales (…@audit.alvsport.test), ejecuta los intentos y
 * limpia todo al final. Sale con código 1 si algún intento indebido pasa.
 */

const SUPABASE_URL = process.env.SUPABASE_URL ?? "";
const ANON_KEY = process.env.ANON_KEY ?? "";
const SERVICE_KEY = process.env.SERVICE_ROLE_KEY ?? "";
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
  console.log(`${ok ? "✅ BLOQUEADO" : "❌ PERMITIDO (FALLA)"} — ${name}${detail ? ` · ${detail}` : ""}`);
}

async function rest(
  path: string,
  init: RequestInit,
  token: string,
): Promise<Response> {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init.headers ?? {}),
    },
  });
}

async function adminApi(path: string, init: RequestInit): Promise<Response> {
  return fetch(`${SUPABASE_URL}/auth/v1/admin/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

async function createUser(email: string): Promise<{ id: string; password: string }> {
  const password = `Audit-${Math.random().toString(36).slice(2, 12)}!`;
  const response = await adminApi("users", {
    method: "POST",
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  const data = (await response.json()) as { id?: string; msg?: string };
  if (!response.ok || !data.id) {
    throw new Error(`No se pudo crear ${email}: ${JSON.stringify(data)}`);
  }
  return { id: data.id, password };
}

async function login(email: string, password: string): Promise<string> {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = (await response.json()) as { access_token?: string };
  if (!data.access_token) throw new Error(`Login falló para ${email}`);
  return data.access_token;
}

async function serviceSql(path: string, body: unknown): Promise<void> {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`setup ${path}: ${response.status} ${await response.text()}`);
  }
}

async function main(): Promise<void> {
  for (const key of ["SUPABASE_URL", "ANON_KEY", "SERVICE_ROLE_KEY", "APP_URL"]) {
    if (!process.env[key]) throw new Error(`Falta ${key}`);
  }
  const stamp = Date.now().toString(36);
  console.log("== Auditoría de seguridad ALV SPORT ==\n");

  // ---------- 1. Anónimo inserta en game_events ----------
  {
    const response = await rest(
      "game_events",
      {
        method: "POST",
        body: JSON.stringify({
          game_id: GAME_SCHEDULED,
          event_type: "run",
          period: 1,
          created_by: "00000000-0000-4000-8000-000000000000",
        }),
      },
      ANON_KEY,
    );
    record(
      "Anónimo inserta en game_events",
      !response.ok,
      `HTTP ${response.status}`,
    );
  }

  // ---------- setup: usuarios temporales ----------
  const scorekeeper = await createUser(`scorekeeper-${stamp}@audit.alvsport.test`);
  const captain = await createUser(`captain-${stamp}@audit.alvsport.test`);
  await serviceSql("organization_members", {
    organization_id: ORG_ID,
    user_id: scorekeeper.id,
    role: "scorekeeper",
  });
  await serviceSql("organization_members", {
    organization_id: ORG_ID,
    user_id: captain.id,
    role: "team_captain",
  });
  await serviceSql("game_assignments", {
    game_id: GAME_SCHEDULED,
    user_id: scorekeeper.id,
    role: "scorekeeper",
  });
  // Una inscripción ajena (pedida por otro usuario) que el capitán NO debe ver.
  await serviceSql("registrations", {
    season_id: SEASON_SOFTBALL,
    team_id: TEAM_COYOTES,
    amount: 1500,
    requested_by: scorekeeper.id,
  });

  const skToken = await login(`scorekeeper-${stamp}@audit.alvsport.test`, scorekeeper.password);
  const capToken = await login(`captain-${stamp}@audit.alvsport.test`, captain.password);

  // ---------- 2. Scorekeeper intenta editar equipos ----------
  {
    const response = await rest(
      `teams?id=eq.${TEAM_COYOTES}`,
      { method: "PATCH", body: JSON.stringify({ name: "HACKEADO FC" }) },
      skToken,
    );
    const rows = response.ok ? ((await response.json()) as unknown[]) : [];
    record(
      "Scorekeeper edita el nombre de un equipo",
      !response.ok || rows.length === 0,
      `HTTP ${response.status}, filas afectadas: ${rows.length}`,
    );
  }

  // ---------- 3. Scorekeeper inserta evento en juego NO asignado/cerrado ----------
  {
    const response = await rest(
      "game_events",
      {
        method: "POST",
        body: JSON.stringify({
          game_id: GAME_FINALIZED,
          team_id: TEAM_COYOTES,
          event_type: "run",
          period: 1,
          created_by: scorekeeper.id,
        }),
      },
      skToken,
    );
    record(
      "Scorekeeper inserta evento en partido no asignado (y finalizado)",
      !response.ok,
      `HTTP ${response.status}`,
    );
  }

  // ---------- 4. Captain lee inscripciones/pagos de otros ----------
  {
    const response = await rest("registrations?select=id,amount,status", { method: "GET" }, capToken);
    const rows = response.ok ? ((await response.json()) as unknown[]) : [];
    record(
      "Team captain lee pagos/inscripciones ajenas",
      rows.length === 0,
      `HTTP ${response.status}, filas visibles: ${rows.length}`,
    );
  }

  // ---------- 5. Endpoint de IA/webhooks sin autenticación ----------
  for (const hook of ["game-status", "game-events"]) {
    const response = await fetch(`${APP_URL}/api/hooks/${hook}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "UPDATE", record: { id: GAME_FINALIZED } }),
    });
    record(
      `Webhook /api/hooks/${hook} sin secreto (dispararía push/IA)`,
      response.status === 401,
      `HTTP ${response.status}`,
    );
  }

  // ---------- limpieza ----------
  await fetch(
    `${SUPABASE_URL}/rest/v1/registrations?season_id=eq.${SEASON_SOFTBALL}&team_id=eq.${TEAM_COYOTES}`,
    {
      method: "DELETE",
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
    },
  );
  for (const user of [scorekeeper, captain]) {
    await adminApi(`users/${user.id}`, { method: "DELETE" });
  }
  console.log("\n(limpieza: usuarios e inscripción de prueba eliminados)");

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
