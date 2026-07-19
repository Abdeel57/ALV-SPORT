import type { Metadata } from "next";
import Image from "next/image";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { InitialsAvatar } from "@/components/public/team-initials";
import {
  AdminTitle,
  EmptyRow,
  Feedback,
  Field,
  SubmitButton,
  inputClass,
} from "@/components/admin/ui";
import {
  assignToRoster,
  deletePlayer,
  removeFromRoster,
  savePlayer,
} from "@/lib/admin/actions";
import { requireAdmin } from "@/lib/admin/auth";

export const metadata: Metadata = { title: "Jugadores" };
export const dynamic = "force-dynamic";

interface PlayerRow {
  id: string;
  first_name: string;
  last_name: string;
  photo_url: string | null;
  rosters: {
    id: string;
    jersey_number: string | null;
    teams: { name: string } | null;
  }[];
}

interface PageProps {
  searchParams: Promise<{ ok?: string; error?: string; q?: string }>;
}

export default async function JugadoresPage({ searchParams }: PageProps) {
  const { ok, error, q = "" } = await searchParams;
  const context = await requireAdmin();
  if (!context) return null;

  let playersQuery = context.supabase
    .from("players")
    .select("id, first_name, last_name, photo_url, rosters(id, jersey_number, teams(name))")
    .order("last_name")
    .limit(50);
  if (q.trim().length >= 2) {
    playersQuery = playersQuery.or(
      `first_name.ilike.%${q.trim()}%,last_name.ilike.%${q.trim()}%`,
    );
  }
  const [{ data: playerRows }, { data: teamRows }] = await Promise.all([
    playersQuery,
    context.supabase.from("teams").select("id, name").order("name"),
  ]);
  const players = (playerRows ?? []) as unknown as PlayerRow[];
  const teams = (teamRows ?? []) as { id: string; name: string }[];

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6">
      <AdminTitle>Jugadores</AdminTitle>
      <Feedback ok={ok} error={error} />

      <section className="rounded-2xl border p-4">
        <h2 className="mb-3 font-display text-xl">Nuevo jugador</h2>
        <form action={savePlayer} className="grid gap-3 sm:grid-cols-2">
          <Field label="Nombre">
            <input name="firstName" required className={inputClass} />
          </Field>
          <Field label="Apellido">
            <input name="lastName" required className={inputClass} />
          </Field>
          <Field label="Fecha de nacimiento (opcional)">
            <input type="date" name="birthdate" className={inputClass} />
          </Field>
          <Field label="Foto (opcional)">
            <input type="file" name="photo" accept="image/*" className={`${inputClass} py-2.5`} />
          </Field>
          <div className="sm:col-span-2">
            <SubmitButton>Crear jugador</SubmitButton>
          </div>
        </form>
      </section>

      <section className="rounded-2xl border p-4">
        <h2 className="mb-3 font-display text-xl">Asignar a roster</h2>
        <p className="mb-3 text-xs text-muted-foreground">
          Elegibilidad: un jugador no puede estar en dos equipos de la misma
          división; los suspendidos no podrán ser titulares en la mesa.
        </p>
        <form action={assignToRoster} className="grid gap-3 sm:grid-cols-4">
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
          <Field label="Número">
            <input name="jerseyNumber" required placeholder="23" className={inputClass} />
          </Field>
          <Field label="Posición (opcional)">
            <input name="position" placeholder="SS" className={inputClass} />
          </Field>
          <div className="sm:col-span-4">
            <SubmitButton>Asignar al roster</SubmitButton>
          </div>
        </form>
      </section>

      <section className="flex flex-col gap-3">
        <form className="flex gap-2" action="/admin/jugadores">
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Buscar jugador…"
            className={`${inputClass} max-w-72`}
          />
          <SubmitButton>Buscar</SubmitButton>
        </form>

        {players.length === 0 ? (
          <EmptyRow>Sin jugadores{q ? ` para “${q}”` : ""}.</EmptyRow>
        ) : (
          <ul className="flex flex-col gap-2">
            {players.map((player) => (
              <li key={player.id} className="flex items-center gap-3 rounded-xl border px-4 py-3">
                {player.photo_url ? (
                  <Image
                    src={player.photo_url}
                    alt=""
                    width={40}
                    height={40}
                    className="size-10 rounded-full border object-cover"
                  />
                ) : (
                  <InitialsAvatar
                    name={`${player.first_name} ${player.last_name}`}
                    className="size-10 border text-sm"
                  />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {player.first_name} {player.last_name}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {player.rosters.length === 0
                      ? "Sin equipo"
                      : player.rosters
                          .map((entry) => `#${entry.jersey_number ?? "—"} ${entry.teams?.name ?? ""}`)
                          .join(" · ")}
                  </span>
                </span>
                {player.rosters.map((entry) => (
                  <form key={entry.id} action={removeFromRoster.bind(null, entry.id)}>
                    <ConfirmButton message={`¿Quitar a ${player.first_name} de ${entry.teams?.name ?? "su equipo"}?`}>
                      Quitar de {entry.teams?.name ?? "equipo"}
                    </ConfirmButton>
                  </form>
                ))}
                <form action={deletePlayer.bind(null, player.id)}>
                  <ConfirmButton message={`¿Eliminar a ${player.first_name} ${player.last_name}?`}>
                    Eliminar
                  </ConfirmButton>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
