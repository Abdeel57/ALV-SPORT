import "server-only";
import { sql } from "@/lib/db";
import { hasDatabaseEnv } from "@/lib/db/pool";
import { getDb } from "@/lib/db/request";

export interface OpenSeason {
  seasonId: string;
  seasonName: string;
  leagueName: string;
  sportName: string;
}

export interface SeasonTeam {
  seasonId: string;
  teamId: string;
  teamName: string;
}

export interface SignupOptions {
  seasons: OpenSeason[];
  teams: SeasonTeam[];
  /** false en modo demo (sin base de datos): el formulario no puede enviar. */
  available: boolean;
}

interface SeasonRow {
  season_id: string;
  season_name: string;
  league_name: string;
  sport_name: string;
}

interface TeamRow {
  season_id: string;
  team_id: string;
  team_name: string;
}

/** Ligas/temporadas abiertas a inscripción y sus equipos (para el form). */
export async function getSignupOptions(): Promise<SignupOptions> {
  if (!hasDatabaseEnv()) return { seasons: [], teams: [], available: false };
  const db = await getDb();
  const [seasons, teams] = await Promise.all([
    db.rows<SeasonRow>(sql`
      select season_id, season_name, league_name, sport_name
        from public.public_open_seasons
    `),
    db.rows<TeamRow>(sql`
      select season_id, team_id, team_name from public.public_season_teams
    `),
  ]);
  return {
    seasons: seasons.map((row) => ({
      seasonId: row.season_id,
      seasonName: row.season_name,
      leagueName: row.league_name,
      sportName: row.sport_name,
    })),
    teams: teams.map((row) => ({
      seasonId: row.season_id,
      teamId: row.team_id,
      teamName: row.team_name,
    })),
    available: true,
  };
}
