import Link from "next/link";
import { AdminTitle, EmptyRow, StatusChip } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/admin/auth";

export const dynamic = "force-dynamic";

interface GameRow {
  id: string;
  status: string;
  scheduled_at: string;
  home: { name: string } | null;
  away: { name: string } | null;
}

const timeFormat = new Intl.DateTimeFormat("es-MX", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Mexico_City",
});

function StatTile({
  value,
  label,
  href,
  tone,
}: {
  value: number;
  label: string;
  href: string;
  tone: "amber" | "red" | "silver";
}) {
  const toneClass =
    tone === "amber"
      ? "text-brand-amber"
      : tone === "red"
        ? "text-primary"
        : "text-brand-silver";
  return (
    <Link
      href={href}
      className="flex flex-col gap-1 rounded-2xl border bg-card px-4 py-4 transition-colors hover:bg-muted"
    >
      <span className={`font-display text-4xl tabular-nums ${toneClass}`}>{value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </Link>
  );
}

export default async function AdminDashboard() {
  const context = await requireAdmin();
  if (!context) return null; // el layout ya mostró el aviso de configuración
  const { supabase } = context;

  const now = new Date();
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
  const weekEnd = new Date(dayStart.getTime() + 7 * 24 * 60 * 60 * 1000);

  const [todayGames, pendingRegs, activeSanctions, upcoming] = await Promise.all([
    supabase
      .from("games")
      .select(
        "id, status, scheduled_at, home:teams!games_home_team_id_fkey(name), away:teams!games_away_team_id_fkey(name)",
      )
      .or(
        `and(scheduled_at.gte.${dayStart.toISOString()},scheduled_at.lt.${dayEnd.toISOString()}),status.eq.in_progress`,
      )
      .order("scheduled_at"),
    supabase
      .from("registrations")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
    supabase
      .from("sanctions")
      .select("id", { count: "exact", head: true })
      .eq("status", "active"),
    supabase
      .from("games")
      .select("id")
      .eq("status", "scheduled")
      .gte("scheduled_at", dayStart.toISOString())
      .lt("scheduled_at", weekEnd.toISOString()),
  ]);

  const upcomingIds = ((upcoming.data ?? []) as { id: string }[]).map((g) => g.id);
  let withoutScorekeeper = 0;
  if (upcomingIds.length > 0) {
    const { data: assigned } = await supabase
      .from("game_assignments")
      .select("game_id")
      .in("game_id", upcomingIds)
      .eq("role", "scorekeeper");
    const assignedIds = new Set(
      ((assigned ?? []) as { game_id: string }[]).map((a) => a.game_id),
    );
    withoutScorekeeper = upcomingIds.filter((id) => !assignedIds.has(id)).length;
  }

  const games = (todayGames.data ?? []) as unknown as GameRow[];

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6">
      <AdminTitle>Dashboard</AdminTitle>

      <section aria-label="Pendientes" className="grid grid-cols-3 gap-3">
        <StatTile
          value={pendingRegs.count ?? 0}
          label="Pagos por confirmar"
          href="/admin/inscripciones"
          tone="amber"
        />
        <StatTile
          value={activeSanctions.count ?? 0}
          label="Sanciones activas"
          href="/admin/sanciones"
          tone="red"
        />
        <StatTile
          value={withoutScorekeeper}
          label="Partidos sin anotador (7 días)"
          href="/admin/calendario"
          tone="silver"
        />
      </section>

      <section aria-labelledby="hoy" className="flex flex-col gap-3">
        <h2 id="hoy" className="font-display text-xl">
          Partidos de hoy
        </h2>
        {games.length === 0 ? (
          <EmptyRow>No hay partidos programados para hoy.</EmptyRow>
        ) : (
          <ul className="flex flex-col gap-2">
            {games.map((game) => (
              <li
                key={game.id}
                className="flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm"
              >
                <span className="min-w-0 truncate">
                  {game.away?.name ?? "—"} @ {game.home?.name ?? "—"}
                </span>
                <span className="flex shrink-0 items-center gap-2 text-muted-foreground">
                  {timeFormat.format(new Date(game.scheduled_at))}
                  <StatusChip status={game.status} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="rapidos" className="flex flex-col gap-3">
        <h2 id="rapidos" className="font-display text-xl">
          Accesos rápidos
        </h2>
        <div className="grid grid-cols-2 gap-3">
          {[
            { href: "/admin/temporadas", label: "Nueva temporada" },
            { href: "/admin/calendario/generar", label: "Generar calendario" },
            { href: "/admin/inscripciones", label: "Registrar inscripción" },
            { href: "/admin/sanciones", label: "Aplicar sanción" },
          ].map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className="flex min-h-14 items-center justify-center rounded-xl border bg-secondary px-4 text-center text-sm font-semibold transition-colors hover:bg-muted"
            >
              {action.label}
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
