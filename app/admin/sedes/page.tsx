import { MapPin, Plus, Trash2, X } from "lucide-react";
import type { Metadata } from "next";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { AdminTitle, EmptyRow, Feedback, Field, FormPanel, SubmitButton, inputClass } from "@/components/admin/ui";
import { deleteCourt, deleteVenue, saveCourt, saveVenue } from "@/lib/admin/actions";
import { requireAdmin } from "@/lib/admin/auth";
import { sql } from "@/lib/db";

export const metadata: Metadata = { title: "Sedes" };
export const dynamic = "force-dynamic";

interface VenueRow {
  id: string;
  name: string;
  address: string | null;
  courts: { id: string; name: string }[];
}

interface PageProps {
  searchParams: Promise<{ ok?: string; error?: string; nuevo?: string }>;
}

export default async function SedesPage({ searchParams }: PageProps) {
  const { ok, error, nuevo } = await searchParams;
  const context = await requireAdmin();
  if (!context) return null;

  const venues = await context.db.rows<VenueRow>(sql`
    select v.id, v.name, v.address,
           coalesce((
             select json_agg(json_build_object('id', c.id, 'name', c.name) order by c.name)
               from public.courts c
              where c.venue_id = v.id
           ), '[]'::json) as courts
      from public.venues v
     order by v.name
  `);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-6">
      <AdminTitle count={venues.length} subtitle="Sedes y sus campos">
        Sedes
      </AdminTitle>
      <Feedback ok={ok} error={error} />

      <FormPanel title="Nueva sede" icon={MapPin} open={nuevo === "1"}>
        <form action={saveVenue} className="grid gap-3 sm:grid-cols-2">
          <Field label="Nombre">
            <input name="name" required placeholder="Deportivo Municipal" className={inputClass} />
          </Field>
          <Field label="Dirección">
            <input name="address" placeholder="Opcional" className={inputClass} />
          </Field>
          <div className="sm:col-span-2">
            <SubmitButton>Crear sede</SubmitButton>
          </div>
        </form>
      </FormPanel>

      {venues.length === 0 ? (
        <EmptyRow>Todavía no hay sedes.</EmptyRow>
      ) : (
        venues.map((venue) => (
          <section key={venue.id} className="flex flex-col gap-3 rounded-2xl border p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="truncate font-display text-lg leading-tight">{venue.name}</h3>
                {venue.address && <p className="truncate text-xs text-muted-foreground">{venue.address}</p>}
              </div>
              <form action={deleteVenue.bind(null, venue.id)}>
                <ConfirmButton icon ariaLabel="Eliminar sede" message={`¿Eliminar la sede "${venue.name}" y sus campos?`}>
                  <Trash2 className="size-4" aria-hidden />
                </ConfirmButton>
              </form>
            </div>
            <ul className="flex flex-wrap gap-2">
              {venue.courts.map((court) => (
                <li key={court.id} className="flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm">
                  {court.name}
                  <form action={deleteCourt.bind(null, court.id)}>
                    <ConfirmButton
                      icon
                      ariaLabel={`Eliminar campo ${court.name}`}
                      message={`¿Eliminar el campo ${court.name}?`}
                      className="size-8 border-0 text-muted-foreground hover:text-destructive"
                    >
                      <X className="size-3.5" aria-hidden />
                    </ConfirmButton>
                  </form>
                </li>
              ))}
              <li>
                <form action={saveCourt} className="flex items-center gap-1.5">
                  <input type="hidden" name="venueId" value={venue.id} />
                  <input name="name" required placeholder="Nuevo campo" className={`${inputClass} min-h-10 w-40 text-sm`} aria-label="Nuevo campo" />
                  <button
                    type="submit"
                    aria-label="Agregar campo"
                    title="Agregar campo"
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
