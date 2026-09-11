import { Newspaper, Pencil, RefreshCw, Sparkles, Trash2 } from "lucide-react";
import type { Metadata } from "next";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { Pager } from "@/components/admin/pagination";
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
  fileInputClass,
  inputClass,
} from "@/components/admin/ui";
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
  games: { home: { name: string } | null; away: { name: string } | null } | null;
}

interface PageProps {
  searchParams: Promise<{ ok?: string; error?: string; edit?: string; p?: string; nuevo?: string }>;
}

export default async function NoticiasPage({ searchParams }: PageProps) {
  const { ok, error, edit, p, nuevo } = await searchParams;
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
    context.db.one<{ total: number }>(sql`select count(*)::int as total from public.news`),
    context.db.rows<AiJobRow>(sql`
      select j.id, j.game_id, j.status::text as status, j.attempts, j.error,
             case when g.id is null then null else json_build_object(
               'home', case when h.id is null then null else json_build_object('name', h.name) end,
               'away', case when a.id is null then null else json_build_object('name', a.name) end
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
            from public.news where id = ${edit} limit 1
        `)
      : Promise.resolve(null),
  ]);
  const editing = editData ?? undefined;
  const total = totalRow.total;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-6">
      <AdminTitle count={total}>Noticias</AdminTitle>
      <Feedback ok={ok} error={error} />

      <FormPanel
        title={editing ? `Editar ${editing.title}` : "Nueva noticia"}
        icon={Newspaper}
        open={Boolean(editing) || nuevo === "1"}
        cancelHref={editing ? "/admin/noticias" : undefined}
      >
        <form action={saveNews} className="flex flex-col gap-3">
          {editing && <input type="hidden" name="id" value={editing.id} />}
          <Field label="Título">
            <input name="title" required defaultValue={editing?.title ?? ""} className={inputClass} />
          </Field>
          <Field label="Texto">
            <textarea name="body" required rows={6} defaultValue={editing?.body ?? ""} className={`${inputClass} min-h-32 py-3`} />
          </Field>
          <Field label="Imagen">
            <input type="file" name="image" accept="image/*" className={fileInputClass} />
          </Field>
          <label className="flex min-h-12 items-center gap-2 rounded-lg border px-3 text-sm">
            <input type="checkbox" name="publish" value="true" defaultChecked={editing?.status === "published"} className="accent-[var(--brand-amber)]" />
            Publicar en el sitio
          </label>
          <SubmitButton className="self-start">{editing ? "Guardar cambios" : "Guardar noticia"}</SubmitButton>
        </form>
      </FormPanel>

      {aiJobs.length > 0 && (
        <FormPanel title="Crónicas automáticas" icon={Sparkles} tone="ghost">
          <p className="text-xs text-muted-foreground">Borradores generados al finalizar un partido. Nada se publica sin que lo revises.</p>
          <ul className="flex flex-col gap-2">
            {aiJobs.map((job) => (
              <ListRow
                key={job.id}
                actions={
                  <form action={regenerateAiNews.bind(null, job.game_id)}>
                    <IconSubmit label="Regenerar" icon={RefreshCw} tone="amber" />
                  </form>
                }
              >
                <RowText
                  title={`${job.games?.home?.name ?? "Equipo 1"} vs ${job.games?.away?.name ?? "Equipo 2"}`}
                  meta={job.error ?? undefined}
                >
                  <StatusChip status={job.status === "done" ? "published" : job.status === "failed" ? "rejected" : "pending"} />
                </RowText>
              </ListRow>
            ))}
          </ul>
        </FormPanel>
      )}

      {news.length === 0 ? (
        <EmptyRow>Todavía no hay noticias.</EmptyRow>
      ) : (
        <ul className="flex flex-col gap-2">
          {news.map((item) => (
            <ListRow
              key={item.id}
              actions={
                <>
                  <IconLink href={`/admin/noticias?edit=${item.id}`} label="Editar" icon={Pencil} />
                  <form action={deleteNews.bind(null, item.id)}>
                    <ConfirmButton icon ariaLabel="Eliminar" message={`¿Eliminar la noticia "${item.title}"?`}>
                      <Trash2 className="size-4" aria-hidden />
                    </ConfirmButton>
                  </form>
                </>
              }
            >
              <RowText title={item.title} meta={`${item.ai_generated ? "Crónica automática · " : ""}${item.body.slice(0, 90)}`}>
                <StatusChip status={item.status} />
              </RowText>
            </ListRow>
          ))}
        </ul>
      )}

      <Pager page={page} total={total} pageSize={PAGE_SIZE} baseHref="/admin/noticias" />
    </main>
  );
}
