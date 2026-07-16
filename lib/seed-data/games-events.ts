import type { EngineGame, EngineGameEvent } from "@/lib/engine/types";
import {
  COURT_FIELD_1_ID,
  COURT_FIELD_2_ID,
  COURT_INDOOR_ID,
  DIVISION_BASKETBALL_ID,
  DIVISION_SOFTBALL_ID,
  SEASON_BASKETBALL_ID,
  SEASON_SOFTBALL_ID,
  SEED_ADMIN_USER_ID,
  VENUE_ID,
  eventId,
  gameId,
  playerId,
  teamId,
} from "./ids";
import { SOFTBALL_ROSTER_SIZE } from "./org-league-teams";

export interface SeedGame extends EngineGame {
  venueId: string | null;
  courtId: string | null;
  scheduledAt: string;
  finalizedAt: string | null;
}

export interface SeedGameEvent extends EngineGameEvent {
  createdBy: string;
  createdAt: string;
}

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

class GameEventBuilder {
  private seq = 0;
  private readonly baseTimeMs: number;
  readonly events: SeedGameEvent[] = [];

  constructor(
    private readonly gameIndex: number,
    private readonly gameUuid: string,
    scheduledAt: string,
  ) {
    this.baseTimeMs = new Date(scheduledAt).getTime();
  }

  add(
    teamIndex: number | null,
    playerIndex: number | null,
    eventType: string,
    period: number,
    opts: { corrects?: string; clockSeconds?: number } = {},
  ): SeedGameEvent {
    this.seq += 1;
    const event: SeedGameEvent = {
      id: eventId(this.gameIndex, this.seq),
      seq: this.seq,
      gameId: this.gameUuid,
      teamId: teamIndex === null ? null : teamId(teamIndex),
      playerId:
        teamIndex === null || playerIndex === null
          ? null
          : playerId(teamIndex, playerIndex),
      eventType,
      payload: {},
      period,
      clockSeconds: opts.clockSeconds ?? null,
      correctsEventId: opts.corrects ?? null,
      createdBy: SEED_ADMIN_USER_ID,
      createdAt: new Date(this.baseTimeMs + this.seq * 30_000).toISOString(),
    };
    this.events.push(event);
    return event;
  }
}

function makeSoftballGame(
  gameIndex: number,
  homeTeamIndex: number,
  awayTeamIndex: number,
  scheduledAt: string,
  courtId: string,
  status: "finalized" | "scheduled",
): SeedGame {
  return {
    id: gameId(gameIndex),
    seasonId: SEASON_SOFTBALL_ID,
    divisionId: DIVISION_SOFTBALL_ID,
    homeTeamId: teamId(homeTeamIndex),
    awayTeamId: teamId(awayTeamIndex),
    status,
    venueId: VENUE_ID,
    courtId,
    scheduledAt,
    finalizedAt:
      status === "finalized"
        ? new Date(new Date(scheduledAt).getTime() + TWO_HOURS_MS).toISOString()
        : null,
  };
}

/* -------------------------------------------------------------------------
 * Juego 1 — Coyotes (T1, local) 7 vs Huracanes (T2, visita) 6.
 * Anotado a mano, entrada por entrada, para que las pruebas de stats por
 * jugador tengan expectativas calculables a mano. Incluye una carrera
 * fantasma anulada por `correction` en el cierre de la 3ª entrada, y
 * termina con walk-off en el cierre de la 7ª (sin outs).
 * Línea: Huracanes [1,0,2,0,0,3,0] = 6 · Coyotes [2,0,3,0,1,0,1] = 7
 * ------------------------------------------------------------------------- */
function buildGame1Events(): SeedGameEvent[] {
  const b = new GameEventBuilder(1, gameId(1), "2026-06-06T18:00:00Z");

  // Entrada 1 — alta (Huracanes anotan 1)
  b.add(2, 1, "single", 1);
  b.add(2, 2, "double", 1);
  b.add(2, 1, "run", 1);
  b.add(2, 2, "rbi", 1);
  b.add(2, 3, "strikeout", 1);
  b.add(2, 4, "out", 1);
  b.add(2, 5, "out", 1);
  // Entrada 1 — baja (Coyotes anotan 2)
  b.add(1, 1, "single", 1);
  b.add(1, 2, "walk", 1);
  b.add(1, 3, "double", 1);
  b.add(1, 1, "run", 1);
  b.add(1, 3, "rbi", 1);
  b.add(1, 4, "single", 1);
  b.add(1, 2, "run", 1);
  b.add(1, 4, "rbi", 1);
  b.add(1, 5, "out", 1);
  b.add(1, 6, "out", 1);
  b.add(1, 7, "strikeout", 1);

  // Entrada 2
  b.add(2, 6, "out", 2);
  b.add(2, 7, "out", 2);
  b.add(2, 8, "walk", 2);
  b.add(2, 9, "strikeout", 2);
  b.add(1, 8, "out", 2);
  b.add(1, 9, "strikeout", 2);
  b.add(1, 10, "out", 2);

  // Entrada 3 — alta (Huracanes anotan 2, cuadrangular de 2)
  b.add(2, 10, "single", 3);
  b.add(2, 1, "home_run", 3);
  b.add(2, 10, "run", 3);
  b.add(2, 1, "run", 3);
  b.add(2, 1, "rbi", 3);
  b.add(2, 1, "rbi", 3);
  b.add(2, 2, "out", 3);
  b.add(2, 3, "out", 3);
  b.add(2, 4, "out", 3);
  // Entrada 3 — baja (Coyotes anotan 3; el anotador registra una carrera
  // fantasma del jugador 5 y la anula con una corrección)
  b.add(1, 1, "double", 3);
  b.add(1, 2, "single", 3);
  b.add(2, 5, "error", 3); // error del campo (Huracanes)
  b.add(1, 1, "run", 3);
  b.add(1, 2, "run", 3);
  b.add(1, 4, "single", 3);
  b.add(1, 5, "walk", 3);
  b.add(1, 6, "single", 3);
  b.add(1, 4, "run", 3);
  b.add(1, 6, "rbi", 3);
  const phantomRun = b.add(1, 5, "run", 3);
  b.add(null, null, "correction", 3, { corrects: phantomRun.id });
  b.add(1, 7, "out", 3);
  b.add(1, 8, "out", 3);
  b.add(1, 9, "out", 3);

  // Entrada 4
  b.add(2, 5, "strikeout", 4);
  b.add(2, 6, "out", 4);
  b.add(2, 7, "out", 4);
  b.add(1, 10, "out", 4);
  b.add(1, 1, "single", 4);
  b.add(1, 2, "strikeout", 4);
  b.add(1, 3, "out", 4);

  // Entrada 5 — baja (cuadrangular solitario del jugador 4)
  b.add(2, 8, "out", 5);
  b.add(2, 9, "single", 5);
  b.add(2, 10, "strikeout", 5);
  b.add(2, 1, "out", 5);
  b.add(1, 4, "home_run", 5);
  b.add(1, 4, "run", 5);
  b.add(1, 4, "rbi", 5);
  b.add(1, 5, "out", 5);
  b.add(1, 6, "out", 5);
  b.add(1, 7, "strikeout", 5);

  // Entrada 6 — alta (Huracanes anotan 3 y empatan el juego 6-6)
  b.add(2, 2, "walk", 6);
  b.add(2, 3, "triple", 6);
  b.add(2, 2, "run", 6);
  b.add(2, 3, "rbi", 6);
  b.add(2, 4, "single", 6);
  b.add(2, 3, "run", 6);
  b.add(2, 4, "rbi", 6);
  b.add(2, 5, "double", 6);
  b.add(2, 4, "run", 6);
  b.add(2, 5, "rbi", 6);
  b.add(2, 6, "out", 6);
  b.add(2, 7, "out", 6);
  b.add(2, 8, "out", 6);
  b.add(1, 8, "out", 6);
  b.add(1, 9, "out", 6);
  b.add(1, 10, "walk", 6);
  b.add(1, 1, "strikeout", 6);

  // Entrada 7 — alta en blanco; baja con carrera de walk-off (sin outs)
  b.add(2, 9, "strikeout", 7);
  b.add(2, 10, "out", 7);
  b.add(2, 1, "out", 7);
  b.add(1, 2, "double", 7);
  b.add(1, 3, "single", 7);
  b.add(1, 2, "run", 7);
  b.add(1, 3, "rbi", 7);

  return b.events;
}

/* -------------------------------------------------------------------------
 * Juegos 2-9 de softbol: generados desde line scores. El patrón por media
 * entrada es: por cada carrera un sencillo + carrera del bateador + RBI del
 * siguiente en el orden; después 3 outs. La baja de la 7ª no se juega si el
 * local ya ganó.
 * ------------------------------------------------------------------------- */
interface GeneratedSoftballSpec {
  gameIndex: number;
  homeTeamIndex: number;
  awayTeamIndex: number;
  /** 7 entradas cada una; la suma es el marcador final. */
  homeLine: readonly number[];
  awayLine: readonly number[];
  scheduledAt: string;
  courtId: string;
}

function makeBatterCursor(rosterSize: number): () => number {
  let next = 1;
  return () => {
    const batter = next;
    next = next === rosterSize ? 1 : next + 1;
    return batter;
  };
}

function emitSoftballHalf(
  b: GameEventBuilder,
  battingTeamIndex: number,
  inning: number,
  runs: number,
  nextBatter: () => number,
): void {
  for (let k = 0; k < runs; k += 1) {
    const scorer = nextBatter();
    b.add(battingTeamIndex, scorer, "single", inning);
    b.add(battingTeamIndex, scorer, "run", inning);
    b.add(battingTeamIndex, nextBatter(), "rbi", inning);
  }
  for (let j = 1; j <= 3; j += 1) {
    const type = (inning + j + battingTeamIndex) % 3 === 0 ? "strikeout" : "out";
    b.add(battingTeamIndex, nextBatter(), type, inning);
  }
}

function buildGeneratedSoftballEvents(spec: GeneratedSoftballSpec): SeedGameEvent[] {
  const b = new GameEventBuilder(spec.gameIndex, gameId(spec.gameIndex), spec.scheduledAt);
  const awayBatter = makeBatterCursor(SOFTBALL_ROSTER_SIZE);
  const homeBatter = makeBatterCursor(SOFTBALL_ROSTER_SIZE);
  const awayTotal = spec.awayLine.reduce((sum, runs) => sum + runs, 0);
  const homeThroughSix = spec.homeLine
    .slice(0, 6)
    .reduce((sum, runs) => sum + runs, 0);

  for (let inning = 1; inning <= 7; inning += 1) {
    emitSoftballHalf(b, spec.awayTeamIndex, inning, spec.awayLine[inning - 1] ?? 0, awayBatter);
    const homeAlreadyWon = inning === 7 && homeThroughSix > awayTotal;
    if (!homeAlreadyWon) {
      emitSoftballHalf(b, spec.homeTeamIndex, inning, spec.homeLine[inning - 1] ?? 0, homeBatter);
    }
  }
  return b.events;
}

/*
 * Resultados diseñados para las pruebas del motor:
 *  - Coyotes (T1) 3-0 y Huracanes (T2) 3-1 empatan a 6 puntos → head-to-head
 *    (juego 1) pone a Coyotes arriba.
 *  - Mineros (T3), Bravos (T4) y Cañeros (T5) empatan a 2 puntos con
 *    head-to-head circular (T3>T4, T4>T5, T5>T3) → cae a diferencia de
 *    carreras: T4 (0) > T5 (−4) > T3 (−7).
 *  - Halcones (T6) 0-2 al fondo. El juego 10 sigue programado y no cuenta.
 */
const generatedSoftballSpecs: readonly GeneratedSoftballSpec[] = [
  {
    gameIndex: 2, homeTeamIndex: 3, awayTeamIndex: 1,
    awayLine: [3, 2, 0, 1, 0, 2, 1], homeLine: [0, 1, 0, 0, 1, 0, 0],
    scheduledAt: "2026-06-06T18:00:00Z", courtId: COURT_FIELD_2_ID,
  },
  {
    gameIndex: 3, homeTeamIndex: 6, awayTeamIndex: 1,
    awayLine: [2, 3, 0, 1, 2, 0, 2], homeLine: [1, 0, 0, 2, 0, 0, 0],
    scheduledAt: "2026-06-06T20:00:00Z", courtId: COURT_FIELD_1_ID,
  },
  {
    gameIndex: 4, homeTeamIndex: 2, awayTeamIndex: 4,
    awayLine: [0, 2, 1, 0, 3, 0, 0], homeLine: [2, 0, 1, 3, 0, 2, 0],
    scheduledAt: "2026-06-13T18:00:00Z", courtId: COURT_FIELD_1_ID,
  },
  {
    gameIndex: 5, homeTeamIndex: 5, awayTeamIndex: 2,
    awayLine: [2, 0, 1, 0, 3, 0, 0], homeLine: [0, 1, 0, 2, 0, 1, 0],
    scheduledAt: "2026-06-13T18:00:00Z", courtId: COURT_FIELD_2_ID,
  },
  {
    gameIndex: 6, homeTeamIndex: 4, awayTeamIndex: 3,
    awayLine: [0, 2, 0, 1, 0, 2, 0], homeLine: [1, 0, 2, 0, 1, 0, 0],
    scheduledAt: "2026-06-13T20:00:00Z", courtId: COURT_FIELD_1_ID,
  },
  {
    gameIndex: 7, homeTeamIndex: 4, awayTeamIndex: 5,
    awayLine: [0, 2, 1, 0, 3, 0, 0], homeLine: [2, 1, 3, 0, 1, 2, 0],
    scheduledAt: "2026-06-20T18:00:00Z", courtId: COURT_FIELD_1_ID,
  },
  {
    gameIndex: 8, homeTeamIndex: 3, awayTeamIndex: 5,
    awayLine: [0, 1, 2, 0, 0, 0, 1], homeLine: [1, 0, 0, 2, 0, 0, 0],
    scheduledAt: "2026-06-20T18:00:00Z", courtId: COURT_FIELD_2_ID,
  },
  {
    gameIndex: 9, homeTeamIndex: 6, awayTeamIndex: 2,
    awayLine: [1, 2, 0, 0, 2, 0, 0], homeLine: [0, 0, 1, 0, 0, 0, 0],
    scheduledAt: "2026-06-20T20:00:00Z", courtId: COURT_FIELD_1_ID,
  },
];

/* -------------------------------------------------------------------------
 * Juego 11 — Basquetbol: Panteras (T7, local) 69 vs Lobos (T8, visita) 62.
 * Anotado a mano por cuartos. Incluye un triple fantasma de Lobos en el 2º
 * cuarto anulado por corrección (sin ella, Lobos tendría 65).
 * Cuartos: Panteras [18,15,20,16] · Lobos [14,17,12,19]
 * ------------------------------------------------------------------------- */
type ScoringPlay = readonly [playerIndex: number, eventType: "fg2" | "fg3" | "ft_made"];

const panterasQuarters: readonly (readonly ScoringPlay[])[] = [
  [[1, "fg3"], [1, "fg2"], [2, "fg2"], [3, "fg2"], [4, "fg3"], [5, "fg2"], [2, "ft_made"], [3, "ft_made"], [6, "fg2"]],
  [[2, "fg2"], [3, "fg2"], [4, "fg3"], [5, "fg2"], [6, "fg2"], [7, "fg2"], [8, "ft_made"], [2, "ft_made"]],
  [[1, "fg3"], [1, "ft_made"], [2, "fg3"], [3, "fg3"], [4, "fg2"], [5, "fg2"], [6, "fg2"], [7, "fg2"], [8, "ft_made"], [2, "ft_made"]],
  [[1, "fg2"], [2, "fg2"], [3, "fg2"], [4, "fg2"], [5, "fg2"], [6, "fg2"], [7, "fg3"], [8, "ft_made"]],
];

const lobosQuarters: readonly (readonly ScoringPlay[])[] = [
  [[1, "fg2"], [2, "fg2"], [3, "fg2"], [4, "fg3"], [5, "fg2"], [6, "fg2"], [7, "ft_made"]],
  [[1, "fg3"], [2, "fg3"], [3, "fg2"], [4, "fg2"], [5, "fg2"], [6, "fg2"], [7, "fg2"], [8, "ft_made"]],
  [[1, "fg2"], [2, "fg2"], [3, "fg2"], [4, "fg2"], [5, "fg3"], [6, "ft_made"]],
  [[1, "fg3"], [2, "fg3"], [3, "fg3"], [4, "fg2"], [5, "fg2"], [6, "fg2"], [7, "fg2"], [8, "ft_made"], [1, "ft_made"]],
];

const QUARTER_SECONDS = 600;

function buildBasketballEvents(): SeedGameEvent[] {
  const b = new GameEventBuilder(11, gameId(11), "2026-06-27T19:00:00Z");

  for (let quarter = 1; quarter <= 4; quarter += 1) {
    const halves: ReadonlyArray<{ teamIndex: number; plays: readonly ScoringPlay[] }> = [
      { teamIndex: 7, plays: panterasQuarters[quarter - 1] ?? [] },
      { teamIndex: 8, plays: lobosQuarters[quarter - 1] ?? [] },
    ];
    for (const { teamIndex, plays } of halves) {
      plays.forEach(([playerIndex, eventType], position) => {
        b.add(teamIndex, playerIndex, eventType, quarter, {
          clockSeconds: QUARTER_SECONDS - (position + 1) * 45,
        });
      });
    }
    // Eventos sin marcador repartidos de forma determinista.
    if (quarter === 1) {
      b.add(7, 1, "assist", 1, { clockSeconds: 400 });
      b.add(8, 1, "rebound", 1, { clockSeconds: 350 });
      b.add(8, 2, "rebound", 1, { clockSeconds: 300 });
    }
    if (quarter === 2) {
      // Triple fantasma de Lobos: el anotador lo registra y lo corrige.
      const phantomThree = b.add(8, 1, "fg3", 2, { clockSeconds: 120 });
      b.add(null, null, "correction", 2, { corrects: phantomThree.id });
      b.add(7, 1, "rebound", 2, { clockSeconds: 100 });
      b.add(7, 3, "assist", 2, { clockSeconds: 90 });
      b.add(7, 5, "steal", 2, { clockSeconds: 80 });
    }
    if (quarter === 3) {
      b.add(7, 1, "foul", 3, { clockSeconds: 200 });
      b.add(8, 4, "foul", 3, { clockSeconds: 180 });
      b.add(7, 6, "block", 3, { clockSeconds: 150 });
    }
    if (quarter === 4) {
      b.add(7, 1, "rebound", 4, { clockSeconds: 90 });
      b.add(8, 6, "turnover", 4, { clockSeconds: 60 });
    }
  }
  return b.events;
}

/* ------------------------------------------------------------------------- */

export const softballGames: SeedGame[] = [
  makeSoftballGame(1, 1, 2, "2026-06-06T18:00:00Z", COURT_FIELD_1_ID, "finalized"),
  ...generatedSoftballSpecs.map((spec) =>
    makeSoftballGame(
      spec.gameIndex,
      spec.homeTeamIndex,
      spec.awayTeamIndex,
      spec.scheduledAt,
      spec.courtId,
      "finalized",
    ),
  ),
  // Juego futuro: no debe contar en standings.
  makeSoftballGame(10, 6, 3, "2026-07-25T18:00:00Z", COURT_FIELD_1_ID, "scheduled"),
];

export const basketballGames: SeedGame[] = [
  {
    id: gameId(11),
    seasonId: SEASON_BASKETBALL_ID,
    divisionId: DIVISION_BASKETBALL_ID,
    homeTeamId: teamId(7),
    awayTeamId: teamId(8),
    status: "finalized",
    venueId: VENUE_ID,
    courtId: COURT_INDOOR_ID,
    scheduledAt: "2026-06-27T19:00:00Z",
    finalizedAt: new Date(
      new Date("2026-06-27T19:00:00Z").getTime() + TWO_HOURS_MS,
    ).toISOString(),
  },
];

export const games: SeedGame[] = [...softballGames, ...basketballGames];

export const eventsByGameId: ReadonlyMap<string, SeedGameEvent[]> = new Map([
  [gameId(1), buildGame1Events()],
  ...generatedSoftballSpecs.map(
    (spec): [string, SeedGameEvent[]] => [
      gameId(spec.gameIndex),
      buildGeneratedSoftballEvents(spec),
    ],
  ),
  [gameId(11), buildBasketballEvents()],
]);

export const allEvents: SeedGameEvent[] = [...eventsByGameId.values()].flat();
