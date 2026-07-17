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

  // Periodos/sets ganados: por cada periodo con eventos, gana quien anotó
  // más en ese periodo (empatado no suma para nadie).
  const periodsWon: Record<string, number> = {};
  const teamIds = Object.keys(byTeam);
  const allPeriods = new Set<number>();
  for (const score of Object.values(byTeam)) {
    for (const period of Object.keys(score.byPeriod)) {
      allPeriods.add(Number(period));
    }
  }
  for (const teamId of teamIds) periodsWon[teamId] = 0;
  for (const period of allPeriods) {
    let best: string | null = null;
    let bestPoints = Number.NEGATIVE_INFINITY;
    for (const teamId of teamIds) {
      const points = byTeam[teamId]?.byPeriod[period] ?? 0;
      if (points > bestPoints) {
        bestPoints = points;
        best = teamId;
      } else if (points === bestPoints) {
        best = null;
      }
    }
    if (best !== null) {
      periodsWon[best] = (periodsWon[best] ?? 0) + 1;
    }
  }

  // Ganador según la config del deporte (marcador total o periodos ganados).
  const metric = (teamId: string): number =>
    config.standings.winnerBy === "periods_won"
      ? (periodsWon[teamId] ?? 0)
      : (byTeam[teamId]?.total ?? 0);
  let winnerTeamId: string | null = null;
  let bestMetric = Number.NEGATIVE_INFINITY;
  for (const teamId of teamIds) {
    const value = metric(teamId);
    if (value > bestMetric) {
      bestMetric = value;
      winnerTeamId = teamId;
    } else if (value === bestMetric) {
      winnerTeamId = null;
    }
  }

  return { byTeam, periodsWon, winnerTeamId };
}
