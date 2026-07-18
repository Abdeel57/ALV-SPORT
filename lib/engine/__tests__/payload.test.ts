import { describe, expect, it } from "vitest";
import { softballConfig } from "@/lib/seed-data/softball-config";
import { sportConfigSchema, validateEventPayload } from "@/lib/engine";
import type { SportConfig } from "@/lib/engine";

/**
 * Validación del payload de eventos: la fuente de verdad no debe recibir
 * basura. Deportes sin campos declarados aceptan cualquier payload
 * (retrocompatibilidad); los que declaran campos, los exigen bien tipados.
 */

// Config de prueba con un evento que lleva payload estructurado.
const withPayload: SportConfig = sportConfigSchema.parse({
  version: 1,
  periodStructure: {
    type: "innings",
    count: 7,
    label: "Entrada",
    allowsTies: false,
    overtime: { enabled: true, maxExtra: null },
  },
  standings: {
    rankBy: "points",
    pointsFor: { win: 2, tie: 1, loss: 0 },
    tiebreakers: ["head_to_head"],
  },
  playerStatDefs: [{ key: "HR", label: "Cuadrangulares" }],
  eventTypes: [
    { key: "run", label: "Carrera", scoreDelta: 1 },
    {
      key: "home_run",
      label: "Cuadrangular",
      playerStats: [{ key: "HR", increment: 1 }],
      requiresPlayer: true,
      payloadFields: [
        { key: "distance", type: "number", required: true },
        { key: "notes", type: "string" },
      ],
    },
  ],
});

describe("validateEventPayload", () => {
  it("rechaza tipos de evento desconocidos", () => {
    const result = validateEventPayload("touchdown", {}, withPayload);
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain("desconocido");
  });

  it("acepta cualquier payload cuando el evento no declara campos", () => {
    expect(validateEventPayload("run", { lo_que_sea: 1 }, withPayload).ok).toBe(true);
    expect(validateEventPayload("run", null, withPayload).ok).toBe(true);
  });

  it("exige los campos requeridos", () => {
    const result = validateEventPayload("home_run", { notes: "banda derecha" }, withPayload);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("distance"))).toBe(true);
  });

  it("valida el tipo de cada campo", () => {
    const bad = validateEventPayload("home_run", { distance: "lejos" }, withPayload);
    expect(bad.ok).toBe(false);
    expect(bad.errors[0]).toContain("number");

    const good = validateEventPayload(
      "home_run",
      { distance: 120, notes: "por el central" },
      withPayload,
    );
    expect(good.ok).toBe(true);
    expect(good.errors).toHaveLength(0);
  });

  it("los deportes seed existentes siguen aceptando payloads (sin campos declarados)", () => {
    for (const eventType of softballConfig.eventTypes) {
      expect(validateEventPayload(eventType.key, {}, softballConfig).ok).toBe(true);
    }
  });
});
