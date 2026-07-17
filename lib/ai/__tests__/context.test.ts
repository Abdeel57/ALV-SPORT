import { describe, expect, it } from "vitest";
import { buildGameAiContext, buildPrompt, type GameAiInput } from "../context";
import {
  eventsByGameId,
  gameId,
  playerId,
  softballConfig,
  teamId,
} from "@/lib/seed-data";

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

describe("buildPrompt", () => {
  it("incluye los datos estructurados y los requisitos es-MX", () => {
    const input = makeInput({ H: { value: 2, holder: "Alguien Más" } });
    const prompt = buildPrompt(input, buildGameAiContext(input));
    expect(prompt).toContain("crónica");
    expect(prompt).toContain("Coyotes");
    expect(prompt).toContain('"maximoAnterior":"2 (Alguien Más)"');
    expect(prompt).not.toContain("<");
  });
});
