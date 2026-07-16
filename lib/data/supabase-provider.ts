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
  rankStandings,
  sportConfigSchema,
  type EngineGameEvent,
  type GameStatus,
  type SportConfig,
  type StandingAggregate,
} from "@/lib/engine";
import { getSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Proveedor respaldado por Supabase. El orden de standings reutiliza
 * rankStandings del motor (misma implementación de desempates que las
 * pruebas); los agregados vienen de la matview vía public_standings y los
 * resultados por juego del caché home_score/away_score.
 */

interface LeagueRow {
  id: string;
  slug: string;
  name: string;
  sports: { key: string; name: string; config: unknown } | null;
  seasons: { id: string; name: string; status: string }[];
}

interface GameRow {
  id: string;
  status: GameStatus;
  scheduled_at: string;
  season_id: string;
  home_score: number | null;
  away_score: number | null;
  home: TeamRowRef | null;
  away: TeamRowRef | null;
}

interface TeamRowRef {
  id: string;
  name: string;
  slug: string;
  color: string | null;
}

interface EventRow {
  id: string;
  seq: number;
  game_id: string;
  team_id: string | null;
  player_id: string | null;
  event_type: string;
  payload: Record<string, unknown> | null;
  period: number | null;
  clock_seconds: number | null;
  corrects_event_id: string | null;
}

const GAME_SELECT =
  "id, status, scheduled_at, season_id, home_score, away_score, home:teams!games_home_team_id_fkey(id,name,slug,color), away:teams!games_away_team_id_fkey(id,name,slug,color)";
const EVENT_SELECT =
  "id, seq, game_id, team_id, player_id, event_type, payload, period, clock_seconds, corrects_event_id";

function toTeamRef(row: TeamRowRef | null): TeamRef {
  return row ?? { id: "", name: "—", slug: "", color: null };
}

function mapEvent(row: EventRow): EngineGameEvent {
  return {
    id: row.id,
    seq: row.seq,
    gameId: row.game_id,
    teamId: row.team_id,
    playerId: row.player_id,
    eventType: row.event_type,
    payload: row.payload ?? {},
    period: row.period,
    clockSeconds: row.clock_seconds,
    correctsEventId: row.corrects_event_id,
  };
}

async function fetchLeagues(): Promise<
  (LeagueInfo & { id: string; seasonId: string; config: SportConfig })[]
> {
  const supabase = await getSupabaseServerClient();
  const { data } = await supabase
    .from("leagues")
    .select("id, slug, name, sports(key, name, config), seasons(id, name, status)")
    .eq("is_published", true)
    .order("name");
  const rows = (data ?? []) as unknown as LeagueRow[];
  return rows.flatMap((row) => {
    const season =
      row.seasons.find((s) => s.status === "active") ?? row.seasons[0];
    if (!season || !row.sports) return [];
    const parsed = sportConfigSchema.safeParse(row.sports.config);
    if (!parsed.success) return [];
    return [
      {
        id: row.id,
        slug: row.slug,
        name: row.name,
        sportKey: row.sports.key,
        sportName: row.sports.name,
        seasonName: season.name,
        seasonId: season.id,
        config: parsed.data,
      },
    ];
  });
}

function toLeagueInfo(league: LeagueInfo): LeagueInfo {
  return {
    slug: league.slug,
    name: league.name,
    sportKey: league.sportKey,
    sportName: league.sportName,
    seasonName: league.seasonName,
  };
}

async function fetchSeasonGames(seasonId: string): Promise<GameRow[]> {
  const supabase = await getSupabaseServerClient();
  const { data } = await supabase
    .from("games")
    .select(GAME_SELECT)
    .eq("season_id", seasonId)
    .order("scheduled_at");
  return (data ?? []) as unknown as GameRow[];
}

async function liveScore(
  gameId: string,
  config: SportConfig,
): Promise<Map<string, number>> {
  const supabase = await getSupabaseServerClient();
  const { data } = await supabase
    .from("game_events")
    .select(EVENT_SELECT)
    .eq("game_id", gameId)
    .order("seq");
  const score = computeScore(
    ((data ?? []) as EventRow[]).map(mapEvent),
    config,
    { onUnknownEventType: "ignore" },
  );
  return new Map(
    Object.entries(score.byTeam).map(([teamId, value]) => [teamId, value.total]),
  );
}

async function toSummary(
  row: GameRow,
  leagueSlug: string,
  config: SportConfig,
): Promise<GameSummary> {
  let homeScore = row.home_score;
  let awayScore = row.away_score;
  if (row.status === "in_progress") {
    const totals = await liveScore(row.id, config);
    homeScore = totals.get(row.home?.id ?? "") ?? 0;
    awayScore = totals.get(row.away?.id ?? "") ?? 0;
  }
  return {
    id: row.id,
    status: row.status,
    scheduledAt: row.scheduled_at,
    leagueSlug,
    home: toTeamRef(row.home),
    away: toTeamRef(row.away),
    homeScore,
    awayScore,
  };
}

async function fetchStandingsRows(
  league: Awaited<ReturnType<typeof fetchLeagues>>[number],
  games: GameRow[],
): Promise<StandingsRowView[]> {
  const supabase = await getSupabaseServerClient();
  const { data } = await supabase
    .from("public_standings")
    .select(
      "team_id, team_name, team_slug, team_color, played, wins, losses, ties, points, score_for, score_against, score_diff",
    )
    .eq("season_id", league.seasonId);
  const raw = (data ?? []) as Array<{
    team_id: string;
    team_name: string;
    team_slug: string;
    team_color: string | null;
    played: number;
    wins: number;
    losses: number;
    ties: number;
    points: number;
    score_for: number;
    score_against: number;
    score_diff: number;
  }>;
  const aggregates: StandingAggregate[] = raw.map((row) => ({
    teamId: row.team_id,
    played: row.played,
    wins: row.wins,
    losses: row.losses,
    ties: row.ties,
    points: Number(row.points),
    scoreFor: row.score_for,
    scoreAgainst: row.score_against,
    scoreDiff: row.score_diff,
    winPct: row.played === 0 ? 0 : (row.wins + 0.5 * row.ties) / row.played,
  }));
  const results = games
    .filter((game) => game.status === "finalized")
    .map((game) => ({
      homeTeamId: game.home?.id ?? "",
      awayTeamId: game.away?.id ?? "",
      homeScore: game.home_score ?? 0,
      awayScore: game.away_score ?? 0,
    }));
  const ranked = rankStandings(aggregates, results, league.config);
  const teamMeta = new Map(
    raw.map((row) => [
      row.team_id,
      {
        id: row.team_id,
        name: row.team_name,
        slug: row.team_slug,
        color: row.team_color,
      },
    ]),
  );
  return ranked.map((row) => ({
    ...row,
    team: teamMeta.get(row.teamId) ?? {
      id: row.teamId,
      name: "—",
      slug: "",
      color: null,
    },
  }));
}

export const supabaseProvider: PublicDataProvider = {
  isLive: true,

  async getLeagues() {
    return (await fetchLeagues()).map(toLeagueInfo);
  },

  async getHome(leagueSlug) {
    const leagues = await fetchLeagues();
    const league =
      (leagueSlug ? leagues.find((l) => l.slug === leagueSlug) : undefined) ??
      leagues[0];
    if (!league) return null;
    const games = await fetchSeasonGames(league.seasonId);
    const summaries = await Promise.all(
      games.map((game) => toSummary(game, league.slug, league.config)),
    );
    const standings = await fetchStandingsRows(league, games);

    const topPlayers: TopPlayer[] = [];
    const headline = league.config.playerStatDefs[0];
    if (headline) {
      const supabase = await getSupabaseServerClient();
      const finalizedIds = games
        .filter((game) => game.status === "finalized")
        .map((game) => game.id);
      if (finalizedIds.length > 0) {
        const { data: eventRows } = await supabase
          .from("game_events")
          .select(EVENT_SELECT)
          .in("game_id", finalizedIds)
          .order("seq");
        const stats = computePlayerStats(
          ((eventRows ?? []) as EventRow[]).map(mapEvent),
          league.config,
          { onUnknownEventType: "ignore" },
        );
        const playerIds = [...stats.keys()];
        const { data: playerRows } = playerIds.length
          ? await supabase
              .from("players")
              .select("id, first_name, last_name, rosters(team_id, teams(id,name,slug,color))")
              .in("id", playerIds)
          : { data: [] };
        const meta = new Map(
          ((playerRows ?? []) as unknown as Array<{
            id: string;
            first_name: string;
            last_name: string;
            rosters: { teams: TeamRowRef | null }[];
          }>).map((row) => [
            row.id,
            {
              name: `${row.first_name} ${row.last_name}`,
              team: toTeamRef(row.rosters[0]?.teams ?? null),
            },
          ]),
        );
        topPlayers.push(
          ...[...stats.entries()]
            .map(([playerId, line]) => ({
              playerId,
              name: meta.get(playerId)?.name ?? "—",
              team: meta.get(playerId)?.team ?? toTeamRef(null),
              statKey: headline.key,
              statLabel: headline.label,
              value: line[headline.key] ?? 0,
            }))
            .filter((entry) => entry.value > 0)
            .sort((a, b) => b.value - a.value)
            .slice(0, 4),
        );
      }
    }

    return {
      leagues: leagues.map(toLeagueInfo),
      league: toLeagueInfo(league),
      liveGames: summaries.filter((game) => game.status === "in_progress"),
      upcomingGames: summaries
        .filter((game) => game.status === "scheduled")
        .slice(0, 6),
      recentResults: summaries
        .filter((game) => game.status === "finalized")
        .reverse()
        .slice(0, 6),
      standingsTop: standings.slice(0, 5),
      topPlayers,
    };
  },

  async getGameDetail(gameId) {
    const supabase = await getSupabaseServerClient();
    const { data: gameData } = await supabase
      .from("games")
      .select(GAME_SELECT)
      .eq("id", gameId)
      .maybeSingle();
    if (!gameData) return null;
    const game = gameData as unknown as GameRow;

    const leagues = await fetchLeagues();
    const league = leagues.find((l) => l.seasonId === game.season_id);
    if (!league) return null;

    const [{ data: eventRows }, { data: lineupRows }, { data: rosterRows }] =
      await Promise.all([
        supabase
          .from("game_events")
          .select(EVENT_SELECT)
          .eq("game_id", gameId)
          .order("seq"),
        supabase
          .from("game_lineups")
          .select("team_id, player_id, batting_order, players(first_name, last_name)")
          .eq("game_id", gameId)
          .eq("is_starter", true)
          .order("batting_order"),
        supabase
          .from("rosters")
          .select("team_id, player_id, jersey_number, players(first_name, last_name)")
          .in("team_id", [game.home?.id ?? "", game.away?.id ?? ""]),
      ]);

    const playerNames: Record<string, string> = {};
    const jerseyByPlayer = new Map<string, string | null>();
    for (const row of (rosterRows ?? []) as unknown as Array<{
      team_id: string;
      player_id: string;
      jersey_number: string | null;
      players: { first_name: string; last_name: string } | null;
    }>) {
      playerNames[row.player_id] =
        `${row.players?.first_name ?? "—"} ${row.players?.last_name ?? ""}`;
      jerseyByPlayer.set(row.player_id, row.jersey_number);
    }

    const lineups: Record<string, LineupEntry[]> = {};
    for (const row of (lineupRows ?? []) as unknown as Array<{
      team_id: string;
      player_id: string;
      batting_order: number | null;
      players: { first_name: string; last_name: string } | null;
    }>) {
      (lineups[row.team_id] ??= []).push({
        playerId: row.player_id,
        name: `${row.players?.first_name ?? "—"} ${row.players?.last_name ?? ""}`,
        jerseyNumber: jerseyByPlayer.get(row.player_id) ?? null,
        battingOrder: row.batting_order,
      });
    }

    return {
      game: await toSummary(game, league.slug, league.config),
      league: toLeagueInfo(league),
      sportConfig: league.config,
      events: ((eventRows ?? []) as EventRow[]).map(mapEvent),
      lineups,
      playerNames,
    };
  },

  async getStandings(leagueSlug) {
    const leagues = await fetchLeagues();
    const league =
      (leagueSlug ? leagues.find((l) => l.slug === leagueSlug) : undefined) ??
      leagues[0];
    if (!league) return null;
    const games = await fetchSeasonGames(league.seasonId);
    return {
      league: toLeagueInfo(league),
      rows: await fetchStandingsRows(league, games),
    };
  },

  async getTeamProfile(slug) {
    const supabase = await getSupabaseServerClient();
    const { data: teamData } = await supabase
      .from("teams")
      .select("id, name, slug, color, division_id, divisions(season_id)")
      .eq("slug", slug)
      .maybeSingle();
    if (!teamData) return null;
    const team = teamData as unknown as {
      id: string;
      name: string;
      slug: string;
      color: string | null;
      divisions: { season_id: string } | null;
    };
    const leagues = await fetchLeagues();
    const league = leagues.find(
      (l) => l.seasonId === team.divisions?.season_id,
    );
    if (!league) return null;
    const games = await fetchSeasonGames(league.seasonId);
    const own = games.filter(
      (game) => game.home?.id === team.id || game.away?.id === team.id,
    );
    const summaries = await Promise.all(
      own.map((game) => toSummary(game, league.slug, league.config)),
    );
    const standings = await fetchStandingsRows(league, games);

    const { data: rosterRows } = await supabase
      .from("rosters")
      .select("player_id, jersey_number, players(first_name, last_name)")
      .eq("team_id", team.id)
      .eq("status", "active");
    const roster: LineupEntry[] = (
      (rosterRows ?? []) as unknown as Array<{
        player_id: string;
        jersey_number: string | null;
        players: { first_name: string; last_name: string } | null;
      }>
    )
      .map((row) => ({
        playerId: row.player_id,
        name: `${row.players?.first_name ?? "—"} ${row.players?.last_name ?? ""}`,
        jerseyNumber: row.jersey_number,
        battingOrder: null,
      }))
      .sort((a, b) => Number(a.jerseyNumber) - Number(b.jerseyNumber));

    const streak = summaries
      .filter((game) => game.status === "finalized")
      .reverse()
      .slice(0, 5)
      .map((game) => {
        const own2 = game.home.id === team.id ? game.homeScore : game.awayScore;
        const rival = game.home.id === team.id ? game.awayScore : game.homeScore;
        if ((own2 ?? 0) > (rival ?? 0)) return "W" as const;
        if ((own2 ?? 0) < (rival ?? 0)) return "L" as const;
        return "T" as const;
      });

    return {
      team: { id: team.id, name: team.name, slug: team.slug, color: team.color },
      league: toLeagueInfo(league),
      standing: standings.find((row) => row.teamId === team.id) ?? null,
      roster,
      games: summaries,
      streak,
    };
  },

  async getPlayerProfile(playerId) {
    const supabase = await getSupabaseServerClient();
    const { data: playerData } = await supabase
      .from("players")
      .select(
        "id, first_name, last_name, rosters(team_id, jersey_number, position, teams(id, name, slug, color, divisions(season_id)))",
      )
      .eq("id", playerId)
      .maybeSingle();
    if (!playerData) return null;
    const player = playerData as unknown as {
      id: string;
      first_name: string;
      last_name: string;
      rosters: Array<{
        team_id: string;
        jersey_number: string | null;
        position: string | null;
        teams: (TeamRowRef & { divisions: { season_id: string } | null }) | null;
      }>;
    };
    const rosterEntry = player.rosters[0];
    const teamRow = rosterEntry?.teams;
    if (!rosterEntry || !teamRow) return null;
    const leagues = await fetchLeagues();
    const league = leagues.find(
      (l) => l.seasonId === teamRow.divisions?.season_id,
    );
    if (!league) return null;

    const games = (await fetchSeasonGames(league.seasonId)).filter(
      (game) =>
        game.status === "finalized" &&
        (game.home?.id === teamRow.id || game.away?.id === teamRow.id),
    );
    const gameIds = games.map((game) => game.id);
    const { data: eventRows } = gameIds.length
      ? await supabase
          .from("game_events")
          .select(EVENT_SELECT)
          .in("game_id", gameIds)
          .or(`player_id.eq.${playerId},event_type.eq.correction`)
          .order("seq")
      : { data: [] };
    const eventsByGame = new Map<string, EngineGameEvent[]>();
    for (const row of (eventRows ?? []) as EventRow[]) {
      const list = eventsByGame.get(row.game_id) ?? [];
      list.push(mapEvent(row));
      eventsByGame.set(row.game_id, list);
    }

    const perGame = games.map((game) => {
      const stats = computePlayerStats(
        eventsByGame.get(game.id) ?? [],
        league.config,
        { onUnknownEventType: "ignore" },
      );
      const opponent =
        game.home?.id === teamRow.id ? game.away?.name : game.home?.name;
      return {
        gameId: game.id,
        opponentName: opponent ?? "—",
        scheduledAt: game.scheduled_at,
        statLine:
          stats.get(playerId) ??
          Object.fromEntries(
            league.config.playerStatDefs.map((def) => [def.key, 0]),
          ),
      };
    });
    const seasonTotals: Record<string, number> = {};
    for (const def of league.config.playerStatDefs) {
      seasonTotals[def.key] = perGame.reduce(
        (sum, line) => sum + (line.statLine[def.key] ?? 0),
        0,
      );
    }

    return {
      playerId,
      name: `${player.first_name} ${player.last_name}`,
      jerseyNumber: rosterEntry.jersey_number,
      position: rosterEntry.position,
      team: toTeamRef(teamRow),
      league: toLeagueInfo(league),
      statDefs: league.config.playerStatDefs.map((def) => ({
        key: def.key,
        label: def.label,
      })),
      seasonTotals,
      perGame,
    };
  },

  async search(query) {
    const q = query.trim();
    const empty: SearchResults = { query, teams: [], players: [], games: [] };
    if (q.length < 2) return empty;
    const supabase = await getSupabaseServerClient();
    const pattern = `%${q}%`;

    const [{ data: teamRows }, { data: playerRows }] = await Promise.all([
      supabase
        .from("teams")
        .select("id, name, slug, color, divisions(seasons(leagues(name)))")
        .ilike("name", pattern)
        .limit(6),
      supabase
        .from("players")
        .select("id, first_name, last_name, rosters(teams(name))")
        .or(`first_name.ilike.${pattern},last_name.ilike.${pattern}`)
        .limit(8),
    ]);

    const teams = (
      (teamRows ?? []) as unknown as Array<{
        id: string;
        name: string;
        slug: string;
        color: string | null;
        divisions: { seasons: { leagues: { name: string } | null } | null } | null;
      }>
    ).map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      color: row.color,
      leagueName: row.divisions?.seasons?.leagues?.name ?? "",
    }));

    let games: GameSummary[] = [];
    const teamIds = teams.map((team) => team.id);
    if (teamIds.length > 0) {
      const { data: gameRows } = await supabase
        .from("games")
        .select(GAME_SELECT)
        .or(
          `home_team_id.in.(${teamIds.join(",")}),away_team_id.in.(${teamIds.join(",")})`,
        )
        .order("scheduled_at", { ascending: false })
        .limit(6);
      const leagues = await fetchLeagues();
      games = await Promise.all(
        ((gameRows ?? []) as unknown as GameRow[]).flatMap((row) => {
          const league = leagues.find((l) => l.seasonId === row.season_id);
          return league ? [toSummary(row, league.slug, league.config)] : [];
        }),
      );
    }

    return {
      query,
      teams,
      players: (
        (playerRows ?? []) as unknown as Array<{
          id: string;
          first_name: string;
          last_name: string;
          rosters: { teams: { name: string } | null }[];
        }>
      ).map((row) => ({
        playerId: row.id,
        name: `${row.first_name} ${row.last_name}`,
        teamName: row.rosters[0]?.teams?.name ?? "—",
      })),
      games,
    };
  },
};
