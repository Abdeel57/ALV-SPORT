import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AnotadorConsole } from "@/components/anotador/console";
import type {
  ConsoleTeam,
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
  players: { first_name: string; last_name: string } | null;
}

function sortRoster(a: RosterPlayer, b: RosterPlayer): number {
  // Los que aún no tienen número asignado van al final, ordenados por apellido.
  const byJersey = compareJerseyNumber(a.jerseyNumber, b.jerseyNumber);
  if (byJersey !== 0) return byJersey;
  return a.lastName.localeCompare(b.lastName);
}

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
    select id, season_id, status::text as status, scheduled_at,
           home_team_id, away_team_id
      from public.games
     where id = ${gameId}
     limit 1
  `);
  if (!game) {
    return <Notice>El partido no existe o no tienes acceso.</Notice>;
  }

  if (game.status === "finalized" || game.status === "canceled") {
    return <Notice>Este partido ya no se puede anotar (estado: {game.status}).</Notice>;
  }

  const assignment = await db.maybeOne<{ id: string }>(sql`
    select id from public.game_assignments
     where game_id = ${gameId} and user_id = ${user.id} and role = 'scorekeeper'
     limit 1
  `);
  if (!assignment && !(await isOrgManager(db, user.id))) {
    return (
      <Notice>
        No estás asignado como anotador de este partido. Pide la asignación al
        administrador de la liga.
      </Notice>
    );
  }

  // Config del deporte: partido → temporada → liga → deporte.
  const sport = await db.maybeOne<{ key: string; config: unknown }>(sql`
    select sp.key, sp.config
      from public.seasons se
      join public.leagues l on l.id = se.league_id
      join public.sports sp on sp.id = l.sport_id
     where se.id = ${game.season_id}
     limit 1
  `);
  if (!sport) {
    return <Notice>No se pudo cargar la configuración del deporte.</Notice>;
  }
  const sportConfig = sportConfigSchema.parse(sport.config);

  const teamIds = [game.home_team_id, game.away_team_id];
  const teamRows = await db.rows<TeamRow>(sql`
    select id, name, color from public.teams where id = any(${teamIds}::uuid[])
  `);
  const teamsById = new Map(teamRows.map((team) => [team.id, team]));

  const rosterRows = await db.rows<RosterRow>(sql`
    select r.team_id, r.player_id, r.jersey_number,
           json_build_object('first_name', p.first_name,
                             'last_name', p.last_name) as players
      from public.rosters r
      join public.players p on p.id = r.player_id
     where r.team_id = any(${teamIds}::uuid[]) and r.status = 'active'
  `);

  const rosterByTeam = new Map<string, RosterPlayer[]>();
  for (const row of rosterRows) {
    const list = rosterByTeam.get(row.team_id) ?? [];
    list.push({
      playerId: row.player_id,
      firstName: row.players?.first_name ?? "—",
      lastName: row.players?.last_name ?? "",
      jerseyNumber: row.jersey_number,
    });
    rosterByTeam.set(row.team_id, list);
  }

  const buildTeam = (teamId: string): ConsoleTeam => ({
    id: teamId,
    name: teamsById.get(teamId)?.name ?? "Equipo",
    color: teamsById.get(teamId)?.color ?? null,
    roster: (rosterByTeam.get(teamId) ?? []).sort(sortRoster),
  });

  const eventRows = await db.rows<ServerEventRow>(sql`
    select id, seq, game_id, team_id, player_id, event_type, payload, period,
           clock_seconds, corrects_event_id, created_by, created_at
      from public.game_events
     where game_id = ${gameId}
     order by seq
  `);

  // Suspendidos por sanción: la mesa los deshabilita como titulares (y las
  // políticas de game_lineups lo rechazan de todos modos).
  const sanctionedRows = await db.rows<{ player_id: string | null }>(sql`
    select public.sanctioned_players_for_game(${gameId}) as player_id
  `);
  const sanctionedPlayerIds = sanctionedRows
    .map((row) => row.player_id)
    .filter((id): id is string => Boolean(id));

  // Alineaciones ya confirmadas: permiten continuar el partido desde otro
  // dispositivo (IndexedDB local tiene prioridad si existe).
  const lineupRows = await db.rows<{
    team_id: string;
    player_id: string;
    batting_order: number | null;
  }>(sql`
    select team_id, player_id, batting_order
      from public.game_lineups
     where game_id = ${gameId} and is_starter
     order by batting_order
  `);
  const initialLineups: Record<string, string[]> = {};
  for (const row of lineupRows) {
    (initialLineups[row.team_id] ??= []).push(row.player_id);
  }

  return (
    <AnotadorConsole
      mode="live"
      userId={user.id}
      game={{ id: game.id, status: game.status, scheduledAt: game.scheduled_at }}
      homeTeam={buildTeam(game.home_team_id)}
      awayTeam={buildTeam(game.away_team_id)}
      sportKey={sport.key}
      sportConfig={sportConfig}
      initialEvents={eventRows}
      initialLineups={initialLineups}
      sanctionedPlayerIds={sanctionedPlayerIds}
    />
  );
}
