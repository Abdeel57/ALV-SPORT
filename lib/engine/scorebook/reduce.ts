import { effectiveEvents } from "../corrections";
import type { EngineGameEvent } from "../types";
import { positionByNumber } from "./positions";
import type { RulesProfile } from "./rules";
import type {
  AdvanceReason,
  BaseIndex,
  Bases,
  Half,
  InitialLineup,
  LineupSlot,
  OccupiedBase,
  PAResultKind,
  PlateAppearance,
  PlaySummary,
  ReachKind,
  RunnerState,
  ScorebookIssue,
  ScorebookState,
  TeamBook,
} from "./types";

/**
 * Pliegue de eventos → libreta.
 *
 * CONTRATO DE PAYLOAD (lo que emite el constructor de jugadas y lee esto):
 *  - Todo evento de una jugada lleva `payload.playId`. Sin él (eventos
 *    antiguos), el evento es su propia jugada.
 *  - Resultados del bateador (single, double, triple, home_run, walk,
 *    intentional_walk, hbp, strikeout, out, fielders_choice, reach_on_error,
 *    sac_fly, sac_bunt, interference): playerId = bateador, teamId = equipo
 *    al bate. `payload.kind` (subtipo), `payload.fielders` (números de
 *    posición en orden), `payload.to` (base alcanzada si no es la obvia).
 *  - Corredores (runner_advance, runner_out, stolen_base, caught_stealing,
 *    pickoff): playerId = corredor; `payload.from`, `payload.to`,
 *    `payload.reason`, `payload.fielders`.
 *  - run: playerId = corredor que anota; `payload.earned` (true/false/null),
 *    `payload.pitcherId` (opcional, sobrescribe al responsable derivado).
 *  - rbi: playerId = bateador acreditado.
 *  - error: playerId = fildeador; teamId = equipo que DEFIENDE;
 *    `payload.position` (número).
 *  - Pitcheo/receptor: wild_pitch, passed_ball, balk (solo estadística).
 *  - Alineación: substitution { slot, inPlayerId, outPlayerId, position,
 *    role }, defensive_change { playerId, position } o { changes: [...] }.
 *  - Flujo: half_inning_end { reason }.
 *
 * El motor NUNCA inventa avances ni carreras: solo pliega lo que se anotó.
 * Lo incoherente se reporta en `issues`, no se "repara".
 */

const RESULT_TYPES = new Set<PAResultKind>([
  "single",
  "double",
  "triple",
  "home_run",
  "walk",
  "intentional_walk",
  "hbp",
  "strikeout",
  "out",
  "fielders_choice",
  "reach_on_error",
  "sac_fly",
  "sac_bunt",
  "interference",
]);

/** Resultados que valen turno oficial (AB). */
export const AT_BAT_RESULTS = new Set<PAResultKind>([
  "single",
  "double",
  "triple",
  "home_run",
  "strikeout",
  "out",
  "fielders_choice",
  "reach_on_error",
]);

export const HIT_RESULTS = new Set<PAResultKind>(["single", "double", "triple", "home_run"]);

interface RunRecord {
  playerId: string;
  inning: number;
  half: Half;
  playId: string;
  paId: string | null;
  earned: boolean | null;
  /** Pitcher responsable (del equipo que defendía). */
  pitcherId: string | null;
}

interface OutRecord {
  playId: string;
  inning: number;
  half: Half;
  pitcherId: string | null;
  fielders: number[];
  /** Ids resueltos a partir de la defensa vigente en ese momento. */
  putoutPlayerId: string | null;
  assistPlayerIds: string[];
  kind: string;
}

interface ErrorRecord {
  playerId: string;
  position: number | null;
  inning: number;
  half: Half;
  playId: string;
}

/** Ampliación interna del libro de equipo con registros para estadísticas. */
export interface TeamBookInternal extends TeamBook {
  runsScored: RunRecord[];
  /** Outs hechos por la DEFENSA de este equipo. */
  outsMade: OutRecord[];
  /** Errores cometidos por la DEFENSA de este equipo. */
  errorsMade: ErrorRecord[];
  /** Bateadores enfrentados por cada pitcher de este equipo (playId → pitcher). */
  battersFaced: { pitcherId: string; paId: string }[];
}

export interface ScorebookStateInternal extends ScorebookState {
  teams: Record<string, TeamBookInternal>;
}

export interface ReduceInput {
  events: readonly EngineGameEvent[];
  rules: RulesProfile;
  homeTeamId: string;
  awayTeamId: string;
  lineups: readonly InitialLineup[];
  /** Nombres para los resúmenes humanos (opcional). */
  playerNames?: Record<string, string>;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function base(value: unknown): BaseIndex | null {
  const n = num(value);
  return n === 0 || n === 1 || n === 2 || n === 3 || n === 4 ? n : null;
}

function fielderList(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is number => typeof v === "number" && v >= 1 && v <= 10);
}

function createTeamBook(teamId: string, lineup: InitialLineup | undefined): TeamBookInternal {
  const slots: LineupSlot[] = (lineup?.slots ?? [])
    .slice()
    .sort((a, b) => a.slot - b.slot)
    .map((slot) => ({
      slot: slot.slot,
      playerId: slot.playerId,
      position: slot.position,
      role: slot.role,
      enteredByEventId: null,
    }));
  const pitcher = slots.find((slot) => slot.position === "P")?.playerId ?? null;
  return {
    teamId,
    slots,
    substitutions: [],
    nextSlotIndex: 0,
    plateAppearances: [],
    line: { runs: [], hits: 0, errors: 0, leftOnBase: 0 },
    currentPitcherId: pitcher,
    runsScored: [],
    outsMade: [],
    errorsMade: [],
    battersFaced: [],
  };
}

function emptyBases(): Bases {
  return { 1: null, 2: null, 3: null };
}

/**
 * Pliega los eventos de un partido en el estado de la libreta.
 * Función pura y determinista: mismos eventos → misma libreta.
 */
export function reduceScorebook(input: ReduceInput): ScorebookStateInternal {
  const { rules, homeTeamId, awayTeamId } = input;
  const names = input.playerNames ?? {};
  const nameOf = (id: string | null | undefined): string =>
    id ? (names[id] ?? "jugador") : "jugador";

  const teams: Record<string, TeamBookInternal> = {
    [awayTeamId]: createTeamBook(awayTeamId, input.lineups.find((l) => l.teamId === awayTeamId)),
    [homeTeamId]: createTeamBook(homeTeamId, input.lineups.find((l) => l.teamId === homeTeamId)),
  };

  const state: ScorebookStateInternal = {
    rules,
    homeTeamId,
    awayTeamId,
    inning: 1,
    half: "top",
    outs: 0,
    balls: rules.initialBalls,
    strikes: rules.initialStrikes,
    bases: emptyBases(),
    teams,
    battingTeamId: awayTeamId,
    fieldingTeamId: homeTeamId,
    currentPA: null,
    plays: [],
    issues: [],
    endCondition: null,
    lastSeq: 0,
    effective: [],
  };

  const issues = state.issues;
  const issue = (
    severity: ScorebookIssue["severity"],
    message: string,
    event?: EngineGameEvent,
    playId?: string,
  ): void => {
    issues.push({
      severity,
      eventId: event?.id ?? null,
      playId: playId ?? (event ? playIdOf(event) : null),
      message,
    });
  };

  const playIdOf = (event: EngineGameEvent): string => str(event.payload.playId) ?? event.id;
  const isLegacy = (event: EngineGameEvent): boolean => str(event.payload.playId) === null;

  const batting = (): TeamBookInternal => teams[state.battingTeamId]!;
  const fielding = (): TeamBookInternal => teams[state.fieldingTeamId]!;

  let errorInHalf = false;
  const playIndex = new Map<string, PlaySummary>();
  const playParts = new Map<string, string[]>();

  const touchPlay = (event: EngineGameEvent, teamId: string): PlaySummary => {
    const id = playIdOf(event);
    let summary = playIndex.get(id);
    if (!summary) {
      summary = {
        playId: id,
        seq: event.seq,
        inning: state.inning,
        half: state.half,
        teamId,
        text: "",
        eventIds: [],
        partiallyVoided: false,
      };
      playIndex.set(id, summary);
      state.plays.push(summary);
      playParts.set(id, []);
    }
    summary.eventIds.push(event.id);
    return summary;
  };
  const describe = (event: EngineGameEvent, text: string): void => {
    playParts.get(playIdOf(event))?.push(text);
  };

  const resetCount = (): void => {
    state.balls = rules.initialBalls;
    state.strikes = rules.initialStrikes;
  };

  const runsThisHalf = (): number =>
    batting().line.runs[state.inning - 1] ?? 0;

  const totalRuns = (teamId: string): number =>
    teams[teamId]!.line.runs.reduce((sum, r) => sum + r, 0);

  const ensureLineScore = (book: TeamBookInternal, inning: number): void => {
    while (book.line.runs.length < inning) book.line.runs.push(0);
  };

  /** Resuelve números de posición a jugadores de la defensa vigente. */
  const resolveFielders = (fielders: number[]): { putout: string | null; assists: string[] } => {
    const defense = fielding().slots;
    const byNumber = (n: number): string | null => {
      const code = positionByNumber(n)?.code ?? null;
      if (!code) return null;
      return defense.find((slot) => slot.position === code)?.playerId ?? null;
    };
    if (fielders.length === 0) return { putout: null, assists: [] };
    const putout = byNumber(fielders[fielders.length - 1]!);
    const assists = fielders
      .slice(0, -1)
      .map(byNumber)
      .filter((id): id is string => id !== null);
    return { putout, assists };
  };

  const recordOut = (event: EngineGameEvent, fielders: number[], kind: string): void => {
    const resolved = resolveFielders(fielders);
    fielding().outsMade.push({
      playId: playIdOf(event),
      inning: state.inning,
      half: state.half,
      pitcherId: fielding().currentPitcherId,
      fielders,
      putoutPlayerId: resolved.putout,
      assistPlayerIds: resolved.assists,
      kind,
    });
  };

  const openPA = (event: EngineGameEvent, batterId: string): PlateAppearance => {
    const book = batting();
    const slotIndex = book.slots.findIndex((slot) => slot.playerId === batterId);
    const expectedIndex = book.slots.length > 0 ? book.nextSlotIndex % book.slots.length : 0;
    if (slotIndex === -1) {
      issue("warning", `${nameOf(batterId)} bateó sin estar en la alineación`, event);
    } else if (slotIndex !== expectedIndex && book.slots.length > 0) {
      issue(
        "warning",
        `${nameOf(batterId)} bateó fuera de orden (tocaba ${nameOf(book.slots[expectedIndex]?.playerId)})`,
        event,
      );
    }
    const inningPAs = book.plateAppearances.filter(
      (pa) => pa.inning === state.inning && pa.batterId === batterId,
    );
    const pa: PlateAppearance = {
      id: playIdOf(event),
      teamId: state.battingTeamId,
      batterId,
      slot: slotIndex === -1 ? 0 : book.slots[slotIndex]!.slot,
      inning: state.inning,
      half: state.half,
      indexInInning: inningPAs.length + 1,
      result: null,
      code: "",
      detail: null,
      fielders: [],
      path: [],
      finalBase: 0,
      scored: false,
      outNumber: null,
      batterOut: false,
      rbi: 0,
      earnedRun: null,
      pitches: [],
      pitcherId: fielding().currentPitcherId,
      eventIds: [],
      interrupted: false,
    };
    state.currentPA = pa;
    return pa;
  };

  const currentOrOpenPA = (event: EngineGameEvent, batterId: string): PlateAppearance => {
    const current = state.currentPA;
    if (current && current.batterId === batterId && current.result === null) return current;
    if (current && current.result === null) {
      // Cambió el bateador sin cerrar la aparición anterior (p. ej. emergente).
      issue(
        "warning",
        `Aparición de ${nameOf(current.batterId)} quedó sin resultado`,
        event,
      );
    }
    return openPA(event, batterId);
  };

  const closePA = (event: EngineGameEvent, pa: PlateAppearance, result: PAResultKind): void => {
    const book = batting();
    pa.result = result;
    pa.id = playIdOf(event);
    pa.eventIds.push(event.id);
    book.plateAppearances.push(pa);
    fielding().battersFaced.push({ pitcherId: pa.pitcherId ?? "", paId: pa.id });
    // El siguiente bateador es quien sigue al que ACABA de batear.
    const slotIndex = book.slots.findIndex((slot) => slot.playerId === pa.batterId);
    if (slotIndex !== -1 && book.slots.length > 0) {
      book.nextSlotIndex = (slotIndex + 1) % book.slots.length;
    }
    state.currentPA = null;
    resetCount();
  };

  const findRunner = (playerId: string): { base: OccupiedBase; runner: RunnerState } | null => {
    for (const b of [1, 2, 3] as const) {
      const runner = state.bases[b];
      if (runner && runner.playerId === playerId) return { base: b, runner };
    }
    return null;
  };

  const ownerPA = (paId: string): PlateAppearance | null => {
    if (state.currentPA?.id === paId) return state.currentPA;
    for (const book of Object.values(teams)) {
      const pa = book.plateAppearances.find((item) => item.id === paId);
      if (pa) return pa;
    }
    return null;
  };

  const placeRunner = (
    event: EngineGameEvent,
    runner: RunnerState,
    to: OccupiedBase,
  ): void => {
    const occupant = state.bases[to];
    if (occupant && occupant.playerId !== runner.playerId) {
      issue(
        "error",
        `${nameOf(runner.playerId)} llega a ${to}ª pero ${nameOf(occupant.playerId)} sigue ahí`,
        event,
      );
    }
    state.bases[to] = { ...runner, base: to };
  };

  const batterReaches = (
    event: EngineGameEvent,
    pa: PlateAppearance,
    to: BaseIndex,
    reachedBy: ReachKind,
    reason: AdvanceReason,
  ): void => {
    pa.finalBase = to;
    pa.path.push({ from: 0, to, reason, playId: playIdOf(event), out: false, fielders: [] });
    if (to === 1 || to === 2 || to === 3) {
      placeRunner(event, {
        playerId: pa.batterId,
        base: to,
        paId: pa.id,
        reachedBy,
        pitcherId: fielding().currentPitcherId,
        errorBeforeReach: errorInHalf,
      }, to);
    }
  };

  const addOut = (event: EngineGameEvent, pa: PlateAppearance | null, fielders: number[], kind: string): number => {
    state.outs += 1;
    recordOut(event, fielders, kind);
    if (pa) pa.outNumber = state.outs;
    return state.outs;
  };

  const endHalf = (event: EngineGameEvent | null, reason: string): void => {
    const book = batting();
    book.line.leftOnBase += [1, 2, 3].filter((b) => state.bases[b as OccupiedBase]).length;
    if (state.currentPA && state.currentPA.result === null) {
      // Tercer out en las bases con turno inconcluso: el bateador abre la
      // siguiente entrada de su equipo; la aparición no cuenta.
      state.currentPA.interrupted = true;
      state.currentPA = null;
    }
    state.bases = emptyBases();
    state.outs = 0;
    resetCount();
    errorInHalf = false;

    const endedInning = state.inning;
    const endedHalf = state.half;
    if (state.half === "top") {
      state.half = "bottom";
    } else {
      state.half = "top";
      state.inning += 1;
    }
    [state.battingTeamId, state.fieldingTeamId] = [state.fieldingTeamId, state.battingTeamId];
    ensureLineScore(batting(), state.inning);

    evaluateEnd(endedInning, endedHalf, reason);
    void event;
  };

  const evaluateEnd = (endedInning: number, endedHalf: Half, reason: string): void => {
    if (state.endCondition) return;
    const home = totalRuns(homeTeamId);
    const away = totalRuns(awayTeamId);
    const regulation = rules.innings;

    if (rules.mercyRule && endedInning >= rules.mercyRule.afterInning) {
      const diff = Math.abs(home - away);
      const homeAheadAfterTop = endedHalf === "top" && home > away;
      const halfComplete = endedHalf === "bottom" || homeAheadAfterTop;
      if (halfComplete && diff >= rules.mercyRule.runDifference) {
        state.endCondition = { reason: "mercy", inning: endedInning, half: endedHalf };
        return;
      }
    }
    if (endedInning >= regulation) {
      if (endedHalf === "top" && home > away) {
        state.endCondition = { reason: "regulation", inning: endedInning, half: endedHalf };
        return;
      }
      if (endedHalf === "bottom") {
        if (home !== away) {
          state.endCondition = { reason: "regulation", inning: endedInning, half: endedHalf };
          return;
        }
        if (!rules.extraInnings) {
          state.endCondition = { reason: "regulation", inning: endedInning, half: endedHalf };
          return;
        }
      }
    }
    if (reason === "manual" || reason === "time") {
      state.endCondition = { reason: "manual", inning: endedInning, half: endedHalf };
    }
  };

  const checkWalkOff = (): void => {
    if (state.endCondition) return;
    if (state.half !== "bottom" || state.inning < rules.innings) return;
    if (totalRuns(homeTeamId) > totalRuns(awayTeamId)) {
      state.endCondition = { reason: "walk_off", inning: state.inning, half: "bottom" };
    }
  };

  const applyRun = (event: EngineGameEvent): void => {
    const playId = playIdOf(event);
    const runnerId = event.playerId;
    // La carrera se acredita al equipo del evento (es lo mismo que suma el
    // SQL de standings); normalmente coincide con el que batea.
    const book = (event.teamId ? teams[event.teamId] : undefined) ?? batting();
    const legacy = isLegacy(event);
    if (!legacy && book.teamId !== state.battingTeamId) {
      issue("warning", "Carrera acreditada al equipo que no está al bate", event);
    }
    // Eventos antiguos traen la entrada en `period`; hoy la entrada la
    // manda el estado.
    const inning = legacy && event.period ? event.period : state.inning;
    ensureLineScore(book, inning);

    let paId: string | null = null;
    let earned: boolean | null = null;
    let pitcherId: string | null = fielding().currentPitcherId;

    const located = runnerId ? findRunner(runnerId) : null;
    if (located) {
      const { base: from, runner } = located;
      state.bases[from] = null;
      paId = runner.paId;
      pitcherId = runner.pitcherId;
      const pa = ownerPA(runner.paId);
      if (pa) {
        pa.path.push({
          from,
          to: 4,
          reason: (str(event.payload.reason) as AdvanceReason | null) ?? "batted_ball",
          playId,
          out: false,
          fielders: [],
        });
        pa.finalBase = 4;
        pa.scored = true;
      }
      earned =
        runner.reachedBy === "error" || runner.errorBeforeReach ? null : true;
    } else if (runnerId && state.currentPA && state.currentPA.batterId === runnerId) {
      // Cuadrangular: el bateador anota en su propia jugada.
      const pa = state.currentPA;
      paId = pa.id;
      pitcherId = pa.pitcherId;
      pa.path.push({ from: 0, to: 4, reason: "home_run", playId, out: false, fielders: [] });
      pa.finalBase = 4;
      pa.scored = true;
      earned = errorInHalf ? null : true;
    } else if (runnerId) {
      const justClosed = book.plateAppearances.find(
        (pa) => pa.id === playId && pa.batterId === runnerId,
      );
      if (justClosed) {
        paId = justClosed.id;
        pitcherId = justClosed.pitcherId;
        justClosed.path.push({ from: 0, to: 4, reason: "home_run", playId, out: false, fielders: [] });
        justClosed.finalBase = 4;
        justClosed.scored = true;
        earned = errorInHalf ? null : true;
      } else if (!legacy) {
        issue("warning", `Carrera de ${nameOf(runnerId)} sin corredor en base`, event);
      }
    }

    const explicitEarned = event.payload.earned;
    if (explicitEarned === true || explicitEarned === false) earned = explicitEarned;
    else if (explicitEarned === null) earned = null;
    const explicitPitcher = str(event.payload.pitcherId);
    if (explicitPitcher) pitcherId = explicitPitcher;

    if (rules.runLimitPerInning && !legacy && runsThisHalf() >= rules.runLimitPerInning) {
      issue("error", "Carrera registrada después de alcanzar el tope por entrada", event);
    }

    book.line.runs[inning - 1] = (book.line.runs[inning - 1] ?? 0) + 1;
    book.runsScored.push({
      playerId: runnerId ?? "",
      inning,
      half: state.half,
      playId,
      paId,
      earned,
      pitcherId,
    });
    if (paId) {
      const pa = ownerPA(paId);
      if (pa) pa.earnedRun = earned;
    }
    describe(event, `${nameOf(runnerId)} anota`);
    checkWalkOff();
    if (
      rules.runLimitPerInning &&
      runsThisHalf() >= rules.runLimitPerInning &&
      !state.endCondition
    ) {
      endHalf(event, "run_limit");
    }
  };

  const applyRunnerMove = (event: EngineGameEvent, out: boolean): void => {
    const runnerId = event.playerId ?? str(event.payload.runnerId);
    const playId = playIdOf(event);
    const reason =
      (str(event.payload.reason) as AdvanceReason | null) ??
      (event.eventType === "stolen_base"
        ? "stolen_base"
        : event.eventType === "caught_stealing"
          ? "caught_stealing"
          : event.eventType === "pickoff"
            ? "pickoff"
            : out
              ? "tag"
              : "batted_ball");
    const fielders = fielderList(event.payload.fielders);
    if (!runnerId) {
      issue("error", "Movimiento de corredor sin jugador", event);
      return;
    }
    const located = findRunner(runnerId);
    if (!located) {
      issue("error", `${nameOf(runnerId)} no está en base`, event);
      return;
    }
    const { base: from, runner } = located;
    const declaredFrom = base(event.payload.from);
    if (declaredFrom !== null && declaredFrom !== from) {
      issue("warning", `${nameOf(runnerId)} estaba en ${from}ª, no en ${declaredFrom}ª`, event);
    }
    const to = base(event.payload.to) ?? (out ? from : null);
    const pa = ownerPA(runner.paId);

    if (out) {
      state.bases[from] = null;
      if (pa) {
        pa.path.push({ from, to: to ?? from, reason, playId, out: true, fielders });
        pa.finalBase = from;
      }
      addOut(event, pa, fielders, event.eventType === "caught_stealing" ? "caught_stealing" : "runner");
      describe(event, `${nameOf(runnerId)} out en ${to ?? from}ª`);
      if (state.outs >= 3) endHalf(event, "three_outs");
      return;
    }

    if (to === null || to === 4 || to === 0) {
      issue("error", "Un avance a home debe registrarse como carrera", event);
      return;
    }
    if (to === from) return;
    state.bases[from] = null;
    placeRunner(event, runner, to as OccupiedBase);
    if (pa) {
      pa.path.push({ from, to, reason, playId, out: false, fielders });
      pa.finalBase = to;
    }
    describe(event, `${nameOf(runnerId)} avanza a ${to}ª`);
  };

  const applyResult = (event: EngineGameEvent, result: PAResultKind): void => {
    const batterId = event.playerId;
    if (!batterId) {
      issue("error", "Resultado de bateo sin bateador", event);
      return;
    }
    const pa = currentOrOpenPA(event, batterId);
    const fielders = fielderList(event.payload.fielders);
    const kind = str(event.payload.kind);
    pa.fielders = fielders;
    pa.detail = kind;
    const seq = fielders.join("-");
    const last = fielders[fielders.length - 1];

    switch (result) {
      case "single":
        pa.code = "1B";
        batterReaches(event, pa, base(event.payload.to) ?? 1, "hit", "hit");
        batting().line.hits += 1;
        describe(event, `Sencillo de ${nameOf(batterId)}`);
        break;
      case "double":
        pa.code = kind === "ground_rule" ? "2B*" : "2B";
        batterReaches(event, pa, base(event.payload.to) ?? 2, "hit", "hit");
        batting().line.hits += 1;
        describe(event, `Doble de ${nameOf(batterId)}`);
        break;
      case "triple":
        pa.code = "3B";
        batterReaches(event, pa, base(event.payload.to) ?? 3, "hit", "hit");
        batting().line.hits += 1;
        describe(event, `Triple de ${nameOf(batterId)}`);
        break;
      case "home_run":
        pa.code = kind === "inside_park" ? "HR*" : "HR";
        batting().line.hits += 1;
        // La carrera del bateador llega como evento `run` de la misma jugada.
        describe(event, `Cuadrangular de ${nameOf(batterId)}`);
        break;
      case "walk":
        pa.code = "BB";
        batterReaches(event, pa, 1, "walk", "walk");
        describe(event, `Base por bolas a ${nameOf(batterId)}`);
        break;
      case "intentional_walk":
        pa.code = "IBB";
        batterReaches(event, pa, 1, "walk", "walk");
        describe(event, `Base intencional a ${nameOf(batterId)}`);
        break;
      case "hbp":
        pa.code = "HBP";
        batterReaches(event, pa, 1, "hbp", "walk");
        describe(event, `${nameOf(batterId)} golpeado`);
        break;
      case "interference":
        pa.code = "CI";
        batterReaches(event, pa, 1, "interference", "walk");
        describe(event, `Interferencia: ${nameOf(batterId)} a primera`);
        break;
      case "strikeout":
        if (kind === "dropped") {
          // Tercer strike no retenido: el pitcher recibe el ponche, pero el
          // bateador llega a primera y no hay out.
          pa.code = "K*";
          batterReaches(event, pa, base(event.payload.to) ?? 1, "dropped_third_strike", "batted_ball");
          describe(event, `Tercer strike no retenido: ${nameOf(batterId)} a primera`);
          break;
        }
        pa.code = kind === "looking" ? "Kc" : kind === "foul" ? "Kf" : "K";
        pa.batterOut = true;
        addOut(event, pa, fielders.length > 0 ? fielders : [2], "strikeout");
        describe(event, `Ponche a ${nameOf(batterId)}`);
        break;
      case "out": {
        const prefix =
          kind === "fly"
            ? "F"
            : kind === "line"
              ? "L"
              : kind === "popup"
                ? "P"
                : kind === "foul_fly"
                  ? "FF"
                  : kind === "infield_fly"
                    ? "IF"
                    : "";
        pa.code =
          prefix && last !== undefined
            ? `${prefix}${last}`
            : seq || (kind === "unassisted" && last !== undefined ? `${last}U` : "OUT");
        if (kind === "double_play") pa.code = `${seq || pa.code} DP`;
        if (kind === "triple_play") pa.code = `${seq || pa.code} TP`;
        pa.batterOut = true;
        addOut(event, pa, fielders, kind ?? "out");
        describe(event, `${nameOf(batterId)} out (${pa.code})`);
        break;
      }
      case "fielders_choice":
        pa.code = seq ? `FC ${seq}` : "FC";
        batterReaches(event, pa, base(event.payload.to) ?? 1, "fielders_choice", "fielders_choice");
        describe(event, `${nameOf(batterId)} a primera por elección`);
        break;
      case "reach_on_error":
        pa.code = last !== undefined ? `E${last}` : "E";
        batterReaches(event, pa, base(event.payload.to) ?? 1, "error", "error");
        describe(event, `${nameOf(batterId)} llega por error`);
        break;
      case "sac_fly":
        pa.code = last !== undefined ? `SF${last}` : "SF";
        pa.batterOut = true;
        addOut(event, pa, fielders, "sac_fly");
        describe(event, `Elevado de sacrificio de ${nameOf(batterId)}`);
        break;
      case "sac_bunt":
        pa.code = seq ? `SAC ${seq}` : "SAC";
        pa.batterOut = true;
        addOut(event, pa, fielders, "sac_bunt");
        describe(event, `Toque de sacrificio de ${nameOf(batterId)}`);
        break;
    }

    closePA(event, pa, result);
    if (state.outs >= 3) endHalf(event, "three_outs");
  };

  const applyPitch = (event: EngineGameEvent, kind: "ball" | "strike" | "foul"): void => {
    const batterId = event.playerId;
    if (!batterId) return;
    const pa = currentOrOpenPA(event, batterId);
    pa.pitches.push({ eventId: event.id, kind });
    pa.eventIds.push(event.id);
    if (kind === "ball") state.balls = Math.min(state.balls + 1, rules.ballsForWalk);
    else if (kind === "strike") state.strikes = Math.min(state.strikes + 1, rules.strikesForOut);
    else if (state.strikes < rules.strikesForOut - 1) state.strikes += 1;
    const label = kind === "ball" ? "Bola" : kind === "strike" ? "Strike" : "Foul";
    describe(event, `${label} (${state.balls}-${state.strikes})`);
  };

  const applySubstitution = (event: EngineGameEvent): void => {
    const teamId = event.teamId;
    const book = teamId ? teams[teamId] : undefined;
    if (!book) {
      issue("error", "Sustitución sin equipo válido", event);
      return;
    }
    const inPlayerId = str(event.payload.inPlayerId) ?? event.playerId;
    const outPlayerId = str(event.payload.outPlayerId);
    const slotNumber = num(event.payload.slot);
    const position = str(event.payload.position);
    const roleRaw = str(event.payload.role);
    const role = (
      roleRaw === "EP" || roleRaw === "DH" || roleRaw === "PH" || roleRaw === "PR" || roleRaw === "FLEX"
        ? roleRaw
        : "sub"
    ) as LineupSlot["role"];
    if (!inPlayerId) {
      issue("error", "Sustitución sin jugador entrante", event);
      return;
    }
    let slot = slotNumber !== null ? book.slots.find((s) => s.slot === slotNumber) : undefined;
    if (!slot && outPlayerId) slot = book.slots.find((s) => s.playerId === outPlayerId);
    if (!slot) {
      // Puesto nuevo (p. ej. se agrega un EP).
      const nextSlot = slotNumber ?? (book.slots.length + 1);
      slot = { slot: nextSlot, playerId: inPlayerId, position, role, enteredByEventId: event.id };
      book.slots.push(slot);
      book.slots.sort((a, b) => a.slot - b.slot);
    } else {
      slot.playerId = inPlayerId;
      slot.position = position ?? slot.position;
      slot.role = role;
      slot.enteredByEventId = event.id;
    }
    if (slot.position === "P") book.currentPitcherId = inPlayerId;
    // Corredor emergente: el sustituto toma la base del sustituido.
    if (outPlayerId) {
      const located = findRunner(outPlayerId);
      if (located) {
        state.bases[located.base] = { ...located.runner, playerId: inPlayerId, reachedBy: located.runner.reachedBy };
      }
      if (state.currentPA && state.currentPA.batterId === outPlayerId && state.currentPA.result === null) {
        state.currentPA.batterId = inPlayerId;
      }
    }
    book.substitutions.push({
      eventId: event.id,
      seq: event.seq,
      inning: state.inning,
      half: state.half,
      slot: slot.slot,
      inPlayerId,
      outPlayerId,
      position: slot.position,
      role,
    });
    describe(event, `${nameOf(inPlayerId)} entra${outPlayerId ? ` por ${nameOf(outPlayerId)}` : ""}`);
  };

  const applyDefensiveChange = (event: EngineGameEvent): void => {
    const book = event.teamId ? teams[event.teamId] : undefined;
    if (!book) return;
    const rawChanges = event.payload.changes;
    const changes: { playerId: string; position: string | null }[] = Array.isArray(rawChanges)
      ? rawChanges
          .map((c) => ({
            playerId: str((c as Record<string, unknown>).playerId) ?? "",
            position: str((c as Record<string, unknown>).position),
          }))
          .filter((c) => c.playerId)
      : [{ playerId: str(event.payload.playerId) ?? event.playerId ?? "", position: str(event.payload.position) }];
    for (const change of changes) {
      const slot = book.slots.find((s) => s.playerId === change.playerId);
      if (!slot) {
        issue("warning", `${nameOf(change.playerId)} no está en la alineación`, event);
        continue;
      }
      slot.position = change.position;
      if (change.position === "P") book.currentPitcherId = change.playerId;
      describe(event, `${nameOf(change.playerId)} pasa a ${change.position ?? "banca"}`);
    }
  };

  // -------------------------------------------------------------------
  // Pliegue principal
  // -------------------------------------------------------------------
  const effective = effectiveEvents(input.events);
  state.effective = effective;
  ensureLineScore(batting(), 1);
  ensureLineScore(fielding(), 1);

  // Jugadas parcialmente anuladas: si una corrección tumbó algunos eventos
  // de una jugada pero no todos, se marca para revisión.
  const allByPlay = new Map<string, Set<string>>();
  for (const event of input.events) {
    if (event.eventType === "correction") continue;
    const id = str(event.payload.playId);
    if (!id) continue;
    const set = allByPlay.get(id) ?? new Set<string>();
    set.add(event.id);
    allByPlay.set(id, set);
  }
  const effectiveIds = new Set(effective.map((e) => e.id));

  for (const event of effective) {
    state.lastSeq = Math.max(state.lastSeq, event.seq);
    const battingTeam = state.battingTeamId;

    switch (event.eventType) {
      case "substitution":
        touchPlay(event, event.teamId ?? battingTeam);
        applySubstitution(event);
        break;
      case "defensive_change":
        touchPlay(event, event.teamId ?? battingTeam);
        applyDefensiveChange(event);
        break;
      case "pitch_ball":
        touchPlay(event, battingTeam);
        applyPitch(event, "ball");
        break;
      case "pitch_strike":
        touchPlay(event, battingTeam);
        applyPitch(event, "strike");
        break;
      case "pitch_foul":
        touchPlay(event, battingTeam);
        applyPitch(event, "foul");
        break;
      case "run":
        touchPlay(event, battingTeam);
        applyRun(event);
        break;
      case "rbi": {
        touchPlay(event, battingTeam);
        const playId = playIdOf(event);
        const book = batting();
        const pa =
          (state.currentPA && state.currentPA.id === playId ? state.currentPA : null) ??
          book.plateAppearances.find((item) => item.id === playId) ??
          [...book.plateAppearances].reverse().find((item) => item.batterId === event.playerId) ??
          null;
        if (pa) pa.rbi += 1;
        break;
      }
      case "error": {
        touchPlay(event, battingTeam);
        const book = (event.teamId ? teams[event.teamId] : undefined) ?? fielding();
        book.line.errors += 1;
        book.errorsMade.push({
          playerId: event.playerId ?? "",
          position: num(event.payload.position),
          inning: state.inning,
          half: state.half,
          playId: playIdOf(event),
        });
        if (book.teamId === state.fieldingTeamId) errorInHalf = true;
        describe(event, `Error de ${nameOf(event.playerId)}`);
        break;
      }
      case "wild_pitch":
      case "passed_ball":
      case "balk":
        touchPlay(event, battingTeam);
        describe(
          event,
          event.eventType === "wild_pitch"
            ? "Lanzamiento descontrolado"
            : event.eventType === "passed_ball"
              ? "Passed ball"
              : "Balk",
        );
        break;
      case "runner_advance":
      case "stolen_base":
        touchPlay(event, battingTeam);
        applyRunnerMove(event, false);
        break;
      case "runner_out":
      case "caught_stealing":
      case "pickoff":
        touchPlay(event, battingTeam);
        applyRunnerMove(event, true);
        break;
      case "half_inning_end": {
        touchPlay(event, battingTeam);
        const reason = str(event.payload.reason) ?? "manual";
        describe(event, "Fin de la media entrada");
        endHalf(event, reason);
        break;
      }
      default:
        if (RESULT_TYPES.has(event.eventType as PAResultKind)) {
          touchPlay(event, battingTeam);
          applyResult(event, event.eventType as PAResultKind);
        }
        // Tipos desconocidos (otros deportes) se ignoran en la libreta.
        break;
    }
  }

  for (const summary of state.plays) {
    const parts = playParts.get(summary.playId) ?? [];
    summary.text = parts.join("; ");
    const all = allByPlay.get(summary.playId);
    if (all && [...all].some((id) => !effectiveIds.has(id))) {
      summary.partiallyVoided = true;
      issue("warning", "Jugada parcialmente corregida: revisar", undefined, summary.playId);
    }
  }
  if (state.currentPA?.code === "HR" && !state.currentPA.scored) {
    issue("warning", "Cuadrangular sin carrera registrada", undefined, state.currentPA.id);
  }

  return state;
}

/** Bateador que sigue según el orden vigente (o null si no hay alineación). */
export function nextBatter(state: ScorebookState): LineupSlot | null {
  const book = state.teams[state.battingTeamId];
  if (!book || book.slots.length === 0) return null;
  if (state.currentPA && state.currentPA.result === null) {
    return book.slots.find((slot) => slot.playerId === state.currentPA?.batterId) ?? null;
  }
  return book.slots[book.nextSlotIndex % book.slots.length] ?? null;
}

/** El que sigue después del bateador actual. */
export function onDeckBatter(state: ScorebookState): LineupSlot | null {
  const book = state.teams[state.battingTeamId];
  const current = nextBatter(state);
  if (!book || !current || book.slots.length < 2) return null;
  const index = book.slots.findIndex((slot) => slot.playerId === current.playerId);
  return book.slots[(index + 1) % book.slots.length] ?? null;
}

export function currentPitcher(state: ScorebookState): LineupSlot | null {
  const book = state.teams[state.fieldingTeamId];
  if (!book) return null;
  const id = book.currentPitcherId;
  return book.slots.find((slot) => slot.playerId === id) ?? null;
}

export function fielderAt(state: ScorebookState, position: string): LineupSlot | null {
  const book = state.teams[state.fieldingTeamId];
  return book?.slots.find((slot) => slot.position === position) ?? null;
}

export function pathTargetLabel(to: BaseIndex): string {
  return to === 4 ? "home" : `${to}ª`;
}
