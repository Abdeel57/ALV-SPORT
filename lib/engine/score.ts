import { effectiveEvents } from "./corrections";
import type { EventTypeDef, SportConfig } from "./sport-config";
import type { EngineGameEvent, GameScore, TeamScore } from "./types";

export interface ComputeScoreOptions {
  /**
   * "throw" (default): un event_type que no existe en la config es un bug de
   * datos y debe explotar. "ignore": lo omite (útil para render defensivo).
   */
  onUnknownEventType?: "throw" | "ignore";
}

export function buildEventTypeIndex(
  config: SportConfig,
): Map<string, EventTypeDef> {
  return new Map(config.eventTypes.map((eventType) => [eventType.key, eventType]));
}

/**
 * Marcador derivado exclusivamente de game_events: total y desglose por
 * periodo para cada equipo con eventos. Un equipo sin eventos no aparece en
 * byTeam; quien consuma debe tratarlo como 0 (`byTeam[id]?.total ?? 0`).
 */
export function computeScore(
  events: readonly EngineGameEvent[],
  config: SportConfig,
  options: ComputeScoreOptions = {},
): GameScore {
  const { onUnknownEventType = "throw" } = options;
  const eventTypeIndex = buildEventTypeIndex(config);
  const byTeam: Record<string, TeamScore> = {};

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
    if (def.scoreDelta === 0 || !event.teamId) continue;

    const team = (byTeam[event.teamId] ??= { total: 0, byPeriod: {} });
    team.total += def.scoreDelta;
    const period = event.period ?? 0;
    team.byPeriod[period] = (team.byPeriod[period] ?? 0) + def.scoreDelta;
  }

  let winnerTeamId: string | null = null;
  let bestTotal = Number.NEGATIVE_INFINITY;
  for (const [teamId, score] of Object.entries(byTeam)) {
    if (score.total > bestTotal) {
      bestTotal = score.total;
      winnerTeamId = teamId;
    } else if (score.total === bestTotal) {
      winnerTeamId = null;
    }
  }

  return { byTeam, winnerTeamId };
}
