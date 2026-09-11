import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { startHarness, type Harness } from "@/lib/db/__tests__/support/pg-harness";
import { sql } from "@/lib/db/sql";
import { serviceDb } from "@/lib/db/session";
import { SESSION_COOKIE, signSession } from "@/lib/auth/token";

/**
 * Alta de jugador con equipo en el mismo paso, contra Postgres real con la
 * sesión del administrador: crea al jugador, lo pone en el roster y respeta
 * la elegibilidad (un jugador por división).
 */

const ORG_ID = "01000000-0000-4000-8000-000000000001";

let harness: Harness;
let sessionToken = "";

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
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: () => undefined,
  revalidateTag: () => undefined,
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === SESSION_COOKIE && sessionToken ? { name, value: sessionToken } : undefined,
    getAll: () => [],
    set: () => undefined,
  }),
}));

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

let teamId = "";
let rivalId = "";

beforeAll(async () => {
  process.env.DATABASE_URL = "postgresql://pruebas/en-proceso";
  process.env.AUTH_SECRET = "secreto-de-pruebas-con-mas-de-32-caracteres";
  harness = await startHarness();

  const admin = await serviceDb().one<{ id: string }>(sql`
    insert into auth.users (id, email, aud, role)
    values (gen_random_uuid(), 'players-admin@pruebas.test', 'authenticated', 'authenticated')
    returning id
  `);
  await serviceDb().exec(sql`
    insert into public.organization_members (organization_id, user_id, role)
    values (${ORG_ID}, ${admin.id}, 'org_admin')
  `);
  sessionToken = await signSession({ sub: admin.id, email: "players-admin@pruebas.test" });

  const teams = await serviceDb().rows<{ id: string }>(sql`
    select t.id from public.teams t
     where t.division_id = (select division_id from public.teams order by name limit 1)
     order by t.name limit 2
  `);
  teamId = teams[0]!.id;
  rivalId = teams[1]!.id;
}, 180_000);

afterAll(async () => {
  await harness?.close();
});

describe("alta de jugador con equipo", () => {
  it("crea al jugador y lo deja en el roster del equipo elegido", async () => {
    const { savePlayer } = await import("../actions");
    const url = await runAction(() =>
      savePlayer(formData({ firstName: "Prueba", lastName: "Directa", teamId, jerseyNumber: "7" })),
    );
    expect(decodeURIComponent(url)).toContain("ok=");
    expect(decodeURIComponent(url)).toContain("Prueba Directa");

    const roster = await serviceDb().one<{ jersey_number: string | null; team_id: string }>(sql`
      select r.jersey_number, r.team_id
        from public.rosters r
        join public.players p on p.id = r.player_id
       where p.first_name = 'Prueba' and p.last_name = 'Directa'
    `);
    expect(roster.team_id).toBe(teamId);
    expect(roster.jersey_number).toBe("7");
  });

  it("sin equipo solo crea al jugador", async () => {
    const { savePlayer } = await import("../actions");
    const url = await runAction(() => savePlayer(formData({ firstName: "Prueba", lastName: "SinEquipo", teamId: "" })));
    expect(url).toContain("ok=1");
    const rows = await serviceDb().rows<{ id: string }>(sql`
      select r.id from public.rosters r join public.players p on p.id = r.player_id
       where p.last_name = 'SinEquipo'
    `);
    expect(rows).toHaveLength(0);
  });

  it("no duplica al jugador en otro equipo de la misma división", async () => {
    const { assignToRoster } = await import("../actions");
    const player = await serviceDb().one<{ id: string }>(sql`
      select id from public.players where first_name = 'Prueba' and last_name = 'Directa'
    `);
    const url = await runAction(() => assignToRoster(formData({ playerId: player.id, teamId: rivalId })));
    expect(url).toContain("error=");
  });
});
