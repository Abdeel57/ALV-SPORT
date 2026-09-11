import type {
  GameSummary,
  LeagueInfo,
  LineupEntry,
  PublicDataProvider,
  SearchResults,
  StandingsRowView,
  TeamRef,
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
import { getDb } from "@/lib/db/request";
import { sql, type SqlQuery } from "@/lib/db/sql";
import { compareJerseyNumber } from "@/lib/utils";
import { buildStatCategories } from "./stat-leaders";

/**
 * Proveedor del sitio público leyendo Postgres directo.
 *
 * Sustituye a supabase-provider sin cambiar una sola regla de negocio: el
 * marcador, los desempates y las estadísticas los sigue calculando el motor
 * en /lib/engine. Lo único que cambia es de dónde salen las filas —antes
 * PostgREST por HTTP, ahora SQL— y las consultas corren con el rol `anon`
 * o `authenticated`, así que el RLS se aplica igual que antes.
 */

interface TeamRowRef {
  id: string;
  name: string;
  slug: string;
  color: string | null;
  logo_url: string | null;
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

interface LeagueRecord extends LeagueInfo {
  id: string;
  seasonId: string;
  config: SportConfig;
}

/** Columnas de un partido con sus dos equipos ya embebidos como JSON. */
const GAME_COLUMNS: SqlQuery = sql`
  g.id, g.status, g.scheduled_at, g.season_id, g.home_score, g.away_score,
  case when h.id is null then null else
    json_build_object('id', h.id, 'name', h.name, 'slug', h.slug,
                      'color', h.color, 'logo_url', h.logo_url) end as home,
  case when a.id is null then null else
    json_build_object('id', a.id, 'name', a.name, 'slug', a.slug,
                      'color', a.color, 'logo_url', a.logo_url) end as away
`;

const GAME_FROM: SqlQuery = sql`
  from public.games g
  left join public.teams h on h.id = g.home_team_id
  left join public.teams a on a.id = g.away_team_id
`;

const EVENT_COLUMNS: SqlQuery = sql`
  id, seq, game_id, team_id, player_id, event_type, payload, period,
  clock_seconds, corrects_event_id
`;

function toTeamRef(row: TeamRowRef | null): TeamRef {
  if (!row) return { id: "", name: "—", slug: "", color: null, logoUrl: null };
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    color: row.color,
    logoUrl: row.logo_url,
  };
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

function fullName(first: string | null, last: string | null): string {
  return `${first ?? "—"} ${last ?? ""}`;
}

/** Escapa los comodines de LIKE para que el texto del usuario se busque literal. */
function likePattern(term: string): string {
  return `%${term.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

interface LeagueQueryRow {
  id: string;
  slug: string;
  name: string;
  logo_url: string | null;
  color: string | null;
  sport_key: string;
  sport_name: string;
  sport_config: unknown;
  seasons: { id: string; name: string; status: string }[] | null;
}

async function fetchLeagues(): Promise<LeagueRecord[]> {
  const db = await getDb();
  const rows = await db.rows<LeagueQueryRow>(sql`
    select l.id, l.slug, l.name, l.logo_url, l.color,
           sp.key as sport_key, sp.name as sport_name, sp.config as sport_config,
           coalesce((
             select json_agg(
                      json_build_object('id', se.id, 'name', se.name, 'status', se.status)
                      order by se.created_at
                    )
               from public.seasons se
              where se.league_id = l.id
           ), '[]'::json) as seasons
      from public.leagues l
      join public.sports sp on sp.id = l.sport_id
     where l.is_published
     order by l.name
  `);

  return rows.flatMap((row) => {
    const seasons = row.seasons ?? [];
    const season = seasons.find((s) => s.status === "active") ?? seasons[0];
    if (!season) return [];
    const parsed = sportConfigSchema.safeParse(row.sport_config);
    if (!parsed.success) return [];
    return [
      {
        id: row.id,
        slug: row.slug,
        name: row.name,
        sportKey: row.sport_key,
        sportName: row.sport_name,
        seasonName: season.name,
        logoUrl: row.logo_url,
        color: row.color,
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
    logoUrl: league.logoUrl,
    color: league.color,
  };
}

async function fetchSeasonGames(seasonId: string): Promise<GameRow[]> {
  const db = await getDb();
  return db.rows<GameRow>(sql`
    select ${GAME_COLUMNS} ${GAME_FROM}
     where g.season_id = ${seasonId}
     order by g.scheduled_at
  `);
}

async function fetchEvents(gameIds: readonly string[]): Promise<EventRow[]> {
  if (gameIds.length === 0) return [];
  const db = await getDb();
  return db.rows<EventRow>(sql`
    select ${EVENT_COLUMNS}
      from public.game_events
     where game_id = any(${[...gameIds]}::uuid[])
     order by seq
  `);
}

/**
 * Marcador en vivo de varios partidos en UNA consulta. El proveedor anterior
 * pedía los eventos partido por partido; el resultado es idéntico porque lo
 * calcula el mismo motor, pero la portada deja de hacer N viajes a la base.
 */
async function liveScores(
  gameIds: readonly string[],
  config: SportConfig,
): Promise<Map<string, Map<string, number>>> {
  const rows = await fetchEvents(gameIds);
  const byGame = new Map<string, EngineGameEvent[]>();
  for (const row of rows) {
    const list = byGame.get(row.game_id) ?? [];
    list.push(mapEvent(row));
    byGame.set(row.game_id, list);
  }
  const result = new Map<string, Map<string, number>>();
  for (const gameId of gameIds) {
    const score = computeScore(byGame.get(gameId) ?? [], config, {
      onUnknownEventType: "ignore",
    });
    result.set(
      gameId,
      new Map(
        Object.entries(score.byTeam).map(([teamId, value]) => [teamId, value.total]),
      ),
    );
  }
  return result;
}

/** Convierte filas de partido a resúmenes, resolviendo los que están en vivo. */
async function toSummaries(
  rows: readonly GameRow[],
  leagueSlug: string,
  config: SportConfig,
): Promise<GameSummary[]> {
  const liveIds = rows.filter((row) => row.status === "in_progress").map((r) => r.id);
  const totals = await liveScores(liveIds, config);

  return rows.map((row) => {
    let homeScore = row.home_score;
    let awayScore = row.away_score;
    if (row.status === "in_progress") {
      const score = totals.get(row.id);
      homeScore = score?.get(row.home?.id ?? "") ?? 0;
      awayScore = score?.get(row.away?.id ?? "") ?? 0;
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
  });
}

interface StandingsQueryRow {
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
}

async function fetchStandingsRows(
  league: LeagueRecord,
  games: readonly GameRow[],
): Promise<StandingsRowView[]> {
  const db = await getDb();
  const raw = await db.rows<StandingsQueryRow>(sql`
    select team_id, team_name, team_slug, team_color, played, wins, losses,
           ties, points, score_for, score_against, score_diff
      from public.public_standings
     where season_id = ${league.seasonId}
  `);

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

interface RosterMetaRow {
  player_id: string;
  status: string;
  first_name: string | null;
  last_name: string | null;
  team_id: string | null;
  team_name: string | null;
  team_slug: string | null;
  team_color: string | null;
  team_logo_url: string | null;
}

async function fetchLeagueStatData(
  league: LeagueRecord,
  games: readonly GameRow[],
): Promise<{
  categories: ReturnType<typeof buildStatCategories>;
  finalizedGames: number;
  playersWithStats: number;
}> {
  const finalized = games.filter((game) => game.status === "finalized");
  const gameIds = finalized.map((game) => game.id);
  if (gameIds.length === 0) {
    return {
      categories: buildStatCategories(new Map(), league.config.playerStatDefs, new Map()),
      finalizedGames: 0,
      playersWithStats: 0,
    };
  }

  const stats = computePlayerStats(
    (await fetchEvents(gameIds)).map(mapEvent),
    league.config,
    { onUnknownEventType: "ignore" },
  );
  const playerIds = [...stats.keys()];
  const teamIds = [
    ...new Set(
      finalized.flatMap((game) =>
        [game.home?.id, game.away?.id].filter((id): id is string => Boolean(id)),
      ),
    ),
  ];

  const db = await getDb();
  const rosterRows =
    playerIds.length > 0 && teamIds.length > 0
      ? await db.rows<RosterMetaRow>(sql`
          select r.player_id, r.status::text as status,
                 p.first_name, p.last_name,
                 t.id as team_id, t.name as team_name, t.slug as team_slug,
                 t.color as team_color, t.logo_url as team_logo_url
            from public.rosters r
            join public.players p on p.id = r.player_id
            left join public.teams t on t.id = r.team_id
           where r.player_id = any(${playerIds}::uuid[])
             and r.team_id = any(${teamIds}::uuid[])
           order by r.status asc
        `)
      : [];

  const playerMeta = new Map<string, { name: string; team: TeamRef }>();
  for (const row of rosterRows) {
    // El roster activo tiene prioridad si existen registros históricos.
    if (playerMeta.has(row.player_id) && row.status !== "active") continue;
    playerMeta.set(row.player_id, {
      name: fullName(row.first_name, row.last_name).trim(),
      team: toTeamRef(
        row.team_id
          ? {
              id: row.team_id,
              name: row.team_name ?? "—",
              slug: row.team_slug ?? "",
              color: row.team_color,
              logo_url: row.team_logo_url,
            }
          : null,
      ),
    });
  }

  return {
    categories: buildStatCategories(stats, league.config.playerStatDefs, playerMeta),
    finalizedGames: finalized.length,
    playersWithStats: playerMeta.size,
  };
}

async function pickLeague(leagueSlug?: string): Promise<LeagueRecord | null> {
  const leagues = await fetchLeagues();
  return (
    (leagueSlug ? leagues.find((league) => league.slug === leagueSlug) : undefined) ??
    leagues[0] ??
    null
  );
}

export const postgresProvider: PublicDataProvider = {
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
    const summaries = await toSummaries(games, league.slug, league.config);
    const standings = await fetchStandingsRows(league, games);
    const statData = await fetchLeagueStatData(league, games);

    return {
      leagues: leagues.map(toLeagueInfo),
      league: toLeagueInfo(league),
      liveGames: summaries.filter((game) => game.status === "in_progress"),
      upcomingGames: summaries.filter((game) => game.status === "scheduled").slice(0, 6),
      recentResults: summaries
        .filter((game) => game.status === "finalized")
        .reverse()
        .slice(0, 6),
      standingsTop: standings.slice(0, 5),
      topPlayers: statData.categories[0]?.leaders.slice(0, 4) ?? [],
    };
  },

  async getGameDetail(gameId) {
    const db = await getDb();
    const game = await db.maybeOne<GameRow>(sql`
      select ${GAME_COLUMNS} ${GAME_FROM} where g.id = ${gameId} limit 1
    `);
    if (!game) return null;

    const leagues = await fetchLeagues();
    const league = leagues.find((l) => l.seasonId === game.season_id);
    if (!league) return null;

    const teamIds = [game.home?.id, game.away?.id].filter(
      (id): id is string => Boolean(id),
    );

    const [eventRows, lineupRows, rosterRows] = await Promise.all([
      fetchEvents([gameId]),
      db.rows<{
        team_id: string;
        player_id: string;
        batting_order: number | null;
        first_name: string | null;
        last_name: string | null;
      }>(sql`
        select gl.team_id, gl.player_id, gl.batting_order, p.first_name, p.last_name
          from public.game_lineups gl
          join public.players p on p.id = gl.player_id
         where gl.game_id = ${gameId} and gl.is_starter
         order by gl.batting_order
      `),
      teamIds.length > 0
        ? db.rows<{
            team_id: string;
            player_id: string;
            jersey_number: string | null;
            first_name: string | null;
            last_name: string | null;
          }>(sql`
            select r.team_id, r.player_id, r.jersey_number, p.first_name, p.last_name
              from public.rosters r
              join public.players p on p.id = r.player_id
             where r.team_id = any(${teamIds}::uuid[])
          `)
        : Promise.resolve([]),
    ]);

    const playerNames: Record<string, string> = {};
    const jerseyByPlayer = new Map<string, string | null>();
    for (const row of rosterRows) {
      playerNames[row.player_id] = fullName(row.first_name, row.last_name);
      jerseyByPlayer.set(row.player_id, row.jersey_number);
    }

    const lineups: Record<string, LineupEntry[]> = {};
    for (const row of lineupRows) {
      (lineups[row.team_id] ??= []).push({
        playerId: row.player_id,
        name: fullName(row.first_name, row.last_name),
        jerseyNumber: jerseyByPlayer.get(row.player_id) ?? null,
        battingOrder: row.batting_order,
      });
    }

    const [summary] = await toSummaries([game], league.slug, league.config);
    if (!summary) return null;

    return {
      game: summary,
      league: toLeagueInfo(league),
      sportConfig: league.config,
      events: eventRows.map(mapEvent),
      lineups,
      playerNames,
    };
  },

  async getStandings(leagueSlug) {
    const league = await pickLeague(leagueSlug);
    if (!league) return null;
    const games = await fetchSeasonGames(league.seasonId);
    return {
      league: toLeagueInfo(league),
      rows: await fetchStandingsRows(league, games),
    };
  },

  async getLeagueStats(leagueSlug) {
    const league = await pickLeague(leagueSlug);
    if (!league) return null;
    const games = await fetchSeasonGames(league.seasonId);
    return {
      league: toLeagueInfo(league),
      ...(await fetchLeagueStatData(league, games)),
    };
  },

  async getTeamProfile(slug) {
    const db = await getDb();
    const team = await db.maybeOne<{
      id: string;
      name: string;
      slug: string;
      color: string | null;
      season_id: string | null;
    }>(sql`
      select t.id, t.name, t.slug, t.color, d.season_id
        from public.teams t
        left join public.divisions d on d.id = t.division_id
       where t.slug = ${slug}
       limit 1
    `);
    if (!team) return null;

    const leagues = await fetchLeagues();
    const league = leagues.find((l) => l.seasonId === team.season_id);
    if (!league) return null;

    const games = await fetchSeasonGames(league.seasonId);
    const own = games.filter(
      (game) => game.home?.id === team.id || game.away?.id === team.id,
    );
    const summaries = await toSummaries(own, league.slug, league.config);
    const standings = await fetchStandingsRows(league, games);

    const rosterRows = await db.rows<{
      player_id: string;
      jersey_number: string | null;
      first_name: string | null;
      last_name: string | null;
    }>(sql`
      select r.player_id, r.jersey_number, p.first_name, p.last_name
        from public.rosters r
        join public.players p on p.id = r.player_id
       where r.team_id = ${team.id} and r.status = 'active'
    `);

    const roster: LineupEntry[] = rosterRows
      .map((row) => ({
        playerId: row.player_id,
        name: fullName(row.first_name, row.last_name),
        jerseyNumber: row.jersey_number,
        battingOrder: null,
      }))
      .sort(
        (a, b) =>
          compareJerseyNumber(a.jerseyNumber, b.jerseyNumber) ||
          a.name.localeCompare(b.name),
      );

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
    const db = await getDb();
    const player = await db.maybeOne<{
      id: string;
      first_name: string;
      last_name: string;
      jersey_number: string | null;
      position: string | null;
      team_id: string | null;
      team_name: string | null;
      team_slug: string | null;
      team_color: string | null;
      team_logo_url: string | null;
      season_id: string | null;
    }>(sql`
      select p.id, p.first_name, p.last_name,
             r.jersey_number, r.position,
             t.id as team_id, t.name as team_name, t.slug as team_slug,
             t.color as team_color, t.logo_url as team_logo_url,
             d.season_id
        from public.players p
        left join public.rosters r on r.player_id = p.id
        left join public.teams t on t.id = r.team_id
        left join public.divisions d on d.id = t.division_id
       where p.id = ${playerId}
       order by (r.status = 'active') desc nulls last
       limit 1
    `);
    if (!player || !player.team_id) return null;

    const leagues = await fetchLeagues();
    const league = leagues.find((l) => l.seasonId === player.season_id);
    if (!league) return null;

    const teamId = player.team_id;
    const games = (await fetchSeasonGames(league.seasonId)).filter(
      (game) =>
        game.status === "finalized" &&
        (game.home?.id === teamId || game.away?.id === teamId),
    );
    const gameIds = games.map((game) => game.id);

    const eventRows =
      gameIds.length > 0
        ? await db.rows<EventRow>(sql`
            select ${EVENT_COLUMNS}
              from public.game_events
             where game_id = any(${gameIds}::uuid[])
               and (player_id = ${playerId} or event_type = 'correction')
             order by seq
          `)
        : [];

    const eventsByGame = new Map<string, EngineGameEvent[]>();
    for (const row of eventRows) {
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
        game.home?.id === teamId ? game.away?.name : game.home?.name;
      return {
        gameId: game.id,
        opponentName: opponent ?? "—",
        scheduledAt: game.scheduled_at,
        statLine:
          stats.get(playerId) ??
          Object.fromEntries(league.config.playerStatDefs.map((def) => [def.key, 0])),
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
      jerseyNumber: player.jersey_number,
      position: player.position,
      team: toTeamRef({
        id: teamId,
        name: player.team_name ?? "—",
        slug: player.team_slug ?? "",
        color: player.team_color,
        logo_url: player.team_logo_url,
      }),
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
    const term = query.trim();
    const blank: SearchResults = { query, teams: [], players: [], games: [] };
    if (term.length < 2) return blank;

    const db = await getDb();
    const pattern = likePattern(term);

    const [teamRows, playerRows] = await Promise.all([
      db.rows<{
        id: string;
        name: string;
        slug: string;
        color: string | null;
        league_name: string | null;
      }>(sql`
        select t.id, t.name, t.slug, t.color, l.name as league_name
          from public.teams t
          left join public.divisions d on d.id = t.division_id
          left join public.seasons s on s.id = d.season_id
          left join public.leagues l on l.id = s.league_id
         where t.name ilike ${pattern}
         order by t.name
         limit 6
      `),
      db.rows<{
        id: string;
        first_name: string;
        last_name: string;
        team_name: string | null;
      }>(sql`
        select p.id, p.first_name, p.last_name,
               (select t.name
                  from public.rosters r
                  join public.teams t on t.id = r.team_id
                 where r.player_id = p.id
                 order by (r.status = 'active') desc
                 limit 1) as team_name
          from public.players p
         where p.first_name ilike ${pattern} or p.last_name ilike ${pattern}
         order by p.last_name, p.first_name
         limit 8
      `),
    ]);

    const teams = teamRows.map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      color: row.color,
      leagueName: row.league_name ?? "",
    }));

    let games: GameSummary[] = [];
    const teamIds = teams.map((team) => team.id);
    if (teamIds.length > 0) {
      const gameRows = await db.rows<GameRow>(sql`
        select ${GAME_COLUMNS} ${GAME_FROM}
         where g.home_team_id = any(${teamIds}::uuid[])
            or g.away_team_id = any(${teamIds}::uuid[])
         order by g.scheduled_at desc
         limit 6
      `);

      const leagues = await fetchLeagues();
      const bySeason = new Map(leagues.map((league) => [league.seasonId, league]));
      const grouped = new Map<string, GameRow[]>();
      for (const row of gameRows) {
        if (!bySeason.has(row.season_id)) continue;
        const list = grouped.get(row.season_id) ?? [];
        list.push(row);
        grouped.set(row.season_id, list);
      }

      const summaries = await Promise.all(
        [...grouped.entries()].map(async ([seasonId, rows]) => {
          const league = bySeason.get(seasonId);
          if (!league) return [] as GameSummary[];
          return toSummaries(rows, league.slug, league.config);
        }),
      );
      // Se recupera el orden original (más reciente primero) tras agrupar.
      const order = new Map(gameRows.map((row, index) => [row.id, index]));
      games = summaries
        .flat()
        .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
    }

    return {
      query,
      teams,
      players: playerRows.map((row) => ({
        playerId: row.id,
        name: `${row.first_name} ${row.last_name}`,
        teamName: row.team_name ?? "—",
      })),
      games,
    };
  },
};
