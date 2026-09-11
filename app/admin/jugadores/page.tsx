import { ListPlus, Search, Trash2, UserMinus, UserPlus } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { TeamOptions, type TeamChoice } from "@/components/admin/team-options";
import {
  AdminTitle,
  EmptyRow,
  Feedback,
  Field,
  FormPanel,
  ListRow,
  RowText,
  SecondaryLink,
  SubmitButton,
  fileInputClass,
  inputClass,
} from "@/components/admin/ui";
import { InitialsAvatar } from "@/components/public/team-initials";
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

interface TeamRow {
  id: string;
  name: string;
  category: string | null;
}

interface PageProps {
  searchParams: Promise<{ ok?: string; error?: string; q?: string; team?: string; nuevo?: string }>;
}

export default async function JugadoresPage({ searchParams }: PageProps) {
  const { ok, error, q = "", team = "", nuevo } = await searchParams;
  const context = await requireAdmin();
  if (!context) return null;

  // Con ?team= la lista se vuelve el roster de ese equipo (desde la tarjeta
  // del equipo en /admin/equipos); el EXISTS descarta a quienes no están.
  const search = q.trim();
  const like = `%${search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const filters = [
    team ? sql`exists (select 1 from public.rosters r where r.player_id = p.id and r.team_id = ${team})` : null,
    search.length >= 2 ? sql`(p.first_name ilike ${like} or p.last_name ilike ${like})` : null,
  ].filter((part): part is SqlQuery => part !== null);
  const where = filters.length > 0 ? join(filters, " and ") : sql`true`;
  const rosterFilter = team ? sql`and r.team_id = ${team}` : empty;

  const [players, totalRow, teamRows, duplicateRows] = await Promise.all([
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
       order by p.last_name, p.first_name
       limit 50
    `),
    context.db.one<{ total: number }>(sql`select count(*)::int as total from public.players p where ${where}`),
    context.db.rows<TeamRow>(sql`
      select t.id, t.name, l.name as category
        from public.teams t
        left join public.divisions d on d.id = t.division_id
        left join public.seasons se on se.id = d.season_id
        left join public.leagues l on l.id = se.league_id
       order by l.name nulls last, t.name
    `),
    context.db.rows<{ first_name: string; last_name: string; n: number }>(sql`
      select first_name, last_name, count(*)::int as n
        from public.players
       group by lower(first_name), lower(last_name), first_name, last_name
      having count(*) > 1
       order by n desc, last_name
       limit 12
    `),
  ]);
  const duplicates = duplicateRows.map((row) => `${row.first_name} ${row.last_name}`);
  const teams: TeamChoice[] = teamRows.map((row) => ({ id: row.id, name: row.name, category: row.category ?? "Sin categoría" }));
  const rosterTeam = team ? teams.find((row) => row.id === team) : undefined;
  const total = totalRow.total;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-6">
      <AdminTitle
        count={total}
        subtitle={rosterTeam ? `Roster de ${rosterTeam.name}` : undefined}
        back={rosterTeam ? { href: "/admin/jugadores", label: "Todos los jugadores" } : undefined}
      >
        Jugadores
      </AdminTitle>
      <Feedback ok={ok} error={error} />
      {duplicates.length > 0 && !team && !search && (
        <p className="rounded-lg border border-brand-amber/40 bg-brand-amber/5 px-4 py-3 text-sm">
          <span className="font-semibold text-brand-amber">
            {duplicates.length} nombre{duplicates.length === 1 ? "" : "s"} repetido{duplicates.length === 1 ? "" : "s"}:
          </span>{" "}
          {duplicates.slice(0, 6).join(", ")}
          {duplicates.length > 6 ? "…" : ""}. Busca cada uno y elimina el registro que sobra.
        </p>
      )}

      <FormPanel title="Nuevo jugador" open={nuevo === "1"}>
        <form action={savePlayer} className="grid gap-3 sm:grid-cols-2">
          <Field label="Nombre">
            <input name="firstName" required className={inputClass} />
          </Field>
          <Field label="Apellido">
            <input name="lastName" required className={inputClass} />
          </Field>
          <Field label="Equipo">
            <select name="teamId" defaultValue={team || ""} className={inputClass}>
              <option value="">Sin equipo por ahora</option>
              <TeamOptions teams={teams} />
            </select>
          </Field>
          <Field label="Número">
            <input name="jerseyNumber" inputMode="numeric" maxLength={4} placeholder="Opcional" className={inputClass} />
          </Field>
          <Field label="Fecha de nacimiento">
            <input type="date" name="birthdate" className={inputClass} />
          </Field>
          <Field label="Foto">
            <input type="file" name="photo" accept="image/*" className={fileInputClass} />
          </Field>
          <div className="sm:col-span-2">
            <SubmitButton>Crear jugador</SubmitButton>
          </div>
        </form>
      </FormPanel>

      <div className="grid gap-2 sm:grid-cols-2">
        <FormPanel title="Alta por lista" icon={ListPlus} tone="ghost">
          <form action={bulkAssignRoster} className="flex flex-col gap-3">
            <Field label="Equipo">
              <select name="teamId" required defaultValue={team || ""} className={inputClass}>
                <option value="" disabled>
                  Selecciona
                </option>
                <TeamOptions teams={teams} />
              </select>
            </Field>
            <Field label="Lista" hint="Un jugador por línea, número opcional. Los que ya existen se reutilizan.">
              <textarea
                name="list"
                required
                rows={6}
                placeholder={"23 Juan Pérez\nMaría López #10\nPedro Ramírez"}
                className={`${inputClass} min-h-32 py-2.5`}
              />
            </Field>
            <SubmitButton className="self-start">Agregar al equipo</SubmitButton>
          </form>
        </FormPanel>

        <FormPanel title="Asignar a un equipo" icon={UserPlus} tone="ghost">
          <form action={assignToRoster} className="flex flex-col gap-3">
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
                <TeamOptions teams={teams} />
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Número">
                <input name="jerseyNumber" inputMode="numeric" maxLength={4} placeholder="Opcional" className={inputClass} />
              </Field>
              <Field label="Posición">
                <input name="position" placeholder="SS" className={inputClass} />
              </Field>
            </div>
            <SubmitButton className="self-start">Asignar</SubmitButton>
          </form>
        </FormPanel>
      </div>

      <form className="flex gap-2" action="/admin/jugadores" role="search">
        {team && <input type="hidden" name="team" value={team} />}
        <label className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder={rosterTeam ? `Buscar en ${rosterTeam.name}` : "Buscar jugador"}
            className={`${inputClass} pl-9`}
            aria-label="Buscar jugador"
          />
        </label>
        <SubmitButton className="min-h-12 px-4">Buscar</SubmitButton>
        {search && <SecondaryLink href={team ? `/admin/jugadores?team=${team}` : "/admin/jugadores"}>Limpiar</SecondaryLink>}
      </form>

      {players.length === 0 ? (
        <EmptyRow>
          Sin jugadores{q ? ` para “${q}”` : ""}
          {rosterTeam ? ` en ${rosterTeam.name}` : ""}.
        </EmptyRow>
      ) : (
        <ul className="flex flex-col gap-2">
          {players.map((player) => (
            <ListRow
              key={player.id}
              actions={
                <>
                  {player.rosters.map((entry) => (
                    <form key={entry.id} action={removeFromRoster.bind(null, entry.id)}>
                      <ConfirmButton
                        icon
                        ariaLabel={`Quitar de ${entry.teams?.name ?? "su equipo"}`}
                        message={`¿Quitar a ${player.first_name} de ${entry.teams?.name ?? "su equipo"}?`}
                        className="border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        <UserMinus className="size-4" aria-hidden />
                      </ConfirmButton>
                    </form>
                  ))}
                  <form action={deletePlayer.bind(null, player.id)}>
                    <ConfirmButton icon ariaLabel="Eliminar jugador" message={`¿Eliminar a ${player.first_name} ${player.last_name}?`}>
                      <Trash2 className="size-4" aria-hidden />
                    </ConfirmButton>
                  </form>
                </>
              }
            >
              {player.photo_url ? (
                <Image src={player.photo_url} alt="" width={40} height={40} className="size-10 shrink-0 rounded-full border object-cover" />
              ) : (
                <InitialsAvatar name={`${player.first_name} ${player.last_name}`} className="size-10 shrink-0 border text-sm" />
              )}
              <RowText
                title={`${player.first_name} ${player.last_name}`}
                meta={
                  player.rosters.length === 0
                    ? "Sin equipo"
                    : player.rosters.map((entry) => `${entry.jersey_number ? `#${entry.jersey_number} ` : ""}${entry.teams?.name ?? ""}`).join(" · ")
                }
              />
            </ListRow>
          ))}
        </ul>
      )}
      {total > players.length && (
        <p className="text-center text-xs text-muted-foreground">
          Se muestran {players.length} de {total}. Usa la búsqueda para encontrar al resto.
        </p>
      )}
    </main>
  );
}
