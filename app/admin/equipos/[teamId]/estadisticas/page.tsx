import { Trash2, Upload } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { StatImportForm } from "@/components/admin/stat-import-form";
import { AdminTitle, Feedback, FormPanel, SecondaryLink } from "@/components/admin/ui";
import { ImportedStatsTable } from "@/components/public/imported-stats";
import { deleteTeamStatImport, importTeamStats } from "@/lib/admin/actions";
import { requireAdmin } from "@/lib/admin/auth";
import { sql } from "@/lib/db";
import { KIND_LABELS, toStatImportView, type TeamStatImportView } from "@/lib/stats-import";

export const metadata: Metadata = { title: "Estadísticas del equipo" };
export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ teamId: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}

export default async function TeamStatsPage({ params, searchParams }: PageProps) {
  const { teamId } = await params;
  const { ok, error } = await searchParams;
  if (!z.uuid().safeParse(teamId).success) notFound();
  const context = await requireAdmin();
  if (!context) return null;

  const team = await context.db.maybeOne<{ id: string; name: string; slug: string; color: string | null }>(sql`
    select id, name, slug, color from public.teams where id = ${teamId} limit 1
  `);
  if (!team) notFound();

  const rows = await context.db.rows<Record<string, unknown>>(sql`
    select id, kind, title, source_name, columns, rows, totals, player_count, updated_at
      from public.team_stat_imports
     where team_id = ${team.id}
     order by case kind when 'batting' then 0 when 'pitching' then 1 when 'fielding' then 2 else 3 end, title
  `);
  const imports = rows.map(toStatImportView).filter((view): view is TeamStatImportView => view !== null);

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-5 px-4 py-6">
      <AdminTitle
        subtitle={team.name}
        back={{ href: "/admin/equipos", label: "Equipos" }}
        action={
          <SecondaryLink href={`/equipo/${team.slug}`} className="w-full sm:w-auto">
            Ver página pública
          </SecondaryLink>
        }
      >
        Estadísticas
      </AdminTitle>
      <Feedback ok={ok} error={error} />

      <FormPanel title="Cargar tabla" icon={Upload} open={imports.length === 0}>
        <StatImportForm teamId={team.id} action={importTeamStats} />
      </FormPanel>

      {imports.length > 0 &&
        imports.map((data) => {
          const linked = data.rows.filter((row) => row.playerId).length;
          const unlinked = data.rows.filter((row) => !row.playerId).map((row) => row.name);
          return (
            <section key={data.id} className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="rounded-full border px-2.5 py-1 text-xs font-semibold tracking-wider uppercase">{KIND_LABELS[data.kind]}</span>
                <span className="text-muted-foreground">
                  {linked} de {data.rows.length} vinculados a la plantilla
                </span>
                <form action={deleteTeamStatImport.bind(null, data.id, team.id)} className="ml-auto">
                  <ConfirmButton icon ariaLabel="Quitar tabla" message={`¿Quitar la tabla "${data.title}"?`}>
                    <Trash2 className="size-4" aria-hidden />
                  </ConfirmButton>
                </form>
              </div>
              {unlinked.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Sin vincular: {unlinked.slice(0, 8).join("; ")}
                  {unlinked.length > 8 ? ` y ${unlinked.length - 8} más` : ""}
                </p>
              )}
              <ImportedStatsTable data={data} accentColor={team.color} linkPlayers={false} />
            </section>
          );
        })}
    </main>
  );
}
