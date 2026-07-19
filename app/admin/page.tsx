import {
  ArrowUpRight,
  Ban,
  CalendarPlus,
  ClipboardCheck,
  CreditCard,
  type LucideIcon,
  Trophy,
  TriangleAlert,
} from "lucide-react";
import Link from "next/link";
import { InstallAppButton } from "@/components/admin/install-app";
import { AdminTitle, EmptyRow, StatusChip } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/admin/auth";
import { cn } from "@/lib/utils";

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

const dateFormat = new Intl.DateTimeFormat("es-MX", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "America/Mexico_City",
});

const roleLabels: Record<string, string> = {
  org_admin: "Administrador de liga",
  season_manager: "Gestor de temporada",
};

const toneClasses: Record<"amber" | "red" | "silver", string> = {
  amber: "text-brand-amber",
  red: "text-primary",
  silver: "text-brand-silver",
};

function StatTile({
  value,
  label,
  href,
  tone,
  icon: Icon,
}: {
  value: number;
  label: string;
  href: string;
  tone: "amber" | "red" | "silver";
  icon: LucideIcon;
}) {
  return (
    <Link
      href={href}
      className="card-elevated hover-lift group flex flex-col gap-3 rounded-2xl p-4"
    >
      <div className="flex items-center justify-between">
        <span
          className={cn(
            "flex size-9 items-center justify-center rounded-xl bg-white/[0.04] ring-1 ring-white/[0.06]",
            toneClasses[tone],
          )}
        >
          <Icon className="size-4.5" aria-hidden />
        </span>
        <ArrowUpRight
          className="size-4 text-muted-foreground/40 transition-colors group-hover:text-foreground"
          aria-hidden
        />
      </div>
      <div>
        <span
          className={cn(
            "font-display block text-4xl leading-none tabular-nums",
            toneClasses[tone],
          )}
        >
          {value}
        </span>
        <span className="mt-1.5 block text-xs leading-snug text-muted-foreground">
          {label}
        </span>
      </div>
    </Link>
  );
}

const quickActions: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/admin/temporadas", label: "Nueva temporada", icon: Trophy },
  { href: "/admin/calendario/generar", label: "Generar calendario", icon: CalendarPlus },
  { href: "/admin/inscripciones", label: "Registrar inscripción", icon: CreditCard },
  { href: "/admin/sanciones", label: "Aplicar sanción", icon: Ban },
];

export default async function AdminDashboard() {
  const context = await requireAdmin();
  if (!context) return null; // el layout ya mostró el aviso de configuración
  const { supabase, role } = context;

  const now = new Date();
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
  const weekEnd = new Date(dayStart.getTime() + 7 * 24 * 60 * 60 * 1000);

  const [todayGames, pendingRegs, activeSanctions, pendingSignups, upcoming] = await Promise.all([
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
      .from("signup_requests")
      .select("id", { count: "exact", head: true })
      .in("status", ["pending", "contacted"]),
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
  const todayLabel = dateFormat.format(now);

  return (
    <main className="stagger mx-auto flex w-full max-w-5xl flex-col gap-7 px-4 py-6 lg:px-8">
      <AdminTitle
        subtitle={
          <span className="capitalize">{todayLabel}</span>
        }
        action={
          <span className="rounded-full border border-brand-silver/25 bg-brand-silver/5 px-3 py-1.5 text-xs font-medium text-brand-silver">
            {roleLabels[role] ?? "Administrador"}
          </span>
        }
      >
        Dashboard
      </AdminTitle>

      {/* Solo aparece si el panel aún no está instalado como app. */}
      <InstallAppButton className="self-start lg:hidden" />

      <section
        aria-label="Pendientes"
        className="grid grid-cols-2 gap-3 sm:grid-cols-4"
      >
        <StatTile
          value={pendingSignups.count ?? 0}
          label="Solicitudes por revisar"
          href="/admin/solicitudes"
          tone="amber"
          icon={ClipboardCheck}
        />
        <StatTile
          value={pendingRegs.count ?? 0}
          label="Pagos por confirmar"
          href="/admin/inscripciones"
          tone="amber"
          icon={CreditCard}
        />
        <StatTile
          value={activeSanctions.count ?? 0}
          label="Sanciones activas"
          href="/admin/sanciones"
          tone="red"
          icon={Ban}
        />
        <StatTile
          value={withoutScorekeeper}
          label="Partidos sin anotador (7 días)"
          href="/admin/calendario"
          tone="silver"
          icon={TriangleAlert}
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
            {games.map((game) => {
              const live = game.status === "in_progress";
              return (
                <li
                  key={game.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card/60 px-4 py-3 text-sm transition-colors hover:bg-muted"
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    {live && <span className="live-dot size-2 shrink-0" aria-hidden />}
                    <span className="truncate">
                      {game.away?.name ?? "—"} @ {game.home?.name ?? "—"}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2.5 text-muted-foreground">
                    <span className="tabular-nums">
                      {timeFormat.format(new Date(game.scheduled_at))}
                    </span>
                    <StatusChip status={game.status} />
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="rapidos" className="flex flex-col gap-3">
        <h2 id="rapidos" className="font-display text-xl">
          Accesos rápidos
        </h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {quickActions.map((action) => {
            const Icon = action.icon;
            return (
              <Link
                key={action.href}
                href={action.href}
                className="card-elevated hover-lift group flex min-h-24 flex-col justify-between gap-3 rounded-2xl p-4"
              >
                <span className="flex size-9 items-center justify-center rounded-xl bg-white/[0.04] text-brand-amber ring-1 ring-white/[0.06]">
                  <Icon className="size-4.5" aria-hidden />
                </span>
                <span className="text-sm font-semibold leading-snug">
                  {action.label}
                </span>
              </Link>
            );
          })}
        </div>
      </section>
    </main>
  );
}
