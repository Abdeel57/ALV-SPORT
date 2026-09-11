import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { startHarness, type Harness } from "@/lib/db/__tests__/support/pg-harness";
import { sql } from "@/lib/db/sql";
import { serviceDb } from "@/lib/db/session";
import { SESSION_COOKIE, signSession } from "@/lib/auth/token";

/**
 * Ejercita las Server Actions del panel contra un Postgres real, con la
 * sesión y el RLS de verdad. Es la contraparte de escritura del proveedor
 * público: valida los INSERT/UPDATE escritos a mano en la migración.
 */

const ORG_ID = "01000000-0000-4000-8000-000000000001";

let harness: Harness;
let adminId: string;
let sessionToken = "";

/** `redirect()` de Next lanza; aquí se captura para leer el destino. */
class RedirectError extends Error {
  digest: string;
  constructor(public url: string) {
    super(`NEXT_REDIRECT ${url}`);
    this.digest = `NEXT_REDIRECT;replace;${url};307;`;
  }
}

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new RedirectError(url);
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: () => undefined,
  revalidateTag: () => undefined,
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === SESSION_COOKIE && sessionToken
        ? { name, value: sessionToken }
        : undefined,
    getAll: () => [],
    set: () => undefined,
  }),
}));

/** Corre una acción y devuelve la URL a la que redirigió. */
async function runAction(action: () => Promise<unknown>): Promise<string> {
  try {
    await action();
  } catch (error) {
    if (error instanceof RedirectError) return error.url;
    throw error;
  }
  throw new Error("La acción no redirigió (se esperaba redirect)");
}

function formData(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
}

beforeAll(async () => {
  process.env.DATABASE_URL = "postgresql://pruebas/en-proceso";
  process.env.AUTH_SECRET = "secreto-de-pruebas-con-mas-de-32-caracteres";
  harness = await startHarness();

  const admin = await serviceDb().one<{ id: string }>(sql`
    insert into auth.users (id, email, aud, role)
    values (gen_random_uuid(), 'admin@pruebas.test', 'authenticated', 'authenticated')
    returning id
  `);
  adminId = admin.id;
  await serviceDb().exec(sql`
    insert into public.organization_members (organization_id, user_id, role)
    values (${ORG_ID}, ${adminId}, 'org_admin')
  `);
  sessionToken = await signSession({ sub: adminId, email: "admin@pruebas.test" });
}, 180_000);

afterAll(async () => {
  await harness?.close();
});

describe("acciones del panel", () => {
  it("crea un equipo", async () => {
    const { saveTeam } = await import("../actions");
    const division = await serviceDb().one<{ id: string }>(sql`
      select id from public.divisions limit 1
    `);

    const url = await runAction(() =>
      saveTeam(
        formData({
          divisionId: division.id,
          name: "Pumas de Prueba",
          slug: "pumas-de-prueba",
          color: "#123456",
        }),
      ),
    );
    expect(url).toContain("ok=1");

    const created = await serviceDb().maybeOne<{ name: string; color: string }>(sql`
      select name, color from public.teams where slug = 'pumas-de-prueba'
    `);
    expect(created?.name).toBe("Pumas de Prueba");
    expect(created?.color).toBe("#123456");
  });

  it("edita un equipo existente", async () => {
    const { saveTeam } = await import("../actions");
    const team = await serviceDb().one<{ id: string; division_id: string }>(sql`
      select id, division_id from public.teams where slug = 'pumas-de-prueba'
    `);

    const url = await runAction(() =>
      saveTeam(
        formData({
          id: team.id,
          divisionId: team.division_id,
          name: "Pumas Editados",
          slug: "pumas-de-prueba",
          color: "#abcdef",
        }),
      ),
    );
    expect(url).toContain("ok=1");

    const updated = await serviceDb().one<{ name: string }>(sql`
      select name from public.teams where id = ${team.id}
    `);
    expect(updated.name).toBe("Pumas Editados");
  });

  it("crea una sede", async () => {
    const { saveVenue } = await import("../actions");
    const url = await runAction(() =>
      saveVenue(formData({ name: "Campo de Prueba", address: "Calle 1" })),
    );
    expect(url).toContain("ok=1");

    const venue = await serviceDb().maybeOne<{ address: string }>(sql`
      select address from public.venues where name = 'Campo de Prueba'
    `);
    expect(venue?.address).toBe("Calle 1");
  });

  it("bloquea a un jugador en dos equipos de la misma división", async () => {
    const { assignToRoster } = await import("../actions");
    const existing = await serviceDb().one<{ player_id: string; team_id: string }>(sql`
      select player_id, team_id from public.rosters where status = 'active' limit 1
    `);
    const rival = await serviceDb().one<{ id: string }>(sql`
      select t.id from public.teams t
       where t.division_id = (select division_id from public.teams where id = ${existing.team_id})
         and t.id <> ${existing.team_id}
       limit 1
    `);

    const url = await runAction(() =>
      assignToRoster(
        formData({ playerId: existing.player_id, teamId: rival.id, jerseyNumber: "99" }),
      ),
    );
    expect(url).toContain("error=");
    expect(decodeURIComponent(url)).toContain("ya está en un roster");
  });

  it("da de alta un roster completo desde una lista pegada", async () => {
    const { bulkAssignRoster } = await import("../actions");
    const team = await serviceDb().one<{ id: string }>(sql`
      select id from public.teams where slug = 'pumas-de-prueba'
    `);

    const url = await runAction(() =>
      bulkAssignRoster(
        formData({
          teamId: team.id,
          list: "23 Juan Pruebas\nMaria Ensayo #10\nPedro Testigo",
        }),
      ),
    );
    expect(url).toContain("ok=");

    const roster = await serviceDb().rows<{ jersey_number: string | null }>(sql`
      select jersey_number from public.rosters where team_id = ${team.id}
    `);
    expect(roster.length).toBe(3);
    expect(roster.map((row) => row.jersey_number).sort()).toEqual(["10", "23", null]);
  });

  it("captura un resultado final derivándolo de eventos", async () => {
    const { submitFinalScore } = await import("../actions");
    const game = await serviceDb().one<{
      id: string;
      home_team_id: string;
      away_team_id: string;
    }>(sql`
      select id, home_team_id, away_team_id from public.games
       where status = 'scheduled' limit 1
    `);

    const url = await runAction(() =>
      submitFinalScore(
        formData({ gameId: game.id, homeScore: "7", awayScore: "4" }),
      ),
    );
    expect(url).toContain("ok=1");

    const updated = await serviceDb().one<{
      status: string;
      home_score: number;
      away_score: number;
    }>(sql`
      select status::text as status, home_score, away_score
        from public.games where id = ${game.id}
    `);
    expect(updated.status).toBe("finalized");
    expect(updated.home_score).toBe(7);
    expect(updated.away_score).toBe(4);

    // El marcador NO se escribió a mano: son eventos reales en la tabla.
    const events = await serviceDb().one<{ total: number }>(sql`
      select count(*)::int as total from public.game_events where game_id = ${game.id}
    `);
    expect(events.total).toBe(11);
  });

  it("rechaza un marcador menor al ya anotado en la mesa", async () => {
    const { submitFinalScore } = await import("../actions");
    const game = await serviceDb().one<{ id: string }>(sql`
      select id from public.games where status = 'finalized' limit 1
    `);

    const url = await runAction(() =>
      submitFinalScore(formData({ gameId: game.id, homeScore: "1", awayScore: "0" })),
    );
    expect(url).toContain("error=");
    expect(decodeURIComponent(url)).toContain("ya está finalizado");
  });

  it("registra la mutación en la auditoría", async () => {
    const audit = await serviceDb().rows<{ action: string; table_name: string }>(sql`
      select action::text as action, table_name from public.audit_log
       where table_name = 'teams' and action = 'insert'
       order by created_at desc limit 1
    `);
    expect(audit.length).toBe(1);
  });
});
