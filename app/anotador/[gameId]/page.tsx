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
import { sportConfigSchema } from "@/lib/engine";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { compareJerseyNumber } from "@/lib/utils";
import { getSupabaseServerClient } from "@/lib/supabase/server";

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

  if (!hasSupabaseEnv()) {
    return (
      <Notice>
        <p>Supabase no está configurado (ver README).</p>
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

  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: gameData } = await supabase
    .from("games")
    .select("id, season_id, status, scheduled_at, home_team_id, away_team_id")
    .eq("id", gameId)
    .maybeSingle();
  if (!gameData) {
    return <Notice>El partido no existe o no tienes acceso.</Notice>;
  }
  const game = gameData as GameRow;

  if (game.status === "finalized" || game.status === "canceled") {
    return <Notice>Este partido ya no se puede anotar (estado: {game.status}).</Notice>;
  }

  const { data: assignment } = await supabase
    .from("game_assignments")
    .select("id")
    .eq("game_id", gameId)
    .eq("user_id", user.id)
    .eq("role", "scorekeeper")
    .maybeSingle();
  if (!assignment) {
    return (
      <Notice>
        No estás asignado como anotador de este partido. Pide la asignación al
        administrador de la liga.
      </Notice>
    );
  }

  // Config del deporte: partido → temporada → liga → deporte.
  const { data: seasonData } = await supabase
    .from("seasons")
    .select("id, leagues(sport_id, sports(key, config))")
    .eq("id", game.season_id)
    .single();
  const league = (seasonData as {
    leagues: { sports: { key: string; config: unknown } | null } | null;
  } | null)?.leagues;
  if (!league?.sports) {
    return <Notice>No se pudo cargar la configuración del deporte.</Notice>;
  }
  const sportConfig = sportConfigSchema.parse(league.sports.config);

  const { data: teamRows } = await supabase
    .from("teams")
    .select("id, name, color")
    .in("id", [game.home_team_id, game.away_team_id]);
  const teamsById = new Map(
    ((teamRows ?? []) as TeamRow[]).map((team) => [team.id, team]),
  );

  const { data: rosterRows } = await supabase
    .from("rosters")
    .select("team_id, player_id, jersey_number, players(first_name, last_name)")
    .in("team_id", [game.home_team_id, game.away_team_id])
    .eq("status", "active");

  const rosterByTeam = new Map<string, RosterPlayer[]>();
  for (const row of (rosterRows ?? []) as unknown as RosterRow[]) {
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

  const { data: eventRows } = await supabase
    .from("game_events")
    .select(
      "id, seq, game_id, team_id, player_id, event_type, payload, period, clock_seconds, corrects_event_id, created_by, created_at",
    )
    .eq("game_id", gameId)
    .order("seq");

  // Suspendidos por sanción: la mesa los deshabilita como titulares (y las
  // políticas de game_lineups lo rechazan de todos modos).
  const { data: sanctionedIds } = await supabase.rpc(
    "sanctioned_players_for_game",
    { p_game: gameId },
  );

  // Alineaciones ya confirmadas: permiten continuar el partido desde otro
  // dispositivo (IndexedDB local tiene prioridad si existe).
  const { data: lineupRows } = await supabase
    .from("game_lineups")
    .select("team_id, player_id, batting_order")
    .eq("game_id", gameId)
    .eq("is_starter", true)
    .order("batting_order", { ascending: true });
  const initialLineups: Record<string, string[]> = {};
  for (const row of (lineupRows ?? []) as Array<{
    team_id: string;
    player_id: string;
    batting_order: number | null;
  }>) {
    (initialLineups[row.team_id] ??= []).push(row.player_id);
  }

  return (
    <AnotadorConsole
      mode="live"
      userId={user.id}
      game={{ id: game.id, status: game.status, scheduledAt: game.scheduled_at }}
      homeTeam={buildTeam(game.home_team_id)}
      awayTeam={buildTeam(game.away_team_id)}
      sportKey={league.sports.key}
      sportConfig={sportConfig}
      initialEvents={(eventRows ?? []) as ServerEventRow[]}
      initialLineups={initialLineups}
      sanctionedPlayerIds={((sanctionedIds ?? []) as unknown as string[]) ?? []}
    />
  );
}
