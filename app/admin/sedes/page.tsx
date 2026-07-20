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
import { deleteCourt, deleteVenue, saveCourt, saveVenue } from "@/lib/admin/actions";
import { requireAdmin } from "@/lib/admin/auth";

export const metadata: Metadata = { title: "Sedes" };
export const dynamic = "force-dynamic";

interface VenueRow {
  id: string;
  name: string;
  address: string | null;
  courts: { id: string; name: string }[];
}

interface PageProps {
  searchParams: Promise<{ ok?: string; error?: string }>;
}

export default async function SedesPage({ searchParams }: PageProps) {
  const { ok, error } = await searchParams;
  const context = await requireAdmin();
  if (!context) return null;

  const { data } = await context.supabase
    .from("venues")
    .select("id, name, address, courts(id, name)")
    .order("name");
  const venues = (data ?? []) as unknown as VenueRow[];

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6">
      <AdminTitle>Sedes y campos</AdminTitle>
      <Feedback ok={ok} error={error} />

      <section className="rounded-2xl border p-4">
        <h2 className="mb-3 font-display text-xl">Nueva sede</h2>
        <form action={saveVenue} className="grid gap-3 sm:grid-cols-2">
          <Field label="Nombre">
            <input name="name" required placeholder="Deportivo Municipal" className={inputClass} />
          </Field>
          <Field label="Dirección">
            <input name="address" placeholder="Av. de los Deportes 100" className={inputClass} />
          </Field>
          <div className="sm:col-span-2">
            <SubmitButton>Crear sede</SubmitButton>
          </div>
        </form>
      </section>

      {venues.length === 0 ? (
        <EmptyRow>Sin sedes registradas.</EmptyRow>
      ) : (
        venues.map((venue) => (
          <section key={venue.id} className="flex flex-col gap-3 rounded-2xl border p-4">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-display text-lg">{venue.name}</h3>
              {venue.address && (
                <span className="text-xs text-muted-foreground">{venue.address}</span>
              )}
              <span className="ml-auto">
                <form action={deleteVenue.bind(null, venue.id)}>
                  <ConfirmButton message={`¿Eliminar la sede "${venue.name}" y sus campos?`}>
                    Eliminar
                  </ConfirmButton>
                </form>
              </span>
            </div>
            <ul className="flex flex-wrap gap-2">
              {venue.courts.map((court) => (
                <li
                  key={court.id}
                  className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
                >
                  {court.name}
                  <form action={deleteCourt.bind(null, court.id)}>
                    <button
                      type="submit"
                      aria-label={`Eliminar campo ${court.name}`}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      ×
                    </button>
                  </form>
                </li>
              ))}
            </ul>
            <form action={saveCourt} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="venueId" value={venue.id} />
              <input
                name="name"
                required
                placeholder="Nuevo campo (ej. Campo 1)"
                className={`${inputClass} max-w-72`}
              />
              <SubmitButton>Agregar</SubmitButton>
            </form>
          </section>
        ))
      )}
    </main>
  );
}
