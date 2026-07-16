import { effectiveEvents } from "./corrections";
import { buildEventTypeIndex } from "./score";
import type { SportConfig } from "./sport-config";
import type { EngineGameEvent } from "./types";

export type PlayerStatLine = Record<string, number>;

export interface ComputePlayerStatsOptions {
  onUnknownEventType?: "throw" | "ignore";
}

/**
 * Acumula estadísticas por jugador según los `playerStats` de cada tipo de
 * evento en la config. La línea de cada jugador arranca con todas las
 * estadísticas declaradas en playerStatDefs en 0.
 */
export function computePlayerStats(
  events: readonly EngineGameEvent[],
  config: SportConfig,
  options: ComputePlayerStatsOptions = {},
): Map<string, PlayerStatLine> {
  const { onUnknownEventType = "throw" } = options;
  const eventTypeIndex = buildEventTypeIndex(config);
  const stats = new Map<string, PlayerStatLine>();

  for (const event of effectiveEvents(events)) {
    const def = eventTypeIndex.get(event.eventType);
    if (!def) {
      if (onUnknownEventType === "throw") {
        throw new Error(
          `Tipo de evento desconocido para este deporte: "${event.eventType}" (evento ${event.id})`,
        );
      }
      continue;
    }
    if (!event.playerId || def.playerStats.length === 0) continue;

    let line = stats.get(event.playerId);
    if (!line) {
      line = Object.fromEntries(
        config.playerStatDefs.map((statDef) => [statDef.key, 0]),
      );
      stats.set(event.playerId, line);
    }
    for (const stat of def.playerStats) {
      line[stat.key] = (line[stat.key] ?? 0) + stat.increment;
    }
  }

  return stats;
}
