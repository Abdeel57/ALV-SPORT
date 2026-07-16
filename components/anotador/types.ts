import type { SportConfig } from "@/lib/engine";

/** Props serializables server → client de la mesa de anotación. */

export interface RosterPlayer {
  playerId: string;
  firstName: string;
  lastName: string;
  jerseyNumber: string | null;
}

export interface ConsoleTeam {
  id: string;
  name: string;
  color: string | null;
  roster: RosterPlayer[];
}

/** Fila cruda de game_events tal como viene de Supabase (snake_case). */
export interface ServerEventRow {
  id: string;
  seq: number;
  game_id: string;
  team_id: string | null;
  player_id: string | null;
  event_type: string;
  payload: Record<string, unknown>;
  period: number | null;
  clock_seconds: number | null;
  corrects_event_id: string | null;
  created_by: string;
  created_at: string;
}

export interface ConsoleGame {
  id: string;
  status: string;
  scheduledAt: string;
}

export interface ConsoleProps {
  /** "live" usa Supabase (sync + Realtime); "demo" es 100% local. */
  mode: "live" | "demo";
  userId: string;
  game: ConsoleGame;
  homeTeam: ConsoleTeam;
  awayTeam: ConsoleTeam;
  sportKey: string;
  sportConfig: SportConfig;
  initialEvents: ServerEventRow[];
  /** Alineaciones ya confirmadas en el servidor (recuperación cross-device). */
  initialLineups?: Record<string, string[]>;
}
