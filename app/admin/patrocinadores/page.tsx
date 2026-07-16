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
import { deleteSponsor, saveSponsor } from "@/lib/admin/actions";
import { requireAdmin } from "@/lib/admin/auth";

export const metadata: Metadata = { title: "Patrocinadores" };
export const dynamic = "force-dynamic";

const placementLabels: Record<string, string> = {
  home: "Portada",
  game: "Página de partido",
  footer: "Pie de página",
};

interface SponsorRow {
  id: string;
  name: string;
  logo_url: string | null;
  link_url: string | null;
  placement: string;
  sort_order: number;
}

interface PageProps {
  searchParams: Promise<{ ok?: string; error?: string }>;
}

export default async function PatrocinadoresPage({ searchParams }: PageProps) {
  const { ok, error } = await searchParams;
  const context = await requireAdmin();
  if (!context) return null;

  const { data } = await context.supabase
    .from("sponsors")
    .select("id, name, logo_url, link_url, placement, sort_order")
    .order("placement")
    .order("sort_order");
  const sponsors = (data ?? []) as SponsorRow[];

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6">
      <AdminTitle>Patrocinadores</AdminTitle>
      <Feedback ok={ok} error={error} />

      <section className="rounded-2xl border p-4">
        <h2 className="mb-3 font-display text-xl">Nuevo patrocinador</h2>
        <form action={saveSponsor} className="grid gap-3 sm:grid-cols-2">
          <Field label="Nombre">
            <input name="name" required className={inputClass} />
          </Field>
          <Field label="Link (opcional)">
            <input type="url" name="linkUrl" placeholder="https://…" className={inputClass} />
          </Field>
          <Field label="Posición en el sitio">
            <select name="placement" defaultValue="footer" className={inputClass}>
              <option value="home">Portada</option>
              <option value="game">Página de partido</option>
              <option value="footer">Pie de página</option>
            </select>
          </Field>
          <Field label="Logo">
            <input type="file" name="logo" accept="image/*" className={`${inputClass} py-2.5`} />
          </Field>
          <input type="hidden" name="sortOrder" value={sponsors.length} />
          <div className="sm:col-span-2">
            <SubmitButton>Guardar patrocinador</SubmitButton>
          </div>
        </form>
      </section>

      {sponsors.length === 0 ? (
        <EmptyRow>Sin patrocinadores registrados.</EmptyRow>
      ) : (
        <ul className="flex flex-col gap-2">
          {sponsors.map((sponsor) => (
            <li key={sponsor.id} className="flex items-center gap-3 rounded-xl border px-4 py-3">
              {sponsor.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={sponsor.logo_url} alt="" className="h-8 w-14 rounded border object-contain" />
              ) : (
                <span className="flex h-8 w-14 items-center justify-center rounded border bg-secondary text-xs">
                  Logo
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{sponsor.name}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {placementLabels[sponsor.placement] ?? sponsor.placement}
                  {sponsor.link_url ? ` · ${sponsor.link_url}` : ""}
                </span>
              </span>
              <form action={deleteSponsor.bind(null, sponsor.id)}>
                <ConfirmButton message={`¿Eliminar a "${sponsor.name}"?`}>
                  Eliminar
                </ConfirmButton>
              </form>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
