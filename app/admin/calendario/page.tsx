import { ChevronDown, Plus, Sparkles, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { MatchupForm, type TeamOption } from "@/components/admin/matchup-form";
import {
  AdminTitle,
  EmptyRow,
  Feedback,
  GhostButton,
  StatusChip,
  inputClass,
} from "@/components/admin/ui";
import {
  assignOfficial,
  createGame,
  deleteGame,
  removeAssignment,
  submitFinalScore,
  updateGame,
} from "@/lib/admin/actions";
import { requireAdmin } from "@/lib/admin/auth";
import { sql } from "@/lib/db";
import { findScheduleConflicts, type ScheduleWarning } from "@/lib/engine";
import { seasonLabel } from "@/lib/utils";

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
  courts: { name: string } | null;
  game_assignments: {
    id: string;
    role: string;
    user_id: string;
  }[];
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

  const [games, courts, divisionRows, teams] = await Promise.all([
    context.db.rows<GameRow>(sql`
      select g.id, g.status::text as status, g.scheduled_at, g.division_id,
             g.home_team_id, g.away_team_id, g.court_id,
             case when h.id is null then null
                  else json_build_object('name', h.name) end as home,
             case when a.id is null then null
                  else json_build_object('name', a.name) end as away,
             case when c.id is null then null
                  else json_build_object('name', c.name) end as courts,
             coalesce((
               select json_agg(
                        json_build_object('id', ga.id, 'role', ga.role,
                                          'user_id', ga.user_id)
                        order by ga.created_at
                      )
                 from public.game_assignments ga
                where ga.game_id = g.id
             ), '[]'::json) as game_assignments
        from public.games g
        left join public.teams h on h.id = g.home_team_id
        left join public.teams a on a.id = g.away_team_id
        left join public.courts c on c.id = g.court_id
       where g.status <> 'finalized'
       order by g.scheduled_at
       limit 60
    `),
    context.db.rows<{ id: string; name: string }>(sql`
      select id, name from public.courts order by name
    `),
    context.db.rows<{
      id: string;
      name: string;
      seasons: { name: string; leagues: { name: string } | null } | null;
    }>(sql`
      select d.id, d.name,
             case when se.id is null then null else json_build_object(
               'name', se.name,
               'leagues', case when l.id is null then null
                               else json_build_object('name', l.name) end
             ) end as seasons
        from public.divisions d
        left join public.seasons se on se.id = d.season_id
        left join public.leagues l on l.id = se.league_id
       order by d.created_at desc
    `),
    context.db.rows<TeamOption & { division_id: string | null }>(sql`
      select id, name, division_id from public.teams order by name
    `),
  ]);
  const divisions = divisionRows.map((division) => ({
    id: division.id,
    label: [division.name, seasonLabel(division.seasons)].filter(Boolean).join(" · "),
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
              courts={courts}
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
            const scorekeepers = game.game_assignments.filter(
              (a) => a.role === "scorekeeper",
            );
            return (
              <li key={game.id} className="flex flex-col gap-3 rounded-2xl border p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {game.away?.name ?? "—"} @ {game.home?.name ?? "—"}
                  </span>
                  <StatusChip status={game.status} />
                </div>
                <p className="text-xs text-muted-foreground">
                  {dateTimeFormat.format(new Date(game.scheduled_at))} ·{" "}
                  {game.courts?.name ?? "Sin campo"} ·{" "}
                  {scorekeepers.length > 0 ? (
                    <span className="text-brand-silver">Anotador asignado</span>
                  ) : (
                    <span className="text-brand-amber">Sin anotador</span>
                  )}
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
                    courts={courts}
                    cancelHref="/admin/calendario"
                    initial={{
                      gameId: game.id,
                      divisionId: game.division_id ?? "",
                      homeTeamId: game.home_team_id,
                      awayTeamId: game.away_team_id,
                      scheduledAt: toLocalInputValue(game.scheduled_at),
                      courtId: game.court_id,
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
                        <span className="max-w-28 truncate">
                          {game.away?.name ?? "Visita"}
                        </span>
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
                      <span aria-hidden className="pb-3 text-muted-foreground">
                        —
                      </span>
                      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                        <span className="max-w-28 truncate">
                          {game.home?.name ?? "Local"}
                        </span>
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
                      <GhostButton>Guardar y finalizar</GhostButton>
                    </form>
                    <p className="px-3 pb-3 text-xs text-muted-foreground">
                      Registra las anotaciones, finaliza el partido y actualiza
                      la tabla. Para estadísticas por jugador usa la mesa
                      (&quot;Anotar&quot;).
                    </p>
                  </details>
                )}

                {/* Plegado por defecto: en móvil este bloque ocupaba media
                    pantalla por juego; el resumen ya dice cuántos hay. */}
                <details className="group rounded-xl bg-secondary/50">
                  <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 text-xs tracking-widest text-muted-foreground uppercase select-none [&::-webkit-details-marker]:hidden">
                    Mesa y umpires
                    <span className="tracking-normal normal-case">
                      {game.game_assignments.length > 0
                        ? `· ${game.game_assignments.length}`
                        : "· sin asignar"}
                    </span>
                    <ChevronDown
                      className="ml-auto size-4 transition-transform group-open:rotate-180"
                      aria-hidden
                    />
                  </summary>
                  <div className="flex flex-col gap-2 px-3 pb-3">
                  {game.game_assignments.length > 0 && (
                    <ul className="flex flex-wrap gap-2">
                      {game.game_assignments.map((assignment) => (
                        <li
                          key={assignment.id}
                          className="flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs"
                        >
                          {assignment.role === "scorekeeper" ? "Anotador" : "Umpire"}
                          <form action={removeAssignment.bind(null, assignment.id)}>
                            <button
                              type="submit"
                              aria-label="Quitar asignación"
                              className="text-muted-foreground hover:text-destructive"
                            >
                              ×
                            </button>
                          </form>
                        </li>
                      ))}
                    </ul>
                  )}
                  <form action={assignOfficial} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="gameId" value={game.id} />
                    <input
                      type="email"
                      name="email"
                      required
                      placeholder="correo@delanotador.mx"
                      className={`${inputClass} min-h-11 max-w-64`}
                    />
                    <select name="role" defaultValue="scorekeeper" className={`${inputClass} min-h-11 w-auto`}>
                      <option value="scorekeeper">Anotador</option>
                      <option value="referee">Umpire</option>
                    </select>
                    <GhostButton>Asignar</GhostButton>
                  </form>
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
