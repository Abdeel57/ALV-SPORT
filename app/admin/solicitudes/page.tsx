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

  let query = context.supabase
    .from("signup_requests")
    .select(
      "id, kind, status, season_id, full_name, email, phone, team_name, team_color, preferred_team_id, position, jersey_number, message, created_at, resolved_team_id, resolved_player_id, seasons(name, leagues(name))",
    )
    .order("created_at", { ascending: false });
  if (estado === "abiertas") query = query.in("status", ["pending", "contacted"]);
  else if (estado) query = query.eq("status", estado);
  if (tipo) query = query.eq("kind", tipo);

  const [{ data: reqData }, { data: divData }, { data: teamData }] = await Promise.all([
    query,
    context.supabase.from("divisions").select("id, name, season_id"),
    context.supabase.from("teams").select("id, name, division_id, join_code"),
  ]);
  const requests = (reqData ?? []) as unknown as SignupRow[];
  const divisions = (divData ?? []) as { id: string; name: string; season_id: string }[];
  const teams = (teamData ?? []) as {
    id: string;
    name: string;
    division_id: string;
    join_code: string | null;
  }[];
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

  const filters: { key: string; label: string; param: "estado"; value: string }[] = [
    { key: "abiertas", label: "Abiertas", param: "estado", value: "abiertas" },
    { key: "approved", label: "Aprobadas", param: "estado", value: "approved" },
    { key: "rejected", label: "Rechazadas", param: "estado", value: "rejected" },
    { key: "todas", label: "Todas", param: "estado", value: "" },
  ];

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-6">
      <AdminTitle>Solicitudes de registro</AdminTitle>
      <Feedback ok={ok} error={error} />
      <p className="text-sm text-muted-foreground">
        Coaches y jugadores que se registraron desde el sitio. Aprobar a un
        coach <strong>crea su equipo</strong> y siembra la inscripción; aprobar
        a un jugador <strong>lo crea y lo pone en el roster</strong> — sin
        capturar nada a mano.
      </p>

      <div className="flex flex-wrap gap-2">
        {filters.map((filter) => {
          const active = estado === filter.value || (filter.value === "" && estado === "todas");
          const href = `/admin/solicitudes?estado=${filter.value === "" ? "todas" : filter.value}${tipo ? `&tipo=${tipo}` : ""}`;
          return (
            <a
              key={filter.key}
              href={href}
              className={`min-h-9 rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                active ? "border-brand-amber/60 bg-secondary font-semibold" : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {filter.label}
            </a>
          );
        })}
      </div>

      {requests.length === 0 ? (
        <EmptyRow>No hay solicitudes con estos filtros.</EmptyRow>
      ) : (
        <ul className="flex flex-col gap-3">
          {requests.map((request) => {
            const open = request.status === "pending" || request.status === "contacted";
            const seasonDivisions = request.season_id
              ? (divisionsBySeason.get(request.season_id) ?? [])
              : [];
            const seasonTeams = request.season_id
              ? (teamsBySeason.get(request.season_id) ?? [])
              : [];
            return (
              <li key={request.id} className="flex flex-col gap-3 rounded-2xl border p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className="rounded-md border px-2 py-0.5 text-xs font-semibold"
                    style={{
                      borderColor: request.kind === "coach" ? "var(--brand-amber)" : "var(--brand-silver)",
                      color: request.kind === "coach" ? "var(--brand-amber)" : "var(--brand-silver)",
                    }}
                  >
                    {request.kind === "coach" ? "COACH" : "JUGADOR"}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-medium">{request.full_name}</span>
                  <StatusChip status={request.status} />
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {dateFormat.format(new Date(request.created_at))}
                  </span>
                </div>

                <div className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
                  <p className="truncate">
                    <span className="text-muted-foreground">Correo: </span>
                    <a href={`mailto:${request.email}`} className="text-brand-amber hover:underline">
                      {request.email}
                    </a>
                  </p>
                  {request.phone && (
                    <p className="truncate">
                      <span className="text-muted-foreground">Tel: </span>
                      {request.phone}
                    </p>
                  )}
                  <p className="truncate">
                    <span className="text-muted-foreground">Liga: </span>
                    {seasonLabel(request.seasons) || "—"}
                  </p>
                  {request.kind === "coach" ? (
                    <p className="truncate">
                      <span className="text-muted-foreground">Equipo: </span>
                      {request.team_name ?? "—"}
                    </p>
                  ) : (
                    <p className="truncate">
                      <span className="text-muted-foreground">Quiere: </span>
                      {request.preferred_team_id
                        ? (teamName.get(request.preferred_team_id) ?? "un equipo")
                        : "Agente libre (busca equipo)"}
                      {request.position ? ` · ${request.position}` : ""}
                      {request.jersey_number ? ` · #${request.jersey_number}` : ""}
                    </p>
                  )}
                </div>
                {request.message && (
                  <p className="rounded-lg border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                    “{request.message}”
                  </p>
                )}

                {request.status === "approved" && (
                  <div className="flex flex-col gap-2">
                    <p className="text-xs text-brand-silver">
                      ✓ {request.resolved_team_id ? "Equipo creado" : request.resolved_player_id ? "Jugador agregado al roster" : "Aprobada"}
                    </p>
                    {request.resolved_team_id && teamCode.get(request.resolved_team_id) && (
                      <div className="rounded-lg border border-brand-amber/25 bg-brand-amber/[0.03] p-3">
                        <p className="mb-2 text-xs text-muted-foreground">
                          📲 Comparte este link con el coach para que sus
                          jugadores se auto-agreguen al roster:
                        </p>
                        <CopyLink
                          url={`${siteUrl}/unirse/${teamCode.get(request.resolved_team_id)}`}
                        />
                      </div>
                    )}
                  </div>
                )}

                {open && request.kind === "coach" && (
                  <form
                    action={approveCoachRequest}
                    className="flex flex-col gap-3 rounded-xl border border-brand-amber/25 bg-brand-amber/[0.03] p-3"
                  >
                    <input type="hidden" name="requestId" value={request.id} />
                    <p className="text-xs font-semibold text-brand-amber">Aprobar y crear equipo</p>
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
                      <Field label="Slug (URL)">
                        <input
                          name="slug"
                          required
                          defaultValue={slugify(request.team_name ?? request.full_name)}
                          className={inputClass}
                        />
                      </Field>
                      <Field label="Color">
                        <input
                          type="color"
                          name="color"
                          defaultValue={request.team_color ?? "#2563EB"}
                          className="h-12 w-full rounded-lg border bg-transparent px-2"
                        />
                      </Field>
                      <Field label="Cuota de inscripción (MXN, opcional)">
                        <input
                          type="number"
                          name="amount"
                          min="0"
                          step="0.01"
                          placeholder="1500"
                          className={inputClass}
                        />
                      </Field>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <SubmitButton>Crear equipo y aprobar</SubmitButton>
                    </div>
                  </form>
                )}

                {open && request.kind === "player" && (
                  <form
                    action={approvePlayerRequest}
                    className="flex flex-col gap-3 rounded-xl border border-brand-silver/25 bg-white/[0.02] p-3"
                  >
                    <input type="hidden" name="requestId" value={request.id} />
                    <p className="text-xs font-semibold text-brand-silver">Aprobar y agregar al roster</p>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <Field label="Equipo">
                        <select
                          name="teamId"
                          required
                          defaultValue={request.preferred_team_id ?? ""}
                          className={inputClass}
                        >
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
                      <Field label="Número" hint="opcional">
                        <input
                          name="jerseyNumber"
                          inputMode="numeric"
                          maxLength={4}
                          defaultValue={request.jersey_number ?? ""}
                          placeholder="Sin asignar"
                          className={inputClass}
                        />
                      </Field>
                      <Field label="Posición (opcional)">
                        <input
                          name="position"
                          defaultValue={request.position ?? ""}
                          className={inputClass}
                        />
                      </Field>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <SubmitButton>Crear jugador y aprobar</SubmitButton>
                    </div>
                  </form>
                )}

                <div className="flex flex-wrap gap-2">
                  {request.status === "pending" && (
                    <form action={markSignupContacted.bind(null, request.id)}>
                      <GhostButton>Marcar como contactado</GhostButton>
                    </form>
                  )}
                  {open && (
                    <form action={rejectSignup.bind(null, request.id)}>
                      <GhostButton>Rechazar</GhostButton>
                    </form>
                  )}
                  <form action={deleteSignup.bind(null, request.id)}>
                    <ConfirmButton message={`¿Eliminar la solicitud de ${request.full_name}?`}>
                      Eliminar
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
