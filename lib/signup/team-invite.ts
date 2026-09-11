import "server-only";
import { sql } from "@/lib/db";
import { hasDatabaseEnv } from "@/lib/db/pool";
import { getDb } from "@/lib/db/request";

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
  if (!hasDatabaseEnv()) return null;
  const db = await getDb();
  const row = await db.maybeOne<InviteRow>(sql`
    select team_id, team_name, team_color, league_name, season_id, season_name
      from public.resolve_team_invite(${code})
     limit 1
  `);
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
