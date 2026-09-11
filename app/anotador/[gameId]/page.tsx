import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AnotadorConsole } from "@/components/anotador/console";
import type {
  ConsoleTeam,
  LineupSlotInput,
  LineupsInput,
  RosterPlayer,
  ServerEventRow,
} from "@/components/anotador/types";
import { Card, CardContent } from "@/components/ui/card";
import { isOrgManager } from "@/lib/admin/auth";
import { getSessionUser } from "@/lib/auth/session";
import { sql } from "@/lib/db";
import { hasDatabaseEnv } from "@/lib/db/pool";
import { getDb } from "@/lib/db/request";
import { sportConfigSchema } from "@/lib/engine";
import { parseRulesProfile } from "@/lib/engine/scorebook";
import { compareJerseyNumber } from "@/lib/utils";

export const metadata: Metadata = { title: "Anotando" };

interface PageProps {
  params: Promise<{ gameId: string }>;
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardContent className="flex flex-col gap-3 py-8 text-center text-sm text-muted-foreground">
          {children}
        </CardContent>
      </Card>
    </main>
  );
}

interface GameRow {
  id: string;
  season_id: string;
  status: string;
  scheduled_at: string;
  home_team_id: string;
  away_team_id: string;
  rules_snapshot: unknown;
  league_rules: unknown;
  league_name: string;
  season_name: string;
  sport_key: string;
  sport_config: unknown;
}

interface TeamRow {
  id: string;
  name: string;
  color: string | null;
}

interface RosterRow {
  team_id: string;
  player_id: string;
  jersey_number: string | null;
  position: string | null;
  first_name: string | null;
  last_name: string | null;
}

interface LineupRow {
  team_id: string;
  player_id: string;
  batting_order: number | null;
  position: string | null;
  lineup_role: string;
}

function sortRoster(a: RosterPlayer, b: RosterPlayer): number {
  // Los que aún no tienen número asignado van al final, ordenados por apellido.
  const byJersey = compareJerseyNumber(a.jerseyNumber, b.jerseyNumber);
  if (byJersey !== 0) return byJersey;
  return a.lastName.localeCompare(b.lastName);
}

function toLineupSlot(row: LineupRow): LineupSlotInput {
  const role =
    row.lineup_role === "EP" || row.lineup_role === "DH" || row.lineup_role === "FLEX"
      ? row.lineup_role
      : "starter";
  return {
    playerId: row.player_id,
    slot: row.batting_order,
    position: row.position,
    role,
  };
}

// Siempre por petición: la comprobación de DATABASE_URL no debe congelarse en el build.
export const dynamic = "force-dynamic";

export default async function AnotadorGamePage({ params }: PageProps) {
  const { gameId } = await params;

  if (!hasDatabaseEnv()) {
    return (
      <Notice>
        <p>La base de datos no está configurada (ver README).</p>
        <p>
          Prueba la mesa en{" "}
          <Link href="/anotador/demo" className="text-brand-amber underline">
            /anotador/demo
          </Link>
          .
        </p>
      </Notice>
    );
  }

  const user = await getSessionUser();
  if (!user) redirect("/login");

  const db = await getDb();
  const game = await db.maybeOne<GameRow>(sql`
    select g.id, g.season_id, g.status::text as status, g.scheduled_at,
           g.home_team_id, g.away_team_id, g.rules_snapshot,
           l.rules as league_rules, l.name as league_name, se.name as season_name,
           sp.key as sport_key, sp.config as sport_config
      from public.games g
      join public.seasons se on se.id = g.season_id
      join public.leagues l on l.id = se.league_id
      join public.sports sp on sp.id = l.sport_id
     where g.id = ${gameId}
     limit 1
  `);
  if (!game) {
    return <Notice>El partido no existe o no tienes acceso.</Notice>;
  }

  const manager = await isOrgManager(db, user.id);
  if (game.status === "canceled") {
    return <Notice>Este partido está cancelado y no se puede anotar.</Notice>;
  }

  const assignment = await db.maybeOne<{ id: string }>(sql`
    select id from public.game_assignments
     where game_id = ${gameId} and user_id = ${user.id} and role = 'scorekeeper'
     limit 1
  `);
  if (!assignment && !manager) {
    return (
      <Notice>
        No estás asignado como anotador de este partido. Pide la asignación al
        administrador de la liga.
      </Notice>
    );
  }

  const sportConfig = sportConfigSchema.parse(game.sport_config);
  const snapshot = parseRulesProfile(game.rules_snapshot);
  const league = parseRulesProfile(game.league_rules);
  const rules = game.rules_snapshot ? snapshot.rules : league.rules;
  const rulesSource: "snapshot" | "league" | "default" = game.rules_snapshot
    ? "snapshot"
    : game.league_rules
      ? "league"
      : "default";

  const teamIds = [game.home_team_id, game.away_team_id];
  const [teamRows, rosterRows, lineupRows, eventRows, sanctionedRows, previousRows] = await Promise.all([
    db.rows<TeamRow>(sql`
      select id, name, color from public.teams where id = any(${teamIds}::uuid[])
    `),
    db.rows<RosterRow>(sql`
      select r.team_id, r.player_id, r.jersey_number, r.position,
             p.first_name, p.last_name
        from public.rosters r
        join public.players p on p.id = r.player_id
       where r.team_id = any(${teamIds}::uuid[]) and r.status = 'active'
    `),
    db.rows<LineupRow>(sql`
      select team_id, player_id, batting_order, position, lineup_role
        from public.game_lineups
       where game_id = ${gameId}
       order by batting_order nulls last
    `),
    db.rows<ServerEventRow>(sql`
      select id, seq, game_id, team_id, player_id, event_type, payload, period,
             clock_seconds, corrects_event_id, created_by, created_at
        from public.game_events
       where game_id = ${gameId}
       order by seq
    `),
    db.rows<{ player_id: string | null }>(sql`
      select public.sanctioned_players_for_game(${gameId}) as player_id
    `),
    // Última alineación de cada equipo en otro partido ya iniciado.
    db.rows<LineupRow & { game_id: string }>(sql`
      select gl.team_id, gl.player_id, gl.batting_order, gl.position, gl.lineup_role, gl.game_id
        from public.game_lineups gl
        join public.games g on g.id = gl.game_id
       where gl.team_id = any(${teamIds}::uuid[])
         and gl.game_id <> ${gameId}
         and g.status in ('in_progress', 'finalized')
         and g.scheduled_at = (
           select max(g2.scheduled_at)
             from public.games g2
             join public.game_lineups gl2 on gl2.game_id = g2.id
            where gl2.team_id = gl.team_id
              and g2.id <> ${gameId}
              and g2.status in ('in_progress', 'finalized')
         )
       order by gl.batting_order nulls last
    `),
  ]);

  const teamsById = new Map(teamRows.map((team) => [team.id, team]));
  const rosterByTeam = new Map<string, RosterPlayer[]>();
  for (const row of rosterRows) {
    const list = rosterByTeam.get(row.team_id) ?? [];
    list.push({
      playerId: row.player_id,
      firstName: row.first_name ?? "—",
      lastName: row.last_name ?? "",
      jerseyNumber: row.jersey_number,
      position: row.position,
    });
    rosterByTeam.set(row.team_id, list);
  }

  const buildTeam = (teamId: string): ConsoleTeam => ({
    id: teamId,
    name: teamsById.get(teamId)?.name ?? "Equipo",
    color: teamsById.get(teamId)?.color ?? null,
    roster: (rosterByTeam.get(teamId) ?? []).sort(sortRoster),
  });

  const initialLineups: LineupsInput = {};
  for (const row of lineupRows) {
    (initialLineups[row.team_id] ??= []).push(toLineupSlot(row));
  }
  const previousLineups: LineupsInput = {};
  for (const row of previousRows) {
    (previousLineups[row.team_id] ??= []).push(toLineupSlot(row));
  }

  return (
    <AnotadorConsole
      mode="live"
      userId={user.id}
      game={{
        id: game.id,
        status: game.status,
        scheduledAt: game.scheduled_at,
        leagueName: game.league_name,
        seasonName: game.season_name,
      }}
      homeTeam={buildTeam(game.home_team_id)}
      awayTeam={buildTeam(game.away_team_id)}
      sportKey={game.sport_key}
      sportConfig={sportConfig}
      rules={rules}
      rulesSource={rulesSource}
      initialEvents={eventRows}
      initialLineups={initialLineups}
      previousLineups={previousLineups}
      sanctionedPlayerIds={sanctionedRows
        .map((row) => row.player_id)
        .filter((id): id is string => Boolean(id))}
      isManager={manager}
    />
  );
}
