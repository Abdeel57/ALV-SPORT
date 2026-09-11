import { Megaphone, Trash2 } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import { ConfirmButton } from "@/components/admin/confirm-button";
import {
  AdminTitle,
  EmptyRow,
  Feedback,
  Field,
  FormPanel,
  ListRow,
  RowText,
  SubmitButton,
  fileInputClass,
  inputClass,
} from "@/components/admin/ui";
import { deleteSponsor, saveSponsor } from "@/lib/admin/actions";
import { requireAdmin } from "@/lib/admin/auth";
import { sql } from "@/lib/db";

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
  searchParams: Promise<{ ok?: string; error?: string; nuevo?: string }>;
}

export default async function PatrocinadoresPage({ searchParams }: PageProps) {
  const { ok, error, nuevo } = await searchParams;
  const context = await requireAdmin();
  if (!context) return null;

  const sponsors = await context.db.rows<SponsorRow>(sql`
    select id, name, logo_url, link_url, placement::text as placement, sort_order
      from public.sponsors
     order by placement, sort_order
  `);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-6">
      <AdminTitle count={sponsors.length}>Patrocinadores</AdminTitle>
      <Feedback ok={ok} error={error} />

      <FormPanel title="Nuevo patrocinador" icon={Megaphone} open={nuevo === "1"}>
        <form action={saveSponsor} className="grid gap-3 sm:grid-cols-2">
          <Field label="Nombre">
            <input name="name" required className={inputClass} />
          </Field>
          <Field label="Enlace">
            <input type="url" name="linkUrl" placeholder="https://… (opcional)" className={inputClass} />
          </Field>
          <Field label="Dónde aparece">
            <select name="placement" defaultValue="footer" className={inputClass}>
              <option value="home">Portada</option>
              <option value="game">Página de partido</option>
              <option value="footer">Pie de página</option>
            </select>
          </Field>
          <Field label="Logo">
            <input type="file" name="logo" accept="image/*" className={fileInputClass} />
          </Field>
          <input type="hidden" name="sortOrder" value={sponsors.length} />
          <div className="sm:col-span-2">
            <SubmitButton>Guardar patrocinador</SubmitButton>
          </div>
        </form>
      </FormPanel>

      {sponsors.length === 0 ? (
        <EmptyRow>Todavía no hay patrocinadores.</EmptyRow>
      ) : (
        <ul className="flex flex-col gap-2">
          {sponsors.map((sponsor) => (
            <ListRow
              key={sponsor.id}
              actions={
                <form action={deleteSponsor.bind(null, sponsor.id)}>
                  <ConfirmButton icon ariaLabel="Eliminar" message={`¿Eliminar a "${sponsor.name}"?`}>
                    <Trash2 className="size-4" aria-hidden />
                  </ConfirmButton>
                </form>
              }
            >
              {sponsor.logo_url ? (
                <Image src={sponsor.logo_url} alt="" width={56} height={32} className="h-8 w-14 shrink-0 rounded border object-contain" />
              ) : (
                <span className="flex h-8 w-14 shrink-0 items-center justify-center rounded border bg-secondary text-[10px] text-muted-foreground">Sin logo</span>
              )}
              <RowText title={sponsor.name} meta={`${placementLabels[sponsor.placement] ?? sponsor.placement}${sponsor.link_url ? ` · ${sponsor.link_url}` : ""}`} />
            </ListRow>
          ))}
        </ul>
      )}
    </main>
  );
}
