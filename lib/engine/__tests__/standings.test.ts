import { describe, expect, it } from "vitest";
import { basketballConfig } from "@/lib/seed-data/basketball-config";
import { basketballGames, eventsByGameId, softballGames } from "@/lib/seed-data/games-events";
import { teamId } from "@/lib/seed-data/ids";
import { softballConfig } from "@/lib/seed-data/softball-config";
import { computeStandings } from "../standings";
import type { EngineGame, EngineGameEvent } from "../types";

describe("computeStandings — softbol (temporada seed completa)", () => {
  const standings = computeStandings(softballGames, eventsByGameId, softballConfig);

  it("ordena la tabla con ambos escenarios de desempate resueltos", () => {
    // Coyotes y Huracanes empatan a 6 pts → head-to-head (juego 1) decide.
    // Bravos, Cañeros y Mineros empatan a 2 pts con head-to-head circular
    // → cae a diferencia de carreras: 0 > −4 > −7.
    expect(standings.map((row) => row.teamId)).toEqual([
      teamId(1), // Coyotes
      teamId(2), // Huracanes
      teamId(4), // Bravos
      teamId(5), // Cañeros
      teamId(3), // Mineros
      teamId(6), // Halcones
    ]);
    expect(standings.map((row) => row.rank)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("calcula récords, puntos y diferencial exactos", () => {
    const byTeam = new Map(standings.map((row) => [row.teamId, row]));
    const expected = [
      { teamIndex: 1, played: 3, wins: 3, losses: 0, points: 6, scoreFor: 26, scoreAgainst: 11, scoreDiff: 15 },
      { teamIndex: 2, played: 4, wins: 3, losses: 1, points: 6, scoreFor: 25, scoreAgainst: 18, scoreDiff: 7 },
      { teamIndex: 3, played: 3, wins: 1, losses: 2, points: 2, scoreFor: 10, scoreAgainst: 17, scoreDiff: -7 },
      { teamIndex: 4, played: 3, wins: 1, losses: 2, points: 2, scoreFor: 19, scoreAgainst: 19, scoreDiff: 0 },
      { teamIndex: 5, played: 3, wins: 1, losses: 2, points: 2, scoreFor: 14, scoreAgainst: 18, scoreDiff: -4 },
      { teamIndex: 6, played: 2, wins: 0, losses: 2, points: 0, scoreFor: 4, scoreAgainst: 15, scoreDiff: -11 },
    ];
    for (const row of expected) {
      const actual = byTeam.get(teamId(row.teamIndex));
      expect(actual, `equipo ${row.teamIndex}`).toMatchObject({
        played: row.played,
        wins: row.wins,
        losses: row.losses,
        ties: 0,
        points: row.points,
        scoreFor: row.scoreFor,
        scoreAgainst: row.scoreAgainst,
        scoreDiff: row.scoreDiff,
      });
    }
  });

  it("excluye el juego programado (no finalizado)", () => {
    // El juego 10 (Halcones vs Mineros) está scheduled: Halcones solo suma 2 jugados.
    const halcones = standings.find((row) => row.teamId === teamId(6));
    expect(halcones?.played).toBe(2);
  });
});

describe("computeStandings — basquetbol (puntos estilo FIBA)", () => {
  it("la derrota también suma: Panteras 2 pts, Lobos 1 pt", () => {
    const standings = computeStandings(basketballGames, eventsByGameId, basketballConfig);
    expect(standings).toHaveLength(2);
    expect(standings[0]).toMatchObject({ teamId: teamId(7), wins: 1, points: 2, rank: 1 });
    expect(standings[1]).toMatchObject({ teamId: teamId(8), losses: 1, points: 1, rank: 2 });
  });
});

describe("computeStandings — casos límite", () => {
  const TEAM_A = "aaaaaaaa-0000-4000-8000-000000000001";
  const TEAM_B = "aaaaaaaa-0000-4000-8000-000000000002";
  const TEAM_C = "aaaaaaaa-0000-4000-8000-000000000003";
  const GAME = "bbbbbbbb-0000-4000-8000-000000000001";

  const tiedGame: EngineGame = {
    id: GAME,
    seasonId: "cccccccc-0000-4000-8000-000000000001",
    divisionId: null,
    homeTeamId: TEAM_A,
    awayTeamId: TEAM_B,
    status: "finalized",
  };

  const makeRun = (id: string, seq: number, team: string): EngineGameEvent => ({
    id,
    seq,
    gameId: GAME,
    teamId: team,
    playerId: null,
    eventType: "run",
    payload: {},
    period: 1,
    clockSeconds: null,
    correctsEventId: null,
  });

  const events = new Map([
    [
      GAME,
      [
        makeRun("dddddddd-0000-4000-8000-000000000001", 1, TEAM_A),
        makeRun("dddddddd-0000-4000-8000-000000000002", 2, TEAM_B),
      ],
    ],
  ]);

  it("empate irresoluble comparte rank; equipos sin juegos aparecen en ceros", () => {
    const standings = computeStandings([tiedGame], events, softballConfig, {
      teamIds: [TEAM_A, TEAM_B, TEAM_C],
    });
    expect(standings).toHaveLength(3);
    // A y B: 1 empate cada uno (1 pt), todos los desempates iguales → rank 1 compartido.
    expect(standings[0]?.rank).toBe(1);
    expect(standings[1]?.rank).toBe(1);
    expect(standings[0]?.ties).toBe(1);
    // C sin juegos: fila en ceros, rank 3 (ranking de competencia).
    expect(standings[2]).toMatchObject({
      teamId: TEAM_C,
      played: 0,
      points: 0,
      rank: 3,
    });
  });

  it("sin juegos finalizados regresa solo filas en ceros", () => {
    const scheduled: EngineGame = { ...tiedGame, status: "scheduled" };
    const standings = computeStandings([scheduled], events, softballConfig, {
      teamIds: [TEAM_A, TEAM_B],
    });
    expect(standings.every((row) => row.played === 0)).toBe(true);
  });
});
