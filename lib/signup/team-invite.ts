import "server-only";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export interface TeamInvite {
  teamId: string;
  teamName: string;
  teamColor: string | null;
  leagueName: string;
  seasonId: string;
  seasonName: string;
}

interface InviteRow {
  team_id: string;
  team_name: string;
  team_color: string | null;
  league_name: string;
  season_id: string;
  season_name: string;
}

/** Resuelve un código de invitación → equipo/liga (o null si no existe). */
export async function resolveTeamInvite(code: string): Promise<TeamInvite | null> {
  if (!hasSupabaseEnv()) return null;
  const supabase = await getSupabaseServerClient();
  const { data } = await supabase.rpc("resolve_team_invite", { p_code: code });
  const row = (data as InviteRow[] | null)?.[0];
  if (!row) return null;
  return {
    teamId: row.team_id,
    teamName: row.team_name,
    teamColor: row.team_color,
    leagueName: row.league_name,
    seasonId: row.season_id,
    seasonName: row.season_name,
  };
}
