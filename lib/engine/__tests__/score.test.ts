import { describe, expect, it } from "vitest";
import { eventsForGame } from "./helpers";
import { basketballConfig } from "@/lib/seed-data/basketball-config";
import { gameId, teamId } from "@/lib/seed-data/ids";
import { softballConfig } from "@/lib/seed-data/softball-config";
import { buildExclusionSet } from "../corrections";
import { computeScore } from "../score";

describe("computeScore — softbol (juego 1, anotado a mano)", () => {
  const events = eventsForGame(1);

  it("calcula el marcador final desde eventos: Coyotes 7, Huracanes 6", () => {
    const score = computeScore(events, softballConfig);
    expect(score.byTeam[teamId(1)]?.total).toBe(7);
    expect(score.byTeam[teamId(2)]?.total).toBe(6);
    expect(score.winnerTeamId).toBe(teamId(1));
  });

  it("calcula la línea por entrada", () => {
    const score = computeScore(events, softballConfig);
    expect(score.byTeam[teamId(1)]?.byPeriod).toEqual({ 1: 2, 3: 3, 5: 1, 7: 1 });
    expect(score.byTeam[teamId(2)]?.byPeriod).toEqual({ 1: 1, 3: 2, 6: 3 });
  });

  it("excluye la carrera fantasma anulada por corrección", () => {
    const rawTeam1Runs = events.filter(
      (event) => event.eventType === "run" && event.teamId === teamId(1),
    );
    // El stream crudo trae 8 carreras de Coyotes; una está anulada.
    expect(rawTeam1Runs).toHaveLength(8);
    const excluded = buildExclusionSet(events);
    expect(excluded.size).toBe(1);
    const score = computeScore(events, softballConfig);
    expect(score.byTeam[teamId(1)]?.total).toBe(7);
  });

  it("explota ante un tipo de evento desconocido (default) y lo ignora bajo opción", () => {
    const corrupted = [
      ...events,
      { ...events[0]!, id: "99999999-0000-4000-8000-000000000001", eventType: "no_existe" },
    ];
    expect(() => computeScore(corrupted, softballConfig)).toThrow(/no_existe/);
    expect(
      computeScore(corrupted, softballConfig, { onUnknownEventType: "ignore" })
        .byTeam[teamId(1)]?.total,
    ).toBe(7);
  });
});

describe("computeScore — softbol (juegos generados)", () => {
  const expectedFinals: ReadonlyArray<{
    gameIndex: number;
    homeTeamIndex: number;
    awayTeamIndex: number;
    home: number;
    away: number;
  }> = [
    { gameIndex: 2, homeTeamIndex: 3, awayTeamIndex: 1, home: 2, away: 9 },
    { gameIndex: 3, homeTeamIndex: 6, awayTeamIndex: 1, home: 3, away: 10 },
    { gameIndex: 4, homeTeamIndex: 2, awayTeamIndex: 4, home: 8, away: 6 },
    { gameIndex: 5, homeTeamIndex: 5, awayTeamIndex: 2, home: 4, away: 6 },
    { gameIndex: 6, homeTeamIndex: 4, awayTeamIndex: 3, home: 4, away: 5 },
    { gameIndex: 7, homeTeamIndex: 4, awayTeamIndex: 5, home: 9, away: 6 },
    { gameIndex: 8, homeTeamIndex: 3, awayTeamIndex: 5, home: 3, away: 4 },
    { gameIndex: 9, homeTeamIndex: 6, awayTeamIndex: 2, home: 1, away: 5 },
  ];

  it.each(expectedFinals)(
    "juego $gameIndex: local $home — visita $away",
    ({ gameIndex, homeTeamIndex, awayTeamIndex, home, away }) => {
      const score = computeScore(eventsForGame(gameIndex), softballConfig);
      expect(score.byTeam[teamId(homeTeamIndex)]?.total).toBe(home);
      expect(score.byTeam[teamId(awayTeamIndex)]?.total).toBe(away);
    },
  );
});

describe("computeScore — basquetbol (mismo motor, otra config)", () => {
  const events = eventsForGame(11);

  it("marcador final Panteras 69 — Lobos 62, y equivale a 2·fg2 + 3·fg3 + ft", () => {
    const score = computeScore(events, basketballConfig);
    expect(score.byTeam[teamId(7)]?.total).toBe(69);
    expect(score.byTeam[teamId(8)]?.total).toBe(62);
    expect(score.winnerTeamId).toBe(teamId(7));

    // Verificación independiente contando eventos efectivos por tipo.
    const excluded = buildExclusionSet(events);
    for (const [teamIndex, expected] of [[7, 69], [8, 62]] as const) {
      const effective = events.filter(
        (event) =>
          event.teamId === teamId(teamIndex) &&
          !excluded.has(event.id) &&
          event.eventType !== "correction",
      );
      const fg2 = effective.filter((event) => event.eventType === "fg2").length;
      const fg3 = effective.filter((event) => event.eventType === "fg3").length;
      const ft = effective.filter((event) => event.eventType === "ft_made").length;
      expect(2 * fg2 + 3 * fg3 + ft).toBe(expected);
    }
  });

  it("línea por cuarto correcta y el triple fantasma de Lobos queda anulado", () => {
    const score = computeScore(events, basketballConfig);
    expect(score.byTeam[teamId(7)]?.byPeriod).toEqual({ 1: 18, 2: 15, 3: 20, 4: 16 });
    expect(score.byTeam[teamId(8)]?.byPeriod).toEqual({ 1: 14, 2: 17, 3: 12, 4: 19 });
  });
});

describe("gameId helper", () => {
  it("los juegos del seed tienen eventos indexados", () => {
    expect(eventsForGame(1).length).toBeGreaterThan(0);
    expect(eventsForGame(11).length).toBeGreaterThan(0);
    expect(eventsForGame(1)[0]?.gameId).toBe(gameId(1));
  });
});
