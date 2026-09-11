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
  bulkAssignRoster,
  deletePlayer,
  removeFromRoster,
  savePlayer,
} from "@/lib/admin/actions";
import { requireAdmin } from "@/lib/admin/auth";
import { empty, join, sql, type SqlQuery } from "@/lib/db";

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
  searchParams: Promise<{ ok?: string; error?: string; q?: string; team?: string }>;
}

export default async function JugadoresPage({ searchParams }: PageProps) {
  const { ok, error, q = "", team = "" } = await searchParams;
  const context = await requireAdmin();
  if (!context) return null;

  // Con ?team= la lista se vuelve el roster de ese equipo (desde la tarjeta
  // del equipo en /admin/equipos); el EXISTS descarta a quienes no están.
  const search = q.trim();
  const filters = [
    team
      ? sql`exists (select 1 from public.rosters r
                     where r.player_id = p.id and r.team_id = ${team})`
      : null,
    search.length >= 2
      ? sql`(p.first_name ilike ${`%${search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`}
             or p.last_name ilike ${`%${search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`})`
      : null,
  ].filter((part): part is SqlQuery => part !== null);
  const where = filters.length > 0 ? join(filters, " and ") : sql`true`;
  // Con ?team= el roster listado es solo el de ese equipo.
  const rosterFilter = team ? sql`and r.team_id = ${team}` : empty;

  const [players, teams] = await Promise.all([
    context.db.rows<PlayerRow>(sql`
      select p.id, p.first_name, p.last_name, p.photo_url,
             coalesce((
               select json_agg(
                        json_build_object(
                          'id', r.id,
                          'jersey_number', r.jersey_number,
                          'teams', case when t.id is null then null
                                        else json_build_object('name', t.name) end
                        ) order by r.created_at
                      )
                 from public.rosters r
                 left join public.teams t on t.id = r.team_id
                where r.player_id = p.id ${rosterFilter}
             ), '[]'::json) as rosters
        from public.players p
       where ${where}
       order by p.last_name
       limit 50
    `),
    context.db.rows<{ id: string; name: string }>(sql`
      select id, name from public.teams order by name
    `),
  ]);
  const rosterTeam = team ? teams.find((row) => row.id === team) : undefined;

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
        <h2 className="mb-3 font-display text-xl">Alta por lista (roster completo)</h2>
        <p className="mb-3 text-xs text-muted-foreground">
          Pega la lista del equipo: un jugador por línea, número de playera
          opcional al inicio o al final. Los nombres que ya existen se
          reutilizan (no se duplican) y quien ya esté en un roster de la misma
          división se omite.
        </p>
        <form action={bulkAssignRoster} className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Equipo">
              <select name="teamId" required defaultValue={team || ""} className={inputClass}>
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
          </div>
          <div className="sm:col-span-2">
            <Field label="Lista de jugadores">
              <textarea
                name="list"
                required
                rows={8}
                placeholder={"23 Juan Pérez\nMaría López #10\nPedro Ramírez"}
                className={`${inputClass} min-h-40 py-2.5`}
              />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <SubmitButton>Agregar lista al equipo</SubmitButton>
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
            <select name="teamId" required defaultValue={team || ""} className={inputClass}>
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
          <Field label="Número" hint="opcional">
            <input
              name="jerseyNumber"
              inputMode="numeric"
              maxLength={4}
              placeholder="23"
              className={inputClass}
            />
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
        {rosterTeam && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-brand-amber/40 bg-secondary/50 px-4 py-3">
            <p className="text-sm">
              <span className="text-muted-foreground">Roster de </span>
              <span className="font-display text-base">{rosterTeam.name}</span>
              <span className="text-muted-foreground"> · {players.length} jugador{players.length === 1 ? "" : "es"}</span>
            </p>
            <a
              href="/admin/jugadores"
              className="flex min-h-11 items-center rounded-lg border px-3 text-sm text-muted-foreground hover:bg-muted"
            >
              Ver todos
            </a>
          </div>
        )}
        <form className="flex gap-2" action="/admin/jugadores">
          {team && <input type="hidden" name="team" value={team} />}
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder={rosterTeam ? `Buscar en ${rosterTeam.name}…` : "Buscar jugador…"}
            className={`${inputClass} max-w-72`}
          />
          <SubmitButton>Buscar</SubmitButton>
        </form>

        {players.length === 0 ? (
          <EmptyRow>
            Sin jugadores{q ? ` para “${q}”` : ""}
            {rosterTeam ? ` en el roster de ${rosterTeam.name}` : ""}.
          </EmptyRow>
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
