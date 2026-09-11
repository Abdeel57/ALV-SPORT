import type { TeamStatImportView } from "@/lib/stats-import/view";

export type { TeamStatImportView };
import type {
  EngineGameEvent,
  GameStatus,
  SportConfig,
  StandingRow,
} from "@/lib/engine";

/**
 * Contratos del sitio público. Dos proveedores los implementan:
 *  - seed-provider: calcula todo desde lib/seed-data con el motor (sin DB).
 *  - postgres-provider: lee de Postgres (con marcador en vivo por SSE).
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
  /** Criterio principal de la tabla: puntos o porcentaje ganado (G ÷ JJ). */
  rankBy: "points" | "win_pct";
  /** Contacto público (https://wa.me/…, mailto:… o URL); null = sin botón. */
  contactUrl: string | null;
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

export interface StatLeader extends TopPlayer {
  /** Ranking de competencia: valores empatados comparten posición. */
  rank: number;
}

export interface StatCategory {
  key: string;
  label: string;
  leaders: StatLeader[];
}

export interface LeagueStatsView {
  league: LeagueInfo;
  categories: StatCategory[];
  finalizedGames: number;
  playersWithStats: number;
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
  /** true cuando los datos vienen de la base (habilita el marcador en vivo). */
  readonly isLive: boolean;
  getLeagues(): Promise<LeagueInfo[]>;
  getHome(leagueSlug?: string): Promise<HomeData | null>;
  getGameDetail(gameId: string): Promise<GameDetail | null>;
  getStandings(leagueSlug?: string): Promise<StandingsView | null>;
  getLeagueStats(leagueSlug?: string): Promise<LeagueStatsView | null>;
  getTeamProfile(slug: string): Promise<TeamProfile | null>;
  /** Tablas cargadas desde otro programa para el equipo (vacío si no hay). */
  getTeamStatImports(teamId: string): Promise<TeamStatImportView[]>;
  getPlayerProfile(playerId: string): Promise<PlayerProfile | null>;
  search(query: string): Promise<SearchResults>;
}
