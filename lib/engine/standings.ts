import { computeScore } from "./score";
import type { SportConfig, Tiebreaker } from "./sport-config";
import type { EngineGame, EngineGameEvent, StandingRow } from "./types";

/**
 * Tabla de posiciones derivada de juegos finalizados + sus game_events.
 * La vista materializada `standings` en Postgres expone estos mismos
 * agregados crudos; el orden y los desempates viven SOLO aquí, para que
 * exista una única implementación testeable.
 */

type Accumulator = Omit<StandingRow, "rank">;

interface GameResult {
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number;
  awayScore: number;
}

export interface ComputeStandingsOptions {
  /** Equipos a incluir aunque no tengan juegos finalizados (fila en ceros). */
  teamIds?: readonly string[];
}

export function computeStandings(
  games: readonly EngineGame[],
  eventsByGameId: ReadonlyMap<string, readonly EngineGameEvent[]>,
  config: SportConfig,
  options: ComputeStandingsOptions = {},
): StandingRow[] {
  const accumulators = new Map<string, Accumulator>();
  const ensure = (teamId: string): Accumulator => {
    let acc = accumulators.get(teamId);
    if (!acc) {
      acc = {
        teamId,
        played: 0,
        wins: 0,
        losses: 0,
        ties: 0,
        points: 0,
        scoreFor: 0,
        scoreAgainst: 0,
        scoreDiff: 0,
        winPct: 0,
      };
      accumulators.set(teamId, acc);
    }
    return acc;
  };

  for (const teamId of options.teamIds ?? []) ensure(teamId);

  const results: GameResult[] = [];
  for (const game of games) {
    if (game.status !== "finalized") continue;
    const events = eventsByGameId.get(game.id) ?? [];
    const score = computeScore(events, config);
    const homeScore = score.byTeam[game.homeTeamId]?.total ?? 0;
    const awayScore = score.byTeam[game.awayTeamId]?.total ?? 0;
    results.push({
      homeTeamId: game.homeTeamId,
      awayTeamId: game.awayTeamId,
      homeScore,
      awayScore,
    });
    applyResult(ensure(game.homeTeamId), homeScore, awayScore, config);
    applyResult(ensure(game.awayTeamId), awayScore, homeScore, config);
  }

  for (const acc of accumulators.values()) {
    acc.winPct =
      acc.played === 0 ? 0 : (acc.wins + 0.5 * acc.ties) / acc.played;
  }

  const rows = [...accumulators.values()];
  const primaryMetric =
    config.standings.rankBy === "points"
      ? (row: Accumulator) => row.points
      : (row: Accumulator) => row.winPct;

  const orderedClasses: Accumulator[][] = [];
  for (const tieClass of partitionDesc(rows, primaryMetric)) {
    orderedClasses.push(
      ...breakTies(tieClass, config.standings.tiebreakers, config, results),
    );
  }

  const standings: StandingRow[] = [];
  let rank = 1;
  for (const tieClass of orderedClasses) {
    const deterministic = [...tieClass].sort((a, b) =>
      a.teamId.localeCompare(b.teamId),
    );
    for (const row of deterministic) standings.push({ ...row, rank });
    rank += tieClass.length;
  }
  return standings;
}

function applyResult(
  acc: Accumulator,
  scored: number,
  conceded: number,
  config: SportConfig,
): void {
  acc.played += 1;
  acc.scoreFor += scored;
  acc.scoreAgainst += conceded;
  acc.scoreDiff = acc.scoreFor - acc.scoreAgainst;
  const { pointsFor } = config.standings;
  if (scored > conceded) {
    acc.wins += 1;
    acc.points += pointsFor.win;
  } else if (scored < conceded) {
    acc.losses += 1;
    acc.points += pointsFor.loss;
  } else {
    acc.ties += 1;
    acc.points += pointsFor.tie;
  }
}

/**
 * Aplica los desempates en orden dentro de un grupo empatado. Cuando un
 * criterio divide al grupo, cada subgrupo reinicia con la lista completa
 * (head-to-head se recalcula entre los que siguen empatados). Un grupo que
 * agota los criterios queda como clase de empate terminal: comparte rank.
 */
function breakTies(
  group: Accumulator[],
  tiebreakers: readonly Tiebreaker[],
  config: SportConfig,
  results: readonly GameResult[],
): Accumulator[][] {
  if (group.length <= 1) return [group];
  const [current, ...rest] = tiebreakers;
  if (!current) return [group];

  const metric = tiebreakerMetric(current, group, config, results);
  const classes = partitionDesc(group, metric);
  if (classes.length === 1) return breakTies(group, rest, config, results);
  return classes.flatMap((tieClass) =>
    breakTies(tieClass, config.standings.tiebreakers, config, results),
  );
}

function tiebreakerMetric(
  tiebreaker: Tiebreaker,
  group: readonly Accumulator[],
  config: SportConfig,
  results: readonly GameResult[],
): (row: Accumulator) => number {
  switch (tiebreaker) {
    case "wins":
      return (row) => row.wins;
    case "score_diff":
      return (row) => row.scoreDiff;
    case "score_for":
      return (row) => row.scoreFor;
    case "score_against":
      // Menos puntos en contra es mejor: se niega para que mayor = mejor.
      return (row) => -row.scoreAgainst;
    case "head_to_head": {
      const groupIds = new Set(group.map((row) => row.teamId));
      const mutual = new Map<
        string,
        { played: number; wins: number; ties: number; points: number }
      >();
      const ensure = (teamId: string) => {
        let entry = mutual.get(teamId);
        if (!entry) {
          entry = { played: 0, wins: 0, ties: 0, points: 0 };
          mutual.set(teamId, entry);
        }
        return entry;
      };
      const { pointsFor } = config.standings;
      for (const result of results) {
        if (!groupIds.has(result.homeTeamId) || !groupIds.has(result.awayTeamId)) {
          continue;
        }
        const home = ensure(result.homeTeamId);
        const away = ensure(result.awayTeamId);
        home.played += 1;
        away.played += 1;
        if (result.homeScore > result.awayScore) {
          home.wins += 1;
          home.points += pointsFor.win;
          away.points += pointsFor.loss;
        } else if (result.homeScore < result.awayScore) {
          away.wins += 1;
          away.points += pointsFor.win;
          home.points += pointsFor.loss;
        } else {
          home.ties += 1;
          away.ties += 1;
          home.points += pointsFor.tie;
          away.points += pointsFor.tie;
        }
      }
      return (row) => {
        const entry = mutual.get(row.teamId);
        if (!entry || entry.played === 0) return 0;
        return config.standings.rankBy === "points"
          ? entry.points
          : (entry.wins + 0.5 * entry.ties) / entry.played;
      };
    }
  }
}

/** Ordena descendente por métrica y agrupa en clases de igual valor. */
function partitionDesc<T>(
  items: readonly T[],
  metric: (item: T) => number,
): T[][] {
  const sorted = [...items].sort((a, b) => metric(b) - metric(a));
  const classes: T[][] = [];
  let current: T[] = [];
  let currentMetric = Number.NaN;
  for (const item of sorted) {
    const value = metric(item);
    if (current.length === 0 || value === currentMetric) {
      current.push(item);
    } else {
      classes.push(current);
      current = [item];
    }
    currentMetric = value;
  }
  if (current.length > 0) classes.push(current);
  return classes;
}
