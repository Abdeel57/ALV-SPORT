import { Plus, Sparkles, TriangleAlert } from "lucide-react";
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
  updateGame,
} from "@/lib/admin/actions";
import { requireAdmin } from "@/lib/admin/auth";
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

  const [{ data: gameRows }, { data: courtRows }, { data: divisionRows }, { data: teamRows }] =
    await Promise.all([
      context.supabase
        .from("games")
        .select(
          "id, status, scheduled_at, division_id, home_team_id, away_team_id, court_id, home:teams!games_home_team_id_fkey(name), away:teams!games_away_team_id_fkey(name), courts(name), game_assignments(id, role, user_id)",
        )
        .neq("status", "finalized")
        .order("scheduled_at")
        .limit(60),
      context.supabase.from("courts").select("id, name").order("name"),
      context.supabase
        .from("divisions")
        .select("id, name, seasons(name, leagues(name))")
        .order("created_at", { ascending: false }),
      context.supabase.from("teams").select("id, name, division_id").order("name"),
    ]);
  const games = (gameRows ?? []) as unknown as GameRow[];
  const courts = (courtRows ?? []) as { id: string; name: string }[];
  const divisions = (
    (divisionRows ?? []) as unknown as Array<{
      id: string;
      name: string;
      seasons: { name: string; leagues: { name: string } | null } | null;
    }>
  ).map((division) => ({
    id: division.id,
    label: [division.name, seasonLabel(division.seasons)].filter(Boolean).join(" · "),
  }));
  const teams = (teamRows ?? []) as unknown as Array<TeamOption & { division_id: string | null }>;

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

                <div className="flex flex-col gap-2 rounded-xl bg-secondary/50 p-3">
                  <p className="text-xs tracking-widest text-muted-foreground uppercase">
                    Mesa y umpires
                  </p>
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
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
