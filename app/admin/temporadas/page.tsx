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
import {
  deleteDivision,
  deleteSeason,
  saveDivision,
  saveSeason,
} from "@/lib/admin/actions";
import { requireAdmin } from "@/lib/admin/auth";

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
  divisions: { id: string; name: string; sort_order: number }[];
}

interface PageProps {
  searchParams: Promise<{ ok?: string; error?: string; edit?: string }>;
}

export default async function TemporadasPage({ searchParams }: PageProps) {
  const { ok, error, edit } = await searchParams;
  const context = await requireAdmin();
  if (!context) return null;
  const { supabase } = context;

  const [{ data: leagueRows }, { data: seasonRows }] = await Promise.all([
    supabase.from("leagues").select("id, name").order("name"),
    supabase
      .from("seasons")
      .select(
        "id, name, status, starts_on, ends_on, league_id, leagues(name), divisions(id, name, sort_order)",
      )
      .order("created_at", { ascending: false }),
  ]);
  const leagues = (leagueRows ?? []) as { id: string; name: string }[];
  const seasons = (seasonRows ?? []) as unknown as SeasonRow[];
  const editing = seasons.find((season) => season.id === edit);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6">
      <AdminTitle>Temporadas y divisiones</AdminTitle>
      <Feedback ok={ok} error={error} />

      <section className="rounded-2xl border p-4">
        <h2 className="mb-3 font-display text-xl">
          {editing ? `Editar: ${editing.name}` : "Nueva temporada"}
        </h2>
        <form action={saveSeason} className="grid gap-3 sm:grid-cols-2">
          {editing && <input type="hidden" name="id" value={editing.id} />}
          <Field label="Liga">
            <select name="leagueId" required defaultValue={editing?.league_id ?? ""} className={inputClass}>
              <option value="" disabled>
                Selecciona una liga
              </option>
              {leagues.map((league) => (
                <option key={league.id} value={league.id}>
                  {league.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Nombre">
            <input name="name" required defaultValue={editing?.name ?? ""} placeholder="Temporada Otoño 2026" className={inputClass} />
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
      </section>

      {seasons.length === 0 ? (
        <EmptyRow>Sin temporadas todavía: crea la primera arriba.</EmptyRow>
      ) : (
        seasons.map((season) => (
          <section key={season.id} className="flex flex-col gap-3 rounded-2xl border p-4">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-display text-lg">{season.name}</h3>
              <StatusChip status={season.status} />
              <span className="text-xs text-muted-foreground">
                {season.leagues?.name}
              </span>
              <span className="ml-auto flex gap-2">
                <a
                  href={`/admin/temporadas?edit=${season.id}`}
                  className="flex min-h-11 items-center rounded-lg border px-3 text-sm text-muted-foreground hover:bg-muted"
                >
                  Editar
                </a>
                <form action={deleteSeason.bind(null, season.id)}>
                  <ConfirmButton message={`¿Eliminar la temporada "${season.name}" y todo su contenido?`}>
                    Eliminar
                  </ConfirmButton>
                </form>
              </span>
            </div>

            <div className="flex flex-col gap-2">
              <p className="text-xs tracking-widest text-muted-foreground uppercase">
                Divisiones
              </p>
              {season.divisions.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin divisiones.</p>
              ) : (
                <ul className="flex flex-wrap gap-2">
                  {season.divisions
                    .sort((a, b) => a.sort_order - b.sort_order)
                    .map((division) => (
                      <li
                        key={division.id}
                        className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
                      >
                        {division.name}
                        <form action={deleteDivision.bind(null, division.id)}>
                          <button
                            type="submit"
                            aria-label={`Eliminar división ${division.name}`}
                            className="text-muted-foreground hover:text-destructive"
                          >
                            ×
                          </button>
                        </form>
                      </li>
                    ))}
                </ul>
              )}
              <form action={saveDivision} className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="seasonId" value={season.id} />
                <input type="hidden" name="sortOrder" value={season.divisions.length} />
                <input
                  name="name"
                  required
                  placeholder="Nueva división (ej. Primera Fuerza)"
                  className={`${inputClass} max-w-72`}
                />
                <SubmitButton>Agregar</SubmitButton>
              </form>
            </div>
          </section>
        ))
      )}
    </main>
  );
}
