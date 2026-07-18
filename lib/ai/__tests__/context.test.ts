import { describe, expect, it } from "vitest";
import { buildGameAiContext, type GameAiContext, type GameAiInput } from "../context";
import { buildRecap } from "../recap";
import {
  eventsByGameId,
  gameId,
  playerId,
  softballConfig,
  teamId,
} from "@/lib/seed-data";
import { volleyballConfig } from "@/lib/seed-data/volleyball-config";

function makeInput(
  seasonMaxes: GameAiInput["seasonMaxes"] = {},
): GameAiInput {
  return {
    game: {
      id: gameId(1),
      homeTeamId: teamId(1),
      awayTeamId: teamId(2),
      homeName: "Coyotes",
      awayName: "Huracanes",
      leagueName: "Liga de Softbol del Valle",
      seasonName: "Temporada Verano 2026",
      scheduledAt: "2026-06-06T18:00:00Z",
    },
    config: softballConfig,
    events: eventsByGameId.get(gameId(1)) ?? [],
    playerNames: {
      [playerId(1, 1)]: "Jugador Uno",
      [playerId(1, 4)]: "Jugador Cuatro",
      [playerId(2, 1)]: "Rival Uno",
    },
    playerTeams: {
      [playerId(1, 1)]: "Coyotes",
      [playerId(1, 4)]: "Coyotes",
      [playerId(2, 1)]: "Huracanes",
    },
    seasonMaxes,
  };
}

describe("buildGameAiContext (juego 1 del seed)", () => {
  it("marcador y línea correctos, corrección excluida", () => {
    const context = buildGameAiContext(makeInput());
    expect(context.homeScore).toBe(7);
    expect(context.awayScore).toBe(6);
    expect(context.lineScore.home).toEqual([2, 0, 3, 0, 1, 0, 1]);
    expect(context.lineScore.away).toEqual([1, 0, 2, 0, 0, 3, 0]);
  });

  it("las actuaciones traen los números del motor", () => {
    const context = buildGameAiContext(makeInput());
    const p14 = context.performances.find((p) => p.playerId === playerId(1, 4));
    expect(p14?.line).toMatchObject({ HR: 1, RBI: 2, R: 2, H: 3 });
  });

  it("detecta récords contra los máximos previos de la temporada", () => {
    // Máximo previo de HR en un juego: 0 → no cuenta (sin historia).
    // Máximo previo de H: 2 → los 3 hits de los jugadores 1 y 4 lo rompen.
    const context = buildGameAiContext(
      makeInput({ H: { value: 2, holder: "Alguien Más" } }),
    );
    const hRecords = context.records.filter((r) => r.statKey === "H");
    expect(hRecords.length).toBeGreaterThanOrEqual(2);
    expect(hRecords[0]).toMatchObject({ value: 3, previousMax: 2 });
  });

  it("sin máximos previos no hay récords fantasma", () => {
    const context = buildGameAiContext(makeInput({}));
    expect(context.records).toEqual([]);
  });
});

describe("buildRecap (crónica determinista, sin IA)", () => {
  it("redacta el resultado real: Coyotes gana 7-6", () => {
    const input = makeInput();
    const story = buildRecap(input, buildGameAiContext(input));
    expect(story.titulo).toContain("Coyotes");
    expect(story.titulo).toContain("7-6");
    expect(story.resumen).toContain("Coyotes se impuso 7-6 a Huracanes");
    expect(story.resumen.length).toBeGreaterThan(50);
  });

  it("elige un MVP real del equipo ganador con su línea de números", () => {
    const input = makeInput();
    const story = buildRecap(input, buildGameAiContext(input));
    // El MVP es el jugador de mayor impacto del equipo ganador (Coyotes).
    expect(["Jugador Uno", "Jugador Cuatro"]).toContain(story.mvp.nombre);
    expect(story.mvp.justificacion).toContain("Coyotes");
    expect(story.destacado.nombre).not.toBe(story.mvp.nombre);
  });

  it("menciona el récord de temporada cuando existe", () => {
    const input = makeInput({ H: { value: 2, holder: "Alguien Más" } });
    const story = buildRecap(input, buildGameAiContext(input));
    expect(story.resumen).toContain("marca de temporada");
  });

  it("gana por sets aunque anote menos puntos (winnerBy periods_won)", () => {
    const input: GameAiInput = {
      game: {
        id: "g",
        homeTeamId: "H",
        awayTeamId: "A",
        homeName: "Águilas",
        awayName: "Escorpiones",
        leagueName: "Liga de Voleibol",
        seasonName: "Verano 2026",
        scheduledAt: "2026-07-12T19:00:00Z",
      },
      config: volleyballConfig,
      events: [],
      playerNames: {},
      playerTeams: {},
      seasonMaxes: {},
    };
    // Águilas (local) gana 3 sets a 2 con MENOS puntos (95 vs 103).
    const context: GameAiContext = {
      homeScore: 95,
      awayScore: 103,
      lineScore: {
        periods: [1, 2, 3, 4, 5],
        home: [25, 20, 25, 10, 15],
        away: [20, 25, 23, 25, 10],
      },
      performances: [],
      records: [],
      eventCount: 0,
    };
    const story = buildRecap(input, context);
    expect(story.titulo).toContain("Águilas vence a Escorpiones 3-2");
    expect(story.resumen).toContain("3 sets a 2");
    expect(story.resumen).toContain("95");
  });
});
