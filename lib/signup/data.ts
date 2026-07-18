import "server-only";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { getSupabaseServerClient } from "@/lib/supabase/server";

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
  /** false en modo demo (sin Supabase): el formulario no puede enviar. */
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
  if (!hasSupabaseEnv()) return { seasons: [], teams: [], available: false };
  const supabase = await getSupabaseServerClient();
  const [{ data: seasons }, { data: teams }] = await Promise.all([
    supabase
      .from("public_open_seasons")
      .select("season_id, season_name, league_name, sport_name"),
    supabase.from("public_season_teams").select("season_id, team_id, team_name"),
  ]);
  return {
    seasons: ((seasons ?? []) as SeasonRow[]).map((row) => ({
      seasonId: row.season_id,
      seasonName: row.season_name,
      leagueName: row.league_name,
      sportName: row.sport_name,
    })),
    teams: ((teams ?? []) as TeamRow[]).map((row) => ({
      seasonId: row.season_id,
      teamId: row.team_id,
      teamName: row.team_name,
    })),
    available: true,
  };
}
