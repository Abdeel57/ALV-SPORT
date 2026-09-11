import { ClipboardList, Pencil, Trash2, Users } from "lucide-react";
import type { Metadata } from "next";
import { ConfirmButton } from "@/components/admin/confirm-button";
import {
  AdminTitle,
  EmptyRow,
  Feedback,
  Field,
  FormPanel,
  IconLink,
  ListRow,
  RowText,
  SectionHeading,
  SubmitButton,
  colorInputClass,
  fileInputClass,
  inputClass,
} from "@/components/admin/ui";
import { deleteTeam, saveTeam } from "@/lib/admin/actions";
import { requireAdmin } from "@/lib/admin/auth";
import { sql } from "@/lib/db";

export const metadata: Metadata = { title: "Equipos" };
export const dynamic = "force-dynamic";

interface TeamRow {
  id: string;
  name: string;
  slug: string;
  color: string | null;
  logo_url: string | null;
  division_id: string;
  division_name: string | null;
  season_name: string | null;
  league_name: string | null;
  roster_count: number;
}

interface DivisionOption {
  id: string;
  name: string;
  season_name: string | null;
  league_name: string | null;
}

interface PageProps {
  searchParams: Promise<{ ok?: string; error?: string; edit?: string; nuevo?: string }>;
}

export default async function EquiposPage({ searchParams }: PageProps) {
  const { ok, error, edit, nuevo } = await searchParams;
  const context = await requireAdmin();
  if (!context) return null;

  const [divisions, teams] = await Promise.all([
    context.db.rows<DivisionOption>(sql`
      select d.id, d.name, se.name as season_name, l.name as league_name
        from public.divisions d
        left join public.seasons se on se.id = d.season_id
        left join public.leagues l on l.id = se.league_id
       order by l.name nulls last, se.created_at desc, d.sort_order
    `),
    context.db.rows<TeamRow>(sql`
      select t.id, t.name, t.slug, t.color, t.logo_url, t.division_id,
             d.name as division_name, se.name as season_name, l.name as league_name,
             (select count(*)::int from public.rosters r where r.team_id = t.id and r.status = 'active') as roster_count
        from public.teams t
        left join public.divisions d on d.id = t.division_id
        left join public.seasons se on se.id = d.season_id
        left join public.leagues l on l.id = se.league_id
       order by l.name nulls last, d.name, t.name
    `),
  ]);
  const editing = teams.find((team) => team.id === edit);

  // Agrupadas por categoría (liga): con varias categorías la lista plana no se lee.
  const groups = new Map<string, TeamRow[]>();
  for (const team of teams) {
    const key = team.league_name ?? "Sin categoría";
    (groups.get(key) ?? groups.set(key, []).get(key))!.push(team);
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-6">
      <AdminTitle count={teams.length}>Equipos</AdminTitle>
      <Feedback ok={ok} error={error} />

      <FormPanel
        title={editing ? `Editar ${editing.name}` : "Nuevo equipo"}
        open={Boolean(editing) || nuevo === "1"}
        cancelHref={editing ? "/admin/equipos" : undefined}
      >
        <form action={saveTeam} className="grid gap-3 sm:grid-cols-2">
          {editing && <input type="hidden" name="id" value={editing.id} />}
          <Field label="División" className="sm:col-span-2">
            <select name="divisionId" required defaultValue={editing?.division_id ?? ""} className={inputClass}>
              <option value="" disabled>
                Selecciona
              </option>
              {divisions.map((division) => (
                <option key={division.id} value={division.id}>
                  {[division.league_name, division.season_name, division.name].filter(Boolean).join(" · ")}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Nombre">
            <input name="name" required defaultValue={editing?.name ?? ""} placeholder="Tiburones" className={inputClass} />
          </Field>
          <Field label="URL pública" hint="minúsculas, números y guiones">
            <input name="slug" required defaultValue={editing?.slug ?? ""} placeholder="tiburones" className={inputClass} />
          </Field>
          <Field label="Color">
            <input type="color" name="color" defaultValue={editing?.color ?? "#E32B1E"} className={colorInputClass} />
          </Field>
          <Field label={editing?.logo_url ? "Escudo (reemplazar)" : "Escudo"} hint="Imagen, máximo 4 MB">
            <input type="file" name="logo" accept="image/*" className={fileInputClass} />
          </Field>
          <div className="sm:col-span-2">
            <SubmitButton>{editing ? "Guardar cambios" : "Crear equipo"}</SubmitButton>
          </div>
        </form>
      </FormPanel>

      {teams.length === 0 ? (
        <EmptyRow>Todavía no hay equipos.</EmptyRow>
      ) : (
        [...groups.entries()].map(([league, rows]) => (
          <section key={league} className="flex flex-col gap-2" aria-label={league}>
            {groups.size > 1 && <SectionHeading count={rows.length}>{league}</SectionHeading>}
            <ul className="flex flex-col gap-2">
              {rows.map((team) => (
                <ListRow
                  key={team.id}
                  actions={
                    <>
                      <IconLink href={`/admin/jugadores?team=${team.id}`} label="Roster" icon={Users} />
                      <IconLink href={`/admin/equipos/${team.id}/estadisticas`} label="Estadísticas" icon={ClipboardList} />
                      <IconLink href={`/admin/equipos?edit=${team.id}`} label="Editar" icon={Pencil} />
                      <form action={deleteTeam.bind(null, team.id)}>
                        <ConfirmButton icon ariaLabel="Eliminar" message={`¿Eliminar al equipo "${team.name}"?`}>
                          <Trash2 className="size-4" aria-hidden />
                        </ConfirmButton>
                      </form>
                    </>
                  }
                >
                  {team.logo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={team.logo_url} alt="" className="size-10 shrink-0 rounded-full border object-cover" />
                  ) : (
                    <span
                      aria-hidden
                      className="flex size-10 shrink-0 items-center justify-center rounded-full border font-display"
                      style={{ backgroundColor: `${team.color ?? "#666"}26`, borderColor: `${team.color ?? "#666"}66` }}
                    >
                      {team.name.slice(0, 1)}
                    </span>
                  )}
                  <RowText
                    title={team.name}
                    meta={`${[team.division_name, team.season_name].filter(Boolean).join(" · ")} · ${team.roster_count} jugador${team.roster_count === 1 ? "" : "es"}`}
                  />
                </ListRow>
              ))}
            </ul>
          </section>
        ))
      )}
    </main>
  );
}
