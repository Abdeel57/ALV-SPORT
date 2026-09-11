import { CreditCard } from "lucide-react";
import type { Metadata } from "next";
import { TeamOptions, type TeamChoice } from "@/components/admin/team-options";
import {
  AdminTitle,
  EmptyRow,
  Feedback,
  Field,
  FormPanel,
  GhostButton,
  StatusChip,
  SubmitButton,
  inputClass,
} from "@/components/admin/ui";
import {
  approveRegistration,
  createMpCheckout,
  createRegistration,
  registerCashPayment,
  rejectRegistration,
} from "@/lib/admin/actions";
import { requireAdmin } from "@/lib/admin/auth";
import { sql } from "@/lib/db";
import { hasMercadoPago } from "@/lib/admin/mercadopago";
import { seasonLabel } from "@/lib/utils";

export const metadata: Metadata = { title: "Inscripciones" };
export const dynamic = "force-dynamic";

interface RegistrationRow {
  id: string;
  status: string;
  amount: number | null;
  payment_method: string | null;
  payment_ref: string | null;
  note: string | null;
  teams: { name: string } | null;
  seasons: { name: string; leagues: { name: string } | null } | null;
}

interface PageProps {
  searchParams: Promise<{ ok?: string; error?: string; mp_link?: string; nuevo?: string }>;
}

const money = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

export default async function InscripcionesPage({ searchParams }: PageProps) {
  const { ok, error, mp_link, nuevo } = await searchParams;
  const context = await requireAdmin();
  if (!context) return null;

  const [registrations, seasons, teamRows] = await Promise.all([
    context.db.rows<RegistrationRow>(sql`
      select r.id, r.status::text as status, r.amount,
             r.payment_method::text as payment_method, r.payment_ref, r.note,
             case when t.id is null then null else json_build_object('name', t.name) end as teams,
             case when se.id is null then null else json_build_object(
               'name', se.name,
               'leagues', case when l.id is null then null else json_build_object('name', l.name) end
             ) end as seasons
        from public.registrations r
        left join public.teams t on t.id = r.team_id
        left join public.seasons se on se.id = r.season_id
        left join public.leagues l on l.id = se.league_id
       order by r.created_at desc
    `),
    context.db.rows<{ id: string; name: string; leagues: { name: string } | null }>(sql`
      select se.id, se.name,
             case when l.id is null then null else json_build_object('name', l.name) end as leagues
        from public.seasons se
        left join public.leagues l on l.id = se.league_id
       order by l.name, se.created_at desc
    `),
    context.db.rows<{ id: string; name: string; category: string | null }>(sql`
      select t.id, t.name, l.name as category
        from public.teams t
        left join public.divisions d on d.id = t.division_id
        left join public.seasons se on se.id = d.season_id
        left join public.leagues l on l.id = se.league_id
       order by l.name nulls last, t.name
    `),
  ]);
  const teams: TeamChoice[] = teamRows.map((row) => ({ id: row.id, name: row.name, category: row.category ?? "Sin categoría" }));
  const mpReady = hasMercadoPago();
  const pending = registrations.filter((r) => r.status === "pending").length;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-6">
      <AdminTitle count={registrations.length} subtitle={pending > 0 ? `${pending} por aprobar` : "Registrar → aprobar → cobrar"}>
        Inscripciones
      </AdminTitle>
      <Feedback ok={ok} error={error} mpLink={mp_link} />

      <FormPanel title="Registrar inscripción" icon={CreditCard} open={nuevo === "1"}>
        <form action={createRegistration} className="grid gap-3 sm:grid-cols-3">
          <Field label="Temporada">
            <select name="seasonId" required defaultValue="" className={inputClass}>
              <option value="" disabled>
                Selecciona
              </option>
              {seasons.map((season) => (
                <option key={season.id} value={season.id}>
                  {seasonLabel(season)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Equipo">
            <select name="teamId" required defaultValue="" className={inputClass}>
              <option value="" disabled>
                Selecciona
              </option>
              <TeamOptions teams={teams} />
            </select>
          </Field>
          <Field label="Monto (MXN)">
            <input type="number" name="amount" min="0" step="0.01" required placeholder="1500" className={inputClass} />
          </Field>
          <div className="sm:col-span-3">
            <SubmitButton>Registrar</SubmitButton>
          </div>
        </form>
      </FormPanel>

      {registrations.length === 0 ? (
        <EmptyRow>Todavía no hay inscripciones.</EmptyRow>
      ) : (
        <ul className="flex flex-col gap-3">
          {registrations.map((registration) => (
            <li key={registration.id} className="flex flex-col gap-3 rounded-2xl border p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{registration.teams?.name ?? "—"}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {seasonLabel(registration.seasons)}
                    {registration.status === "paid"
                      ? ` · ${registration.payment_method === "cash" ? "Efectivo" : "Mercado Pago"}${registration.payment_ref ? ` · ${registration.payment_ref}` : ""}${registration.note ? ` · ${registration.note}` : ""}`
                      : ""}
                  </p>
                </div>
                <span className="flex shrink-0 items-center gap-2">
                  {registration.amount !== null && (
                    <span className="font-display text-lg tabular-nums">{money.format(Number(registration.amount))}</span>
                  )}
                  <StatusChip status={registration.status} />
                </span>
              </div>

              {registration.status === "pending" && (
                <div className="flex flex-wrap gap-2">
                  <form action={approveRegistration.bind(null, registration.id)}>
                    <SubmitButton className="min-h-11">Aprobar</SubmitButton>
                  </form>
                  <form action={rejectRegistration.bind(null, registration.id)}>
                    <GhostButton>Rechazar</GhostButton>
                  </form>
                </div>
              )}

              {registration.status === "approved" && (
                <div className="flex flex-col gap-3">
                  <form action={createMpCheckout.bind(null, registration.id)}>
                    <button
                      type="submit"
                      disabled={!mpReady}
                      className="min-h-11 rounded-lg border border-brand-amber/50 px-3 text-sm text-brand-amber transition-colors hover:bg-brand-amber/10 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {mpReady ? "Generar link de Mercado Pago" : "Mercado Pago sin configurar"}
                    </button>
                  </form>
                  <form action={registerCashPayment} className="flex flex-wrap items-end gap-2">
                    <input type="hidden" name="registrationId" value={registration.id} />
                    <Field label="Folio">
                      <input name="paymentRef" placeholder="Opcional" className={`${inputClass} min-h-11 max-w-36`} />
                    </Field>
                    <Field label="Nota">
                      <input name="note" required placeholder="Pagó en efectivo el capitán" className={`${inputClass} min-h-11 max-w-72`} />
                    </Field>
                    <GhostButton>Registrar pago en efectivo</GhostButton>
                  </form>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
