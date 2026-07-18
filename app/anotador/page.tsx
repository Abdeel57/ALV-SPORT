import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BrandLogo } from "@/components/brand/brand-logo";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Mesa de anotación" };

interface AssignedGameRow {
  id: string;
  scheduled_at: string;
  status: string;
  home_team_id: string;
  away_team_id: string;
}

interface TeamRow {
  id: string;
  name: string;
  color: string | null;
}

const dateFormat = new Intl.DateTimeFormat("es-MX", {
  weekday: "long",
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Mexico_City",
});

function SetupNotice() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4">
      <BrandLogo className="h-8" />
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="font-display text-2xl">Mesa de anotación</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm text-muted-foreground">
          <p>
            Supabase no está configurado, así que no hay partidos asignados
            que mostrar. Sigue el README para conectar tu proyecto.
          </p>
          <p>
            Puedes probar la mesa completa (incluido el modo offline) en{" "}
            <Link href="/anotador/demo" className="text-brand-amber underline">
              /anotador/demo
            </Link>{" "}
            con el partido seed Halcones vs Mineros.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}

export default async function AnotadorPage() {
  if (!hasSupabaseEnv()) return <SetupNotice />;

  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: assignmentRows } = await supabase
    .from("game_assignments")
    .select("game_id")
    .eq("user_id", user.id)
    .eq("role", "scorekeeper");
  const gameIds = (assignmentRows ?? []).map(
    (row) => (row as { game_id: string }).game_id,
  );

  let games: AssignedGameRow[] = [];
  let teams = new Map<string, TeamRow>();
  if (gameIds.length > 0) {
    const { data: gameRows } = await supabase
      .from("games")
      .select("id, scheduled_at, status, home_team_id, away_team_id")
      .in("id", gameIds)
      .neq("status", "finalized")
      .neq("status", "canceled")
      .order("scheduled_at");
    games = (gameRows ?? []) as AssignedGameRow[];

    const teamIds = [
      ...new Set(games.flatMap((game) => [game.home_team_id, game.away_team_id])),
    ];
    if (teamIds.length > 0) {
      const { data: teamRows } = await supabase
        .from("teams")
        .select("id, name, color")
        .in("id", teamIds);
      teams = new Map(((teamRows ?? []) as TeamRow[]).map((team) => [team.id, team]));
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-4 px-4 py-8">
      <div className="flex items-center justify-between gap-4">
        <BrandLogo className="h-6" />
        <Badge variant="outline" className="border-brand-silver/40 text-brand-silver">
          Anotador
        </Badge>
      </div>
      <header>
        <h1 className="font-display text-3xl">Mis partidos</h1>
      </header>
      <div className="bg-brand-gradient h-0.5 w-full rounded-full" aria-hidden />
      {games.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No tienes partidos asignados pendientes. Pide al administrador de
            la liga que te asigne como anotador.
          </CardContent>
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {games.map((game) => {
            const home = teams.get(game.home_team_id);
            const away = teams.get(game.away_team_id);
            return (
              <li key={game.id}>
                <Link
                  href={`/anotador/${game.id}`}
                  className="flex min-h-14 items-center justify-between gap-4 rounded-lg border px-4 py-3 transition-colors hover:bg-muted"
                >
                  <span className="flex flex-col gap-0.5">
                    <span className="font-medium">
                      {away?.name ?? "Visita"} @ {home?.name ?? "Local"}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {dateFormat.format(new Date(game.scheduled_at))}
                    </span>
                  </span>
                  {game.status === "in_progress" ? (
                    <Badge className="bg-primary text-primary-foreground">EN VIVO</Badge>
                  ) : (
                    <Badge variant="outline">Programado</Badge>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
