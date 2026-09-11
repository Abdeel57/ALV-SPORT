import { Eraser, Eye, EyeOff, Megaphone, Pencil, Trash2 } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
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
  SectionHeading,
  StatusChip,
  SubmitButton,
  fileInputClass,
  inputClass,
} from "@/components/admin/ui";
import { cleanSponsorLogo, deleteSponsor, saveSponsor, setSponsorActive } from "@/lib/admin/actions";
import { requireAdmin } from "@/lib/admin/auth";
import { sql } from "@/lib/db";

export const metadata: Metadata = { title: "Patrocinadores" };
export const dynamic = "force-dynamic";

const TIERS = [
  { value: "main", label: "Principal", where: "Marcador, barra y pie" },
  { value: "official", label: "Oficial", where: "Barra deslizante y pie" },
  { value: "ally", label: "Aliado", where: "Pie de página" },
] as const;

type Tier = (typeof TIERS)[number]["value"];

interface SponsorRow {
  id: string;
  name: string;
  logo_url: string | null;
  link_url: string | null;
  tier: Tier;
  sort_order: number;
  is_active: boolean;
}

interface PageProps {
  searchParams: Promise<{ ok?: string; error?: string; nuevo?: string; edit?: string }>;
}

export default async function PatrocinadoresPage({ searchParams }: PageProps) {
  const { ok, error, nuevo, edit } = await searchParams;
  const context = await requireAdmin();
  if (!context) return null;

  const sponsors = await context.db.rows<SponsorRow>(sql`
    select id, name, logo_url, link_url, tier::text as tier, sort_order, is_active
      from public.sponsors
     order by tier, sort_order, created_at
  `);
  const editing = edit ? sponsors.find((sponsor) => sponsor.id === edit) : undefined;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-6">
      <AdminTitle count={sponsors.length}>Patrocinadores</AdminTitle>
      <Feedback ok={ok} error={error} />

      <FormPanel
        title={editing ? `Editar ${editing.name}` : "Nuevo patrocinador"}
        icon={Megaphone}
        open={Boolean(editing) || nuevo === "1"}
        cancelHref={editing ? "/admin/patrocinadores" : undefined}
      >
        <form action={saveSponsor} className="grid gap-3 sm:grid-cols-2">
          {editing && <input type="hidden" name="id" value={editing.id} />}
          <Field label="Nombre">
            <input name="name" required defaultValue={editing?.name ?? ""} className={inputClass} />
          </Field>
          <Field label="Enlace">
            <input
              type="url"
              name="linkUrl"
              placeholder="https://… (opcional)"
              defaultValue={editing?.link_url ?? ""}
              className={inputClass}
            />
          </Field>
          <Field label="Nivel">
            <select name="tier" defaultValue={editing?.tier ?? "official"} className={inputClass}>
              {TIERS.map((tier) => (
                <option key={tier.value} value={tier.value}>
                  {tier.label} · {tier.where}
                </option>
              ))}
            </select>
          </Field>
          <Field label={editing?.logo_url ? "Cambiar logo" : "Logo"} hint="Mejor PNG o SVG con fondo transparente.">
            <input type="file" name="logo" accept="image/*" className={fileInputClass} />
          </Field>
          <label className="flex min-h-12 items-center gap-2 rounded-lg border px-3 text-sm sm:col-span-2">
            <input type="checkbox" name="cleanBackground" value="true" defaultChecked className="accent-[var(--brand-amber)]" />
            Quitar el fondo blanco del logo al subirlo
          </label>
          <input type="hidden" name="sortOrder" value={editing?.sort_order ?? sponsors.length} />
          <div className="sm:col-span-2">
            <SubmitButton>{editing ? "Guardar cambios" : "Guardar patrocinador"}</SubmitButton>
          </div>
        </form>
      </FormPanel>

      {sponsors.length === 0 ? (
        <EmptyRow>Todavía no hay patrocinadores.</EmptyRow>
      ) : (
        TIERS.map((tier) => {
          const group = sponsors.filter((sponsor) => sponsor.tier === tier.value);
          if (group.length === 0) return null;
          return (
            <section key={tier.value} className="flex flex-col gap-2">
              <SectionHeading count={group.length}>{tier.label}</SectionHeading>
              <ul className="flex flex-col gap-2">
                {group.map((sponsor) => (
                  <ListRow
                    key={sponsor.id}
                    className={sponsor.is_active ? undefined : "opacity-60"}
                    actions={
                      <>
                        {sponsor.logo_url && (
                          <form action={cleanSponsorLogo.bind(null, sponsor.id)}>
                            <IconSubmit label="Quitar fondo blanco" icon={Eraser} tone="amber" />
                          </form>
                        )}
                        <form action={setSponsorActive.bind(null, sponsor.id, !sponsor.is_active)}>
                          <IconSubmit label={sponsor.is_active ? "Pausar" : "Activar"} icon={sponsor.is_active ? EyeOff : Eye} />
                        </form>
                        <IconLink href={`/admin/patrocinadores?edit=${sponsor.id}`} label="Editar" icon={Pencil} />
                        <form action={deleteSponsor.bind(null, sponsor.id)}>
                          <ConfirmButton icon ariaLabel="Eliminar" message={`¿Eliminar a "${sponsor.name}"?`}>
                            <Trash2 className="size-4" aria-hidden />
                          </ConfirmButton>
                        </form>
                      </>
                    }
                  >
                    {sponsor.logo_url ? (
                      <Image
                        src={sponsor.logo_url}
                        alt=""
                        width={64}
                        height={40}
                        className="logo-glow h-10 w-16 shrink-0 rounded-lg border bg-card object-contain p-1"
                      />
                    ) : (
                      <span className="flex h-10 w-16 shrink-0 items-center justify-center rounded-lg border bg-secondary text-[10px] text-muted-foreground">
                        Sin logo
                      </span>
                    )}
                    <RowText title={sponsor.name} meta={sponsor.link_url ?? "Sin enlace"}>
                      {!sponsor.is_active && <StatusChip status="hidden" />}
                    </RowText>
                  </ListRow>
                ))}
              </ul>
            </section>
          );
        })
      )}
    </main>
  );
}
