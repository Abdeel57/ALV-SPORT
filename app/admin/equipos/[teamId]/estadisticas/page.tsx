import { Trash2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { StatImportForm } from "@/components/admin/stat-import-form";
import { AdminTitle, EmptyRow, Feedback } from "@/components/admin/ui";
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
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6">
      <div className="flex flex-col gap-1">
        <Link href="/admin/equipos" className="text-xs text-muted-foreground underline-offset-2 hover:underline">
          ← Equipos
        </Link>
        <AdminTitle>Estadísticas de {team.name}</AdminTitle>
        <p className="text-sm text-muted-foreground">
          Tablas acumuladas de otro programa. Se muestran en{" "}
          <Link href={`/equipo/${team.slug}`} className="text-brand-amber underline-offset-2 hover:underline">
            la página pública del equipo
          </Link>
          , separadas de las estadísticas que ALV SPORT calcula desde la anotación.
        </p>
      </div>
      <Feedback ok={ok} error={error} />

      <section className="rounded-2xl border p-4">
        <h2 className="mb-3 font-display text-xl">Cargar tabla</h2>
        <StatImportForm teamId={team.id} action={importTeamStats} />
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-display text-xl">Tablas cargadas</h2>
        {imports.length === 0 ? (
          <EmptyRow>Todavía no hay tablas cargadas para este equipo.</EmptyRow>
        ) : (
          imports.map((data) => {
            const linked = data.rows.filter((row) => row.playerId).length;
            const unlinked = data.rows.filter((row) => !row.playerId).map((row) => row.name);
            return (
              <div key={data.id} className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="rounded-full border px-2.5 py-1 text-xs font-semibold uppercase tracking-wider">
                    {KIND_LABELS[data.kind]}
                  </span>
                  <span className="text-muted-foreground">
                    {linked} de {data.rows.length} nombres vinculados a la plantilla
                    {data.sourceName ? ` · ${data.sourceName}` : ""}
                  </span>
                  <form action={deleteTeamStatImport.bind(null, data.id, team.id)} className="ml-auto">
                    <ConfirmButton message={`¿Quitar la tabla "${data.title}"?`} ariaLabel={`Quitar ${data.title}`}>
                      <Trash2 className="size-4" aria-hidden />
                    </ConfirmButton>
                  </form>
                </div>
                {unlinked.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Sin vincular (revisa el nombre en la plantilla): {unlinked.slice(0, 8).join("; ")}
                    {unlinked.length > 8 ? ` y ${unlinked.length - 8} más` : ""}
                  </p>
                )}
                <ImportedStatsTable data={data} accentColor={team.color} linkPlayers={false} />
              </div>
            );
          })
        )}
      </section>
    </main>
  );
}
