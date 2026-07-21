import { describe, expect, it } from "vitest";
import {
  assignSlots,
  findScheduleConflicts,
  generateRoundRobin,
  type ConflictInput,
} from "../schedule";

const teams8 = ["t1", "t2", "t3", "t4", "t5", "t6", "t7", "t8"];
const teams5 = ["a", "b", "c", "d", "e"];

function pairKey(home: string, away: string): string {
  return [home, away].sort().join("|");
}

describe("generateRoundRobin", () => {
  it("8 equipos: 7 jornadas de 4 juegos, cada par exactamente una vez", () => {
    const fixtures = generateRoundRobin(teams8);
    expect(fixtures).toHaveLength(28);
    expect(new Set(fixtures.map((f) => f.round)).size).toBe(7);
    const pairs = fixtures.map((f) => pairKey(f.homeTeamId, f.awayTeamId));
    expect(new Set(pairs).size).toBe(28);
    for (let round = 1; round <= 7; round += 1) {
      const inRound = fixtures.filter((f) => f.round === round);
      expect(inRound).toHaveLength(4);
      const teamsInRound = inRound.flatMap((f) => [f.homeTeamId, f.awayTeamId]);
      expect(new Set(teamsInRound).size).toBe(8); // nadie repite en la jornada
    }
  });

  it("doble vuelta: cada par ordenado (ida y vuelta con localía invertida) una vez", () => {
    const fixtures = generateRoundRobin(teams8, { doubleRound: true });
    expect(fixtures).toHaveLength(56);
    const ordered = fixtures.map((f) => `${f.homeTeamId}@${f.awayTeamId}`);
    expect(new Set(ordered).size).toBe(56);
    expect(new Set(fixtures.map((f) => f.round)).size).toBe(14);
  });

  it("equipos impares: descansos (bye) y todos juegan n-1 partidos", () => {
    const fixtures = generateRoundRobin(teams5);
    expect(fixtures).toHaveLength(10);
    for (const team of teams5) {
      const count = fixtures.filter(
        (f) => f.homeTeamId === team || f.awayTeamId === team,
      ).length;
      expect(count).toBe(4);
    }
  });

  it("la localía queda razonablemente repartida", () => {
    const fixtures = generateRoundRobin(teams8);
    for (const team of teams8) {
      const home = fixtures.filter((f) => f.homeTeamId === team).length;
      expect(home).toBeGreaterThanOrEqual(2);
      expect(home).toBeLessThanOrEqual(5);
    }
  });
});

describe("assignSlots", () => {
  const constraints = {
    startDate: "2026-08-01",
    weekdays: [6], // sábados
    times: ["18:00", "20:00"],
    courtIds: ["c1", "c2"],
    minRestDays: 6,
  };

  it("sin choques de cancha+horario y con descanso mínimo respetado", () => {
    const fixtures = generateRoundRobin(teams8);
    const scheduled = assignSlots(fixtures, constraints);
    expect(scheduled).toHaveLength(28);

    const slots = scheduled.map((g) => `${g.courtId}|${g.scheduledAt}`);
    expect(new Set(slots).size).toBe(slots.length); // cancha única por horario

    const lastByTeam = new Map<string, number>();
    for (const game of scheduled) {
      const dateMs = new Date(game.scheduledAt.slice(0, 10)).getTime();
      for (const team of [game.homeTeamId, game.awayTeamId]) {
        const last = lastByTeam.get(team);
        if (last !== undefined) {
          const restDays = (dateMs - last) / (24 * 60 * 60 * 1000);
          expect(restDays).toBeGreaterThanOrEqual(constraints.minRestDays + 1);
        }
        lastByTeam.set(team, dateMs);
      }
    }
  });

  it("una jornada de 4 juegos cabe en un sábado con 2 canchas × 2 horarios", () => {
    const fixtures = generateRoundRobin(teams8).filter((f) => f.round === 1);
    const scheduled = assignSlots(fixtures, constraints);
    const dates = new Set(scheduled.map((g) => g.scheduledAt.slice(0, 10)));
    expect(dates.size).toBe(1);
    expect([...dates][0]).toBe("2026-08-01"); // 2026-08-01 es sábado
  });

  it("desborda a la siguiente fecha válida cuando la capacidad no alcanza", () => {
    const fixtures = generateRoundRobin(teams8).filter((f) => f.round === 1);
    const scheduled = assignSlots(fixtures, {
      ...constraints,
      courtIds: ["c1"], // 2 slots por fecha para 4 juegos
    });
    const dates = [...new Set(scheduled.map((g) => g.scheduledAt.slice(0, 10)))];
    expect(dates).toHaveLength(2);
    const slots = scheduled.map((g) => `${g.courtId}|${g.scheduledAt}`);
    expect(new Set(slots).size).toBe(4);
  });

  it("los partidos quedan en los días de la semana permitidos", () => {
    const scheduled = assignSlots(generateRoundRobin(teams5), constraints);
    for (const game of scheduled) {
      const weekday = new Date(`${game.scheduledAt.slice(0, 10)}T00:00:00Z`).getUTCDay();
      expect(weekday).toBe(6);
    }
  });
});

describe("findScheduleConflicts", () => {
  const game = (partial: Partial<ConflictInput> & { id: string }): ConflictInput => ({
    homeTeamId: "t1",
    awayTeamId: "t2",
    courtId: "c1",
    scheduledAt: "2026-08-01T18:00:00-06:00",
    ...partial,
  });
  const typesOf = (map: Map<string, { type: string }[]>, id: string) =>
    [...new Set((map.get(id) ?? []).map((w) => w.type))].sort();

  it("un calendario sano (round-robin asignado) no produce advertencias", () => {
    const scheduled = assignSlots(generateRoundRobin(teams8), {
      startDate: "2026-08-01",
      weekdays: [6],
      times: ["18:00", "20:00"],
      courtIds: ["c1", "c2"],
      minRestDays: 6,
    });
    const conflicts = findScheduleConflicts(
      scheduled.map((fixture, index) => ({
        id: `g${index}`,
        homeTeamId: fixture.homeTeamId,
        awayTeamId: fixture.awayTeamId,
        courtId: fixture.courtId,
        scheduledAt: fixture.scheduledAt,
      })),
    );
    expect(conflicts.size).toBe(0);
  });

  it("marca el mismo enfrentamiento repetido en ambos partidos", () => {
    const conflicts = findScheduleConflicts([
      game({ id: "a" }),
      game({ id: "b", scheduledAt: "2026-08-08T18:00:00-06:00", courtId: "c2" }),
    ]);
    expect(typesOf(conflicts, "a")).toEqual(["duplicate_matchup"]);
    expect(typesOf(conflicts, "b")).toEqual(["duplicate_matchup"]);
  });

  it("la vuelta con localía invertida NO es enfrentamiento repetido", () => {
    const conflicts = findScheduleConflicts([
      game({ id: "a" }),
      game({
        id: "b",
        homeTeamId: "t2",
        awayTeamId: "t1",
        scheduledAt: "2026-08-08T18:00:00-06:00",
        courtId: "c2",
      }),
    ]);
    expect(conflicts.size).toBe(0);
  });

  it("marca a un equipo con dos partidos en el mismo instante", () => {
    const conflicts = findScheduleConflicts([
      game({ id: "a" }),
      game({ id: "b", homeTeamId: "t1", awayTeamId: "t3", courtId: "c2" }),
    ]);
    expect(typesOf(conflicts, "a")).toContain("team_clash");
    expect(typesOf(conflicts, "b")).toContain("team_clash");
  });

  it("marca una cancha con dos partidos en el mismo instante", () => {
    const conflicts = findScheduleConflicts([
      game({ id: "a" }),
      game({ id: "b", homeTeamId: "t3", awayTeamId: "t4" }),
    ]);
    expect(typesOf(conflicts, "a")).toContain("court_clash");
    expect(typesOf(conflicts, "b")).toContain("court_clash");
  });

  it("mismo instante en canchas distintas y equipos distintos: sin advertencias", () => {
    const conflicts = findScheduleConflicts([
      game({ id: "a" }),
      game({ id: "b", homeTeamId: "t3", awayTeamId: "t4", courtId: "c2" }),
    ]);
    expect(conflicts.size).toBe(0);
  });

  it("partidos sin cancha nunca chocan por cancha", () => {
    const conflicts = findScheduleConflicts([
      game({ id: "a", courtId: null }),
      game({ id: "b", homeTeamId: "t3", awayTeamId: "t4", courtId: null }),
    ]);
    expect(conflicts.size).toBe(0);
  });
});
