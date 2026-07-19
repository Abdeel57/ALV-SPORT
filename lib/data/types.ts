import type {
  EngineGameEvent,
  GameStatus,
  SportConfig,
  StandingRow,
} from "@/lib/engine";

/**
 * Contratos del sitio público. Dos proveedores los implementan:
 *  - seed-provider: calcula todo desde lib/seed-data con el motor (sin DB).
 *  - supabase-provider: lee de Supabase (con Realtime en el cliente).
 * La selección es automática según haya proyecto configurado.
 */

export interface TeamRef {
  id: string;
  name: string;
  slug: string;
  color: string | null;
  // Escudo del equipo (Storage). Opcional: quien no lo trae cae al monograma.
  logoUrl?: string | null;
}

export interface LeagueInfo {
  slug: string;
  name: string;
  sportKey: string;
  sportName: string;
  seasonName: string;
  // Identidad propia de la liga: tiñe sus chips/acentos sobre la base ALV.
  logoUrl: string | null;
  color: string | null;
}

export interface GameSummary {
  id: string;
  status: GameStatus;
  scheduledAt: string;
  leagueSlug: string;
  home: TeamRef;
  away: TeamRef;
  homeScore: number | null;
  awayScore: number | null;
}

export interface StandingsRowView extends StandingRow {
  team: TeamRef;
}

export interface StandingsView {
  league: LeagueInfo;
  rows: StandingsRowView[];
}

export interface TopPlayer {
  playerId: string;
  name: string;
  team: TeamRef;
  statKey: string;
  statLabel: string;
  value: number;
}

export interface HomeData {
  leagues: LeagueInfo[];
  league: LeagueInfo;
  liveGames: GameSummary[];
  upcomingGames: GameSummary[];
  recentResults: GameSummary[];
  standingsTop: StandingsRowView[];
  topPlayers: TopPlayer[];
}

export interface LineupEntry {
  playerId: string;
  name: string;
  jerseyNumber: string | null;
  battingOrder: number | null;
}

export interface GameDetail {
  game: GameSummary;
  league: LeagueInfo;
  sportConfig: SportConfig;
  /** Eventos crudos en orden; el consumidor aplica el motor (correcciones). */
  events: EngineGameEvent[];
  lineups: Record<string, LineupEntry[]>;
  playerNames: Record<string, string>;
}

export interface TeamProfile {
  team: TeamRef;
  league: LeagueInfo;
  standing: StandingsRowView | null;
  roster: LineupEntry[];
  games: GameSummary[];
  /** Últimos resultados, más reciente primero: "W" | "L" | "T". */
  streak: ("W" | "L" | "T")[];
}

export interface PlayerGameLine {
  gameId: string;
  opponentName: string;
  scheduledAt: string;
  statLine: Record<string, number>;
}

export interface PlayerProfile {
  playerId: string;
  name: string;
  jerseyNumber: string | null;
  position: string | null;
  team: TeamRef;
  league: LeagueInfo;
  statDefs: { key: string; label: string }[];
  seasonTotals: Record<string, number>;
  perGame: PlayerGameLine[];
}

export interface SearchResults {
  query: string;
  teams: (TeamRef & { leagueName: string })[];
  players: { playerId: string; name: string; teamName: string }[];
  games: GameSummary[];
}

export interface PublicDataProvider {
  /** true cuando los datos vienen de Supabase (habilita Realtime). */
  readonly isLive: boolean;
  getLeagues(): Promise<LeagueInfo[]>;
  getHome(leagueSlug?: string): Promise<HomeData | null>;
  getGameDetail(gameId: string): Promise<GameDetail | null>;
  getStandings(leagueSlug?: string): Promise<StandingsView | null>;
  getTeamProfile(slug: string): Promise<TeamProfile | null>;
  getPlayerProfile(playerId: string): Promise<PlayerProfile | null>;
  search(query: string): Promise<SearchResults>;
}
