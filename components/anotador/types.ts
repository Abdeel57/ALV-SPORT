import type { SportConfig } from "@/lib/engine";
import type { RulesProfile } from "@/lib/engine/scorebook";

/** Props serializables server → client de la mesa de anotación. */

export interface RosterPlayer {
  playerId: string;
  firstName: string;
  lastName: string;
  jerseyNumber: string | null;
  position: string | null;
}

export interface ConsoleTeam {
  id: string;
  name: string;
  color: string | null;
  roster: RosterPlayer[];
}

/** Fila cruda de game_events tal como viene de la base (snake_case). */
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
  leagueName: string;
  seasonName: string;
}

/** Un puesto de la alineación tal como lo confirma el anotador. */
export interface LineupSlotInput {
  playerId: string;
  /** Turno al bate (1..n); null solo para FLEX. */
  slot: number | null;
  position: string | null;
  role: "starter" | "EP" | "DH" | "FLEX";
}

export type LineupsInput = Record<string, LineupSlotInput[]>;

export interface ConsoleProps {
  /** "live" sincroniza con el servidor (cola + SSE); "demo" es 100% local. */
  mode: "live" | "demo";
  userId: string;
  game: ConsoleGame;
  homeTeam: ConsoleTeam;
  awayTeam: ConsoleTeam;
  sportKey: string;
  sportConfig: SportConfig;
  /** Perfil de reglas vigente para este partido. */
  rules: RulesProfile;
  /** De dónde salió el perfil: copia del partido, liga, o defaults. */
  rulesSource: "snapshot" | "league" | "default";
  initialEvents: ServerEventRow[];
  /** Alineaciones ya confirmadas en el servidor (recuperación cross-device). */
  initialLineups?: LineupsInput;
  /** Última alineación usada por cada equipo, para cargarla de un toque. */
  previousLineups?: LineupsInput;
  /** Jugadores con sanción activa: no pueden ser titulares. */
  sanctionedPlayerIds?: string[];
  /** Puede finalizar/reabrir y corregir cualquier jugada. */
  isManager?: boolean;
}
