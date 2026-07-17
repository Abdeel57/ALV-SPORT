import { describe, expect, it } from "vitest";
import { volleyballConfig } from "@/lib/seed-data/volleyball-config";
import { computeScore, computeStandings } from "@/lib/engine";
import type { EngineGame, EngineGameEvent } from "@/lib/engine";

/**
 * Voleibol SOLO con configuración (winnerBy: periods_won). El caso ácido:
 * el equipo A gana 3 sets a 2 aunque anota MENOS puntos totales que B.
 * Sets: A 25-20 · B 25-20 · A 25-23 · B 25-10 · A 15-10
 *   → A: 3 sets, 110 puntos · B: 2 sets, 113 puntos. Gana A.
 */

const TEAM_A = "aaaaaaaa-0000-4000-8000-00000000000a";
const TEAM_B = "aaaaaaaa-0000-4000-8000-00000000000b";
const GAME = "bbbbbbbb-0000-4000-8000-00000000000b";

const setScores: Array<[number, number]> = [
  [25, 20],
  [20, 25],
  [25, 23],
  [10, 25],
  [15, 10],
];

function buildEvents(): EngineGameEvent[] {
  const events: EngineGameEvent[] = [];
  let seq = 0;
  const push = (teamId: string, period: number) => {
    seq += 1;
    events.push({
      id: `cccccccc-0000-4000-8000-${String(seq).padStart(12, "0")}`,
      seq,
      gameId: GAME,
      teamId,
      // opponent_error no requiere jugador; alternamos tipos anotadores.
      playerId: null,
      eventType: seq % 3 === 0 ? "ace" : "opponent_error",
      payload: {},
      period,
      clockSeconds: null,
      correctsEventId: null,
    });
  };
  setScores.forEach(([pointsA, pointsB], index) => {
    const period = index + 1;
    for (let i = 0; i < pointsA; i += 1) push(TEAM_A, period);
    for (let i = 0; i < pointsB; i += 1) push(TEAM_B, period);
  });
  return events;
}

// ace requiere jugador: relajamos usando solo opponent_error para A y B.
function buildSimpleEvents(): EngineGameEvent[] {
  return buildEvents().map((event) => ({ ...event, eventType: "opponent_error" }));
}

const game: EngineGame = {
  id: GAME,
  seasonId: "dddddddd-0000-4000-8000-000000000001",
  divisionId: null,
  homeTeamId: TEAM_A,
  awayTeamId: TEAM_B,
  status: "finalized",
};

describe("voleibol — ganador por sets, no por puntos (solo configuración)", () => {
  const events = buildSimpleEvents();

  it("computeScore: A gana 3-2 en sets aunque B tiene más puntos totales", () => {
    const score = computeScore(events, volleyballConfig);
    expect(score.byTeam[TEAM_A]?.total).toBe(95); // 25+20+25+10+15
    expect(score.byTeam[TEAM_B]?.total).toBe(103); // 20+25+23+25+10
    expect(score.periodsWon[TEAM_A]).toBe(3);
    expect(score.periodsWon[TEAM_B]).toBe(2);
    // B anotó más puntos… pero el ganador es A, por sets (winnerBy).
    expect(score.winnerTeamId).toBe(TEAM_A);
  });

  it("computeStandings: la victoria es de A (3 pts) y B queda 0-1", () => {
    const standings = computeStandings(
      [game],
      new Map([[GAME, events]]),
      volleyballConfig,
    );
    const a = standings.find((row) => row.teamId === TEAM_A);
    const b = standings.find((row) => row.teamId === TEAM_B);
    expect(a).toMatchObject({ wins: 1, losses: 0, points: 3, rank: 1 });
    expect(b).toMatchObject({ wins: 0, losses: 1, points: 0, rank: 2 });
    // CF/CC siguen siendo PUNTOS (para desempates por ratio de puntos).
    expect(a?.scoreFor).toBe(95);
    expect(a?.scoreAgainst).toBe(103);
  });

  it("softbol/basquetbol no cambian: winnerBy default sigue siendo total_score", () => {
    expect(volleyballConfig.standings.winnerBy).toBe("periods_won");
  });
});
