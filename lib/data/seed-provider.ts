import type {
  GameSummary,
  LeagueInfo,
  LineupEntry,
  PublicDataProvider,
  SearchResults,
  StandingsRowView,
  TeamRef,
  TopPlayer,
} from "./types";
import {
  computePlayerStats,
  computeScore,
  computeStandings,
  type SportConfig,
} from "@/lib/engine";
import {
  eventsByGameId,
  games as seedGames,
  leagues as seedLeagues,
  players as seedPlayers,
  rosters as seedRosters,
  seasons as seedSeasons,
  sports as seedSports,
  teams as seedTeams,
  type SeedGame,
} from "@/lib/seed-data";
import { compareJerseyNumber } from "@/lib/utils";

/**
 * Proveedor local: la experiencia pública completa calculada desde
 * lib/seed-data con el motor — la misma fuente que genera seed.sql y
 * alimenta las pruebas. Sin red, sin base de datos.
 */

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

const sportById = new Map(seedSports.map((sport) => [sport.id, sport]));
const seasonById = new Map(seedSeasons.map((season) => [season.id, season]));

const leagueInfos: LeagueInfo[] = seedLeagues.map((league) => {
  const sport = sportById.get(league.sportId);
  const season = seedSeasons.find((s) => s.leagueId === league.id);
  return {
    slug: league.slug,
    name: league.name,
    sportKey: sport?.key ?? "",
    sportName: sport?.name ?? "",
    seasonName: season?.name ?? "",
    // El seed de demo no trae identidad propia: cae al monograma/acento ALV.
    logoUrl: null,
    color: null,
  };
});

const leagueBySlug = new Map(leagueInfos.map((info) => [info.slug, info]));

const configByLeagueSlug = new Map<string, SportConfig>(
  seedLeagues.map((league) => [
    league.slug,
    sportById.get(league.sportId)?.config as SportConfig,
  ]),
);

function leagueSlugOfSeason(seasonId: string): string {
  const season = seasonById.get(seasonId);
  const league = seedLeagues.find((l) => l.id === season?.leagueId);
  return league?.slug ?? "";
}

const teamRefById = new Map<string, TeamRef>(
  seedTeams.map((team) => [
    team.id,
    { id: team.id, name: team.name, slug: team.slug, color: team.color },
  ]),
);

const teamBySlug = new Map(seedTeams.map((team) => [team.slug, team]));
const playerById = new Map(seedPlayers.map((player) => [player.id, player]));
const rosterEntryByPlayer = new Map(
  seedRosters.map((entry) => [entry.playerId, entry]),
);

function playerName(playerId: string): string {
  const player = playerById.get(playerId);
  return player ? `${player.firstName} ${player.lastName}` : "—";
}

function toSummary(game: SeedGame): GameSummary {
  const leagueSlug = leagueSlugOfSeason(game.seasonId);
  const config = configByLeagueSlug.get(leagueSlug);
  let homeScore: number | null = null;
  let awayScore: number | null = null;
  if (game.status !== "scheduled" && config) {
    const score = computeScore(eventsByGameId.get(game.id) ?? [], config);
    homeScore = score.byTeam[game.homeTeamId]?.total ?? 0;
    awayScore = score.byTeam[game.awayTeamId]?.total ?? 0;
  }
  const fallback: TeamRef = { id: "", name: "—", slug: "", color: null };
  return {
    id: game.id,
    status: game.status,
    scheduledAt: game.scheduledAt,
    leagueSlug,
    home: teamRefById.get(game.homeTeamId) ?? fallback,
    away: teamRefById.get(game.awayTeamId) ?? fallback,
    homeScore,
    awayScore,
  };
}

const allSummaries = seedGames.map(toSummary);

function leagueGames(leagueSlug: string): GameSummary[] {
  return allSummaries.filter((game) => game.leagueSlug === leagueSlug);
}

function leagueStandings(leagueSlug: string): StandingsRowView[] {
  const config = configByLeagueSlug.get(leagueSlug);
  if (!config) return [];
  const games = seedGames.filter(
    (game) => leagueSlugOfSeason(game.seasonId) === leagueSlug,
  );
  const teamIds = [
    ...new Set(games.flatMap((game) => [game.homeTeamId, game.awayTeamId])),
  ];
  const rows = computeStandings(games, eventsByGameId, config, { teamIds });
  return rows.map((row) => ({
    ...row,
    team: teamRefById.get(row.teamId) ?? {
      id: row.teamId,
      name: "—",
      slug: "",
      color: null,
    },
  }));
}

function leagueTopPlayers(leagueSlug: string): TopPlayer[] {
  const config = configByLeagueSlug.get(leagueSlug);
  if (!config) return [];
  const headline = config.playerStatDefs[0];
  if (!headline) return [];
  const games = seedGames.filter(
    (game) =>
      leagueSlugOfSeason(game.seasonId) === leagueSlug &&
      game.status === "finalized",
  );
  const events = games.flatMap((game) => eventsByGameId.get(game.id) ?? []);
  const stats = computePlayerStats(events, config);
  return [...stats.entries()]
    .map(([playerId, line]) => ({
      playerId,
      name: playerName(playerId),
      team:
        teamRefById.get(rosterEntryByPlayer.get(playerId)?.teamId ?? "") ?? {
          id: "",
          name: "—",
          slug: "",
          color: null,
        },
      statKey: headline.key,
      statLabel: headline.label,
      value: line[headline.key] ?? 0,
    }))
    .filter((entry) => entry.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 4);
}

function rosterOfTeam(teamId: string): LineupEntry[] {
  return seedRosters
    .filter((entry) => entry.teamId === teamId)
    .map((entry) => ({
      playerId: entry.playerId,
      name: playerName(entry.playerId),
      jerseyNumber: entry.jerseyNumber,
      battingOrder: null,
    }))
    .sort(
      (a, b) =>
        compareJerseyNumber(a.jerseyNumber, b.jerseyNumber) ||
        a.name.localeCompare(b.name),
    );
}

export const seedProvider: PublicDataProvider = {
  isLive: false,

  async getLeagues() {
    return leagueInfos;
  },

  async getHome(leagueSlug) {
    const league =
      (leagueSlug ? leagueBySlug.get(leagueSlug) : undefined) ?? leagueInfos[0];
    if (!league) return null;
    const games = leagueGames(league.slug);
    const byDateAsc = (a: GameSummary, b: GameSummary) =>
      a.scheduledAt.localeCompare(b.scheduledAt);
    return {
      leagues: leagueInfos,
      league,
      liveGames: games.filter((game) => game.status === "in_progress"),
      upcomingGames: games
        .filter((game) => game.status === "scheduled")
        .sort(byDateAsc)
        .slice(0, 6),
      recentResults: games
        .filter((game) => game.status === "finalized")
        .sort((a, b) => byDateAsc(b, a))
        .slice(0, 6),
      standingsTop: leagueStandings(league.slug).slice(0, 5),
      topPlayers: leagueTopPlayers(league.slug),
    };
  },

  async getGameDetail(gameId) {
    const game = seedGames.find((g) => g.id === gameId);
    if (!game) return null;
    const leagueSlug = leagueSlugOfSeason(game.seasonId);
    const league = leagueBySlug.get(leagueSlug);
    const config = configByLeagueSlug.get(leagueSlug);
    if (!league || !config) return null;
    const names: Record<string, string> = {};
    for (const teamId of [game.homeTeamId, game.awayTeamId]) {
      for (const entry of rosterOfTeam(teamId)) {
        names[entry.playerId] = entry.name;
      }
    }
    return {
      game: toSummary(game),
      league,
      sportConfig: config,
      events: eventsByGameId.get(game.id) ?? [],
      // El seed no trae alineaciones confirmadas: roster completo.
      lineups: {
        [game.awayTeamId]: rosterOfTeam(game.awayTeamId),
        [game.homeTeamId]: rosterOfTeam(game.homeTeamId),
      },
      playerNames: names,
    };
  },

  async getStandings(leagueSlug) {
    const league =
      (leagueSlug ? leagueBySlug.get(leagueSlug) : undefined) ?? leagueInfos[0];
    if (!league) return null;
    return { league, rows: leagueStandings(league.slug) };
  },

  async getTeamProfile(slug) {
    const team = teamBySlug.get(slug);
    if (!team) return null;
    const division = seedTeams.find((t) => t.id === team.id);
    if (!division) return null;
    const games = allSummaries
      .filter((game) => game.home.id === team.id || game.away.id === team.id)
      .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
    const leagueSlug = games[0]?.leagueSlug ?? leagueInfos[0]?.slug ?? "";
    const league = leagueBySlug.get(leagueSlug);
    if (!league) return null;
    const standing =
      leagueStandings(leagueSlug).find((row) => row.teamId === team.id) ?? null;
    const streak = games
      .filter((game) => game.status === "finalized")
      .reverse()
      .slice(0, 5)
      .map((game) => {
        const own = game.home.id === team.id ? game.homeScore : game.awayScore;
        const rival = game.home.id === team.id ? game.awayScore : game.homeScore;
        if ((own ?? 0) > (rival ?? 0)) return "W" as const;
        if ((own ?? 0) < (rival ?? 0)) return "L" as const;
        return "T" as const;
      });
    return {
      team: teamRefById.get(team.id) ?? {
        id: team.id,
        name: team.name,
        slug: team.slug,
        color: team.color,
      },
      league,
      standing,
      roster: rosterOfTeam(team.id),
      games,
      streak,
    };
  },

  async getPlayerProfile(playerId) {
    const player = playerById.get(playerId);
    const rosterEntry = rosterEntryByPlayer.get(playerId);
    if (!player || !rosterEntry) return null;
    const team = teamRefById.get(rosterEntry.teamId);
    if (!team) return null;
    const teamGames = seedGames
      .filter(
        (game) =>
          (game.homeTeamId === team.id || game.awayTeamId === team.id) &&
          game.status === "finalized",
      )
      .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
    const leagueSlug = leagueSlugOfSeason(teamGames[0]?.seasonId ?? "");
    const league = leagueBySlug.get(leagueSlug);
    const config = configByLeagueSlug.get(leagueSlug);
    if (!league || !config) return null;

    const perGame = teamGames.map((game) => {
      const stats = computePlayerStats(eventsByGameId.get(game.id) ?? [], config);
      const opponentId =
        game.homeTeamId === team.id ? game.awayTeamId : game.homeTeamId;
      return {
        gameId: game.id,
        opponentName: teamRefById.get(opponentId)?.name ?? "—",
        scheduledAt: game.scheduledAt,
        statLine:
          stats.get(playerId) ??
          Object.fromEntries(config.playerStatDefs.map((def) => [def.key, 0])),
      };
    });
    const seasonTotals: Record<string, number> = {};
    for (const def of config.playerStatDefs) {
      seasonTotals[def.key] = perGame.reduce(
        (sum, line) => sum + (line.statLine[def.key] ?? 0),
        0,
      );
    }
    return {
      playerId,
      name: playerName(playerId),
      jerseyNumber: rosterEntry.jerseyNumber,
      position: rosterEntry.position,
      team,
      league,
      statDefs: config.playerStatDefs.map((def) => ({
        key: def.key,
        label: def.label,
      })),
      seasonTotals,
      perGame,
    };
  },

  async search(query) {
    const q = normalize(query.trim());
    const empty: SearchResults = { query, teams: [], players: [], games: [] };
    if (q.length < 2) return empty;

    const matchedTeams = seedTeams.filter((team) =>
      normalize(team.name).includes(q),
    );
    const players = seedPlayers
      .filter((player) =>
        normalize(`${player.firstName} ${player.lastName}`).includes(q),
      )
      .slice(0, 8)
      .map((player) => ({
        playerId: player.id,
        name: `${player.firstName} ${player.lastName}`,
        teamName:
          teamRefById.get(rosterEntryByPlayer.get(player.id)?.teamId ?? "")
            ?.name ?? "—",
      }));
    const matchedTeamIds = new Set(matchedTeams.map((team) => team.id));
    const games = allSummaries
      .filter(
        (game) =>
          matchedTeamIds.has(game.home.id) || matchedTeamIds.has(game.away.id),
      )
      .slice(0, 6);
    return {
      query,
      teams: matchedTeams.map((team) => ({
        id: team.id,
        name: team.name,
        slug: team.slug,
        color: team.color,
        leagueName:
          leagueBySlug.get(
            leagueSlugOfSeason(
              seedGames.find(
                (game) =>
                  game.homeTeamId === team.id || game.awayTeamId === team.id,
              )?.seasonId ?? "",
            ),
          )?.name ?? "",
      })),
      players,
      games,
    };
  },
};
