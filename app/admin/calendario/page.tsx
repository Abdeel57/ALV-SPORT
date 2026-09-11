import { ChevronDown, Plus, Sparkles, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { MatchupForm, type DivisionOption, type TeamOption } from "@/components/admin/matchup-form";
import {
  AdminTitle,
  EmptyRow,
  Feedback,
  GhostButton,
  StatusChip,
  inputClass,
} from "@/components/admin/ui";
import { createGame, deleteGame, submitFinalScore, updateGame } from "@/lib/admin/actions";
import { requireAdmin } from "@/lib/admin/auth";
import { sql } from "@/lib/db";
import { findScheduleConflicts, type ScheduleWarning } from "@/lib/engine";

export const metadata: Metadata = { title: "Calendario" };
export const dynamic = "force-dynamic";

interface GameRow {
  id: string;
  status: string;
  scheduled_at: string;
  division_id: string | null;
  home_team_id: string;
  away_team_id: string;
  court_id: string | null;
  home: { name: string } | null;
  away: { name: string } | null;
}

interface DivisionRow {
  id: string;
  name: string;
  season_name: string | null;
  league_id: string | null;
  league_name: string | null;
}

const dateTimeFormat = new Intl.DateTimeFormat("es-MX", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Mexico_City",
});

function toLocalInputValue(iso: string): string {
  // datetime-local sin zona: se muestra en hora del centro de México.
  const date = new Date(iso);
  const mx = new Date(date.getTime() - 6 * 60 * 60 * 1000);
  return mx.toISOString().slice(0, 16);
}

// Advertencias sutiles, nunca bloqueantes: el admin decide si el choque es real.
const warningLabels: Record<ScheduleWarning["type"], string> = {
  duplicate_matchup: "Enfrentamiento repetido",
  team_clash: "Un equipo tiene dos partidos a la misma hora",
  court_clash: "Campo ocupado a la misma hora",
};

interface PageProps {
  searchParams: Promise<{ ok?: string; error?: string; edit?: string; nuevo?: string }>;
}

export default async function CalendarioPage({ searchParams }: PageProps) {
  const { ok, error, edit, nuevo } = await searchParams;
  const context = await requireAdmin();
  if (!context) return null;

  const [games, divisionRows, teams] = await Promise.all([
    context.db.rows<GameRow>(sql`
      select g.id, g.status::text as status, g.scheduled_at, g.division_id,
             g.home_team_id, g.away_team_id, g.court_id,
             case when h.id is null then null
                  else json_build_object('name', h.name) end as home,
             case when a.id is null then null
                  else json_build_object('name', a.name) end as away
        from public.games g
        left join public.teams h on h.id = g.home_team_id
        left join public.teams a on a.id = g.away_team_id
       where g.status <> 'finalized'
       order by g.scheduled_at
       limit 60
    `),
    context.db.rows<DivisionRow>(sql`
      select d.id, d.name, se.name as season_name, l.id as league_id, l.name as league_name
        from public.divisions d
        left join public.seasons se on se.id = d.season_id
        left join public.leagues l on l.id = se.league_id
       order by l.name nulls last, d.created_at desc
    `),
    context.db.rows<TeamOption & { division_id: string | null }>(sql`
      select id, name, division_id from public.teams order by name
    `),
  ]);
  // Categoría = liga; dentro de ella, la división (con su temporada).
  const divisions: DivisionOption[] = divisionRows.map((division) => ({
    id: division.id,
    label: [division.name, division.season_name].filter(Boolean).join(" · "),
    categoryId: division.league_id ?? "",
    categoryName: division.league_name ?? "Sin categoría",
  }));

  const teamsByDivision: Record<string, TeamOption[]> = {};
  for (const team of teams) {
    const key = team.division_id ?? "";
    (teamsByDivision[key] ??= []).push({ id: team.id, name: team.name });
  }
  // Partidos sin división (clave ""): se ofrecen todos los equipos.
  teamsByDivision[""] = teams.map(({ id, name }) => ({ id, name }));

  const conflicts = findScheduleConflicts(
    games.map((game) => ({
      id: game.id,
      homeTeamId: game.home_team_id,
      awayTeamId: game.away_team_id,
      courtId: game.court_id,
      scheduledAt: game.scheduled_at,
    })),
  );
  const warningsFor = (gameId: string): string[] => [
    ...new Set((conflicts.get(gameId) ?? []).map((warning) => warningLabels[warning.type])),
  ];

  const creating = nuevo === "1";

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-6">
      <AdminTitle
        action={
          <>
            <Link
              href="/admin/calendario/generar"
              className="inline-flex min-h-11 items-center gap-2 rounded-lg border px-3.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Sparkles className="size-4" aria-hidden />
              Generar sugerencias
            </Link>
            <Link
              href="/admin/calendario?nuevo=1"
              className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/85 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none active:scale-[.99]"
            >
              <Plus className="size-4" aria-hidden />
              Crear enfrentamiento
            </Link>
          </>
        }
      >
        Calendario
      </AdminTitle>
      <Feedback ok={ok} error={error} />

      {creating && (
        <section className="rounded-2xl border p-4">
          <h2 className="mb-3 font-display text-xl">Nuevo enfrentamiento</h2>
          {divisions.length === 0 ? (
            <EmptyRow>Primero crea una división con equipos.</EmptyRow>
          ) : (
            <MatchupForm
              action={createGame}
              divisions={divisions}
              teamsByDivision={teamsByDivision}
              cancelHref="/admin/calendario"
            />
          )}
        </section>
      )}

      {games.length === 0 ? (
        <EmptyRow>
          No hay partidos próximos. Crea un enfrentamiento manual o usa
          “Generar sugerencias” para armar el rol de una división completa.
        </EmptyRow>
      ) : (
        <ul className="flex flex-col gap-3">
          {games.map((game) => {
            const editing = edit === game.id;
            const warnings = warningsFor(game.id);
            const team1 = game.home?.name ?? "Equipo 1";
            const team2 = game.away?.name ?? "Equipo 2";
            return (
              <li key={game.id} className="flex flex-col gap-3 rounded-2xl border p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {team1} vs {team2}
                  </span>
                  <StatusChip status={game.status} />
                </div>
                <p className="text-xs text-muted-foreground">
                  {dateTimeFormat.format(new Date(game.scheduled_at))}
                </p>
                {warnings.length > 0 && (
                  <p className="flex items-start gap-1.5 text-xs text-brand-amber">
                    <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                    <span>{warnings.join(" · ")}</span>
                  </p>
                )}

                {editing ? (
                  <MatchupForm
                    action={updateGame}
                    teamsByDivision={teamsByDivision}
                    cancelHref="/admin/calendario"
                    initial={{
                      gameId: game.id,
                      divisionId: game.division_id ?? "",
                      homeTeamId: game.home_team_id,
                      awayTeamId: game.away_team_id,
                      scheduledAt: toLocalInputValue(game.scheduled_at),
                      teamsLocked: game.status !== "scheduled",
                    }}
                  />
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {game.status !== "canceled" && (
                      <Link
                        href={`/anotador/${game.id}`}
                        className="flex min-h-11 items-center rounded-lg border border-brand-amber/50 px-3 text-sm text-brand-amber hover:bg-muted"
                      >
                        Anotar
                      </Link>
                    )}
                    <Link
                      href={`/admin/calendario?edit=${game.id}`}
                      className="flex min-h-11 items-center rounded-lg border px-3 text-sm text-muted-foreground hover:bg-muted"
                    >
                      Editar
                    </Link>
                    {game.status === "scheduled" && (
                      <form action={deleteGame.bind(null, game.id)}>
                        <ConfirmButton message="¿Eliminar este partido del calendario?">
                          Eliminar
                        </ConfirmButton>
                      </form>
                    )}
                  </div>
                )}

                {/* Resultado directo: lo que pide la liga para cerrar la
                    jornada sin pasar por alineaciones ni mesa. */}
                {game.status !== "canceled" && (
                  <details className="group rounded-xl border border-brand-amber/30 bg-secondary/50">
                    <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 text-xs font-medium tracking-widest text-brand-amber uppercase select-none [&::-webkit-details-marker]:hidden">
                      Dar resultado
                      <span className="font-normal tracking-normal text-muted-foreground normal-case">
                        · directo, sin alineaciones
                      </span>
                      <ChevronDown
                        className="ml-auto size-4 transition-transform group-open:rotate-180"
                        aria-hidden
                      />
                    </summary>
                    <form
                      action={submitFinalScore}
                      className="flex flex-wrap items-end gap-3 px-3 pb-2"
                    >
                      <input type="hidden" name="gameId" value={game.id} />
                      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                        <span className="max-w-28 truncate">{team1}</span>
                        <input
                          name="homeScore"
                          type="number"
                          inputMode="numeric"
                          min={0}
                          max={199}
                          required
                          placeholder="0"
                          className={`${inputClass} w-24 text-center font-display text-lg tabular-nums`}
                        />
                      </label>
                      <span aria-hidden className="pb-3 text-muted-foreground">
                        —
                      </span>
                      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                        <span className="max-w-28 truncate">{team2}</span>
                        <input
                          name="awayScore"
                          type="number"
                          inputMode="numeric"
                          min={0}
                          max={199}
                          required
                          placeholder="0"
                          className={`${inputClass} w-24 text-center font-display text-lg tabular-nums`}
                        />
                      </label>
                      <GhostButton>Guardar y finalizar</GhostButton>
                    </form>
                    <p className="px-3 pb-3 text-xs text-muted-foreground">
                      Registra las anotaciones, finaliza el partido y actualiza
                      la tabla. Para estadísticas por jugador usa la mesa
                      (&quot;Anotar&quot;).
                    </p>
                  </details>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
