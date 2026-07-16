import { describe, expect, it } from "vitest";
import { basketballConfig } from "@/lib/seed-data/basketball-config";
import { softballConfig } from "@/lib/seed-data/softball-config";
import { CORRECTION_EVENT_TYPE, sportConfigSchema } from "../sport-config";

describe("sportConfigSchema", () => {
  it("valida las configs de softbol y basquetbol tras round-trip JSON (lo que guarda la DB)", () => {
    for (const config of [softballConfig, basketballConfig]) {
      const roundTripped: unknown = JSON.parse(JSON.stringify(config));
      expect(sportConfigSchema.parse(roundTripped)).toEqual(config);
    }
  });

  it("rechaza el tipo de evento reservado 'correction'", () => {
    const invalid = {
      ...softballConfig,
      eventTypes: [
        ...softballConfig.eventTypes,
        { key: CORRECTION_EVENT_TYPE, label: "Corrección", scoreDelta: 0, playerStats: [], requiresPlayer: false },
      ],
    };
    expect(() => sportConfigSchema.parse(invalid)).toThrow();
  });

  it("rechaza tipos de evento duplicados", () => {
    const invalid = {
      ...softballConfig,
      eventTypes: [...softballConfig.eventTypes, ...softballConfig.eventTypes.slice(0, 1)],
    };
    expect(() => sportConfigSchema.parse(invalid)).toThrow();
  });

  it("rechaza playerStats que apuntan a estadísticas no declaradas", () => {
    const invalid = {
      ...softballConfig,
      eventTypes: [
        ...softballConfig.eventTypes,
        {
          key: "sacrifice",
          label: "Sacrificio",
          scoreDelta: 0,
          playerStats: [{ key: "NO_EXISTE", increment: 1 }],
          requiresPlayer: true,
        },
      ],
    };
    expect(() => sportConfigSchema.parse(invalid)).toThrow();
  });
});
