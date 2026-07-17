import { describe, expect, it } from "vitest";
import {
  buildFinalPayload,
  buildGameStartPayload,
  buildPeriodEndPayload,
  detectPeriodEnd,
} from "../payloads";
import { eventsByGameId, gameId, softballConfig, teamId } from "@/lib/seed-data";

const game1Events = eventsByGameId.get(gameId(1)) ?? [];
const game = {
  id: gameId(1),
  homeTeamId: teamId(1),
  awayTeamId: teamId(2),
  homeName: "Coyotes",
  awayName: "Huracanes",
};

describe("detectPeriodEnd", () => {
  const period1 = game1Events.filter((event) => event.period === 1);

  it("el primer evento del periodo 2 marca el fin del periodo 1", () => {
    expect(detectPeriodEnd(period1, { period: 2, eventType: "out" })).toBe(1);
  });

  it("un segundo evento del mismo periodo no dispara nada", () => {
    const withPeriod2 = game1Events.filter((event) => (event.period ?? 0) <= 2);
    expect(detectPeriodEnd(withPeriod2, { period: 2, eventType: "run" })).toBeNull();
  });

  it("las correcciones y el periodo 1 nunca disparan", () => {
    expect(detectPeriodEnd(period1, { period: 2, eventType: "correction" })).toBeNull();
    expect(detectPeriodEnd([], { period: 1, eventType: "run" })).toBeNull();
    expect(detectPeriodEnd(period1, { period: null, eventType: "run" })).toBeNull();
  });

  it("un salto de periodo (2 → 4) reporta el fin del periodo anterior al entrante", () => {
    const throughPeriod2 = game1Events.filter((event) => (event.period ?? 0) <= 2);
    expect(detectPeriodEnd(throughPeriod2, { period: 4, eventType: "out" })).toBe(3);
  });
});

describe("payloads", () => {
  it("fin de la entrada 1 con el marcador del seed (Huracanes 1 — 2 Coyotes)", () => {
    const period1 = game1Events.filter((event) => event.period === 1);
    const payload = buildPeriodEndPayload(game, period1, softballConfig, 1);
    expect(payload.title).toBe("Fin de la entrada 1");
    expect(payload.body).toBe("Huracanes 1 — 2 Coyotes");
    expect(payload.url).toBe(`/partido/${gameId(1)}`);
    expect(payload.kind).toBe("period");
  });

  it("inicio y final con ganador correcto", () => {
    expect(buildGameStartPayload(game).title).toBe("¡Comenzó el partido!");
    const final = buildFinalPayload(game, 7, 6);
    expect(final.title).toBe("Ganó Coyotes");
    expect(final.body).toBe("Final: Huracanes 6 — 7 Coyotes");
    const tie = buildFinalPayload(game, 4, 4);
    expect(tie.title).toBe("Final: empate");
  });
});
