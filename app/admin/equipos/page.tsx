import { Pencil, Trash2 } from "lucide-react";
import type { Metadata } from "next";
import { ConfirmButton } from "@/components/admin/confirm-button";
import {
  AdminTitle,
  EmptyRow,
  Feedback,
  Field,
  SubmitButton,
  inputClass,
} from "@/components/admin/ui";
import { deleteTeam, saveTeam } from "@/lib/admin/actions";
import { requireAdmin } from "@/lib/admin/auth";
import { sql } from "@/lib/db";
import { seasonLabel } from "@/lib/utils";

export const metadata: Metadata = { title: "Equipos" };
export const dynamic = "force-dynamic";

interface TeamRow {
  id: string;
  name: string;
  slug: string;
  color: string | null;
  logo_url: string | null;
  division_id: string;
  divisions: {
    name: string;
    seasons: { name: string; leagues: { name: string } | null } | null;
  } | null;
}

interface DivisionOption {
  id: string;
  name: string;
  seasons: { name: string; leagues: { name: string } | null } | null;
}

interface PageProps {
  searchParams: Promise<{ ok?: string; error?: string; edit?: string }>;
}

export default async function EquiposPage({ searchParams }: PageProps) {
  const { ok, error, edit } = await searchParams;
  const context = await requireAdmin();
  if (!context) return null;

  const [divisions, teams] = await Promise.all([
    context.db.rows<DivisionOption>(sql`
      select d.id, d.name,
             case when se.id is null then null else json_build_object(
               'name', se.name,
               'leagues', case when l.id is null then null
                               else json_build_object('name', l.name) end
             ) end as seasons
        from public.divisions d
        left join public.seasons se on se.id = d.season_id
        left join public.leagues l on l.id = se.league_id
       order by d.created_at desc
    `),
    context.db.rows<TeamRow>(sql`
      select t.id, t.name, t.slug, t.color, t.logo_url, t.division_id,
             case when d.id is null then null else json_build_object(
               'name', d.name,
               'seasons', case when se.id is null then null else json_build_object(
                 'name', se.name,
                 'leagues', case when l.id is null then null
                                 else json_build_object('name', l.name) end
               ) end
             ) end as divisions
        from public.teams t
        left join public.divisions d on d.id = t.division_id
        left join public.seasons se on se.id = d.season_id
        left join public.leagues l on l.id = se.league_id
       order by t.name
    `),
  ]);
  const editing = teams.find((team) => team.id === edit);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6">
      <AdminTitle>Equipos</AdminTitle>
      <Feedback ok={ok} error={error} />

      <section className="rounded-2xl border p-4">
        <h2 className="mb-3 font-display text-xl">
          {editing ? `Editar: ${editing.name}` : "Nuevo equipo"}
        </h2>
        <form action={saveTeam} className="grid gap-3 sm:grid-cols-2">
          {editing && <input type="hidden" name="id" value={editing.id} />}
          <Field label="División">
            <select name="divisionId" required defaultValue={editing?.division_id ?? ""} className={inputClass}>
              <option value="" disabled>
                Selecciona división
              </option>
              {divisions.map((division) => (
                <option key={division.id} value={division.id}>
                  {[division.name, seasonLabel(division.seasons)]
                    .filter(Boolean)
                    .join(" · ")}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Nombre">
            <input name="name" required defaultValue={editing?.name ?? ""} placeholder="Tiburones" className={inputClass} />
          </Field>
          <Field label="Slug (URL pública)" hint="minúsculas, números y guiones">
            <input name="slug" required defaultValue={editing?.slug ?? ""} placeholder="tiburones" className={inputClass} />
          </Field>
          <Field label="Color oficial">
            <input
              type="color"
              name="color"
              defaultValue={editing?.color ?? "#E32B1E"}
              className="h-12 w-full cursor-pointer rounded-lg border bg-transparent px-1"
            />
          </Field>
          <Field label="Escudo (imagen, opcional)" hint="Se sube a Supabase Storage (máx. 4 MB)">
            <input type="file" name="logo" accept="image/*" className={`${inputClass} py-2.5`} />
          </Field>
          <div className="flex items-end">
            <SubmitButton>{editing ? "Guardar cambios" : "Crear equipo"}</SubmitButton>
          </div>
        </form>
      </section>

      {teams.length === 0 ? (
        <EmptyRow>Sin equipos: crea el primero arriba.</EmptyRow>
      ) : (
        <ul className="flex flex-col gap-2">
          {teams.map((team) => (
            <li
              key={team.id}
              className="flex items-center gap-2.5 rounded-xl border px-3 py-3 sm:gap-3 sm:px-4"
            >
              {/* Tocar el equipo abre su roster en Jugadores. */}
              <a
                href={`/admin/jugadores?team=${team.id}`}
                className="group flex min-w-0 flex-1 items-center gap-3"
              >
                {team.logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={team.logo_url}
                    alt=""
                    className="size-10 shrink-0 rounded-full border object-cover"
                  />
                ) : (
                  <span
                    aria-hidden
                    className="flex size-10 shrink-0 items-center justify-center rounded-full border font-display"
                    style={{
                      backgroundColor: `${team.color ?? "#666"}26`,
                      borderColor: `${team.color ?? "#666"}66`,
                    }}
                  >
                    {team.name.slice(0, 1)}
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium transition-colors group-hover:text-brand-amber">
                    {team.name}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {[team.divisions?.name, seasonLabel(team.divisions?.seasons)]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                  <span className="block text-[11px] font-medium text-brand-amber">
                    Ver roster
                  </span>
                </span>
              </a>
              <span
                className="size-4 shrink-0 rounded-full border"
                style={{ backgroundColor: team.color ?? "#666" }}
                aria-label={`Color ${team.color ?? "sin color"}`}
              />
              <a
                href={`/admin/equipos?edit=${team.id}`}
                aria-label={`Editar ${team.name}`}
                className="grid size-11 shrink-0 place-items-center rounded-lg border text-muted-foreground hover:bg-muted"
              >
                <Pencil className="size-4" aria-hidden />
              </a>
              <form action={deleteTeam.bind(null, team.id)}>
                <ConfirmButton
                  message={`¿Eliminar al equipo "${team.name}"?`}
                  ariaLabel={`Eliminar ${team.name}`}
                >
                  <Trash2 className="size-4" aria-hidden />
                </ConfirmButton>
              </form>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
