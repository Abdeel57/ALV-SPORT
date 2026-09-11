import { Ban, XCircle } from "lucide-react";
import type { Metadata } from "next";
import { ConfirmButton } from "@/components/admin/confirm-button";
import {
  AdminTitle,
  EmptyRow,
  Feedback,
  Field,
  FormPanel,
  ListRow,
  RowText,
  StatusChip,
  SubmitButton,
  inputClass,
} from "@/components/admin/ui";
import { cancelSanction, createSanction } from "@/lib/admin/actions";
import { requireAdmin } from "@/lib/admin/auth";
import { sql } from "@/lib/db";

export const metadata: Metadata = { title: "Sanciones" };
export const dynamic = "force-dynamic";

interface SanctionRow {
  id: string;
  reason: string;
  games_count: number;
  starts_on: string;
  status: string;
  players: { first_name: string; last_name: string } | null;
}

interface PageProps {
  searchParams: Promise<{ ok?: string; error?: string; nuevo?: string }>;
}

export default async function SancionesPage({ searchParams }: PageProps) {
  const { ok, error, nuevo } = await searchParams;
  const context = await requireAdmin();
  if (!context) return null;

  const [sanctions, players] = await Promise.all([
    context.db.rows<SanctionRow>(sql`
      select s.id, s.reason, s.games_count, s.starts_on, s.status::text as status,
             case when p.id is null then null
                  else json_build_object('first_name', p.first_name, 'last_name', p.last_name) end as players
        from public.sanctions s
        left join public.players p on p.id = s.player_id
       order by s.created_at desc
    `),
    context.db.rows<{ id: string; first_name: string; last_name: string }>(sql`
      select id, first_name, last_name from public.players order by last_name, first_name limit 300
    `),
  ]);

  // Partidos cumplidos por sanción, derivados en la base de un solo viaje.
  const activeIds = sanctions.filter((s) => s.status === "active").map((s) => s.id);
  const servedRows =
    activeIds.length > 0
      ? await context.db.rows<{ id: string; served: number | null }>(sql`
          select s.id, public.sanction_games_served(s.id) as served
            from public.sanctions s
           where s.id = any(${activeIds}::uuid[])
        `)
      : [];
  const served = new Map(servedRows.map((row) => [row.id, row.served ?? 0]));
  const active = activeIds.length;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-6">
      <AdminTitle count={sanctions.length} subtitle={active > 0 ? `${active} activa${active === 1 ? "" : "s"} · el sancionado no puede ser titular` : "El sancionado no puede ser titular"}>
        Sanciones
      </AdminTitle>
      <Feedback ok={ok} error={error} />

      <FormPanel title="Aplicar sanción" icon={Ban} open={nuevo === "1"}>
        <form action={createSanction} className="grid gap-3 sm:grid-cols-2">
          <Field label="Jugador">
            <select name="playerId" required defaultValue="" className={inputClass}>
              <option value="" disabled>
                Selecciona
              </option>
              {players.map((player) => (
                <option key={player.id} value={player.id}>
                  {player.last_name} {player.first_name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Partidos de suspensión">
            <input type="number" name="gamesCount" min={1} max={99} required defaultValue={1} className={inputClass} />
          </Field>
          <Field label="Motivo">
            <input name="reason" required placeholder="Expulsión por conducta antideportiva" className={inputClass} />
          </Field>
          <Field label="Vigente desde">
            <input type="date" name="startsOn" required className={inputClass} />
          </Field>
          <div className="sm:col-span-2">
            <SubmitButton>Aplicar sanción</SubmitButton>
          </div>
        </form>
      </FormPanel>

      {sanctions.length === 0 ? (
        <EmptyRow>Sin sanciones.</EmptyRow>
      ) : (
        <ul className="flex flex-col gap-2">
          {sanctions.map((sanction) => {
            const done = sanction.status === "active" && (served.get(sanction.id) ?? 0) >= sanction.games_count;
            return (
              <ListRow
                key={sanction.id}
                actions={
                  sanction.status === "active" ? (
                    <form action={cancelSanction.bind(null, sanction.id)}>
                      <ConfirmButton icon ariaLabel="Cancelar sanción" message="¿Cancelar esta sanción? El jugador vuelve a ser elegible.">
                        <XCircle className="size-4" aria-hidden />
                      </ConfirmButton>
                    </form>
                  ) : undefined
                }
              >
                <RowText
                  title={`${sanction.players?.first_name ?? ""} ${sanction.players?.last_name ?? ""}`.trim() || "—"}
                  meta={`${sanction.reason} · desde ${sanction.starts_on}`}
                />
                {sanction.status === "active" && (
                  <span className="shrink-0 font-display text-lg tabular-nums" title="Partidos cumplidos">
                    {served.get(sanction.id) ?? 0}/{sanction.games_count}
                  </span>
                )}
                <StatusChip status={done ? "served" : sanction.status} />
              </ListRow>
            );
          })}
        </ul>
      )}
    </main>
  );
}
