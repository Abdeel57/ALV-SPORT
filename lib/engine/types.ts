/**
 * Tipos del motor de partidos. Este módulo es PURO: sin I/O, sin React,
 * sin Supabase. Refleja las filas de la base de datos en camelCase.
 */

export type GameStatus =
  | "scheduled"
  | "in_progress"
  | "finalized"
  | "canceled"
  | "forfeit";

export interface EngineGameEvent {
  id: string;
  /** Orden total autoritativo del servidor (columna `seq`). */
  seq: number;
  gameId: string;
  teamId: string | null;
  playerId: string | null;
  eventType: string;
  payload: Record<string, unknown>;
  /** Entrada/cuarto/set, base 1. `null` para eventos sin periodo. */
  period: number | null;
  /** `null` en deportes sin reloj (innings). */
  clockSeconds: number | null;
  /** Solo presente cuando eventType === "correction". */
  correctsEventId: string | null;
}

export interface EngineGame {
  id: string;
  seasonId: string;
  divisionId: string | null;
  homeTeamId: string;
  awayTeamId: string;
  status: GameStatus;
}

export interface TeamScore {
  total: number;
  byPeriod: Record<number, number>;
}

export interface GameScore {
  byTeam: Record<string, TeamScore>;
  /** Periodos/sets ganados por equipo (empatados no cuentan para nadie). */
  periodsWon: Record<string, number>;
  /** Según config.standings.winnerBy; `null` = empate o indecidible. */
  winnerTeamId: string | null;
}

export interface StandingRow {
  teamId: string;
  played: number;
  wins: number;
  losses: number;
  ties: number;
  points: number;
  scoreFor: number;
  scoreAgainst: number;
  scoreDiff: number;
  /** (wins + 0.5 * ties) / played; 0 si played === 0. */
  winPct: number;
  /** Ranking de competencia: equipos empatados tras todos los desempates comparten rank. */
  rank: number;
}
