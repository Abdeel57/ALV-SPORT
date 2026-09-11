import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { startHarness, type Harness } from "@/lib/db/__tests__/support/pg-harness";

/**
 * Ejercita el proveedor público REAL contra un Postgres real (en proceso),
 * con el rol `anon` y las políticas RLS activas — exactamente como lo ve un
 * visitante del sitio.
 *
 * Es la prueba que valida las ~20 consultas escritas a mano en la migración
 * de Supabase a SQL directo: sintaxis, joins, nombres de columna y forma de
 * los resultados.
 */

// El proveedor resuelve la identidad desde la cookie del request; en Node no
// hay request, así que se simula un visitante sin sesión.
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => undefined,
    getAll: () => [],
    set: () => undefined,
  }),
}));

let harness: Harness;

beforeAll(async () => {
  process.env.DATABASE_URL = "postgresql://pruebas/en-proceso";
  harness = await startHarness();
}, 180_000);

afterAll(async () => {
  await harness?.close();
});

async function provider() {
  const { postgresProvider } = await import("../postgres-provider");
  return postgresProvider;
}

describe("proveedor público sobre Postgres", () => {
  it("lista las ligas publicadas", async () => {
    const leagues = await (await provider()).getLeagues();
    expect(leagues.length).toBeGreaterThan(0);
    for (const league of leagues) {
      expect(league.slug).toBeTruthy();
      expect(league.sportKey).toBeTruthy();
      expect(league.seasonName).toBeTruthy();
    }
  });

  it("arma la portada con partidos, tabla y líderes", async () => {
    const home = await (await provider()).getHome();
    expect(home).not.toBeNull();
    if (!home) return;
    expect(home.league.slug).toBeTruthy();
    expect(home.standingsTop.length).toBeGreaterThan(0);
    // Los resultados recientes traen equipos resueltos y marcador numérico.
    for (const game of home.recentResults) {
      expect(game.home.name).not.toBe("—");
      expect(game.away.name).not.toBe("—");
      expect(typeof game.homeScore).toBe("number");
    }
  });

  it("ordena la tabla de posiciones con el motor", async () => {
    const standings = await (await provider()).getStandings();
    expect(standings).not.toBeNull();
    if (!standings) return;
    expect(standings.rows.length).toBeGreaterThan(1);
    for (const row of standings.rows) {
      expect(row.team.name).toBeTruthy();
      expect(row.played).toBe(row.wins + row.losses + row.ties);
    }
    // Orden descendente por puntos.
    const points = standings.rows.map((row) => row.points);
    expect([...points].sort((a, b) => b - a)).toEqual(points);
  });

  it("entrega el detalle de un partido con eventos y alineaciones", async () => {
    const finalized = await harness.db.query<{ id: string }>(
      "select id from public.games where status = 'finalized' limit 1",
    );
    const gameId = finalized.rows[0]?.id;
    expect(gameId).toBeTruthy();
    if (!gameId) return;

    const detail = await (await provider()).getGameDetail(gameId);
    expect(detail).not.toBeNull();
    if (!detail) return;
    expect(detail.events.length).toBeGreaterThan(0);
    // seq debe llegar como número: si llegara como texto, el orden del
    // motor se rompería ("10" < "9").
    for (const event of detail.events) {
      expect(typeof event.seq).toBe("number");
    }
    const ordered = detail.events.map((event) => event.seq);
    expect([...ordered].sort((a, b) => a - b)).toEqual(ordered);
    expect(Object.keys(detail.playerNames).length).toBeGreaterThan(0);
  });

  it("calcula las estadísticas de la liga", async () => {
    const stats = await (await provider()).getLeagueStats();
    expect(stats).not.toBeNull();
    if (!stats) return;
    expect(stats.finalizedGames).toBeGreaterThan(0);
    expect(stats.categories.length).toBeGreaterThan(0);
    const leaders = stats.categories[0]?.leaders ?? [];
    expect(leaders.length).toBeGreaterThan(0);
    for (const leader of leaders) {
      expect(leader.name.trim()).not.toBe("");
      expect(leader.team.name).toBeTruthy();
    }
  });

  it("arma el perfil de un equipo", async () => {
    const team = await harness.db.query<{ slug: string }>(
      "select slug from public.teams limit 1",
    );
    const slug = team.rows[0]?.slug;
    expect(slug).toBeTruthy();
    if (!slug) return;

    const profile = await (await provider()).getTeamProfile(slug);
    expect(profile).not.toBeNull();
    if (!profile) return;
    expect(profile.team.slug).toBe(slug);
    expect(profile.roster.length).toBeGreaterThan(0);
    expect(profile.games.length).toBeGreaterThan(0);
    for (const mark of profile.streak) {
      expect(["W", "L", "T"]).toContain(mark);
    }
  });

  it("arma el perfil de un jugador con su línea por partido", async () => {
    const player = await harness.db.query<{ player_id: string }>(
      "select player_id from public.rosters where status = 'active' limit 1",
    );
    const playerId = player.rows[0]?.player_id;
    expect(playerId).toBeTruthy();
    if (!playerId) return;

    const profile = await (await provider()).getPlayerProfile(playerId);
    expect(profile).not.toBeNull();
    if (!profile) return;
    expect(profile.playerId).toBe(playerId);
    expect(profile.team.name).toBeTruthy();
    expect(profile.statDefs.length).toBeGreaterThan(0);
    for (const def of profile.statDefs) {
      expect(typeof profile.seasonTotals[def.key]).toBe("number");
    }
  });

  it("busca equipos y jugadores", async () => {
    const team = await harness.db.query<{ name: string }>(
      "select name from public.teams limit 1",
    );
    const term = (team.rows[0]?.name ?? "").slice(0, 4);
    expect(term.length).toBeGreaterThanOrEqual(2);

    const results = await (await provider()).search(term);
    expect(results.teams.length).toBeGreaterThan(0);
    expect(results.teams[0]?.leagueName).toBeTruthy();
  });

  it("no rompe con una búsqueda de comodines de LIKE", async () => {
    // Antes "%" devolvía TODO; ahora se busca literal.
    const results = await (await provider()).search("%%");
    expect(results.teams).toEqual([]);
    expect(results.players).toEqual([]);
  });

  it("devuelve vacío para una búsqueda demasiado corta", async () => {
    const results = await (await provider()).search("a");
    expect(results.teams).toEqual([]);
    expect(results.games).toEqual([]);
  });
});
