import type { RulesProfile } from "./rules";
import { AT_BAT_RESULTS, HIT_RESULTS, type ScorebookStateInternal } from "./reduce";
import type { LineupSlot, PlateAppearance } from "./types";

/**
 * Estadísticas derivadas de la libreta. Todo sale de los mismos registros
 * que dibujan las celdas, así que nunca pueden contradecirse.
 *
 * Promedios: se calculan SIEMPRE desde los totales (H/AB), nunca promediando
 * promedios de juegos distintos. Denominador cero → null, no "1.000".
 */

export interface BattingLine {
  playerId: string;
  slot: number | null;
  positions: string[];
  PA: number;
  AB: number;
  R: number;
  H: number;
  "2B": number;
  "3B": number;
  HR: number;
  RBI: number;
  BB: number;
  HBP: number;
  SO: number;
  SF: number;
  SH: number;
  SB: number;
  CS: number;
  TB: number;
  AVG: number | null;
  OBP: number | null;
  SLG: number | null;
  OPS: number | null;
}

export interface PitchingLine {
  pitcherId: string;
  /** Outs registrados: la duración se guarda como entero, nunca decimal. */
  outs: number;
  /** "6.1" = seis entradas y un out (notación de libreta). */
  ip: string;
  BF: number;
  H: number;
  R: number;
  ER: number;
  /** Carreras cuya clasificación limpia/sucia sigue pendiente de decisión. */
  pendingER: number;
  BB: number;
  HBP: number;
  SO: number;
  HR: number;
  ERA: number | null;
  WHIP: number | null;
  /** Promedio de bateo de los rivales (H / AB enfrentados). */
  OBA: number | null;
  /** Slugging de los rivales (TB / AB enfrentados). */
  OSLG: number | null;
  /**
   * Ganado/perdido/salvamento requieren regla y revisión: nunca se infieren
   * del marcador. Quedan como decisión explícita del anotador.
   */
  decision: "W" | "L" | "SV" | null;
}

export interface FieldingLine {
  playerId: string;
  positions: string[];
  PO: number;
  A: number;
  E: number;
}

function ratio(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return numerator / denominator;
}

function round3(value: number | null): number | null {
  return value === null ? null : Math.round(value * 1000) / 1000;
}

function round2(value: number | null): number | null {
  return value === null ? null : Math.round(value * 100) / 100;
}

/** 18 outs → "6.0"; 19 → "6.1"; 20 → "6.2". */
export function formatInnings(outs: number): string {
  const whole = Math.floor(outs / 3);
  const rest = outs % 3;
  return `${whole}.${rest}`;
}

/**
 * Efectividad = carreras limpias × base × 3 / outs. Con base 7:
 * ER × 21 / outs → 3 ER en 18 outs = 3.50.
 */
export function earnedRunAverage(
  earnedRuns: number,
  outs: number,
  inningsBase: number,
): number | null {
  if (outs <= 0) return null;
  return round2((earnedRuns * inningsBase * 3) / outs);
}

export function whip(walks: number, hits: number, outs: number): number | null {
  if (outs <= 0) return null;
  return round2(((walks + hits) * 3) / outs);
}

function emptyBatting(playerId: string, slot: LineupSlot | null): BattingLine {
  return {
    playerId,
    slot: slot?.slot ?? null,
    positions: slot?.position ? [slot.position] : [],
    PA: 0,
    AB: 0,
    R: 0,
    H: 0,
    "2B": 0,
    "3B": 0,
    HR: 0,
    RBI: 0,
    BB: 0,
    HBP: 0,
    SO: 0,
    SF: 0,
    SH: 0,
    SB: 0,
    CS: 0,
    TB: 0,
    AVG: null,
    OBP: null,
    SLG: null,
    OPS: null,
  };
}

function finishBatting(line: BattingLine): BattingLine {
  const obpDen = line.AB + line.BB + line.HBP + line.SF;
  line.AVG = round3(ratio(line.H, line.AB));
  line.OBP = round3(ratio(line.H + line.BB + line.HBP, obpDen));
  line.SLG = round3(ratio(line.TB, line.AB));
  line.OPS = line.OBP !== null && line.SLG !== null ? round3(line.OBP + line.SLG) : null;
  return line;
}

function tallyPA(line: BattingLine, pa: PlateAppearance): void {
  if (!pa.result || pa.interrupted) return;
  line.PA += 1;
  if (AT_BAT_RESULTS.has(pa.result)) line.AB += 1;
  if (HIT_RESULTS.has(pa.result)) line.H += 1;
  switch (pa.result) {
    case "single":
      line.TB += 1;
      break;
    case "double":
      line["2B"] += 1;
      line.TB += 2;
      break;
    case "triple":
      line["3B"] += 1;
      line.TB += 3;
      break;
    case "home_run":
      line.HR += 1;
      line.TB += 4;
      break;
    case "walk":
    case "intentional_walk":
      line.BB += 1;
      break;
    case "hbp":
      line.HBP += 1;
      break;
    case "strikeout":
      line.SO += 1;
      break;
    case "sac_fly":
      line.SF += 1;
      break;
    case "sac_bunt":
      line.SH += 1;
      break;
    default:
      break;
  }
  line.RBI += pa.rbi;
}

/** Líneas de bateo por equipo, en orden al bate (sustitutos después de su puesto). */
export function battingLines(
  state: ScorebookStateInternal,
): Record<string, BattingLine[]> {
  const result: Record<string, BattingLine[]> = {};
  for (const book of Object.values(state.teams)) {
    const lines = new Map<string, BattingLine>();
    const slotOf = (playerId: string): LineupSlot | null =>
      book.slots.find((slot) => slot.playerId === playerId) ?? null;
    const lineFor = (playerId: string): BattingLine => {
      let line = lines.get(playerId);
      if (!line) {
        line = emptyBatting(playerId, slotOf(playerId));
        lines.set(playerId, line);
      }
      return line;
    };

    // Todos los que estuvieron en el orden aparecen aunque no hayan bateado.
    for (const slot of book.slots) lineFor(slot.playerId);
    for (const sub of book.substitutions) {
      lineFor(sub.inPlayerId);
      if (sub.outPlayerId) lineFor(sub.outPlayerId);
    }
    for (const pa of book.plateAppearances) tallyPA(lineFor(pa.batterId), pa);
    for (const run of book.runsScored) {
      if (run.playerId) lineFor(run.playerId).R += 1;
    }
    for (const event of state.effective) {
      if (event.teamId !== book.teamId || !event.playerId) continue;
      if (event.eventType === "stolen_base") lineFor(event.playerId).SB += 1;
      if (event.eventType === "caught_stealing") lineFor(event.playerId).CS += 1;
    }
    // Posiciones por las que pasó cada jugador (titular + cambios).
    for (const sub of book.substitutions) {
      if (sub.position) {
        const line = lineFor(sub.inPlayerId);
        if (!line.positions.includes(sub.position)) line.positions.push(sub.position);
      }
    }

    const ordered = [...lines.values()].map(finishBatting).sort((a, b) => {
      const sa = a.slot ?? Number.MAX_SAFE_INTEGER;
      const sb = b.slot ?? Number.MAX_SAFE_INTEGER;
      return sa - sb || a.playerId.localeCompare(b.playerId);
    });
    result[book.teamId] = ordered;
  }
  return result;
}

/** Totales del equipo, calculados desde las sumas (no desde los promedios). */
export function teamBattingTotals(lines: readonly BattingLine[]): BattingLine {
  const total = emptyBatting("", null);
  total.positions = [];
  for (const line of lines) {
    for (const key of [
      "PA", "AB", "R", "H", "2B", "3B", "HR", "RBI", "BB", "HBP", "SO", "SF", "SH", "SB", "CS", "TB",
    ] as const) {
      total[key] += line[key];
    }
  }
  return finishBatting(total);
}

/** Líneas de pitcheo de cada equipo (los pitchers de ese equipo). */
export function pitchingLines(
  state: ScorebookStateInternal,
  rules: RulesProfile = state.rules,
): Record<string, PitchingLine[]> {
  const result: Record<string, PitchingLine[]> = {};
  for (const book of Object.values(state.teams)) {
    const opponentId = book.teamId === state.homeTeamId ? state.awayTeamId : state.homeTeamId;
    const opponent = state.teams[opponentId];
    const lines = new Map<string, PitchingLine & { abAgainst: number; tbAgainst: number }>();
    const lineFor = (pitcherId: string) => {
      let line = lines.get(pitcherId);
      if (!line) {
        line = {
          pitcherId,
          outs: 0,
          ip: "0.0",
          BF: 0,
          H: 0,
          R: 0,
          ER: 0,
          pendingER: 0,
          BB: 0,
          HBP: 0,
          SO: 0,
          HR: 0,
          ERA: null,
          WHIP: null,
          OBA: null,
          OSLG: null,
          decision: null,
          abAgainst: 0,
          tbAgainst: 0,
        };
        lines.set(pitcherId, line);
      }
      return line;
    };

    // Pitcher titular aunque aún no haya lanzado.
    const starter = book.slots.find((slot) => slot.position === "P");
    if (starter) lineFor(starter.playerId);

    for (const out of book.outsMade) {
      if (out.pitcherId) lineFor(out.pitcherId).outs += 1;
    }
    for (const faced of book.battersFaced) {
      if (faced.pitcherId) lineFor(faced.pitcherId).BF += 1;
    }
    if (opponent) {
      for (const pa of opponent.plateAppearances) {
        if (!pa.pitcherId || !pa.result || pa.interrupted) continue;
        const line = lineFor(pa.pitcherId);
        if (HIT_RESULTS.has(pa.result)) line.H += 1;
        if (AT_BAT_RESULTS.has(pa.result)) line.abAgainst += 1;
        switch (pa.result) {
          case "single":
            line.tbAgainst += 1;
            break;
          case "double":
            line.tbAgainst += 2;
            break;
          case "triple":
            line.tbAgainst += 3;
            break;
          case "home_run":
            line.HR += 1;
            line.tbAgainst += 4;
            break;
          case "walk":
          case "intentional_walk":
            line.BB += 1;
            break;
          case "hbp":
            line.HBP += 1;
            break;
          case "strikeout":
            line.SO += 1;
            break;
          default:
            break;
        }
      }
      for (const run of opponent.runsScored) {
        if (!run.pitcherId) continue;
        const line = lineFor(run.pitcherId);
        line.R += 1;
        if (run.earned === true) line.ER += 1;
        if (run.earned === null) line.pendingER += 1;
      }
    }

    result[book.teamId] = [...lines.values()].map((line) => {
      const { abAgainst, tbAgainst, ...rest } = line;
      return {
        ...rest,
        ip: formatInnings(line.outs),
        ERA: earnedRunAverage(line.ER, line.outs, rules.eraInningsBase),
        WHIP: whip(line.BB, line.H, line.outs),
        OBA: round3(ratio(line.H, abAgainst)),
        OSLG: round3(ratio(tbAgainst, abAgainst)),
      };
    });
  }
  return result;
}

/** Outs realizados, asistencias y errores por jugador (defensa de cada equipo). */
export function fieldingLines(
  state: ScorebookStateInternal,
): Record<string, FieldingLine[]> {
  const result: Record<string, FieldingLine[]> = {};
  for (const book of Object.values(state.teams)) {
    const lines = new Map<string, FieldingLine>();
    const lineFor = (playerId: string): FieldingLine => {
      let line = lines.get(playerId);
      if (!line) {
        const slot = book.slots.find((s) => s.playerId === playerId);
        line = { playerId, positions: slot?.position ? [slot.position] : [], PO: 0, A: 0, E: 0 };
        lines.set(playerId, line);
      }
      return line;
    };
    for (const slot of book.slots) {
      if (slot.position) lineFor(slot.playerId);
    }
    for (const out of book.outsMade) {
      if (out.putoutPlayerId) lineFor(out.putoutPlayerId).PO += 1;
      for (const assist of out.assistPlayerIds) lineFor(assist).A += 1;
    }
    for (const error of book.errorsMade) {
      if (error.playerId) lineFor(error.playerId).E += 1;
    }
    result[book.teamId] = [...lines.values()].sort((a, b) => {
      const sa = book.slots.find((s) => s.playerId === a.playerId)?.slot ?? 99;
      const sb = book.slots.find((s) => s.playerId === b.playerId)?.slot ?? 99;
      return sa - sb;
    });
  }
  return result;
}

/** Suma de carreras de un equipo. */
export function teamRuns(state: ScorebookStateInternal, teamId: string): number {
  return state.teams[teamId]?.line.runs.reduce((sum, r) => sum + r, 0) ?? 0;
}
