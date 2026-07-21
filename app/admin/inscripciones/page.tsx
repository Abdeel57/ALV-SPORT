import type { Metadata } from "next";
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
  approveRegistration,
  createMpCheckout,
  createRegistration,
  registerCashPayment,
  rejectRegistration,
} from "@/lib/admin/actions";
import { requireAdmin } from "@/lib/admin/auth";
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
  searchParams: Promise<{ ok?: string; error?: string; mp_link?: string }>;
}

const money = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

export default async function InscripcionesPage({ searchParams }: PageProps) {
  const { ok, error, mp_link } = await searchParams;
  const context = await requireAdmin();
  if (!context) return null;

  const [{ data: regRows }, { data: seasonRows }, { data: teamRows }] =
    await Promise.all([
      context.supabase
        .from("registrations")
        .select(
          "id, status, amount, payment_method, payment_ref, note, teams(name), seasons(name, leagues(name))",
        )
        .order("created_at", { ascending: false }),
      context.supabase
        .from("seasons")
        .select("id, name, leagues(name)")
        .order("created_at", { ascending: false }),
      context.supabase.from("teams").select("id, name").order("name"),
    ]);
  const registrations = (regRows ?? []) as unknown as RegistrationRow[];
  const seasons = (seasonRows ?? []) as unknown as {
    id: string;
    name: string;
    leagues: { name: string } | null;
  }[];
  const teams = (teamRows ?? []) as { id: string; name: string }[];
  const mpReady = hasMercadoPago();

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6">
      <AdminTitle>Inscripciones y pagos</AdminTitle>
      <Feedback ok={ok} error={error} mpLink={mp_link} />

      <section className="rounded-2xl border p-4">
        <h2 className="mb-3 font-display text-xl">Registrar inscripción</h2>
        <p className="mb-3 text-xs text-muted-foreground">
          Flujo: registrar → aprobar → cobrar (Mercado Pago o efectivo). El
          capitán también puede registrar a su equipo desde su cuenta.
        </p>
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
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Monto (MXN)">
            <input type="number" name="amount" min="0" step="0.01" required placeholder="1500" className={inputClass} />
          </Field>
          <div className="sm:col-span-3">
            <SubmitButton>Registrar</SubmitButton>
          </div>
        </form>
      </section>

      {registrations.length === 0 ? (
        <EmptyRow>Sin inscripciones registradas.</EmptyRow>
      ) : (
        <ul className="flex flex-col gap-3">
          {registrations.map((registration) => (
            <li key={registration.id} className="flex flex-col gap-3 rounded-2xl border p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {registration.teams?.name ?? "—"}
                  <span className="text-muted-foreground">
                    {" "}
                    · {seasonLabel(registration.seasons)}
                  </span>
                </span>
                {registration.amount !== null && (
                  <span className="font-display text-lg tabular-nums">
                    {money.format(Number(registration.amount))}
                  </span>
                )}
                <StatusChip status={registration.status} />
              </div>
              {registration.status === "paid" && (
                <p className="text-xs text-muted-foreground">
                  {registration.payment_method === "cash" ? "Efectivo" : "Mercado Pago"}
                  {registration.payment_ref ? ` · ref: ${registration.payment_ref}` : ""}
                  {registration.note ? ` · ${registration.note}` : ""}
                </p>
              )}

              {registration.status === "pending" && (
                <div className="flex flex-wrap gap-2">
                  <form action={approveRegistration.bind(null, registration.id)}>
                    <SubmitButton>Aprobar</SubmitButton>
                  </form>
                  <form action={rejectRegistration.bind(null, registration.id)}>
                    <GhostButton>Rechazar</GhostButton>
                  </form>
                </div>
              )}

              {registration.status === "approved" && (
                <div className="flex flex-col gap-3">
                  <div className="flex flex-wrap gap-2">
                    <form action={createMpCheckout.bind(null, registration.id)}>
                      <button
                        type="submit"
                        disabled={!mpReady}
                        className="min-h-11 rounded-lg border border-brand-amber/50 px-3 text-sm text-brand-amber transition-colors hover:bg-brand-amber/10 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {mpReady ? "Generar link de Mercado Pago" : "Mercado Pago sin configurar"}
                      </button>
                    </form>
                  </div>
                  <form action={registerCashPayment} className="flex flex-wrap items-end gap-2">
                    <input type="hidden" name="registrationId" value={registration.id} />
                    <Field label="Folio (opcional)">
                      <input name="paymentRef" placeholder="REC-001" className={`${inputClass} min-h-11 max-w-36`} />
                    </Field>
                    <Field label="Nota del pago en efectivo">
                      <input name="note" required placeholder="Pagó el capitán en la junta" className={`${inputClass} min-h-11 max-w-72`} />
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
