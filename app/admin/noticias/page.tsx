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
import { deleteNews, saveNews } from "@/lib/admin/actions";
import { requireAdmin } from "@/lib/admin/auth";

export const metadata: Metadata = { title: "Noticias" };
export const dynamic = "force-dynamic";

interface NewsRow {
  id: string;
  title: string;
  body: string;
  status: string;
  published_at: string | null;
}

interface PageProps {
  searchParams: Promise<{ ok?: string; error?: string; edit?: string }>;
}

export default async function NoticiasPage({ searchParams }: PageProps) {
  const { ok, error, edit } = await searchParams;
  const context = await requireAdmin();
  if (!context) return null;

  const { data } = await context.supabase
    .from("news")
    .select("id, title, body, status, published_at")
    .order("created_at", { ascending: false });
  const news = (data ?? []) as NewsRow[];
  const editing = news.find((item) => item.id === edit);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6">
      <AdminTitle>Noticias</AdminTitle>
      <Feedback ok={ok} error={error} />

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
    </main>
  );
}
