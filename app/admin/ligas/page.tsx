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
import { deleteLeague, saveLeague, setLeaguePublished } from "@/lib/admin/actions";
import { requireAdmin } from "@/lib/admin/auth";

export const metadata: Metadata = { title: "Ligas" };
export const dynamic = "force-dynamic";

interface LeagueRow {
  id: string;
  name: string;
  slug: string;
  color: string | null;
  logo_url: string | null;
  is_published: boolean;
  sport_id: string;
  sports: { name: string } | null;
  seasons: { id: string }[];
}

interface SportOption {
  id: string;
  name: string;
}

const DEFAULT_COLOR = "#e32b1e";

/** Escudo de la liga: logo subido o monograma con su color (nunca un hueco). */
function LeagueBadge({
  name,
  color,
  logoUrl,
}: {
  name: string;
  color: string | null;
  logoUrl: string | null;
}) {
  if (logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logoUrl}
        alt=""
        className="size-11 shrink-0 rounded-full border border-border bg-white/5 object-cover"
      />
    );
  }
  const accent = color ?? DEFAULT_COLOR;
  return (
    <span
      aria-hidden
      className="font-display grid size-11 shrink-0 place-items-center rounded-full border text-lg"
      style={{
        color: accent,
        borderColor: `${accent}66`,
        backgroundColor: `${accent}1a`,
      }}
    >
      {name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}

interface PageProps {
  searchParams: Promise<{ ok?: string; error?: string; edit?: string }>;
}

export default async function LigasPage({ searchParams }: PageProps) {
  const { ok, error, edit } = await searchParams;
  const context = await requireAdmin();
  if (!context) return null;
  const { supabase } = context;
  // El RLS de leagues solo deja mutar a org_admin; al season_manager se le
  // muestra la lista en solo lectura en vez de dejarlo chocar con la base.
  const canManage = context.role === "org_admin";

  const [{ data: leagueRows }, { data: sportRows }] = await Promise.all([
    supabase
      .from("leagues")
      .select("id, name, slug, color, logo_url, is_published, sport_id, sports(name), seasons(id)")
      .order("name"),
    supabase.from("sports").select("id, name").order("name"),
  ]);
  const leagues = (leagueRows ?? []) as unknown as LeagueRow[];
  const sports = (sportRows ?? []) as SportOption[];
  const editing = leagues.find((league) => league.id === edit);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6">
      <AdminTitle>Ligas</AdminTitle>
      <Feedback ok={ok} error={error} />

      {canManage && (
        <section className="rounded-2xl border p-4">
          <h2 className="mb-3 font-display text-xl">
            {editing ? `Editar: ${editing.name}` : "Nueva liga"}
          </h2>
          <form action={saveLeague} className="flex flex-col gap-4">
            {editing && <input type="hidden" name="id" value={editing.id} />}

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Nombre">
                <input
                  name="name"
                  required
                  defaultValue={editing?.name ?? ""}
                  placeholder="Liga de Softbol del Valle"
                  className={inputClass}
                />
              </Field>
              <Field label="Deporte">
                {editing ? (
                  <>
                    {/* El deporte no cambia una vez creada la liga: cambiarlo
                        rompería eventos y standings ya registrados. */}
                    <input type="hidden" name="sportId" value={editing.sport_id} />
                    <input
                      value={editing.sports?.name ?? ""}
                      disabled
                      className={`${inputClass} opacity-60`}
                    />
                  </>
                ) : (
                  <select name="sportId" required defaultValue="" className={inputClass}>
                    <option value="" disabled>
                      Selecciona el deporte
                    </option>
                    {sports.map((sport) => (
                      <option key={sport.id} value={sport.id}>
                        {sport.name}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
              <Field label="Color de la liga">
                <input
                  type="color"
                  name="color"
                  defaultValue={editing?.color ?? DEFAULT_COLOR}
                  className="h-11 w-full cursor-pointer rounded-lg border bg-transparent p-1"
                />
              </Field>
              <Field label={editing?.logo_url ? "Logotipo (reemplazar)" : "Logotipo"}>
                <input
                  type="file"
                  name="logo"
                  accept="image/*"
                  className={`${inputClass} pt-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-secondary-foreground`}
                />
              </Field>
            </div>

            {!editing && (
              <fieldset className="rounded-xl border border-dashed p-3">
                <legend className="px-1 text-xs tracking-widest text-muted-foreground uppercase">
                  Primera temporada (opcional)
                </legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Nombre de la temporada">
                    <input
                      name="seasonName"
                      placeholder="Temporada Otoño 2026"
                      className={inputClass}
                    />
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Inicio">
                      <input type="date" name="startsOn" className={inputClass} />
                    </Field>
                    <Field label="Fin">
                      <input type="date" name="endsOn" className={inputClass} />
                    </Field>
                  </div>
                  <div className="sm:col-span-2">
                    <Field label="Divisiones (separadas por coma)">
                      <input
                        name="divisions"
                        placeholder="Primera Fuerza, Segunda Fuerza, Femenil"
                        className={inputClass}
                      />
                    </Field>
                  </div>
                </div>
              </fieldset>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <SubmitButton>{editing ? "Guardar cambios" : "Crear liga"}</SubmitButton>
              {editing ? (
                <a href="/admin/ligas" className="text-sm text-muted-foreground hover:text-foreground">
                  Cancelar edición
                </a>
              ) : (
                <p className="text-xs text-muted-foreground">
                  La liga nace oculta: publícala cuando esté lista.
                </p>
              )}
            </div>
          </form>
        </section>
      )}

      {leagues.length === 0 ? (
        <EmptyRow>
          {canManage
            ? "Sin ligas todavía: crea la primera arriba."
            : "Sin ligas todavía. Solo org_admin puede crearlas."}
        </EmptyRow>
      ) : (
        leagues.map((league) => (
          <section
            key={league.id}
            className="flex flex-wrap items-center gap-3 rounded-2xl border p-4"
          >
            <LeagueBadge name={league.name} color={league.color} logoUrl={league.logo_url} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-display text-lg">{league.name}</h3>
                <span
                  className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-wider uppercase ${
                    league.is_published
                      ? "border-brand-amber/50 text-brand-amber"
                      : "border-border text-muted-foreground"
                  }`}
                >
                  {league.is_published ? "Publicada" : "Oculta"}
                </span>
              </div>
              <p className="truncate text-xs text-muted-foreground">
                {league.sports?.name ?? "—"} · {league.seasons.length}{" "}
                {league.seasons.length === 1 ? "temporada" : "temporadas"} · /{league.slug}
              </p>
            </div>
            {canManage && (
              <span className="ml-auto flex flex-wrap gap-2">
                <form action={setLeaguePublished.bind(null, league.id, !league.is_published)}>
                  <button
                    type="submit"
                    className="flex min-h-11 items-center rounded-lg border px-3 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    {league.is_published ? "Ocultar" : "Publicar"}
                  </button>
                </form>
                <a
                  href={`/admin/ligas?edit=${league.id}`}
                  className="flex min-h-11 items-center rounded-lg border px-3 text-sm text-muted-foreground hover:bg-muted"
                >
                  Editar
                </a>
                <form action={deleteLeague.bind(null, league.id)}>
                  <ConfirmButton
                    message={`¿Eliminar la liga "${league.name}" con TODAS sus temporadas, equipos y partidos? Esta acción no se puede deshacer.`}
                  >
                    Eliminar
                  </ConfirmButton>
                </form>
              </span>
            )}
          </section>
        ))
      )}
    </main>
  );
}
