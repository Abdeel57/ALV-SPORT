import { describe, expect, it } from "vitest";
import { buildStatCategories } from "../stat-leaders";

const team = { id: "t1", name: "Equipo", slug: "equipo", color: null };

describe("buildStatCategories", () => {
  it("ordena por valor, conserva empates y excluye ceros", () => {
    const stats = new Map([
      ["p1", { R: 4, H: 1 }],
      ["p2", { R: 4, H: 3 }],
      ["p3", { R: 0, H: 2 }],
    ]);
    const players = new Map([
      ["p1", { name: "Ana", team }],
      ["p2", { name: "Bea", team }],
      ["p3", { name: "Carla", team }],
    ]);

    const categories = buildStatCategories(
      stats,
      [
        { key: "R", label: "Carreras" },
        { key: "H", label: "Hits" },
      ],
      players,
    );

    expect(categories[0]?.leaders.map(({ playerId, rank, value }) => ({ playerId, rank, value })))
      .toEqual([
        { playerId: "p1", rank: 1, value: 4 },
        { playerId: "p2", rank: 1, value: 4 },
      ]);
    expect(categories[1]?.leaders.map(({ playerId, rank }) => ({ playerId, rank })))
      .toEqual([
        { playerId: "p2", rank: 1 },
        { playerId: "p3", rank: 2 },
        { playerId: "p1", rank: 3 },
      ]);
  });

  it("respeta el límite y omite jugadores sin metadatos", () => {
    const categories = buildStatCategories(
      new Map([
        ["known", { PTS: 8 }],
        ["missing", { PTS: 20 }],
      ]),
      [{ key: "PTS", label: "Puntos" }],
      new Map([["known", { name: "Luis", team }]]),
      1,
    );

    expect(categories[0]?.leaders).toHaveLength(1);
    expect(categories[0]?.leaders[0]?.playerId).toBe("known");
  });
});
