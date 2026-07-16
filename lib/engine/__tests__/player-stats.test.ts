import { describe, expect, it } from "vitest";
import { eventsForGame } from "./helpers";
import { basketballConfig } from "@/lib/seed-data/basketball-config";
import { playerId } from "@/lib/seed-data/ids";
import { softballConfig } from "@/lib/seed-data/softball-config";
import { computePlayerStats } from "../player-stats";

describe("computePlayerStats — softbol (juego 1, expectativas a mano)", () => {
  const stats = computePlayerStats(eventsForGame(1), softballConfig);

  it("línea completa del jugador 1 de Coyotes", () => {
    expect(stats.get(playerId(1, 1))).toEqual({
      R: 2, H: 3, AB: 4, "2B": 1, "3B": 0, HR: 0, SO: 1, BB: 0, RBI: 0, E: 0,
    });
  });

  it("línea del jugador 4 de Coyotes (cuadrangular, 2 impulsadas)", () => {
    expect(stats.get(playerId(1, 4))).toMatchObject({
      R: 2, H: 3, AB: 3, HR: 1, RBI: 2,
    });
  });

  it("la carrera fantasma anulada NO cuenta para el jugador 5 de Coyotes", () => {
    expect(stats.get(playerId(1, 5))).toMatchObject({ R: 0, BB: 1, AB: 2 });
  });

  it("línea del jugador 1 de Huracanes (cuadrangular de 2 carreras)", () => {
    expect(stats.get(playerId(2, 1))).toMatchObject({
      R: 2, H: 2, AB: 4, HR: 1, RBI: 2,
    });
  });

  it("el error de campo se carga al fildeador de Huracanes", () => {
    expect(stats.get(playerId(2, 5))).toMatchObject({ E: 1, H: 1, "2B": 1, RBI: 1 });
  });
});

describe("computePlayerStats — basquetbol (increments: fg3 suma 3 a PTS)", () => {
  const stats = computePlayerStats(eventsForGame(11), basketballConfig);

  it("línea completa del jugador 1 de Panteras", () => {
    expect(stats.get(playerId(7, 1))).toEqual({
      PTS: 11, FG2: 2, FG3: 2, FT: 1, REB: 2, AST: 1, STL: 0, BLK: 0, TO: 0, PF: 1,
    });
  });

  it("el triple fantasma anulado no suma para el jugador 1 de Lobos", () => {
    // Sin la corrección tendría FG3: 3 y PTS: 14.
    expect(stats.get(playerId(8, 1))).toMatchObject({
      PTS: 11, FG3: 2, FG2: 2, FT: 1, REB: 1,
    });
  });
});
