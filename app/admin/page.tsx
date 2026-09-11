import {
  ArrowUpRight,
  Ban,
  CalendarDays,
  CalendarPlus,
  ClipboardCheck,
  ClipboardPen,
  CreditCard,
  type LucideIcon,
  UserPlus,
  Users,
} from "lucide-react";
import Link from "next/link";
import { InstallAppButton } from "@/components/admin/install-app";
import { AdminTitle, EmptyRow, SectionHeading, StatusChip } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/admin/auth";
import { sql } from "@/lib/db";
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
  org_admin: "Administrador",
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
    <Link href={href} className="card-elevated hover-lift group flex flex-col gap-3 rounded-2xl p-4">
      <div className="flex items-center justify-between">
        <span className={cn("flex size-9 items-center justify-center rounded-xl bg-white/[0.04] ring-1 ring-white/[0.06]", toneClasses[tone])}>
          <Icon className="size-4.5" aria-hidden />
        </span>
        <ArrowUpRight className="size-4 text-muted-foreground/40 transition-colors group-hover:text-foreground" aria-hidden />
      </div>
      <div>
        <span className={cn("font-display block text-4xl leading-none tabular-nums", toneClasses[tone])}>{value}</span>
        <span className="mt-1.5 block text-xs leading-snug text-muted-foreground">{label}</span>
      </div>
    </Link>
  );
}

const quickActions: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/admin/calendario?nuevo=1", label: "Crear enfrentamiento", icon: CalendarPlus },
  { href: "/admin/calendario", label: "Dar resultado", icon: ClipboardPen },
  { href: "/admin/equipos?nuevo=1", label: "Nuevo equipo", icon: Users },
  { href: "/admin/jugadores?nuevo=1", label: "Nuevo jugador", icon: UserPlus },
];

export default async function AdminDashboard() {
  const context = await requireAdmin();
  if (!context) return null; // el layout ya mostró el aviso de configuración
  const { db, role } = context;

  const now = new Date();
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
  const weekEnd = new Date(dayStart.getTime() + 7 * 24 * 60 * 60 * 1000);

  const [games, counters] = await Promise.all([
    db.rows<GameRow>(sql`
      select g.id, g.status::text as status, g.scheduled_at,
             case when h.id is null then null
                  else json_build_object('name', h.name) end as home,
             case when a.id is null then null
                  else json_build_object('name', a.name) end as away
        from public.games g
        left join public.teams h on h.id = g.home_team_id
        left join public.teams a on a.id = g.away_team_id
       where (g.scheduled_at >= ${dayStart.toISOString()}
              and g.scheduled_at < ${dayEnd.toISOString()})
          or g.status = 'in_progress'
       order by g.scheduled_at
    `),
    db.one<{
      pending_regs: number;
      active_sanctions: number;
      pending_signups: number;
      week_games: number;
    }>(sql`
      select
        (select count(*)::int from public.registrations where status = 'pending') as pending_regs,
        (select count(*)::int from public.sanctions where status = 'active') as active_sanctions,
        (select count(*)::int from public.signup_requests
          where status in ('pending', 'contacted')) as pending_signups,
        (select count(*)::int from public.games g
          where g.status = 'scheduled'
            and g.scheduled_at >= ${dayStart.toISOString()}
            and g.scheduled_at < ${weekEnd.toISOString()}) as week_games
    `),
  ]);

  return (
    <main className="stagger mx-auto flex w-full max-w-5xl flex-col gap-7 px-4 py-6 lg:px-8">
      <AdminTitle
        subtitle={
          <>
            <span className="capitalize">{dateFormat.format(now)}</span> · {roleLabels[role] ?? "Administrador"}
          </>
        }
      >
        Panel
      </AdminTitle>

      <InstallAppButton className="self-start lg:hidden" />

      <section aria-label="Pendientes" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile value={counters.pending_signups} label="Solicitudes por revisar" href="/admin/solicitudes" tone="amber" icon={ClipboardCheck} />
        <StatTile value={counters.pending_regs} label="Pagos por confirmar" href="/admin/inscripciones" tone="amber" icon={CreditCard} />
        <StatTile value={counters.active_sanctions} label="Sanciones activas" href="/admin/sanciones" tone="red" icon={Ban} />
        <StatTile value={counters.week_games} label="Partidos esta semana" href="/admin/calendario" tone="silver" icon={CalendarDays} />
      </section>

      <section aria-labelledby="hoy" className="flex flex-col gap-3">
        <SectionHeading count={games.length}>
          <span id="hoy">Hoy y en curso</span>
        </SectionHeading>
        {games.length === 0 ? (
          <EmptyRow>No hay partidos programados para hoy.</EmptyRow>
        ) : (
          <ul className="flex flex-col gap-2">
            {games.map((game) => {
              const live = game.status === "in_progress";
              const stale = live && new Date(game.scheduled_at) < dayStart;
              return (
                <li key={game.id}>
                  <Link
                    href={`/anotador/${game.id}`}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card/60 px-4 py-3 text-sm transition-colors hover:bg-muted"
                  >
                    <span className="flex min-w-0 items-center gap-2.5">
                      {live && <span className="live-dot size-2 shrink-0" aria-hidden />}
                      <span className="min-w-0">
                        <span className="block truncate">
                          {game.home?.name ?? "Equipo 1"} vs {game.away?.name ?? "Equipo 2"}
                        </span>
                        {stale && (
                          <span className="block truncate text-[11px] text-brand-amber">
                            Abierto desde el {dateFormat.format(new Date(game.scheduled_at))} · ciérralo con &quot;Dar resultado&quot;
                          </span>
                        )}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2.5 text-muted-foreground">
                      <span className="tabular-nums">{timeFormat.format(new Date(game.scheduled_at))}</span>
                      <StatusChip status={game.status} />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="rapidos" className="flex flex-col gap-3">
        <SectionHeading>
          <span id="rapidos">Accesos rápidos</span>
        </SectionHeading>
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
                <span className="text-sm leading-snug font-semibold">{action.label}</span>
              </Link>
            );
          })}
        </div>
      </section>
    </main>
  );
}
