import type { EngineGameEvent } from "../types";
import type { RulesProfile } from "./rules";

/**
 * Estado de la libreta digital. TODO se deriva de los eventos efectivos de
 * `game_events` en orden `seq`; nada de aquí se guarda ni se edita a mano.
 */

export type Half = "top" | "bottom";

/** 0 = caja de bateo (sin llegar a base); 4 = home (anotó). */
export type BaseIndex = 0 | 1 | 2 | 3 | 4;
export type OccupiedBase = 1 | 2 | 3;

/** Cómo llegó un corredor a base (para carreras limpias y para la celda). */
export type ReachKind =
  | "hit"
  | "walk"
  | "hbp"
  | "error"
  | "fielders_choice"
  | "interference"
  | "dropped_third_strike"
  | "pinch_runner"
  | "placed"; // corredor colocado por regla (desempate) o corrección manual

export type AdvanceReason =
  | "batted_ball"
  | "hit"
  | "walk"
  | "error"
  | "stolen_base"
  | "caught_stealing"
  | "wild_pitch"
  | "passed_ball"
  | "balk"
  | "pickoff"
  | "sacrifice"
  | "fielders_choice"
  | "forced"
  | "tag"
  | "defensive_indifference"
  | "home_run"
  | "manual";

export interface LineupSlot {
  /** Puesto en el orden al bate, base 1. */
  slot: number;
  playerId: string;
  /** Posición defensiva vigente (P, C, 1B…) o null si solo batea (EP/DH). */
  position: string | null;
  /** Rol de alineación: titular, sustituto, o rol especial. */
  role: "starter" | "sub" | "EP" | "DH" | "PH" | "PR" | "FLEX";
  /** Evento que lo puso en el puesto (null para titulares). */
  enteredByEventId: string | null;
}

export interface SubstitutionRecord {
  eventId: string;
  seq: number;
  inning: number;
  half: Half;
  slot: number;
  inPlayerId: string;
  outPlayerId: string | null;
  position: string | null;
  role: LineupSlot["role"];
}

export interface PathSegment {
  from: BaseIndex;
  to: BaseIndex;
  reason: AdvanceReason;
  /** Jugada en la que ocurrió el avance (puede ser posterior al turno). */
  playId: string;
  /** Solo cuando el corredor fue puesto out en este tramo. */
  out: boolean;
  fielders: number[];
}

export interface PitchRecord {
  eventId: string;
  kind: "ball" | "strike" | "foul";
}

export type PAResultKind =
  | "single"
  | "double"
  | "triple"
  | "home_run"
  | "walk"
  | "intentional_walk"
  | "hbp"
  | "strikeout"
  | "out"
  | "fielders_choice"
  | "reach_on_error"
  | "sac_fly"
  | "sac_bunt"
  | "interference";

export interface PlateAppearance {
  /** playId de la jugada que cerró la aparición (o de la primera si sigue abierta). */
  id: string;
  teamId: string;
  batterId: string;
  slot: number;
  inning: number;
  half: Half;
  /** 1 para la primera aparición del bateador en la entrada, 2 para la segunda… */
  indexInInning: number;
  /** null mientras la aparición está en curso. */
  result: PAResultKind | null;
  /** Código de libreta: "1B", "K", "6-3", "BB", "F8"… */
  code: string;
  /** Subtipo del out o del hit (ground, fly, line, swinging, looking…). */
  detail: string | null;
  fielders: number[];
  /** Recorrido del bateador convertido en corredor, tramo por tramo. */
  path: PathSegment[];
  finalBase: BaseIndex;
  scored: boolean;
  /** Número de out (1–3) si el bateador o su corredor fueron puestos out. */
  outNumber: number | null;
  /** Out hecho por el propio bateador en la jugada de su turno. */
  batterOut: boolean;
  rbi: number;
  /** true/false decidido; null = pendiente de revisión del anotador. */
  earnedRun: boolean | null;
  pitches: PitchRecord[];
  /** Pitcher rival que enfrentó esta aparición. */
  pitcherId: string | null;
  eventIds: string[];
  /** Aparición interrumpida por un tercer out en las bases. */
  interrupted: boolean;
}

export interface RunnerState {
  playerId: string;
  base: OccupiedBase;
  /** Aparición en la que este corredor llegó a base (dueña de la celda). */
  paId: string;
  reachedBy: ReachKind;
  /** Pitcher responsable (quien lo dejó llegar a base). */
  pitcherId: string | null;
  /** Ocurrió un error en la media entrada antes de que llegara. */
  errorBeforeReach: boolean;
}

export interface Bases {
  1: RunnerState | null;
  2: RunnerState | null;
  3: RunnerState | null;
}

export interface TeamLineScore {
  /** Carreras por entrada (índice = entrada - 1). */
  runs: number[];
  hits: number;
  /** Errores cometidos por la DEFENSA de este equipo. */
  errors: number;
  leftOnBase: number;
}

export interface TeamBook {
  teamId: string;
  slots: LineupSlot[];
  substitutions: SubstitutionRecord[];
  /** Índice 0-based en `slots` del siguiente bateador. */
  nextSlotIndex: number;
  plateAppearances: PlateAppearance[];
  line: TeamLineScore;
  /** Pitcher vigente cuando este equipo DEFIENDE. */
  currentPitcherId: string | null;
}

export type IssueSeverity = "warning" | "error";

export interface ScorebookIssue {
  severity: IssueSeverity;
  eventId: string | null;
  playId: string | null;
  message: string;
}

export interface PlaySummary {
  playId: string;
  seq: number;
  inning: number;
  half: Half;
  teamId: string;
  /** Texto humano: "Sencillo de Ana; María anota desde segunda". */
  text: string;
  eventIds: string[];
  /** true si alguna corrección anuló parte de la jugada. */
  partiallyVoided: boolean;
}

export interface GameEndCondition {
  reason: "regulation" | "walk_off" | "mercy" | "manual";
  inning: number;
  half: Half;
}

export interface ScorebookState {
  rules: RulesProfile;
  homeTeamId: string;
  awayTeamId: string;
  inning: number;
  half: Half;
  outs: number;
  balls: number;
  strikes: number;
  bases: Bases;
  teams: Record<string, TeamBook>;
  battingTeamId: string;
  fieldingTeamId: string;
  /** Aparición en curso (bateador actual). */
  currentPA: PlateAppearance | null;
  plays: PlaySummary[];
  issues: ScorebookIssue[];
  /** Cuándo debería terminar el partido según reglas; null = sigue. */
  endCondition: GameEndCondition | null;
  /** Último seq procesado (para depuración y catch-up). */
  lastSeq: number;
  /** Eventos efectivos ya plegados, por si la UI necesita releerlos. */
  effective: EngineGameEvent[];
}

/** Snapshot de alineación inicial: lo que confirmó el anotador al iniciar. */
export interface InitialLineup {
  teamId: string;
  slots: {
    slot: number;
    playerId: string;
    position: string | null;
    role: LineupSlot["role"];
  }[];
}
