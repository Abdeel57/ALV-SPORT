import type { PlayerStatLine } from "@/lib/engine/player-stats";
import type { PlayerStatDef } from "@/lib/engine/sport-config";
import type { StatCategory, TeamRef } from "./types";

export interface StatPlayerMeta {
  name: string;
  team: TeamRef;
}

/**
 * Convierte los acumulados del motor en tablas públicas por categoría.
 * El orden secundario es estable y los empates comparten posición.
 */
export function buildStatCategories(
  stats: ReadonlyMap<string, PlayerStatLine>,
  statDefs: readonly PlayerStatDef[],
  players: ReadonlyMap<string, StatPlayerMeta>,
  limit = 10,
): StatCategory[] {
  return statDefs.map((def) => {
    const sorted = [...stats.entries()]
      .flatMap(([playerId, line]) => {
        const player = players.get(playerId);
        const value = line[def.key] ?? 0;
        return player && value > 0 ? [{ playerId, value, ...player }] : [];
      })
      .sort(
        (a, b) =>
          b.value - a.value ||
          a.name.localeCompare(b.name, "es") ||
          a.playerId.localeCompare(b.playerId),
      )
      .slice(0, Math.max(0, limit));

    let rank = 0;
    let previousValue: number | undefined;
    return {
      key: def.key,
      label: def.label,
      leaders: sorted.map((entry, index) => {
        if (entry.value !== previousValue) rank = index + 1;
        previousValue = entry.value;
        return {
          ...entry,
          statKey: def.key,
          statLabel: def.label,
          rank,
        };
      }),
    };
  });
}
