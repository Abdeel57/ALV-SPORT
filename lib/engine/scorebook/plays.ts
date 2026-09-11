import {
  customOutEntry,
  findEntry,
  isAvailable,
  unavailableReason,
  type CatalogEntry,
} from "./catalog";
import { fielderAt, type ScorebookStateInternal } from "./reduce";
import type { RulesProfile } from "./rules";
import type {
  AdvanceReason,
  BaseIndex,
  LineupSlot,
  OccupiedBase,
  ScorebookState,
} from "./types";

/**
 * Constructor de jugadas: convierte lo que decidió el anotador en la lista
 * ordenada de eventos atómicos que comparten un `playId`, más el resumen
 * humano que se muestra antes de confirmar.
 *
 * Es puro: no guarda nada. Quien lo llama encola/inserta los eventos en
 * UNA transacción, o no inserta ninguno.
 */

export interface NewEvent {
  id: string;
  eventType: string;
  teamId: string | null;
  playerId: string | null;
  payload: Record<string, unknown>;
  period: number;
  correctsEventId: string | null;
}

export interface RunnerDecision {
  playerId: string;
  from: OccupiedBase;
  action: "stay" | "advance" | "score" | "out";
  /** advance: 2|3 · score: 4 · out: base donde fue puesto out (2|3|4). */
  to?: BaseIndex;
  reason?: AdvanceReason;
  fielders?: number[];
  /** Movimiento obligado por regla (el anotador no lo puede cambiar). */
  forced?: boolean;
  /** El avance/carrera se debió a un error: carrera sucia y sin impulsada. */
  onError?: boolean;
  /** Posición del fildeador que cometió el error de este corredor. */
  errorFielder?: number | null;
}

export interface PlayDraft {
  /** Clave del catálogo, o "custom" con `customKind` + `fielders`. */
  entryKey: string;
  customKind?: "ground" | "fly" | "line" | "popup" | "foul_fly";
  batterId: string;
  /** Secuencia defensiva elegida (si la entrada la permite). */
  fielders?: number[];
  /** Posición del fildeador del error (entradas con error). */
  errorFielder?: number | null;
  runners: RunnerDecision[];
  /** Impulsadas: null/undefined = usar la propuesta. */
  rbi?: number | null;
  /** Decisión limpia/sucia por corredor que anota (sobrescribe la derivación). */
  earned?: Record<string, boolean | null>;
  /** Para ponches iniciados por conteo: tirándole o cantado. */
  strikeoutKind?: "swinging" | "looking";
}

export interface BuiltPlay {
  ok: boolean;
  playId: string;
  events: NewEvent[];
  summary: string;
  proposedRbi: number;
  rbi: number;
  outsInPlay: number;
  endsHalfInning: boolean;
  errors: string[];
  warnings: string[];
}

export interface BuildOptions {
  playerNames?: Record<string, string>;
  /** Generador de ids (inyectable en pruebas). */
  newId?: () => string;
}

function defaultId(): string {
  return globalThis.crypto.randomUUID();
}

const BASE_NAMES: Record<number, string> = {
  1: "primera",
  2: "segunda",
  3: "tercera",
  4: "home",
};

export function baseName(base: BaseIndex): string {
  return BASE_NAMES[base] ?? "";
}

function name(names: Record<string, string> | undefined, id: string | null): string {
  if (!id) return "jugador";
  return names?.[id] ?? "jugador";
}

function runnersOn(state: ScorebookState): { base: OccupiedBase; playerId: string }[] {
  const list: { base: OccupiedBase; playerId: string }[] = [];
  for (const base of [3, 2, 1] as const) {
    const runner = state.bases[base];
    if (runner) list.push({ base, playerId: runner.playerId });
  }
  return list;
}

function resolveEntry(draft: PlayDraft): CatalogEntry | null {
  if (draft.entryKey === "custom") {
    if (!draft.customKind || !draft.fielders?.length) return null;
    return customOutEntry(draft.customKind, draft.fielders);
  }
  return findEntry(draft.entryKey);
}

function batterFinalBase(entry: CatalogEntry): BaseIndex {
  if (entry.batterTo !== undefined) return entry.batterTo;
  switch (entry.result) {
    case "single":
    case "walk":
    case "intentional_walk":
    case "hbp":
    case "fielders_choice":
    case "reach_on_error":
    case "interference":
      return 1;
    case "double":
      return 2;
    case "triple":
      return 3;
    case "home_run":
      return 4;
    default:
      return 0;
  }
}

function batterIsOut(entry: CatalogEntry): boolean {
  return (
    entry.result === "out" ||
    entry.result === "sac_fly" ||
    entry.result === "sac_bunt" ||
    (entry.result === "strikeout" && entry.kind !== "dropped")
  );
}

/**
 * Propuesta de resolución de corredores según la jugada. Los movimientos
 * FORZADOS por regla vienen marcados y no se editan; el resto son solo
 * sugerencias que el anotador confirma o cambia.
 */
export function proposeRunners(
  state: ScorebookState,
  entry: CatalogEntry,
): RunnerDecision[] {
  const runners = runnersOn(state);
  const decisions: RunnerDecision[] = [];
  const batterBase = batterFinalBase(entry);
  const reachesBase = batterBase >= 1 && !batterIsOut(entry);

  if (entry.runners === "forced") {
    // Cadena de forzados desde primera.
    const occupied = new Set(runners.map((r) => r.base));
    let forcedUpTo: OccupiedBase | 0 = 0;
    if (reachesBase && occupied.has(1)) {
      forcedUpTo = 1;
      if (occupied.has(2)) {
        forcedUpTo = 2;
        if (occupied.has(3)) forcedUpTo = 3;
      }
    }
    for (const runner of runners) {
      if (runner.base <= forcedUpTo) {
        const to = (runner.base + 1) as BaseIndex;
        decisions.push({
          playerId: runner.playerId,
          from: runner.base,
          action: to === 4 ? "score" : "advance",
          to,
          reason: "forced",
          forced: true,
        });
      } else {
        decisions.push({ playerId: runner.playerId, from: runner.base, action: "stay" });
      }
    }
    return decisions;
  }

  const step = entry.runners === "advance1" ? 1 : entry.runners === "advance2" ? 2 : entry.runners === "score" ? 4 : 0;
  const reason: AdvanceReason =
    entry.result === "sac_fly" || entry.result === "sac_bunt"
      ? "sacrifice"
      : entry.result === "fielders_choice"
        ? "fielders_choice"
        : entry.result === "reach_on_error"
          ? "error"
          : entry.result === "home_run"
            ? "home_run"
            : "hit";

  for (const runner of runners) {
    if (step === 0) {
      decisions.push({ playerId: runner.playerId, from: runner.base, action: "stay" });
      continue;
    }
    const target = Math.min(4, runner.base + step) as BaseIndex;
    // Elevado de sacrificio: solo el de tercera anota por propuesta.
    if (entry.result === "sac_fly" && runner.base !== 3) {
      decisions.push({ playerId: runner.playerId, from: runner.base, action: "stay" });
      continue;
    }
    decisions.push({
      playerId: runner.playerId,
      from: runner.base,
      action: target === 4 ? "score" : "advance",
      to: target,
      reason,
      onError: entry.result === "reach_on_error" ? true : undefined,
    });
  }

  // Nadie puede quedarse en la base a la que llega el bateador.
  if (reachesBase && batterBase <= 3) {
    for (const decision of decisions) {
      const landing = decision.action === "stay" ? decision.from : decision.to;
      if (landing !== undefined && landing === batterBase && decision.action !== "out") {
        const next = (batterBase + 1) as BaseIndex;
        decision.action = next === 4 ? "score" : "advance";
        decision.to = next;
        decision.reason = decision.reason ?? "forced";
      }
    }
  }
  return decisions;
}

export function proposeRbi(entry: CatalogEntry, decisions: readonly RunnerDecision[]): number {
  if (!entry.rbiEligible) return 0;
  if (entry.kind === "double_play" || entry.kind === "triple_play") return 0;
  let rbi = decisions.filter((d) => d.action === "score" && !d.onError).length;
  if (entry.result === "home_run") rbi += 1;
  if (entry.result === "reach_on_error" && entry.key !== "reach.sac_fly_dropped") rbi = 0;
  return rbi;
}

function validate(
  state: ScorebookStateInternal,
  entry: CatalogEntry,
  draft: PlayDraft,
): { errors: string[]; warnings: string[]; outsInPlay: number } {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (state.endCondition) errors.push("El partido ya terminó según las reglas; finalízalo o reábrelo.");

  const ctx = { rules: state.rules, outs: state.outs, runnersOn: runnersOn(state).map((r) => r.base) };
  if (!isAvailable(entry, ctx)) {
    errors.push(unavailableReason(entry, ctx) ?? "Esta jugada no está disponible ahora.");
  }

  const book = state.teams[state.battingTeamId];
  const slot = book?.slots.find((s) => s.playerId === draft.batterId);
  if (!slot) warnings.push("El bateador no está en la alineación vigente.");

  const fielders = draft.fielders ?? entry.fielders ?? [];
  if (entry.sequence === "required" && fielders.length === 0) {
    errors.push("Escribe la secuencia defensiva (por ejemplo 6-3).");
  }
  if (entry.needsErrorFielder && !draft.errorFielder) {
    errors.push("Indica la posición del fildeador que cometió el error.");
  }
  for (const n of fielders) {
    if (n < 1 || n > state.rules.fielders) errors.push(`La posición ${n} no existe en esta modalidad.`);
  }

  // Cada corredor en base debe tener exactamente una decisión.
  const onBase = runnersOn(state);
  const seen = new Set<string>();
  for (const runner of onBase) {
    const decision = draft.runners.find((d) => d.playerId === runner.playerId);
    if (!decision) {
      errors.push(`Falta resolver al corredor de ${baseName(runner.base)}.`);
      continue;
    }
    if (decision.from !== runner.base) {
      errors.push(`${name(undefined, runner.playerId)} está en ${baseName(runner.base)}, no en ${baseName(decision.from)}.`);
    }
    if (seen.has(runner.playerId)) errors.push("Un corredor tiene dos decisiones.");
    seen.add(runner.playerId);
  }
  for (const decision of draft.runners) {
    if (!onBase.some((r) => r.playerId === decision.playerId)) {
      errors.push("Hay una decisión para un corredor que no está en base.");
    }
    if (decision.action === "advance" && (decision.to === undefined || decision.to <= decision.from || decision.to > 3)) {
      errors.push("Un avance debe ir a una base más adelante (2ª o 3ª).");
    }
    if (decision.action === "out" && (decision.to === undefined || decision.to <= decision.from)) {
      errors.push("Un out de corredor debe indicar la base donde ocurrió.");
    }
  }

  // Bases finales únicas y sin rebasar.
  const finals: { playerId: string; from: number; landing: number }[] = [];
  for (const decision of draft.runners) {
    const landing =
      decision.action === "stay" ? decision.from : decision.action === "advance" ? (decision.to ?? decision.from) : decision.action === "score" ? 4 : -1;
    if (landing >= 1 && landing <= 3) finals.push({ playerId: decision.playerId, from: decision.from, landing });
  }
  const batterOut = batterIsOut(entry) || entry.stretchOutAt !== undefined;
  const batterBase = batterFinalBase(entry);
  const batterLanding =
    !batterOut && batterBase >= 1 && batterBase <= 3
      ? entry.errorAdvanceTo && entry.errorAdvanceTo <= 3
        ? entry.errorAdvanceTo
        : batterBase
      : -1;
  if (batterLanding >= 1) finals.push({ playerId: draft.batterId, from: 0, landing: batterLanding });
  const byLanding = new Map<number, string[]>();
  for (const f of finals) byLanding.set(f.landing, [...(byLanding.get(f.landing) ?? []), f.playerId]);
  for (const [landing, players] of byLanding) {
    if (players.length > 1) errors.push(`Dos jugadores terminarían en ${baseName(landing as BaseIndex)}.`);
  }
  for (const a of finals) {
    for (const b of finals) {
      if (a.from < b.from && a.landing > b.landing) {
        warnings.push(`${name(undefined, a.playerId)} rebasaría a un corredor que iba adelante.`);
      }
    }
  }

  const runnerOuts = draft.runners.filter((d) => d.action === "out").length;
  const outsInPlay = (batterIsOut(entry) ? 1 : 0) + (entry.stretchOutAt !== undefined ? 1 : 0) + runnerOuts;
  if (state.outs + outsInPlay > 3) {
    errors.push(`Solo quedan ${3 - state.outs} out(s) en la entrada y la jugada registra ${outsInPlay}.`);
  }
  if ((entry.kind === "double_play") && outsInPlay < 2) {
    errors.push("Un doble play necesita dos outs: marca también al corredor puesto out.");
  }
  if (entry.kind === "triple_play" && outsInPlay < 3) {
    errors.push("Un triple play necesita tres outs.");
  }

  // Carreras después del tercer out de fuerza no cuentan (aviso, no bloqueo:
  // el anotador decide con la regla 5.08).
  if (state.outs + outsInPlay >= 3 && draft.runners.some((d) => d.action === "score")) {
    warnings.push("Hay carreras en una jugada con tercer out: verifica que no sea un out de fuerza previo a la carrera.");
  }

  return { errors, warnings, outsInPlay };
}

function describe(
  entry: CatalogEntry,
  draft: PlayDraft,
  names: Record<string, string> | undefined,
  rbi: number,
): string {
  const batter = name(names, draft.batterId);
  const parts: string[] = [];
  const resultText: Record<string, string> = {
    single: `Sencillo de ${batter}`,
    double: `Doble de ${batter}`,
    triple: `Triple de ${batter}`,
    home_run: `Jonrón de ${batter}`,
    walk: `Base por bolas a ${batter}`,
    intentional_walk: `Base intencional a ${batter}`,
    hbp: `${batter} golpeado por lanzamiento`,
    strikeout: entry.kind === "looking" ? `Ponche cantado a ${batter}` : entry.kind === "foul" ? `Ponche por foul a ${batter}` : entry.kind === "dropped" ? `Tercer strike no retenido: ${batter} a primera` : `Ponche a ${batter}`,
    out: `${batter} out (${entry.code === "…" ? (draft.fielders ?? []).join("-") : entry.code})`,
    fielders_choice: `${batter} llega por elección del fildeador`,
    reach_on_error: `${batter} llega por error del ${draft.errorFielder ?? "?"}`,
    sac_fly: `Elevado de sacrificio de ${batter}`,
    sac_bunt: `Toque de sacrificio de ${batter}`,
    interference: `${batter} a primera por ${entry.kind === "obstruction" ? "obstrucción" : "interferencia"}`,
  };
  parts.push(resultText[entry.result] ?? entry.label);

  for (const decision of [...draft.runners].sort((a, b) => b.from - a.from)) {
    const runner = name(names, decision.playerId);
    if (decision.action === "score") parts.push(`${runner} anota desde ${baseName(decision.from)}${decision.onError ? " por error" : ""}`);
    else if (decision.action === "advance" && decision.to) parts.push(`${runner} avanza a ${baseName(decision.to)}${decision.onError ? " por error" : ""}`);
    else if (decision.action === "out" && decision.to) parts.push(`${runner} out en ${baseName(decision.to)}`);
  }

  if (entry.errorAdvanceTo === 4) parts.push(`${batter} anota por error`);
  else if (entry.errorAdvanceTo) parts.push(`${batter} llega a ${baseName(entry.errorAdvanceTo)} por error`);
  else if (entry.stretchOutAt) parts.push(`${batter} out en ${baseName(entry.stretchOutAt)} al estirar`);
  else {
    const base = batterFinalBase(entry);
    if (!batterIsOut(entry) && base >= 1 && base <= 3) parts.push(`${batter} queda en ${baseName(base)}`);
  }
  if (rbi > 0) parts.push(`${rbi} impulsada${rbi === 1 ? "" : "s"}`);
  return parts.join("; ");
}

/** Construye la jugada completa del bateador. */
export function buildPlay(
  state: ScorebookStateInternal,
  draft: PlayDraft,
  options: BuildOptions = {},
): BuiltPlay {
  const newId = options.newId ?? defaultId;
  const entry = resolveEntry(draft);
  const playId = newId();
  if (!entry) {
    return {
      ok: false,
      playId,
      events: [],
      summary: "",
      proposedRbi: 0,
      rbi: 0,
      outsInPlay: 0,
      endsHalfInning: false,
      errors: ["Jugada desconocida."],
      warnings: [],
    };
  }
  const { errors, warnings, outsInPlay } = validate(state, entry, draft);
  const proposedRbi = proposeRbi(entry, draft.runners);
  const rbi = draft.rbi ?? proposedRbi;
  const summary = describe(entry, draft, options.playerNames, rbi);
  const endsHalfInning = state.outs + outsInPlay >= 3;

  if (errors.length > 0) {
    return { ok: false, playId, events: [], summary, proposedRbi, rbi, outsInPlay, endsHalfInning, errors, warnings };
  }

  const battingTeam = state.battingTeamId;
  const fieldingTeam = state.fieldingTeamId;
  const period = state.inning;
  const fielders = draft.fielders ?? entry.fielders ?? [];
  const events: NewEvent[] = [];
  const push = (
    eventType: string,
    teamId: string | null,
    playerId: string | null,
    payload: Record<string, unknown>,
  ): void => {
    events.push({
      id: newId(),
      eventType,
      teamId,
      playerId,
      payload: { playId, ...payload },
      period,
      correctsEventId: null,
    });
  };
  const fielderPlayer = (position: number | null | undefined): string | null => {
    if (!position) return null;
    const code = ["", "P", "C", "1B", "2B", "3B", "SS", "LF", "CF", "RF", "SF"][position];
    return code ? (fielderAt(state, code)?.playerId ?? null) : null;
  };

  // 1. Errores de la defensa (van primero: condicionan carreras sucias).
  if (entry.needsErrorFielder && draft.errorFielder) {
    push("error", fieldingTeam, fielderPlayer(draft.errorFielder), {
      position: draft.errorFielder,
      kind: "fielding",
    });
  }
  for (const decision of draft.runners) {
    if (decision.onError && decision.errorFielder) {
      push("error", fieldingTeam, fielderPlayer(decision.errorFielder), {
        position: decision.errorFielder,
        kind: "fielding",
      });
    }
  }

  // 2. Corredores, del más adelantado al más atrasado (liberan la base).
  for (const decision of [...draft.runners].sort((a, b) => b.from - a.from)) {
    const reason = decision.reason ?? (decision.onError ? "error" : "batted_ball");
    if (decision.action === "advance" && decision.to) {
      push("runner_advance", battingTeam, decision.playerId, {
        from: decision.from,
        to: decision.to,
        reason,
      });
    } else if (decision.action === "score") {
      const earnedOverride = draft.earned?.[decision.playerId];
      push("run", battingTeam, decision.playerId, {
        from: decision.from,
        reason,
        ...(earnedOverride !== undefined
          ? { earned: earnedOverride }
          : decision.onError
            ? { earned: false }
            : {}),
      });
    } else if (decision.action === "out" && decision.to) {
      push("runner_out", battingTeam, decision.playerId, {
        from: decision.from,
        to: decision.to,
        reason: decision.reason ?? "tag",
        fielders: decision.fielders ?? [],
      });
    }
  }

  // 3. Resultado del bateador.
  const resultPayload: Record<string, unknown> = {};
  if (entry.kind) resultPayload.kind = entry.kind;
  if (fielders.length > 0) resultPayload.fielders = fielders;
  // La celda muestra E6 (posición del error) aunque el error sea un evento aparte.
  if (entry.result === "reach_on_error" && fielders.length === 0 && draft.errorFielder) resultPayload.fielders = [draft.errorFielder];
  if (entry.batterTo !== undefined && !batterIsOut(entry)) resultPayload.to = entry.batterTo;
  if (entry.result === "strikeout" && draft.strikeoutKind && !entry.kind) resultPayload.kind = draft.strikeoutKind;
  push(entry.result, battingTeam, draft.batterId, resultPayload);

  if (entry.result === "home_run") {
    const earnedOverride = draft.earned?.[draft.batterId];
    push("run", battingTeam, draft.batterId, {
      from: 0,
      reason: "home_run",
      ...(earnedOverride !== undefined ? { earned: earnedOverride } : {}),
    });
  }
  if (entry.errorAdvanceTo) {
    const from = batterFinalBase(entry) as OccupiedBase;
    if (entry.errorAdvanceTo === 4) {
      push("run", battingTeam, draft.batterId, { from, reason: "error", earned: false });
    } else {
      push("runner_advance", battingTeam, draft.batterId, {
        from,
        to: entry.errorAdvanceTo,
        reason: "error",
      });
    }
  }
  if (entry.stretchOutAt) {
    push("runner_out", battingTeam, draft.batterId, {
      from: batterFinalBase(entry),
      to: entry.stretchOutAt,
      reason: "tag",
      fielders,
    });
  }

  // 4. Impulsadas.
  for (let i = 0; i < rbi; i += 1) push("rbi", battingTeam, draft.batterId, {});

  return { ok: true, playId, events, summary, proposedRbi, rbi, outsInPlay, endsHalfInning, errors, warnings };
}

export interface PitchResult extends BuiltPlay {
  /** true si el lanzamiento cerró la aparición (base por bolas o ponche). */
  completesAppearance: boolean;
}

/**
 * Registra un lanzamiento. Si completa la cuenta, construye además la base
 * por bolas o el ponche en la MISMA jugada (deshacerla deshace ambos).
 */
export function buildPitch(
  state: ScorebookStateInternal,
  kind: "ball" | "strike" | "foul",
  batterId: string,
  options: BuildOptions & { strikeoutKind?: "swinging" | "looking" } = {},
): PitchResult {
  const newId = options.newId ?? defaultId;
  const rules: RulesProfile = state.rules;
  const eventType = kind === "ball" ? "pitch_ball" : kind === "strike" ? "pitch_strike" : "pitch_foul";
  const label = kind === "ball" ? "Bola" : kind === "strike" ? "Strike" : "Foul";

  const completesWalk = kind === "ball" && state.balls + 1 >= rules.ballsForWalk;
  const completesK =
    (kind === "strike" && state.strikes + 1 >= rules.strikesForOut) ||
    (kind === "foul" && state.strikes >= rules.strikesForOut - 1 && rules.foulOnThirdStrike === "out");

  if (!completesWalk && !completesK) {
    const playId = newId();
    return {
      ok: !state.endCondition,
      playId,
      completesAppearance: false,
      events: [
        {
          id: newId(),
          eventType,
          teamId: state.battingTeamId,
          playerId: batterId,
          payload: { playId },
          period: state.inning,
          correctsEventId: null,
        },
      ],
      summary: `${label} a ${name(options.playerNames, batterId)} (${state.balls + (kind === "ball" ? 1 : 0)}-${
        state.strikes + (kind !== "ball" && state.strikes < rules.strikesForOut - 1 ? 1 : 0)
      })`,
      proposedRbi: 0,
      rbi: 0,
      outsInPlay: 0,
      endsHalfInning: false,
      errors: state.endCondition ? ["El partido ya terminó."] : [],
      warnings: [],
    };
  }

  const entry = completesWalk
    ? findEntry("reach.walk")!
    : kind === "foul"
      ? findEntry("out.strikeout.foul")!
      : findEntry(options.strikeoutKind === "looking" ? "out.strikeout.looking" : "out.strikeout.swinging")!;
  const draft: PlayDraft = {
    entryKey: entry.key,
    batterId,
    runners: proposeRunners(state, entry),
  };
  const built = buildPlay(state, draft, options);
  // El lanzamiento que completa la cuenta pertenece a la misma jugada.
  const pitchEvent: NewEvent = {
    id: newId(),
    eventType,
    teamId: state.battingTeamId,
    playerId: batterId,
    payload: { playId: built.playId },
    period: state.inning,
    correctsEventId: null,
  };
  return {
    ...built,
    events: built.ok ? [pitchEvent, ...built.events] : [],
    completesAppearance: true,
  };
}

/** Anula una jugada completa: una corrección por cada evento efectivo. */
export function buildCorrection(
  state: ScorebookStateInternal,
  playId: string,
  options: BuildOptions = {},
): BuiltPlay {
  const newId = options.newId ?? defaultId;
  const targets = state.effective.filter(
    (event) => (typeof event.payload.playId === "string" ? event.payload.playId : event.id) === playId,
  );
  const correctionPlayId = newId();
  if (targets.length === 0) {
    return {
      ok: false,
      playId: correctionPlayId,
      events: [],
      summary: "",
      proposedRbi: 0,
      rbi: 0,
      outsInPlay: 0,
      endsHalfInning: false,
      errors: ["La jugada ya no está vigente."],
      warnings: [],
    };
  }
  const summary = state.plays.find((p) => p.playId === playId)?.text ?? "jugada";
  return {
    ok: true,
    playId: correctionPlayId,
    events: targets.map((target) => ({
      id: newId(),
      eventType: "correction",
      teamId: target.teamId,
      playerId: null,
      payload: { playId: correctionPlayId, correctsPlayId: playId },
      period: target.period ?? state.inning,
      correctsEventId: target.id,
    })),
    summary: `Se anula: ${summary}`,
    proposedRbi: 0,
    rbi: 0,
    outsInPlay: 0,
    endsHalfInning: false,
    errors: [],
    warnings: [],
  };
}

export interface SubstitutionDraft {
  teamId: string;
  slot: number;
  inPlayerId: string;
  outPlayerId: string | null;
  position: string | null;
  role: LineupSlot["role"];
}

export function buildSubstitution(
  state: ScorebookStateInternal,
  draft: SubstitutionDraft,
  options: BuildOptions = {},
): BuiltPlay {
  const newId = options.newId ?? defaultId;
  const playId = newId();
  const errors: string[] = [];
  const book = state.teams[draft.teamId];
  if (!book) errors.push("Equipo desconocido.");
  if (book?.slots.some((s) => s.playerId === draft.inPlayerId)) {
    errors.push("Ese jugador ya está en la alineación.");
  }
  if (draft.position && book?.slots.some((s) => s.position === draft.position && s.playerId !== draft.outPlayerId)) {
    errors.push(`La posición ${draft.position} ya está ocupada; cambia primero a quien la ocupa.`);
  }
  if (!state.rules.reentryAllowed && book?.substitutions.some((s) => s.outPlayerId === draft.inPlayerId)) {
    errors.push("El reingreso no está permitido en esta modalidad.");
  }
  const names = options.playerNames;
  const summary = `${name(names, draft.inPlayerId)} entra${draft.outPlayerId ? ` por ${name(names, draft.outPlayerId)}` : ""}${
    draft.position ? ` como ${draft.position}` : ""
  } (puesto ${draft.slot})`;
  if (errors.length > 0) {
    return { ok: false, playId, events: [], summary, proposedRbi: 0, rbi: 0, outsInPlay: 0, endsHalfInning: false, errors, warnings: [] };
  }
  return {
    ok: true,
    playId,
    events: [
      {
        id: newId(),
        eventType: "substitution",
        teamId: draft.teamId,
        playerId: draft.inPlayerId,
        payload: {
          playId,
          slot: draft.slot,
          inPlayerId: draft.inPlayerId,
          outPlayerId: draft.outPlayerId,
          position: draft.position,
          role: draft.role,
        },
        period: state.inning,
        correctsEventId: null,
      },
    ],
    summary,
    proposedRbi: 0,
    rbi: 0,
    outsInPlay: 0,
    endsHalfInning: false,
    errors: [],
    warnings: [],
  };
}

export function buildDefensiveChange(
  state: ScorebookStateInternal,
  teamId: string,
  changes: { playerId: string; position: string | null }[],
  options: BuildOptions = {},
): BuiltPlay {
  const newId = options.newId ?? defaultId;
  const playId = newId();
  const errors: string[] = [];
  const positions = changes.map((c) => c.position).filter((p): p is string => p !== null);
  if (new Set(positions).size !== positions.length) errors.push("Dos jugadores no pueden ocupar la misma posición.");
  const names = options.playerNames;
  const summary = changes
    .map((c) => `${name(names, c.playerId)} pasa a ${c.position ?? "banca"}`)
    .join("; ");
  if (errors.length > 0) {
    return { ok: false, playId, events: [], summary, proposedRbi: 0, rbi: 0, outsInPlay: 0, endsHalfInning: false, errors, warnings: [] };
  }
  return {
    ok: true,
    playId,
    events: [
      {
        id: newId(),
        eventType: "defensive_change",
        teamId,
        playerId: changes[0]?.playerId ?? null,
        payload: { playId, changes },
        period: state.inning,
        correctsEventId: null,
      },
    ],
    summary,
    proposedRbi: 0,
    rbi: 0,
    outsInPlay: 0,
    endsHalfInning: false,
    errors: [],
    warnings: [],
  };
}

export function buildHalfInningEnd(
  state: ScorebookStateInternal,
  reason: "run_limit" | "time" | "manual",
  options: BuildOptions = {},
): BuiltPlay {
  const newId = options.newId ?? defaultId;
  const playId = newId();
  return {
    ok: true,
    playId,
    events: [
      {
        id: newId(),
        eventType: "half_inning_end",
        teamId: state.battingTeamId,
        playerId: null,
        payload: { playId, reason },
        period: state.inning,
        correctsEventId: null,
      },
    ],
    summary: reason === "run_limit" ? "Fin de entrada por tope de carreras" : reason === "time" ? "Fin de entrada por tiempo" : "Fin de entrada",
    proposedRbi: 0,
    rbi: 0,
    outsInPlay: 0,
    endsHalfInning: true,
    errors: [],
    warnings: [],
  };
}

export type RunnerMoveReason =
  | "stolen_base"
  | "caught_stealing"
  | "wild_pitch"
  | "passed_ball"
  | "balk"
  | "pickoff"
  | "defensive_indifference"
  | "error"
  | "manual";

export interface RunnerMovesDraft {
  reason: RunnerMoveReason;
  decisions: RunnerDecision[];
  /** Posición del fildeador que cometió el error (reason = error). */
  errorFielder?: number | null;
}

const RUNNER_MOVE_LABELS: Record<RunnerMoveReason, string> = {
  stolen_base: "Robo de base",
  caught_stealing: "Out robando",
  wild_pitch: "Lanzamiento descontrolado",
  passed_ball: "Passed ball",
  balk: "Balk",
  pickoff: "Pickoff",
  defensive_indifference: "Indiferencia defensiva",
  error: "Avance por error",
  manual: "Movimiento de corredores",
};

/**
 * Movimientos de corredores SIN resultado del bateador (robo, wild pitch,
 * passed ball, pickoff, avance por error…). No cambian al bateador.
 */
export function buildRunnerMoves(
  state: ScorebookStateInternal,
  draft: RunnerMovesDraft,
  options: BuildOptions = {},
): BuiltPlay {
  const newId = options.newId ?? defaultId;
  const playId = newId();
  const names = options.playerNames;
  const errors: string[] = [];
  const warnings: string[] = [];

  if (state.endCondition) errors.push("El partido ya terminó según las reglas.");
  const onBase = runnersOn(state);
  if (onBase.length === 0) errors.push("No hay corredores en base.");
  const active = draft.decisions.filter((d) => d.action !== "stay");
  if (active.length === 0) errors.push("Elige al menos un movimiento.");
  if (
    (draft.reason === "stolen_base" || draft.reason === "caught_stealing") &&
    !state.rules.stealingAllowed
  ) {
    errors.push("El robo no está permitido en esta modalidad.");
  }
  if (draft.reason === "error" && !draft.errorFielder) {
    errors.push("Indica la posición del fildeador que cometió el error.");
  }
  const seen = new Set<string>();
  for (const decision of draft.decisions) {
    const runner = onBase.find((r) => r.playerId === decision.playerId);
    if (!runner) errors.push("Hay una decisión para un corredor que no está en base.");
    else if (runner.base !== decision.from) errors.push(`${name(names, decision.playerId)} no está en ${baseName(decision.from)}.`);
    if (seen.has(decision.playerId)) errors.push("Un corredor tiene dos decisiones.");
    seen.add(decision.playerId);
    if (decision.action === "advance" && (decision.to === undefined || decision.to <= decision.from || decision.to > 3)) {
      errors.push("Un avance debe ir a una base más adelante.");
    }
    if (decision.action === "out" && (decision.to === undefined || decision.to <= decision.from)) {
      errors.push("Un out de corredor debe indicar la base.");
    }
  }
  // Bases finales únicas (incluyendo a quienes se quedan sin decisión).
  const landings = new Map<number, string>();
  for (const runner of onBase) {
    const decision = draft.decisions.find((d) => d.playerId === runner.playerId);
    const landing =
      !decision || decision.action === "stay" ? runner.base : decision.action === "advance" ? decision.to ?? runner.base : -1;
    if (landing >= 1 && landing <= 3) {
      if (landings.has(landing)) errors.push(`Dos corredores terminarían en ${baseName(landing as BaseIndex)}.`);
      landings.set(landing, runner.playerId);
    }
  }
  const outs = draft.decisions.filter((d) => d.action === "out").length;
  if (state.outs + outs > 3) errors.push(`Solo quedan ${3 - state.outs} out(s) en la entrada.`);

  const parts: string[] = [RUNNER_MOVE_LABELS[draft.reason]];
  for (const decision of [...draft.decisions].sort((a, b) => b.from - a.from)) {
    const runner = name(names, decision.playerId);
    if (decision.action === "advance" && decision.to) parts.push(`${runner} avanza a ${baseName(decision.to)}`);
    else if (decision.action === "score") parts.push(`${runner} anota desde ${baseName(decision.from)}`);
    else if (decision.action === "out" && decision.to) parts.push(`${runner} out en ${baseName(decision.to)}`);
  }
  const summary = parts.join("; ");
  const endsHalfInning = state.outs + outs >= 3;
  if (errors.length > 0) {
    return { ok: false, playId, events: [], summary, proposedRbi: 0, rbi: 0, outsInPlay: outs, endsHalfInning, errors, warnings };
  }

  const battingTeam = state.battingTeamId;
  const fieldingTeam = state.fieldingTeamId;
  const events: NewEvent[] = [];
  const push = (eventType: string, teamId: string | null, playerId: string | null, payload: Record<string, unknown>): void => {
    events.push({ id: newId(), eventType, teamId, playerId, payload: { playId, ...payload }, period: state.inning, correctsEventId: null });
  };
  const pitcher = state.teams[fieldingTeam]?.currentPitcherId ?? null;
  const catcher = fielderAt(state, "C")?.playerId ?? null;
  const fielderPlayer = (position: number | null | undefined): string | null => {
    if (!position) return null;
    const code = ["", "P", "C", "1B", "2B", "3B", "SS", "LF", "CF", "RF", "SF"][position];
    return code ? (fielderAt(state, code)?.playerId ?? null) : null;
  };

  if (draft.reason === "wild_pitch") push("wild_pitch", fieldingTeam, pitcher, {});
  if (draft.reason === "passed_ball") push("passed_ball", fieldingTeam, catcher, {});
  if (draft.reason === "balk") push("balk", fieldingTeam, pitcher, {});
  if (draft.reason === "error" && draft.errorFielder) {
    push("error", fieldingTeam, fielderPlayer(draft.errorFielder), { position: draft.errorFielder, kind: "fielding" });
  }

  const unearnedReason = draft.reason === "error" || draft.reason === "passed_ball";
  for (const decision of [...draft.decisions].sort((a, b) => b.from - a.from)) {
    if (decision.action === "advance" && decision.to) {
      if (draft.reason === "stolen_base") {
        push("stolen_base", battingTeam, decision.playerId, { from: decision.from, to: decision.to, reason: "stolen_base" });
      } else {
        push("runner_advance", battingTeam, decision.playerId, { from: decision.from, to: decision.to, reason: draft.reason });
      }
    } else if (decision.action === "score") {
      push("run", battingTeam, decision.playerId, {
        from: decision.from,
        reason: draft.reason === "stolen_base" ? "stolen_base" : draft.reason,
        ...(unearnedReason ? { earned: false } : {}),
      });
    } else if (decision.action === "out" && decision.to) {
      const type = draft.reason === "caught_stealing" || draft.reason === "stolen_base" ? "caught_stealing" : draft.reason === "pickoff" ? "pickoff" : "runner_out";
      push(type, battingTeam, decision.playerId, {
        from: decision.from,
        to: decision.to,
        reason: draft.reason === "pickoff" ? "pickoff" : "tag",
        fielders: decision.fielders ?? [],
      });
    }
  }

  return { ok: true, playId, events, summary, proposedRbi: 0, rbi: 0, outsInPlay: outs, endsHalfInning, errors, warnings };
}
