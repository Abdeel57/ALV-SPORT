import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { startHarness, type Harness } from "@/lib/db/__tests__/support/pg-harness";
import { sql } from "@/lib/db/sql";
import { anonDb, serviceDb } from "@/lib/db/session";
import { SESSION_COOKIE, signSession } from "@/lib/auth/token";

/**
 * Carga de estadísticas externas contra un Postgres real: la acción del
 * panel escribe con la sesión del administrador (RLS de verdad), vincula
 * nombres con la plantilla, reemplaza al recargar y el público la lee.
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

interface TeamFixture {
  teamId: string;
  players: { firstName: string; lastName: string; playerId: string }[];
}

let fixture: TeamFixture;

beforeAll(async () => {
  process.env.DATABASE_URL = "postgresql://pruebas/en-proceso";
  process.env.AUTH_SECRET = "secreto-de-pruebas-con-mas-de-32-caracteres";
  harness = await startHarness();

  const admin = await serviceDb().one<{ id: string }>(sql`
    insert into auth.users (id, email, aud, role)
    values (gen_random_uuid(), 'stats-admin@pruebas.test', 'authenticated', 'authenticated')
    returning id
  `);
  await serviceDb().exec(sql`
    insert into public.organization_members (organization_id, user_id, role)
    values (${ORG_ID}, ${admin.id}, 'org_admin')
  `);
  sessionToken = await signSession({ sub: admin.id, email: "stats-admin@pruebas.test" });

  // Un equipo de una liga publicada, con plantilla: así el público lo ve.
  const team = await serviceDb().one<{ id: string }>(sql`
    select t.id
      from public.teams t
      join public.divisions d on d.id = t.division_id
      join public.seasons s on s.id = d.season_id
      join public.leagues l on l.id = s.league_id
      join public.rosters r on r.team_id = t.id
     where l.is_published
     group by t.id
    having count(r.id) >= 2
     order by t.id
     limit 1
  `);
  const players = await serviceDb().rows<{ player_id: string; first_name: string; last_name: string }>(sql`
    select r.player_id, p.first_name, p.last_name
      from public.rosters r
      join public.players p on p.id = r.player_id
     where r.team_id = ${team.id}
     order by p.last_name, p.first_name
     limit 2
  `);
  fixture = {
    teamId: team.id,
    players: players.map((p) => ({ playerId: p.player_id, firstName: p.first_name, lastName: p.last_name })),
  };
}, 180_000);

afterAll(async () => {
  await harness?.close();
});

function battingDocument(title: string): string {
  const [a, b] = fixture.players;
  return [
    title,
    "",
    "Name                 AB   R   H  RBI  2B  3B  HR  BB  SO  SB    BA   SLG   OBP",
    `${a!.lastName}, ${a!.firstName}   20   8  13   10   4   0   0   0   1   0  .650  .850  .691`,
    `${b!.lastName}, ${b!.firstName}   25  16  16   10   6   0   2   2   1   0  .640 1.120  .667`,
    "Desconocido, Nadie    2   3   0    1   0   0   0   2   1   0  .000  .000  .500",
    "Totals               47  27  29   21  10   0   2   4   3   0  .617  .936  .647",
    "Number of players : 3",
    "",
  ].join("\n");
}

function uploadForm(teamId: string, content: string, filename = "black-team.txt"): FormData {
  const data = new FormData();
  data.append("teamId", teamId);
  data.append("document", new File([content], filename, { type: "text/plain" }));
  return data;
}

describe("estadísticas importadas por equipo", () => {
  it("carga el documento, vincula nombres con la plantilla y resume el resultado", async () => {
    const { importTeamStats } = await import("../actions");
    const url = await runAction(() => importTeamStats(uploadForm(fixture.teamId, battingDocument("BLACK TEAM - Batting"))));
    expect(url).toContain(`/admin/equipos/${fixture.teamId}/estadisticas?ok=`);
    expect(decodeURIComponent(url)).toContain("3 jugadores, 2 vinculados");

    const stored = await serviceDb().one<{
      kind: string;
      title: string;
      rows: { name: string; playerId: string | null; values: Record<string, number | null> }[];
      totals: Record<string, number>;
      player_count: number;
      source_format: string;
    }>(sql`
      select kind, title, rows, totals, player_count, source_format
        from public.team_stat_imports
       where team_id = ${fixture.teamId}
    `);
    expect(stored.kind).toBe("batting");
    expect(stored.title).toBe("BLACK TEAM - Batting");
    expect(stored.source_format).toBe("text");
    expect(stored.player_count).toBe(3);
    expect(stored.rows).toHaveLength(3);
    expect(stored.rows[0]?.playerId).toBe(fixture.players[0]?.playerId);
    expect(stored.rows[1]?.playerId).toBe(fixture.players[1]?.playerId);
    expect(stored.rows[2]?.playerId).toBeNull();
    expect(stored.rows[0]?.values.BA).toBe(0.65);
    expect(stored.totals.AB).toBe(47);
  });

  it("volver a cargar el mismo tipo reemplaza la tabla en vez de duplicarla", async () => {
    const { importTeamStats } = await import("../actions");
    await runAction(() => importTeamStats(uploadForm(fixture.teamId, battingDocument("BLACK TEAM - Batting v2"))));
    const rows = await serviceDb().rows<{ title: string }>(sql`
      select title from public.team_stat_imports where team_id = ${fixture.teamId}
    `);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.title).toBe("BLACK TEAM - Batting v2");
  });

  it("el público puede leer la tabla de un equipo de liga publicada", async () => {
    const rows = await anonDb().rows<{ title: string }>(sql`
      select title from public.team_stat_imports where team_id = ${fixture.teamId}
    `);
    expect(rows.map((row) => row.title)).toEqual(["BLACK TEAM - Batting v2"]);
  });

  it("acepta el contenido pegado y HTML", async () => {
    const { importTeamStats } = await import("../actions");
    const data = new FormData();
    data.append("teamId", fixture.teamId);
    data.append(
      "pasted",
      "<h1>Pitching</h1><table><tr><th>Name</th><th>IP</th><th>H</th><th>ER</th><th>ERA</th></tr><tr><td>Desconocido, Nadie</td><td>6.1</td><td>5</td><td>3</td><td>3.32</td></tr></table>",
    );
    const url = await runAction(() => importTeamStats(data));
    expect(url).toContain("?ok=");
    const kinds = await serviceDb().rows<{ kind: string }>(sql`
      select kind from public.team_stat_imports where team_id = ${fixture.teamId} order by kind
    `);
    expect(kinds.map((row) => row.kind)).toEqual(["batting", "pitching"]);
  });

  it("rechaza documentos sin tabla y explica por qué", async () => {
    const { importTeamStats } = await import("../actions");
    const url = await runAction(() => importTeamStats(uploadForm(fixture.teamId, "esto no es una tabla\nde nada")));
    expect(decodeURIComponent(url)).toContain("error=No encontré el encabezado");
  });

  it("quita una tabla", async () => {
    const { deleteTeamStatImport } = await import("../actions");
    const pitching = await serviceDb().one<{ id: string }>(sql`
      select id from public.team_stat_imports where team_id = ${fixture.teamId} and kind = 'pitching'
    `);
    const url = await runAction(() => deleteTeamStatImport(pitching.id, fixture.teamId));
    expect(url).toContain("ok=1");
    const remaining = await serviceDb().rows<{ kind: string }>(sql`
      select kind from public.team_stat_imports where team_id = ${fixture.teamId}
    `);
    expect(remaining.map((row) => row.kind)).toEqual(["batting"]);
  });
});
