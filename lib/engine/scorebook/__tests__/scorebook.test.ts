import { describe, expect, it } from "vitest";
import type { EngineGameEvent } from "../../types";
import {
  SLOWPITCH_RULES,
  battingLines,
  buildCorrection,
  buildPitch,
  buildPlay,
  buildSubstitution,
  earnedRunAverage,
  fieldingLines,
  findEntry,
  formatInnings,
  nextBatter,
  pitchingLines,
  proposeRunners,
  reduceScorebook,
  rulesProfileSchema,
  type InitialLineup,
  type NewEvent,
  type PlayDraft,
  type ScorebookStateInternal,
} from "..";

/**
 * Escenarios de la especificación, de principio a fin: cada jugada se
 * construye con el constructor real, se pliega con el reductor real y se
 * verifica en libreta, marcador y estadísticas. Nombres ficticios.
 */

const AWAY = "team-away";
const HOME = "team-home";

const awayNames = ["Ana", "María", "Lucía", "Sofía", "Elena", "Carla", "Rosa", "Vera", "Nadia", "Irma"];
const homeNames = ["Beatriz", "Diana", "Fabiola", "Gloria", "Hilda", "Julia", "Karla", "Laura", "Mónica", "Norma"];

const POSITIONS = ["P", "C", "1B", "2B", "3B", "SS", "LF", "CF", "RF", "SF"];

function lineup(teamId: string, prefix: string): InitialLineup {
  return {
    teamId,
    slots: POSITIONS.map((position, index) => ({
      slot: index + 1,
      playerId: `${prefix}-${index + 1}`,
      position,
      role: "starter" as const,
    })),
  };
}

const NAMES: Record<string, string> = {};
awayNames.forEach((n, i) => (NAMES[`a-${i + 1}`] = n));
homeNames.forEach((n, i) => (NAMES[`h-${i + 1}`] = n));

class Game {
  events: EngineGameEvent[] = [];
  private seq = 0;
  private counter = 0;
  readonly rules;
  constructor(rules = SLOWPITCH_RULES) {
    this.rules = rules;
  }
  newId = (): string => `id-${(this.counter += 1)}`;
  state(): ScorebookStateInternal {
    return reduceScorebook({
      events: this.events,
      rules: this.rules,
      homeTeamId: HOME,
      awayTeamId: AWAY,
      lineups: [lineup(AWAY, "a"), lineup(HOME, "h")],
      playerNames: NAMES,
    });
  }
  commit(built: { ok: boolean; events: NewEvent[]; errors: string[] }): void {
    if (!built.ok) throw new Error(`Jugada inválida: ${built.errors.join(" | ")}`);
    for (const event of built.events) {
      this.seq += 1;
      this.events.push({
        id: event.id,
        seq: this.seq,
        gameId: "game",
        teamId: event.teamId,
        playerId: event.playerId,
        eventType: event.eventType,
        payload: event.payload,
        period: event.period,
        clockSeconds: null,
        correctsEventId: event.correctsEventId,
      });
    }
  }
  /** Juega la entrada del bateador que sigue con la entrada del catálogo. */
  play(entryKey: string, extra: Partial<PlayDraft> = {}): void {
    const state = this.state();
    const batter = nextBatter(state);
    if (!batter) throw new Error("No hay bateador");
    const entry = findEntry(entryKey);
    if (!entry) throw new Error(`Entrada desconocida ${entryKey}`);
    const draft: PlayDraft = {
      entryKey,
      batterId: batter.playerId,
      runners: proposeRunners(state, entry),
      ...extra,
    };
    this.commit(buildPlay(state, draft, { playerNames: NAMES, newId: this.newId }));
  }
  pitch(kind: "ball" | "strike" | "foul"): ReturnType<typeof buildPitch> {
    const state = this.state();
    const batter = nextBatter(state)!;
    const built = buildPitch(state, kind, batter.playerId, { playerNames: NAMES, newId: this.newId });
    this.commit(built);
    return built;
  }
}

describe("preparación y orden al bate", () => {
  it("arranca con la visita al bate, bases vacías y el primer bateador", () => {
    const game = new Game();
    const state = game.state();
    expect(state.inning).toBe(1);
    expect(state.half).toBe("top");
    expect(state.battingTeamId).toBe(AWAY);
    expect(state.outs).toBe(0);
    expect(nextBatter(state)?.playerId).toBe("a-1");
    expect(state.teams[HOME]?.currentPitcherId).toBe("h-1");
  });
});

describe("escenarios de la especificación", () => {
  it("rodado 6-3 con bases vacías: un out, asistencia del SS y putout de 1B", () => {
    const game = new Game();
    game.play("out.ground.6-3");
    const state = game.state();
    expect(state.outs).toBe(1);
    const pa = state.teams[AWAY]!.plateAppearances[0]!;
    expect(pa.code).toBe("6-3");
    expect(pa.outNumber).toBe(1);
    expect(pa.batterOut).toBe(true);
    expect(nextBatter(state)?.playerId).toBe("a-2");

    const fielding = fieldingLines(state)[HOME]!;
    expect(fielding.find((f) => f.playerId === "h-6")?.A).toBe(1); // SS
    expect(fielding.find((f) => f.playerId === "h-3")?.PO).toBe(1); // 1B
  });

  it("sencillo con corredora en segunda que anota: hit, carrera, impulsada y recorrido en la celda", () => {
    const game = new Game();
    game.play("reach.double"); // Ana a segunda
    const before = game.state();
    expect(before.bases[2]?.playerId).toBe("a-1");

    // María: sencillo; la propuesta (avanza 1) se cambia a "anota".
    const entry = findEntry("reach.single")!;
    const proposals = proposeRunners(before, entry);
    expect(proposals[0]).toMatchObject({ playerId: "a-1", from: 2, action: "advance", to: 3 });
    game.play("reach.single", {
      runners: [{ playerId: "a-1", from: 2, action: "score", to: 4, reason: "hit" }],
    });

    const state = game.state();
    expect(state.teams[AWAY]!.line.runs[0]).toBe(1);
    expect(state.teams[AWAY]!.line.hits).toBe(2);
    expect(state.bases[1]?.playerId).toBe("a-2");
    expect(state.bases[2]).toBeNull();

    const anaPA = state.teams[AWAY]!.plateAppearances[0]!;
    expect(anaPA.scored).toBe(true);
    expect(anaPA.finalBase).toBe(4);
    expect(anaPA.path.map((p) => `${p.from}>${p.to}`)).toEqual(["0>2", "2>4"]);

    const batting = battingLines(state)[AWAY]!;
    expect(batting.find((b) => b.playerId === "a-2")?.RBI).toBe(1);
    expect(batting.find((b) => b.playerId === "a-1")?.R).toBe(1);
    expect(state.plays.at(-1)?.text).toContain("Ana anota");
  });

  it("doble play 6-4-3 con corredor en primera y un out: cierra la entrada", () => {
    const game = new Game();
    game.play("out.fly.8"); // 1 out
    game.play("reach.single"); // María a primera
    const state1 = game.state();
    expect(state1.outs).toBe(1);
    game.play("out.dp.ground", {
      fielders: [6, 4, 3],
      runners: [{ playerId: "a-2", from: 1, action: "out", to: 2, fielders: [6, 4], reason: "forced" }],
    });
    const state = game.state();
    // Tercer out → cambia la media entrada y limpia las bases.
    expect(state.half).toBe("bottom");
    expect(state.inning).toBe(1);
    expect(state.outs).toBe(0);
    expect(state.bases).toEqual({ 1: null, 2: null, 3: null });
    expect(state.battingTeamId).toBe(HOME);
    const dp = state.teams[AWAY]!.plateAppearances.at(-1)!;
    expect(dp.code).toContain("DP");
    expect(dp.outNumber).toBe(3);
    expect(state.teams[AWAY]!.plateAppearances[1]!.outNumber).toBe(2);
    const fielding = fieldingLines(state)[HOME]!;
    expect(fielding.find((f) => f.playerId === "h-6")?.A).toBe(2);
    expect(fielding.find((f) => f.playerId === "h-4")?.PO).toBe(1);
    expect(fielding.find((f) => f.playerId === "h-4")?.A).toBe(1);
    expect(fielding.find((f) => f.playerId === "h-3")?.PO).toBe(1);
  });

  it("sencillo y avance a segunda por error conserva el sencillo y carga el error", () => {
    const game = new Game();
    game.play("reach.single_error_2", { errorFielder: 7 });
    const state = game.state();
    const pa = state.teams[AWAY]!.plateAppearances[0]!;
    expect(pa.result).toBe("single");
    expect(pa.finalBase).toBe(2);
    expect(state.bases[2]?.playerId).toBe("a-1");
    expect(state.teams[HOME]!.line.errors).toBe(1);
    expect(fieldingLines(state)[HOME]!.find((f) => f.playerId === "h-7")?.E).toBe(1);
    const line = battingLines(state)[AWAY]!.find((b) => b.playerId === "a-1")!;
    expect(line.H).toBe(1);
    expect(line["2B"]).toBe(0);
  });

  it("sencillo y out intentando llegar a segunda conserva el hit y el out", () => {
    const game = new Game();
    game.play("reach.single_out_2", { fielders: [8, 4] });
    const state = game.state();
    const pa = state.teams[AWAY]!.plateAppearances[0]!;
    expect(pa.result).toBe("single");
    expect(pa.outNumber).toBe(1);
    expect(state.outs).toBe(1);
    expect(state.bases[1]).toBeNull();
    expect(state.teams[AWAY]!.line.hits).toBe(1);
    expect(battingLines(state)[AWAY]![0]!.H).toBe(1);
  });

  it("una bola o un strike no cambian al bateador; la cuarta bola es base por bolas", () => {
    const game = new Game();
    game.pitch("ball");
    game.pitch("strike");
    let state = game.state();
    expect(state.balls).toBe(1);
    expect(state.strikes).toBe(1);
    expect(nextBatter(state)?.playerId).toBe("a-1");
    expect(state.teams[AWAY]!.plateAppearances).toHaveLength(0);

    game.pitch("ball");
    game.pitch("ball");
    const walk = game.pitch("ball");
    expect(walk.completesAppearance).toBe(true);
    state = game.state();
    expect(state.bases[1]?.playerId).toBe("a-1");
    expect(nextBatter(state)?.playerId).toBe("a-2");
    expect(state.balls).toBe(0);
    expect(state.teams[AWAY]!.plateAppearances[0]!.pitches).toHaveLength(5);
  });

  it("foul con dos strikes es out en slowpitch; no lo es con reglas de béisbol", () => {
    const slow = new Game();
    slow.pitch("strike");
    slow.pitch("strike");
    const third = slow.pitch("foul");
    expect(third.completesAppearance).toBe(true);
    expect(slow.state().outs).toBe(1);
    expect(slow.state().teams[AWAY]!.plateAppearances[0]!.code).toBe("Kf");

    const ball = new Game(rulesProfileSchema.parse({ foulOnThirdStrike: "none" }));
    ball.pitch("strike");
    ball.pitch("strike");
    const foul = ball.pitch("foul");
    expect(foul.completesAppearance).toBe(false);
    expect(ball.state().strikes).toBe(2);
    expect(ball.state().outs).toBe(0);
  });

  it("base por bolas con bases llenas fuerza a todos y anota carrera impulsada", () => {
    const game = new Game();
    game.play("reach.walk");
    game.play("reach.walk");
    game.play("reach.walk");
    const state = game.state();
    expect(state.bases[1]?.playerId).toBe("a-3");
    expect(state.bases[2]?.playerId).toBe("a-2");
    expect(state.bases[3]?.playerId).toBe("a-1");
    game.play("reach.walk");
    const after = game.state();
    expect(after.teams[AWAY]!.line.runs[0]).toBe(1);
    expect(after.bases[3]?.playerId).toBe("a-2");
    expect(battingLines(after)[AWAY]!.find((b) => b.playerId === "a-4")?.RBI).toBe(1);
  });

  it("un robo no cambia al bateador; tercer out en las bases interrumpe la aparición", () => {
    const game = new Game(rulesProfileSchema.parse({ stealingAllowed: true }));
    game.play("reach.single"); // a-1 en primera
    game.play("out.fly.9");
    game.play("out.fly.9");
    let state = game.state();
    expect(state.outs).toBe(2);
    expect(nextBatter(state)?.playerId).toBe("a-4");
    game.pitch("ball"); // a-4 con cuenta 1-0

    // Robo frustrado: corredor out en segunda = tercer out durante el turno.
    const s = game.state();
    game.commit({
      ok: true,
      errors: [],
      events: [
        {
          id: game.newId(),
          eventType: "caught_stealing",
          teamId: AWAY,
          playerId: "a-1",
          payload: { playId: "cs-1", from: 1, to: 2, fielders: [2, 6] },
          period: s.inning,
          correctsEventId: null,
        },
      ],
    });
    state = game.state();
    expect(state.half).toBe("bottom");
    expect(state.teams[AWAY]!.plateAppearances).toHaveLength(3);
    // a-4 abre la siguiente entrada de su equipo con cuenta limpia.
    game.play("out.fly.7"); // home
    game.play("out.fly.7");
    game.play("out.fly.7");
    state = game.state();
    expect(state.inning).toBe(2);
    expect(state.half).toBe("top");
    expect(nextBatter(state)?.playerId).toBe("a-4");
    expect(state.balls).toBe(0);
    expect(battingLines(state)[AWAY]!.find((b) => b.playerId === "a-1")?.CS).toBe(1);
  });

  it("cambio de pitcher con corredores heredados: la carrera se carga al pitcher anterior", () => {
    const game = new Game();
    game.play("reach.walk"); // a-1 llega contra h-1
    // Cambio de pitcher: h-10 (SF) pasa a P, h-1 a SF.
    const s = game.state();
    game.commit({
      ok: true,
      errors: [],
      events: [
        {
          id: game.newId(),
          eventType: "defensive_change",
          teamId: HOME,
          playerId: "h-10",
          payload: {
            playId: "dc-1",
            changes: [
              { playerId: "h-10", position: "P" },
              { playerId: "h-1", position: "SF" },
            ],
          },
          period: s.inning,
          correctsEventId: null,
        },
      ],
    });
    expect(game.state().teams[HOME]!.currentPitcherId).toBe("h-10");
    game.play("reach.triple", {
      runners: [{ playerId: "a-1", from: 1, action: "score", to: 4, reason: "hit" }],
    });
    const state = game.state();
    const pitching = pitchingLines(state)[HOME]!;
    const first = pitching.find((p) => p.pitcherId === "h-1")!;
    const second = pitching.find((p) => p.pitcherId === "h-10")!;
    expect(first.R).toBe(1);
    expect(first.ER).toBe(1);
    expect(first.BF).toBe(1);
    expect(second.R).toBe(0);
    expect(second.H).toBe(1);
    expect(second.BF).toBe(1);
  });

  it("sustitución: el sustituto batea en el puesto y las estadísticas no se transfieren", () => {
    const game = new Game();
    game.play("reach.single"); // a-1 hit
    game.play("out.fly.8");
    game.play("out.fly.8");
    game.play("out.fly.8"); // fin alta 1
    // Baja 1: local batea. Sustituimos a h-2 (receptor) por h-11 (banca).
    const s = game.state();
    game.commit(
      buildSubstitution(
        s,
        { teamId: HOME, slot: 2, inPlayerId: "h-11", outPlayerId: "h-2", position: "C", role: "sub" },
        { newId: game.newId },
      ),
    );
    game.play("out.fly.8"); // h-1
    const state = game.state();
    expect(nextBatter(state)?.playerId).toBe("h-11");
    game.play("reach.double");
    const after = game.state();
    const lines = battingLines(after)[HOME]!;
    expect(lines.find((l) => l.playerId === "h-11")?.H).toBe(1);
    expect(lines.find((l) => l.playerId === "h-2")?.H).toBe(0);
    expect(lines.find((l) => l.playerId === "h-2")?.PA).toBe(0);
    expect(after.teams[HOME]!.substitutions).toHaveLength(1);
  });

  it("más de nueve bateadores y dos apariciones del mismo bateador en la misma entrada", () => {
    const game = new Game();
    // 10 sencillos con todos quedándose (bases no se vacían: usamos elección para no chocar)
    for (let i = 0; i < 10; i += 1) {
      const state = game.state();
      const entry = findEntry("reach.walk")!;
      const batter = nextBatter(state)!;
      game.commit(
        buildPlay(state, { entryKey: entry.key, batterId: batter.playerId, runners: proposeRunners(state, entry) }, { newId: game.newId }),
      );
    }
    const state = game.state();
    expect(nextBatter(state)?.playerId).toBe("a-1"); // dio la vuelta a 10 bateadores
    game.play("reach.walk");
    const after = game.state();
    const anaPAs = after.teams[AWAY]!.plateAppearances.filter((pa) => pa.batterId === "a-1");
    expect(anaPAs).toHaveLength(2);
    expect(anaPAs[1]!.indexInInning).toBe(2);
    expect(after.teams[AWAY]!.line.runs[0]).toBe(8);
  });

  it("efectividad: 3 limpias en 18 outs = 3.50; fracciones y cero", () => {
    expect(earnedRunAverage(3, 18, 7)).toBe(3.5);
    expect(earnedRunAverage(0, 0, 7)).toBeNull();
    expect(earnedRunAverage(2, 19, 7)).toBe(2.21);
    expect(formatInnings(18)).toBe("6.0");
    expect(formatInnings(19)).toBe("6.1");
    expect(formatInnings(20)).toBe("6.2");
    expect(formatInnings(0)).toBe("0.0");
  });

  it("carrera por error queda sucia y sin impulsada", () => {
    const game = new Game();
    game.play("reach.single");
    game.play("reach.error_1", {
      errorFielder: 6,
      runners: [{ playerId: "a-1", from: 1, action: "score", to: 4, reason: "error", onError: true, errorFielder: null }],
    });
    const state = game.state();
    const run = state.teams[AWAY]!.runsScored[0]!;
    expect(run.earned).toBe(false);
    expect(battingLines(state)[AWAY]!.find((b) => b.playerId === "a-2")?.RBI).toBe(0);
    const pitching = pitchingLines(state)[HOME]!.find((p) => p.pitcherId === "h-1")!;
    expect(pitching.R).toBe(1);
    expect(pitching.ER).toBe(0);
  });

  it("deshacer una jugada recalcula marcador, bases y estadísticas sin duplicar", () => {
    const game = new Game();
    game.play("reach.home_run");
    let state = game.state();
    expect(state.teams[AWAY]!.line.runs[0]).toBe(1);
    expect(state.teams[AWAY]!.plateAppearances[0]!.scored).toBe(true);
    const lastPlay = state.plays.at(-1)!;
    game.commit(buildCorrection(state, lastPlay.playId, { newId: game.newId }));
    state = game.state();
    expect(state.teams[AWAY]!.line.runs[0]).toBe(0);
    expect(state.teams[AWAY]!.plateAppearances).toHaveLength(0);
    expect(nextBatter(state)?.playerId).toBe("a-1");
    expect(battingLines(state)[AWAY]![0]!.HR).toBe(0);
    // Volver a anotar no duplica.
    game.play("reach.home_run");
    expect(game.state().teams[AWAY]!.line.runs[0]).toBe(1);
  });

  it("rechaza un cuarto out y corredores sin resolver", () => {
    const game = new Game();
    game.play("reach.single");
    game.play("out.fly.8");
    game.play("out.fly.8");
    const state = game.state();
    const entry = findEntry("out.dp.ground")!;
    const missing = buildPlay(state, { entryKey: entry.key, batterId: "a-4", runners: [] }, { newId: game.newId });
    expect(missing.ok).toBe(false);
    expect(missing.errors.join(" ")).toMatch(/Solo con menos de dos outs|Falta resolver/);

    const single = findEntry("reach.single")!;
    const unresolved = buildPlay(state, { entryKey: single.key, batterId: "a-4", runners: [] }, { newId: game.newId });
    expect(unresolved.ok).toBe(false);
    expect(unresolved.errors[0]).toContain("Falta resolver");
  });

  it("dos jugadores no pueden terminar en la misma base", () => {
    const game = new Game();
    game.play("reach.single");
    const state = game.state();
    const built = buildPlay(
      state,
      { entryKey: "reach.single", batterId: "a-2", runners: [{ playerId: "a-1", from: 1, action: "stay" }] },
      { newId: game.newId },
    );
    expect(built.ok).toBe(false);
    expect(built.errors[0]).toContain("primera");
  });

  it("termina por reglamento y detecta el walk-off", () => {
    const rules = rulesProfileSchema.parse({ innings: 1 });
    const game = new Game(rules);
    // Alta 1: visita anota 1.
    game.play("reach.home_run");
    game.play("out.fly.8");
    game.play("out.fly.8");
    game.play("out.fly.8");
    // Baja 1: local empata y luego anota la de la victoria.
    game.play("reach.home_run");
    expect(game.state().endCondition).toBeNull();
    game.play("reach.home_run");
    const state = game.state();
    expect(state.endCondition?.reason).toBe("walk_off");

    // Regla de misericordia.
    const mercy = new Game(rulesProfileSchema.parse({ innings: 7, mercyRule: { runDifference: 2, afterInning: 1 } }));
    mercy.play("reach.home_run");
    mercy.play("reach.home_run");
    mercy.play("out.fly.8");
    mercy.play("out.fly.8");
    mercy.play("out.fly.8");
    mercy.play("out.fly.8");
    mercy.play("out.fly.8");
    mercy.play("out.fly.8");
    expect(mercy.state().endCondition?.reason).toBe("mercy");
  });

  it("resumen humano antes de guardar usa los nombres reales", () => {
    const game = new Game();
    game.play("reach.double");
    const state = game.state();
    const entry = findEntry("reach.single")!;
    const built = buildPlay(
      state,
      {
        entryKey: entry.key,
        batterId: "a-2",
        runners: [{ playerId: "a-1", from: 2, action: "score", to: 4, reason: "hit" }],
      },
      { playerNames: NAMES, newId: game.newId },
    );
    expect(built.summary).toBe("Sencillo de María; Ana anota desde segunda; María queda en primera; 1 impulsada");
  });

  it("los eventos antiguos sin playId siguen sumando al marcador", () => {
    const legacy: EngineGameEvent[] = [
      { id: "l1", seq: 1, gameId: "g", teamId: AWAY, playerId: "a-1", eventType: "single", payload: {}, period: 1, clockSeconds: null, correctsEventId: null },
      { id: "l2", seq: 2, gameId: "g", teamId: AWAY, playerId: "a-1", eventType: "run", payload: {}, period: 1, clockSeconds: null, correctsEventId: null },
      { id: "l3", seq: 3, gameId: "g", teamId: HOME, playerId: null, eventType: "run", payload: {}, period: 3, clockSeconds: null, correctsEventId: null },
    ];
    const state = reduceScorebook({
      events: legacy,
      rules: SLOWPITCH_RULES,
      homeTeamId: HOME,
      awayTeamId: AWAY,
      lineups: [lineup(AWAY, "a"), lineup(HOME, "h")],
    });
    expect(state.teams[AWAY]!.line.runs[0]).toBe(1);
    expect(state.teams[HOME]!.line.runs[2]).toBe(1);
    expect(state.teams[AWAY]!.plateAppearances[0]!.code).toBe("1B");
    expect(state.issues.filter((i) => i.severity === "error")).toHaveLength(0);
  });
});
