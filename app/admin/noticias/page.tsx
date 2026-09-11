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
import { Pager } from "@/components/admin/pagination";
import { deleteNews, regenerateAiNews, saveNews } from "@/lib/admin/actions";
import { requireAdmin } from "@/lib/admin/auth";
import { sql } from "@/lib/db";

export const metadata: Metadata = { title: "Noticias" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 10;

interface NewsRow {
  id: string;
  title: string;
  body: string;
  status: string;
  published_at: string | null;
  ai_generated: boolean;
}

interface AiJobRow {
  id: string;
  game_id: string;
  status: string;
  attempts: number;
  error: string | null;
  games: {
    home: { name: string } | null;
    away: { name: string } | null;
  } | null;
}

interface PageProps {
  searchParams: Promise<{ ok?: string; error?: string; edit?: string; p?: string }>;
}

export default async function NoticiasPage({ searchParams }: PageProps) {
  const { ok, error, edit, p } = await searchParams;
  const page = Math.max(1, Number.parseInt(p ?? "1", 10) || 1);
  const context = await requireAdmin();
  if (!context) return null;

  const [news, totalRow, aiJobs, editData] = await Promise.all([
    context.db.rows<NewsRow>(sql`
      select id, title, body, status::text as status, published_at, ai_generated
        from public.news
       order by created_at desc
       limit ${PAGE_SIZE} offset ${(page - 1) * PAGE_SIZE}
    `),
    context.db.one<{ total: number }>(sql`
      select count(*)::int as total from public.news
    `),
    context.db.rows<AiJobRow>(sql`
      select j.id, j.game_id, j.status::text as status, j.attempts, j.error,
             case when g.id is null then null else json_build_object(
               'home', case when h.id is null then null
                            else json_build_object('name', h.name) end,
               'away', case when a.id is null then null
                            else json_build_object('name', a.name) end
             ) end as games
        from public.ai_jobs j
        left join public.games g on g.id = j.game_id
        left join public.teams h on h.id = g.home_team_id
        left join public.teams a on a.id = g.away_team_id
       order by j.created_at desc
       limit 10
    `),
    edit
      ? context.db.maybeOne<NewsRow>(sql`
          select id, title, body, status::text as status, published_at, ai_generated
            from public.news
           where id = ${edit}
           limit 1
        `)
      : Promise.resolve(null),
  ]);
  const editing = editData ?? undefined;
  const total = totalRow.total;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6">
      <AdminTitle>Noticias</AdminTitle>
      <Feedback ok={ok} error={error} />

      {aiJobs.length > 0 && (
        <section className="rounded-2xl border p-4">
          <h2 className="mb-1 font-display text-xl">Crónicas automáticas</h2>
          <p className="mb-3 text-xs text-muted-foreground">
            Al finalizar un partido se arma un borrador con los datos reales
            del juego (marcador, figuras, récords). Nunca se publica solo:
            revísalo, edítalo y publícalo tú.
          </p>
          <ul className="flex flex-col gap-2">
            {aiJobs.map((job) => (
              <li key={job.id} className="flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 text-sm">
                <span className="min-w-0 flex-1 truncate">
                  {job.games?.away?.name ?? "—"} @ {job.games?.home?.name ?? "—"}
                  {job.error && (
                    <span className="block truncate text-xs text-destructive">{job.error}</span>
                  )}
                </span>
                <StatusChip
                  status={
                    job.status === "done"
                      ? "published"
                      : job.status === "failed"
                        ? "rejected"
                        : "pending"
                  }
                />
                <form action={regenerateAiNews.bind(null, job.game_id)}>
                  <button
                    type="submit"
                    className="min-h-11 rounded-lg border border-brand-amber/50 px-3 text-sm text-brand-amber hover:bg-brand-amber/10"
                  >
                    Regenerar
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-2xl border p-4">
        <h2 className="mb-3 font-display text-xl">
          {editing ? `Editar: ${editing.title}` : "Nueva noticia"}
        </h2>
        <form action={saveNews} className="flex flex-col gap-3">
          {editing && <input type="hidden" name="id" value={editing.id} />}
          <Field label="Título">
            <input name="title" required defaultValue={editing?.title ?? ""} className={inputClass} />
          </Field>
          <Field label="Cuerpo">
            <textarea
              name="body"
              required
              rows={6}
              defaultValue={editing?.body ?? ""}
              className={`${inputClass} min-h-32 py-3`}
            />
          </Field>
          <Field label="Imagen (opcional)">
            <input type="file" name="image" accept="image/*" className={`${inputClass} py-2.5`} />
          </Field>
          <label className="flex min-h-12 items-center gap-2 rounded-lg border px-3 text-sm">
            <input
              type="checkbox"
              name="publish"
              value="true"
              defaultChecked={editing?.status === "published"}
              className="accent-[var(--brand-amber)]"
            />
            Publicar en el sitio (sin marcar = borrador)
          </label>
          <SubmitButton>{editing ? "Guardar cambios" : "Guardar noticia"}</SubmitButton>
        </form>
      </section>

      {news.length === 0 ? (
        <EmptyRow>Sin noticias.</EmptyRow>
      ) : (
        <ul className="flex flex-col gap-2">
          {news.map((item) => (
            <li key={item.id} className="flex items-center gap-3 rounded-xl border px-4 py-3">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{item.title}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {item.body.slice(0, 90)}
                </span>
              </span>
              {item.ai_generated && (
                <span className="rounded-md border border-brand-amber/50 px-2 py-0.5 text-xs text-brand-amber">
                  Auto — revisar
                </span>
              )}
              <StatusChip status={item.status} />
              <a
                href={`/admin/noticias?edit=${item.id}`}
                className="flex min-h-11 items-center rounded-lg border px-3 text-sm text-muted-foreground hover:bg-muted"
              >
                Editar
              </a>
              <form action={deleteNews.bind(null, item.id)}>
                <ConfirmButton message={`¿Eliminar la noticia "${item.title}"?`}>
                  Eliminar
                </ConfirmButton>
              </form>
            </li>
          ))}
        </ul>
      )}

      <Pager page={page} total={total} pageSize={PAGE_SIZE} baseHref="/admin/noticias" />
    </main>
  );
}
