import type { EngineGameEvent, SportConfig } from "@/lib/engine";
import { computeScore } from "@/lib/engine";

/**
 * Construcción PURA de notificaciones (testeable sin red). El envío vive en
 * send.ts; los disparadores en /api/hooks/* (webhooks de la base de datos).
 */

export interface PushPayload {
  title: string;
  body: string;
  /** Ruta a abrir al tocar la notificación. */
  url: string;
  /** Colapsa notificaciones del mismo partido. */
  tag: string;
  kind: "start" | "period" | "final";
}

export interface GameForPush {
  id: string;
  homeTeamId: string;
  awayTeamId: string;
  homeName: string;
  awayName: string;
}

export function buildGameStartPayload(game: GameForPush): PushPayload {
  return {
    title: "¡Comenzó el partido!",
    body: `${game.awayName} vs ${game.homeName} — sigue el marcador en vivo.`,
    url: `/partido/${game.id}`,
    tag: `game-${game.id}`,
    kind: "start",
  };
}

export function buildPeriodEndPayload(
  game: GameForPush,
  events: readonly EngineGameEvent[],
  config: SportConfig,
  endedPeriod: number,
): PushPayload {
  const score = computeScore(events, config, { onUnknownEventType: "ignore" });
  const away = score.byTeam[game.awayTeamId]?.total ?? 0;
  const home = score.byTeam[game.homeTeamId]?.total ?? 0;
  const label = config.periodStructure.label.toLowerCase();
  return {
    title: `Fin de la ${label} ${endedPeriod}`,
    body: `${game.awayName} ${away} — ${home} ${game.homeName}`,
    url: `/partido/${game.id}`,
    tag: `game-${game.id}`,
    kind: "period",
  };
}

export function buildFinalPayload(
  game: GameForPush,
  homeScore: number,
  awayScore: number,
): PushPayload {
  const winner =
    homeScore > awayScore
      ? game.homeName
      : awayScore > homeScore
        ? game.awayName
        : null;
  return {
    title: winner ? `Ganó ${winner}` : "Final: empate",
    body: `Final: ${game.awayName} ${awayScore} — ${homeScore} ${game.homeName}`,
    url: `/partido/${game.id}`,
    tag: `game-${game.id}`,
    kind: "final",
  };
}

/**
 * Detección de fin de periodo: cuando llega el PRIMER evento del periodo P
 * (P > 1), el periodo P-1 terminó. La idempotencia real vive en push_log —
 * esto solo decide si este evento es candidato.
 */
export function detectPeriodEnd(
  previousEvents: readonly EngineGameEvent[],
  incoming: Pick<EngineGameEvent, "period" | "eventType">,
): number | null {
  if (incoming.eventType === "correction") return null;
  if (incoming.period === null || incoming.period <= 1) return null;
  const previousMax = previousEvents.reduce(
    (max, event) => Math.max(max, event.period ?? 0),
    0,
  );
  return incoming.period > previousMax ? incoming.period - 1 : null;
}
