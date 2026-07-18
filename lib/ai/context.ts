import {
  computePlayerStats,
  computeScore,
  effectiveEvents,
  type EngineGameEvent,
  type SportConfig,
} from "@/lib/engine";

/**
 * Construcción PURA del contexto para el resumen de IA: solo datos
 * estructurados desde game_events (nada de HTML). Testeable con los seeds.
 */

export interface GameAiInput {
  game: {
    id: string;
    homeTeamId: string;
    awayTeamId: string;
    homeName: string;
    awayName: string;
    leagueName: string;
    seasonName: string;
    scheduledAt: string;
  };
  config: SportConfig;
  events: EngineGameEvent[];
  /** playerId → nombre completo. */
  playerNames: Record<string, string>;
  /** playerId → nombre de su equipo. */
  playerTeams: Record<string, string>;
  /** Máximos de la temporada ANTES de este juego: statKey → {value, holder}. */
  seasonMaxes: Record<string, { value: number; holder: string }>;
}

export interface PlayerPerformance {
  playerId: string;
  name: string;
  team: string;
  line: Record<string, number>;
}

export interface DetectedRecord {
  playerId: string;
  playerName: string;
  statKey: string;
  statLabel: string;
  value: number;
  previousMax: number;
  previousHolder: string;
}

export interface GameAiContext {
  homeScore: number;
  awayScore: number;
  lineScore: { periods: number[]; home: number[]; away: number[] };
  performances: PlayerPerformance[];
  records: DetectedRecord[];
  eventCount: number;
}

export function buildGameAiContext(input: GameAiInput): GameAiContext {
  const { game, config, events, playerNames, playerTeams, seasonMaxes } = input;
  const score = computeScore(events, config, { onUnknownEventType: "ignore" });
  const effective = effectiveEvents(events);
  const stats = computePlayerStats(events, config, { onUnknownEventType: "ignore" });

  const maxPeriod = Math.max(
    config.periodStructure.count,
    ...effective.map((event) => event.period ?? 0),
  );
  const periods = Array.from({ length: maxPeriod }, (_, i) => i + 1);

  const performances: PlayerPerformance[] = [...stats.entries()]
    .map(([playerId, line]) => ({
      playerId,
      name: playerNames[playerId] ?? "Jugador",
      team: playerTeams[playerId] ?? "",
      line,
    }))
    // Solo actuaciones con algo que contar, ordenadas por impacto simple
    // (suma de sus estadísticas) para acotar el prompt.
    .filter((p) => Object.values(p.line).some((value) => value > 0))
    .sort(
      (a, b) =>
        Object.values(b.line).reduce((s, v) => s + v, 0) -
        Object.values(a.line).reduce((s, v) => s + v, 0),
    )
    .slice(0, 12);

  const statLabels = new Map(config.playerStatDefs.map((def) => [def.key, def.label]));
  const records: DetectedRecord[] = [];
  for (const performance of performances) {
    for (const [statKey, value] of Object.entries(performance.line)) {
      const previous = seasonMaxes[statKey];
      if (previous && value > previous.value && previous.value > 0) {
        records.push({
          playerId: performance.playerId,
          playerName: performance.name,
          statKey,
          statLabel: statLabels.get(statKey) ?? statKey,
          value,
          previousMax: previous.value,
          previousHolder: previous.holder,
        });
      }
    }
  }

  return {
    homeScore: score.byTeam[game.homeTeamId]?.total ?? 0,
    awayScore: score.byTeam[game.awayTeamId]?.total ?? 0,
    lineScore: {
      periods,
      home: periods.map((p) => score.byTeam[game.homeTeamId]?.byPeriod[p] ?? 0),
      away: periods.map((p) => score.byTeam[game.awayTeamId]?.byPeriod[p] ?? 0),
    },
    performances,
    records,
    eventCount: effective.length,
  };
}
