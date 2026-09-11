import { Pencil, Plus, Trash2, X } from "lucide-react";
import type { Metadata } from "next";
import { ConfirmButton } from "@/components/admin/confirm-button";
import {
  AdminTitle,
  EmptyRow,
  Feedback,
  Field,
  FormPanel,
  IconLink,
  StatusChip,
  SubmitButton,
  inputClass,
} from "@/components/admin/ui";
import { deleteDivision, deleteSeason, saveDivision, saveSeason } from "@/lib/admin/actions";
import { requireAdmin } from "@/lib/admin/auth";
import { sql } from "@/lib/db";

export const metadata: Metadata = { title: "Temporadas" };
export const dynamic = "force-dynamic";

interface SeasonRow {
  id: string;
  name: string;
  status: string;
  starts_on: string | null;
  ends_on: string | null;
  league_id: string;
  leagues: { name: string } | null;
  divisions: { id: string; name: string; sort_order: number; team_count: number }[];
}

interface PageProps {
  searchParams: Promise<{ ok?: string; error?: string; edit?: string; nuevo?: string }>;
}

export default async function TemporadasPage({ searchParams }: PageProps) {
  const { ok, error, edit, nuevo } = await searchParams;
  const context = await requireAdmin();
  if (!context) return null;
  const { db } = context;

  const [leagues, seasons] = await Promise.all([
    db.rows<{ id: string; name: string }>(sql`select id, name from public.leagues order by name`),
    db.rows<SeasonRow>(sql`
      select se.id, se.name, se.status::text as status, se.starts_on, se.ends_on, se.league_id,
             case when l.id is null then null else json_build_object('name', l.name) end as leagues,
             coalesce((
               select json_agg(
                        json_build_object('id', d.id, 'name', d.name, 'sort_order', d.sort_order,
                                          'team_count', (select count(*) from public.teams t where t.division_id = d.id))
                        order by d.sort_order
                      )
                 from public.divisions d
                where d.season_id = se.id
             ), '[]'::json) as divisions
        from public.seasons se
        left join public.leagues l on l.id = se.league_id
       order by l.name, se.created_at desc
    `),
  ]);
  const editing = seasons.find((season) => season.id === edit);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-6">
      <AdminTitle count={seasons.length} subtitle="Cada temporada tiene sus divisiones">
        Temporadas
      </AdminTitle>
      <Feedback ok={ok} error={error} />

      <FormPanel
        title={editing ? `Editar ${editing.name}` : "Nueva temporada"}
        open={Boolean(editing) || nuevo === "1"}
        cancelHref={editing ? "/admin/temporadas" : undefined}
      >
        <form action={saveSeason} className="grid gap-3 sm:grid-cols-2">
          {editing && <input type="hidden" name="id" value={editing.id} />}
          <Field label="Liga">
            <select name="leagueId" required defaultValue={editing?.league_id ?? ""} className={inputClass}>
              <option value="" disabled>
                Selecciona
              </option>
              {leagues.map((league) => (
                <option key={league.id} value={league.id}>
                  {league.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Nombre">
            <input name="name" required defaultValue={editing?.name ?? ""} placeholder="Temporada 2026" className={inputClass} />
          </Field>
          <Field label="Estado">
            <select name="status" defaultValue={editing?.status ?? "draft"} className={inputClass}>
              <option value="draft">Borrador</option>
              <option value="active">Activa</option>
              <option value="completed">Terminada</option>
              <option value="archived">Archivada</option>
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Inicio">
              <input type="date" name="startsOn" defaultValue={editing?.starts_on ?? ""} className={inputClass} />
            </Field>
            <Field label="Fin">
              <input type="date" name="endsOn" defaultValue={editing?.ends_on ?? ""} className={inputClass} />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <SubmitButton>{editing ? "Guardar cambios" : "Crear temporada"}</SubmitButton>
          </div>
        </form>
      </FormPanel>

      {seasons.length === 0 ? (
        <EmptyRow>Todavía no hay temporadas.</EmptyRow>
      ) : (
        seasons.map((season) => (
          <section key={season.id} className="flex flex-col gap-3 rounded-2xl border p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="flex flex-wrap items-center gap-2 font-display text-lg leading-tight">
                  <span className="truncate">{season.name}</span>
                  <StatusChip status={season.status} />
                </h3>
                <p className="text-xs text-muted-foreground">
                  {season.leagues?.name}
                  {season.starts_on ? ` · ${season.starts_on}${season.ends_on ? ` a ${season.ends_on}` : ""}` : ""}
                </p>
              </div>
              <span className="flex shrink-0 items-center gap-1.5">
                <IconLink href={`/admin/temporadas?edit=${season.id}`} label="Editar" icon={Pencil} />
                <form action={deleteSeason.bind(null, season.id)}>
                  <ConfirmButton icon ariaLabel="Eliminar" message={`¿Eliminar la temporada "${season.name}" y todo su contenido?`}>
                    <Trash2 className="size-4" aria-hidden />
                  </ConfirmButton>
                </form>
              </span>
            </div>

            <ul className="flex flex-wrap gap-2">
              {season.divisions
                .sort((a, b) => a.sort_order - b.sort_order)
                .map((division) => (
                  <li key={division.id} className="flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm">
                    <span>{division.name}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">{division.team_count} eq.</span>
                    <form action={deleteDivision.bind(null, division.id)}>
                      <ConfirmButton
                        icon
                        ariaLabel={`Eliminar división ${division.name}`}
                        message={`¿Eliminar la división ${division.name}?`}
                        className="size-8 border-0 text-muted-foreground hover:text-destructive"
                      >
                        <X className="size-3.5" aria-hidden />
                      </ConfirmButton>
                    </form>
                  </li>
                ))}
              <li>
                <form action={saveDivision} className="flex items-center gap-1.5">
                  <input type="hidden" name="seasonId" value={season.id} />
                  <input type="hidden" name="sortOrder" value={season.divisions.length} />
                  <input name="name" required placeholder="Nueva división" className={`${inputClass} min-h-10 w-44 text-sm`} aria-label="Nueva división" />
                  <button
                    type="submit"
                    aria-label="Agregar división"
                    title="Agregar división"
                    className="grid size-10 shrink-0 place-items-center rounded-lg border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <Plus className="size-4" aria-hidden />
                  </button>
                </form>
              </li>
            </ul>
          </section>
        ))
      )}
    </main>
  );
}
