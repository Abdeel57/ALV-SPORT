import { Trash2 } from "lucide-react";
import type { Metadata } from "next";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { CopyLink } from "@/components/admin/copy-link";
import {
  AdminTitle,
  EmptyRow,
  Feedback,
  Field,
  GhostButton,
  StatusChip,
  SubmitButton,
  colorInputClass,
  inputClass,
} from "@/components/admin/ui";
import {
  approveCoachRequest,
  approvePlayerRequest,
  deleteSignup,
  markSignupContacted,
  rejectSignup,
} from "@/lib/admin/actions";
import { requireAdmin } from "@/lib/admin/auth";
import { join, sql, type SqlQuery } from "@/lib/db";
import { seasonLabel, slugify } from "@/lib/utils";

export const metadata: Metadata = { title: "Solicitudes" };
export const dynamic = "force-dynamic";

interface SignupRow {
  id: string;
  kind: "coach" | "player";
  status: string;
  season_id: string | null;
  full_name: string;
  email: string;
  phone: string | null;
  team_name: string | null;
  team_color: string | null;
  preferred_team_id: string | null;
  position: string | null;
  jersey_number: string | null;
  message: string | null;
  created_at: string;
  resolved_team_id: string | null;
  resolved_player_id: string | null;
  seasons: { name: string; leagues: { name: string } | null } | null;
}

const dateFormat = new Intl.DateTimeFormat("es-MX", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Mexico_City",
});

interface PageProps {
  searchParams: Promise<{ ok?: string; error?: string; estado?: string; tipo?: string }>;
}

export default async function SolicitudesPage({ searchParams }: PageProps) {
  const { ok, error, estado = "abiertas", tipo = "" } = await searchParams;
  const context = await requireAdmin();
  if (!context) return null;

  const conditions = [
    estado === "abiertas" ? sql`r.status in ('pending', 'contacted')` : estado !== "todas" ? sql`r.status::text = ${estado}` : null,
    tipo ? sql`r.kind::text = ${tipo}` : null,
  ].filter((part): part is SqlQuery => part !== null);
  const where = conditions.length > 0 ? join(conditions, " and ") : sql`true`;

  const [requests, divisions, teams] = await Promise.all([
    context.db.rows<SignupRow>(sql`
      select r.id, r.kind::text as kind, r.status::text as status, r.season_id,
             r.full_name, r.email, r.phone, r.team_name, r.team_color,
             r.preferred_team_id, r.position, r.jersey_number, r.message,
             r.created_at, r.resolved_team_id, r.resolved_player_id,
             case when se.id is null then null else json_build_object(
               'name', se.name,
               'leagues', case when l.id is null then null else json_build_object('name', l.name) end
             ) end as seasons
        from public.signup_requests r
        left join public.seasons se on se.id = r.season_id
        left join public.leagues l on l.id = se.league_id
       where ${where}
       order by r.created_at desc
    `),
    context.db.rows<{ id: string; name: string; season_id: string }>(sql`select id, name, season_id from public.divisions`),
    context.db.rows<{ id: string; name: string; division_id: string; join_code: string | null }>(sql`
      select id, name, division_id, join_code from public.teams
    `),
  ]);
  const teamCode = new Map(teams.map((t) => [t.id, t.join_code]));
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "";

  const divisionSeason = new Map(divisions.map((d) => [d.id, d.season_id]));
  const divisionsBySeason = new Map<string, { id: string; name: string }[]>();
  for (const d of divisions) {
    const list = divisionsBySeason.get(d.season_id) ?? [];
    list.push({ id: d.id, name: d.name });
    divisionsBySeason.set(d.season_id, list);
  }
  const teamsBySeason = new Map<string, { id: string; name: string }[]>();
  const teamName = new Map<string, string>();
  for (const t of teams) {
    teamName.set(t.id, t.name);
    const seasonId = divisionSeason.get(t.division_id);
    if (!seasonId) continue;
    const list = teamsBySeason.get(seasonId) ?? [];
    list.push({ id: t.id, name: t.name });
    teamsBySeason.set(seasonId, list);
  }

  const filters = [
    { value: "abiertas", label: "Abiertas" },
    { value: "approved", label: "Aprobadas" },
    { value: "rejected", label: "Rechazadas" },
    { value: "todas", label: "Todas" },
  ];

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-6">
      <AdminTitle count={requests.length} subtitle="Coaches y jugadores que se registraron desde el sitio">
        Solicitudes
      </AdminTitle>
      <Feedback ok={ok} error={error} />

      <nav aria-label="Filtro por estado" className="flex gap-1 rounded-xl border p-1">
        {filters.map((filter) => {
          const active = estado === filter.value;
          const href = `/admin/solicitudes?estado=${filter.value}${tipo ? `&tipo=${tipo}` : ""}`;
          return (
            <a
              key={filter.value}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-10 flex-1 items-center justify-center rounded-lg px-2 text-sm transition-colors ${
                active ? "bg-secondary font-semibold text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              {filter.label}
            </a>
          );
        })}
      </nav>

      {requests.length === 0 ? (
        <EmptyRow>No hay solicitudes {estado === "abiertas" ? "abiertas" : "con este filtro"}.</EmptyRow>
      ) : (
        <ul className="flex flex-col gap-3">
          {requests.map((request) => {
            const open = request.status === "pending" || request.status === "contacted";
            const seasonDivisions = request.season_id ? (divisionsBySeason.get(request.season_id) ?? []) : [];
            const seasonTeams = request.season_id ? (teamsBySeason.get(request.season_id) ?? []) : [];
            return (
              <li key={request.id} className="flex flex-col gap-3 rounded-2xl border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-sm font-semibold">
                      <span
                        className="rounded-md border px-1.5 py-0.5 text-[10px] font-bold tracking-wider uppercase"
                        style={{
                          borderColor: request.kind === "coach" ? "var(--brand-amber)" : "var(--brand-silver)",
                          color: request.kind === "coach" ? "var(--brand-amber)" : "var(--brand-silver)",
                        }}
                      >
                        {request.kind === "coach" ? "Coach" : "Jugador"}
                      </span>
                      <span className="truncate">{request.full_name}</span>
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {seasonLabel(request.seasons) || "Sin liga"} · {dateFormat.format(new Date(request.created_at))}
                    </p>
                  </div>
                  <StatusChip status={request.status} />
                </div>

                <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
                  <div className="flex gap-1 truncate">
                    <dt className="text-muted-foreground">Correo</dt>
                    <dd className="truncate">
                      <a href={`mailto:${request.email}`} className="text-brand-amber hover:underline">
                        {request.email}
                      </a>
                    </dd>
                  </div>
                  {request.phone && (
                    <div className="flex gap-1 truncate">
                      <dt className="text-muted-foreground">Tel.</dt>
                      <dd>
                        <a href={`tel:${request.phone}`} className="hover:underline">
                          {request.phone}
                        </a>
                      </dd>
                    </div>
                  )}
                  <div className="flex gap-1 truncate">
                    <dt className="text-muted-foreground">{request.kind === "coach" ? "Equipo" : "Quiere"}</dt>
                    <dd className="truncate">
                      {request.kind === "coach"
                        ? (request.team_name ?? "—")
                        : `${request.preferred_team_id ? (teamName.get(request.preferred_team_id) ?? "un equipo") : "Agente libre"}${request.position ? ` · ${request.position}` : ""}${request.jersey_number ? ` · #${request.jersey_number}` : ""}`}
                    </dd>
                  </div>
                </dl>
                {request.message && (
                  <p className="rounded-lg border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">“{request.message}”</p>
                )}

                {request.status === "approved" && (
                  <div className="flex flex-col gap-2">
                    <p className="text-xs text-brand-silver">
                      ✓ {request.resolved_team_id ? "Equipo creado" : request.resolved_player_id ? "Jugador en el roster" : "Aprobada"}
                    </p>
                    {request.resolved_team_id && teamCode.get(request.resolved_team_id) && (
                      <CopyLink label="Link para que sus jugadores se unan" url={`${siteUrl}/unirse/${teamCode.get(request.resolved_team_id)}`} />
                    )}
                  </div>
                )}

                {open && request.kind === "coach" && (
                  <form action={approveCoachRequest} className="flex flex-col gap-3 rounded-xl border border-brand-amber/25 bg-brand-amber/[0.03] p-3">
                    <input type="hidden" name="requestId" value={request.id} />
                    <p className="text-xs font-semibold text-brand-amber">Aprobar: crea el equipo y su inscripción</p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="División">
                        <select name="divisionId" required defaultValue="" className={inputClass}>
                          <option value="" disabled>
                            {seasonDivisions.length ? "Selecciona" : "Crea una división primero"}
                          </option>
                          {seasonDivisions.map((division) => (
                            <option key={division.id} value={division.id}>
                              {division.name}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="URL pública">
                        <input name="slug" required defaultValue={slugify(request.team_name ?? request.full_name)} className={inputClass} />
                      </Field>
                      <div className="grid grid-cols-[auto_1fr] gap-3">
                        <Field label="Color">
                          <input type="color" name="color" defaultValue={request.team_color ?? "#2563EB"} className={colorInputClass} />
                        </Field>
                        <Field label="Cuota (MXN)">
                          <input type="number" name="amount" min="0" step="0.01" placeholder="Opcional" className={inputClass} />
                        </Field>
                      </div>
                    </div>
                    <SubmitButton className="self-start">Crear equipo y aprobar</SubmitButton>
                  </form>
                )}

                {open && request.kind === "player" && (
                  <form action={approvePlayerRequest} className="flex flex-col gap-3 rounded-xl border border-brand-silver/25 bg-white/[0.02] p-3">
                    <input type="hidden" name="requestId" value={request.id} />
                    <p className="text-xs font-semibold text-brand-silver">Aprobar: crea al jugador y lo pone en el roster</p>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <Field label="Equipo">
                        <select name="teamId" required defaultValue={request.preferred_team_id ?? ""} className={inputClass}>
                          <option value="" disabled>
                            {seasonTeams.length ? "Selecciona" : "No hay equipos aún"}
                          </option>
                          {seasonTeams.map((team) => (
                            <option key={team.id} value={team.id}>
                              {team.name}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Número">
                        <input name="jerseyNumber" inputMode="numeric" maxLength={4} defaultValue={request.jersey_number ?? ""} placeholder="Opcional" className={inputClass} />
                      </Field>
                      <Field label="Posición">
                        <input name="position" defaultValue={request.position ?? ""} placeholder="Opcional" className={inputClass} />
                      </Field>
                    </div>
                    <SubmitButton className="self-start">Crear jugador y aprobar</SubmitButton>
                  </form>
                )}

                <div className="flex flex-wrap items-center gap-2">
                  {request.status === "pending" && (
                    <form action={markSignupContacted.bind(null, request.id)}>
                      <GhostButton>Marcar contactado</GhostButton>
                    </form>
                  )}
                  {open && (
                    <form action={rejectSignup.bind(null, request.id)}>
                      <GhostButton>Rechazar</GhostButton>
                    </form>
                  )}
                  <form action={deleteSignup.bind(null, request.id)} className="ml-auto">
                    <ConfirmButton icon ariaLabel="Eliminar solicitud" message={`¿Eliminar la solicitud de ${request.full_name}?`}>
                      <Trash2 className="size-4" aria-hidden />
                    </ConfirmButton>
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
