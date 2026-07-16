import type { Metadata } from "next";
import { ConfirmButton } from "@/components/admin/confirm-button";
import {
  AdminTitle,
  EmptyRow,
  Feedback,
  Field,
  StatusChip,
  SubmitButton,
  inputClass,
} from "@/components/admin/ui";
import { cancelSanction, createSanction } from "@/lib/admin/actions";
import { requireAdmin } from "@/lib/admin/auth";

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
  searchParams: Promise<{ ok?: string; error?: string }>;
}

export default async function SancionesPage({ searchParams }: PageProps) {
  const { ok, error } = await searchParams;
  const context = await requireAdmin();
  if (!context) return null;

  const [{ data: sanctionRows }, { data: playerRows }] = await Promise.all([
    context.supabase
      .from("sanctions")
      .select("id, reason, games_count, starts_on, status, players(first_name, last_name)")
      .order("created_at", { ascending: false }),
    context.supabase
      .from("players")
      .select("id, first_name, last_name")
      .order("last_name")
      .limit(200),
  ]);
  const sanctions = (sanctionRows ?? []) as unknown as SanctionRow[];
  const players = (playerRows ?? []) as { id: string; first_name: string; last_name: string }[];

  // Juegos cumplidos por sanción (derivado en la base).
  const served = new Map<string, number>();
  await Promise.all(
    sanctions
      .filter((sanction) => sanction.status === "active")
      .map(async (sanction) => {
        const { data } = await context.supabase.rpc("sanction_games_served", {
          p_sanction: sanction.id,
        });
        served.set(sanction.id, (data as number | null) ?? 0);
      }),
  );

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6">
      <AdminTitle>Sanciones</AdminTitle>
      <Feedback ok={ok} error={error} />
      <p className="text-sm text-muted-foreground">
        Un jugador con sanción activa <strong>no puede ser marcado titular</strong>{" "}
        en la mesa de anotación (bloqueado también a nivel base de datos). Los
        partidos cumplidos se derivan de los juegos finalizados de su equipo.
      </p>

      <section className="rounded-2xl border p-4">
        <h2 className="mb-3 font-display text-xl">Aplicar sanción</h2>
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
      </section>

      {sanctions.length === 0 ? (
        <EmptyRow>Sin sanciones registradas.</EmptyRow>
      ) : (
        <ul className="flex flex-col gap-2">
          {sanctions.map((sanction) => (
            <li key={sanction.id} className="flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  {sanction.players?.first_name} {sanction.players?.last_name}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {sanction.reason} · desde {sanction.starts_on}
                </span>
              </span>
              {sanction.status === "active" && (
                <span className="font-display text-lg tabular-nums">
                  {served.get(sanction.id) ?? 0}/{sanction.games_count}
                </span>
              )}
              <StatusChip
                status={
                  sanction.status === "active" &&
                  (served.get(sanction.id) ?? 0) >= sanction.games_count
                    ? "served"
                    : sanction.status
                }
              />
              {sanction.status === "active" && (
                <form action={cancelSanction.bind(null, sanction.id)}>
                  <ConfirmButton message="¿Cancelar esta sanción? El jugador vuelve a ser elegible.">
                    Cancelar
                  </ConfirmButton>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
