import { Eye, EyeOff, Pencil, Trash2 } from "lucide-react";
import type { Metadata } from "next";
import { ConfirmButton } from "@/components/admin/confirm-button";
import {
  AdminTitle,
  EmptyRow,
  Feedback,
  Field,
  FormPanel,
  IconLink,
  IconSubmit,
  ListRow,
  RowText,
  StatusChip,
  SubmitButton,
  colorInputClass,
  fileInputClass,
  inputClass,
} from "@/components/admin/ui";
import { deleteLeague, saveLeague, setLeaguePublished } from "@/lib/admin/actions";
import { requireAdmin } from "@/lib/admin/auth";
import { sql } from "@/lib/db";

export const metadata: Metadata = { title: "Ligas" };
export const dynamic = "force-dynamic";

interface LeagueRow {
  id: string;
  name: string;
  slug: string;
  color: string | null;
  logo_url: string | null;
  contact_url: string | null;
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
function LeagueBadge({ name, color, logoUrl }: { name: string; color: string | null; logoUrl: string | null }) {
  if (logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={logoUrl} alt="" className="size-10 shrink-0 rounded-full border border-border bg-white/5 object-cover" />
    );
  }
  const accent = color ?? DEFAULT_COLOR;
  return (
    <span
      aria-hidden
      className="font-display grid size-10 shrink-0 place-items-center rounded-full border text-lg"
      style={{ color: accent, borderColor: `${accent}66`, backgroundColor: `${accent}1a` }}
    >
      {name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}

interface PageProps {
  searchParams: Promise<{ ok?: string; error?: string; edit?: string; nuevo?: string }>;
}

export default async function LigasPage({ searchParams }: PageProps) {
  const { ok, error, edit, nuevo } = await searchParams;
  const context = await requireAdmin();
  if (!context) return null;
  const { db } = context;
  // El RLS de leagues solo deja mutar a org_admin; al season_manager se le
  // muestra la lista en solo lectura.
  const canManage = context.role === "org_admin";

  const [leagues, sports] = await Promise.all([
    db.rows<LeagueRow>(sql`
      select l.id, l.name, l.slug, l.color, l.logo_url, l.contact_url, l.is_published, l.sport_id,
             case when sp.id is null then null
                  else json_build_object('name', sp.name) end as sports,
             coalesce((
               select json_agg(json_build_object('id', se.id) order by se.created_at)
                 from public.seasons se
                where se.league_id = l.id
             ), '[]'::json) as seasons
        from public.leagues l
        left join public.sports sp on sp.id = l.sport_id
       order by l.name
    `),
    db.rows<SportOption>(sql`select id, name from public.sports order by name`),
  ]);
  const editing = leagues.find((league) => league.id === edit);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-6">
      <AdminTitle count={leagues.length} subtitle="Cada liga es una categoría con sus temporadas">
        Ligas
      </AdminTitle>
      <Feedback ok={ok} error={error} />

      {canManage && (
        <FormPanel
          title={editing ? `Editar ${editing.name}` : "Nueva liga"}
          open={Boolean(editing) || nuevo === "1"}
          cancelHref={editing ? "/admin/ligas" : undefined}
        >
          <form action={saveLeague} className="flex flex-col gap-4">
            {editing && <input type="hidden" name="id" value={editing.id} />}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Nombre">
                <input name="name" required defaultValue={editing?.name ?? ""} placeholder="Slowpitch Femenil" className={inputClass} />
              </Field>
              <Field label="Deporte">
                {editing ? (
                  <>
                    <input type="hidden" name="sportId" value={editing.sport_id} />
                    <input value={editing.sports?.name ?? ""} disabled className={`${inputClass} opacity-60`} />
                  </>
                ) : (
                  <select name="sportId" required defaultValue="" className={inputClass}>
                    <option value="" disabled>
                      Selecciona
                    </option>
                    {sports.map((sport) => (
                      <option key={sport.id} value={sport.id}>
                        {sport.name}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
              <Field label="Contacto" hint="WhatsApp, correo o enlace. Es el botón de la portada.">
                <input name="contact" defaultValue={editing?.contact_url ?? ""} placeholder="55 1234 5678" className={inputClass} />
              </Field>
              <div className="grid grid-cols-[auto_1fr] gap-3">
                <Field label="Color">
                  <input type="color" name="color" defaultValue={editing?.color ?? DEFAULT_COLOR} className={colorInputClass} />
                </Field>
                <Field label={editing?.logo_url ? "Logo (reemplazar)" : "Logo"}>
                  <input type="file" name="logo" accept="image/*" className={fileInputClass} />
                </Field>
              </div>
            </div>

            {!editing && (
              <fieldset className="rounded-xl border border-dashed p-3">
                <legend className="px-1 text-xs tracking-widest text-muted-foreground uppercase">Primera temporada (opcional)</legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Nombre">
                    <input name="seasonName" placeholder="Temporada 2026" className={inputClass} />
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Inicio">
                      <input type="date" name="startsOn" className={inputClass} />
                    </Field>
                    <Field label="Fin">
                      <input type="date" name="endsOn" className={inputClass} />
                    </Field>
                  </div>
                  <Field label="Divisiones" hint="Separadas por coma" className="sm:col-span-2">
                    <input name="divisions" placeholder="Primera Fuerza, Segunda Fuerza" className={inputClass} />
                  </Field>
                </div>
              </fieldset>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <SubmitButton>{editing ? "Guardar cambios" : "Crear liga"}</SubmitButton>
              {!editing && <p className="text-xs text-muted-foreground">Nace oculta: publícala cuando esté lista.</p>}
            </div>
          </form>
        </FormPanel>
      )}

      {leagues.length === 0 ? (
        <EmptyRow>Todavía no hay ligas.</EmptyRow>
      ) : (
        <ul className="flex flex-col gap-2">
          {leagues.map((league) => (
            <ListRow
              key={league.id}
              actions={
                canManage ? (
                  <>
                    <form action={setLeaguePublished.bind(null, league.id, !league.is_published)}>
                      <IconSubmit
                        label={league.is_published ? "Ocultar del sitio" : "Publicar en el sitio"}
                        icon={league.is_published ? EyeOff : Eye}
                        tone={league.is_published ? "neutral" : "amber"}
                      />
                    </form>
                    <IconLink href={`/admin/ligas?edit=${league.id}`} label="Editar" icon={Pencil} />
                    <form action={deleteLeague.bind(null, league.id)}>
                      <ConfirmButton
                        icon
                        ariaLabel="Eliminar"
                        message={`¿Eliminar la liga "${league.name}" con TODAS sus temporadas, equipos y partidos? No se puede deshacer.`}
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </ConfirmButton>
                    </form>
                  </>
                ) : undefined
              }
            >
              <LeagueBadge name={league.name} color={league.color} logoUrl={league.logo_url} />
              <RowText
                title={league.name}
                meta={`${league.sports?.name ?? "—"} · ${league.seasons.length} temporada${league.seasons.length === 1 ? "" : "s"}${league.contact_url ? "" : " · sin contacto"}`}
              >
                <StatusChip status={league.is_published ? "published" : "hidden"} />
              </RowText>
            </ListRow>
          ))}
        </ul>
      )}
    </main>
  );
}
