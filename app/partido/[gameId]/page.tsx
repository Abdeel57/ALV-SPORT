import type { Metadata } from "next";
import type { ServerEventRow } from "@/components/anotador/types";
import { LiveGame } from "@/components/partido/live-game";
import { Card, CardContent } from "@/components/ui/card";
import { sportConfigSchema } from "@/lib/engine";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Partido en vivo" };

interface PageProps {
  params: Promise<{ gameId: string }>;
}

interface GameRow {
  id: string;
  season_id: string;
  status: string;
  home_team_id: string;
  away_team_id: string;
}

interface TeamRow {
  id: string;
  name: string;
  color: string | null;
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          {children}
        </CardContent>
      </Card>
    </main>
  );
}

export default async function PartidoPage({ params }: PageProps) {
  const { gameId } = await params;

  if (!hasSupabaseEnv()) {
    return <Notice>Supabase no está configurado (ver README).</Notice>;
  }

  const supabase = await getSupabaseServerClient();

  const { data: gameData } = await supabase
    .from("games")
    .select("id, season_id, status, home_team_id, away_team_id")
    .eq("id", gameId)
    .maybeSingle();
  if (!gameData) {
    return <Notice>El partido no existe o su liga no está publicada.</Notice>;
  }
  const game = gameData as GameRow;

  const { data: seasonData } = await supabase
    .from("seasons")
    .select("id, leagues(sports(config))")
    .eq("id", game.season_id)
    .single();
  const rawConfig = (seasonData as {
    leagues: { sports: { config: unknown } | null } | null;
  } | null)?.leagues?.sports?.config;
  if (!rawConfig) {
    return <Notice>No se pudo cargar la configuración del deporte.</Notice>;
  }
  const sportConfig = sportConfigSchema.parse(rawConfig);

  const { data: teamRows } = await supabase
    .from("teams")
    .select("id, name, color")
    .in("id", [game.home_team_id, game.away_team_id]);
  const teams = new Map(((teamRows ?? []) as TeamRow[]).map((t) => [t.id, t]));

  const { data: eventRows } = await supabase
    .from("game_events")
    .select(
      "id, seq, game_id, team_id, player_id, event_type, payload, period, clock_seconds, corrects_event_id, created_by, created_at",
    )
    .eq("game_id", gameId)
    .order("seq");

  const toTeam = (id: string) => ({
    id,
    name: teams.get(id)?.name ?? "Equipo",
    color: teams.get(id)?.color ?? null,
  });

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 px-4 py-8">
      <LiveGame
        gameId={game.id}
        status={game.status}
        homeTeam={toTeam(game.home_team_id)}
        awayTeam={toTeam(game.away_team_id)}
        sportConfig={sportConfig}
        initialEvents={(eventRows ?? []) as ServerEventRow[]}
      />
    </main>
  );
}
