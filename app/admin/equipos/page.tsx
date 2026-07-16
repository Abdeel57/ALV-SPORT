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
import { deleteTeam, saveTeam } from "@/lib/admin/actions";
import { requireAdmin } from "@/lib/admin/auth";

export const metadata: Metadata = { title: "Equipos" };
export const dynamic = "force-dynamic";

interface TeamRow {
  id: string;
  name: string;
  slug: string;
  color: string | null;
  logo_url: string | null;
  division_id: string;
  divisions: { name: string; seasons: { name: string } | null } | null;
}

interface DivisionOption {
  id: string;
  name: string;
  seasons: { name: string } | null;
}

interface PageProps {
  searchParams: Promise<{ ok?: string; error?: string; edit?: string }>;
}

export default async function EquiposPage({ searchParams }: PageProps) {
  const { ok, error, edit } = await searchParams;
  const context = await requireAdmin();
  if (!context) return null;

  const [{ data: divisionRows }, { data: teamRows }] = await Promise.all([
    context.supabase
      .from("divisions")
      .select("id, name, seasons(name)")
      .order("created_at", { ascending: false }),
    context.supabase
      .from("teams")
      .select("id, name, slug, color, logo_url, division_id, divisions(name, seasons(name))")
      .order("name"),
  ]);
  const divisions = (divisionRows ?? []) as unknown as DivisionOption[];
  const teams = (teamRows ?? []) as unknown as TeamRow[];
  const editing = teams.find((team) => team.id === edit);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6">
      <AdminTitle>Equipos</AdminTitle>
      <Feedback ok={ok} error={error} />

      <section className="rounded-2xl border p-4">
        <h2 className="mb-3 font-display text-xl">
          {editing ? `Editar: ${editing.name}` : "Nuevo equipo"}
        </h2>
        <form action={saveTeam} className="grid gap-3 sm:grid-cols-2">
          {editing && <input type="hidden" name="id" value={editing.id} />}
          <Field label="División">
            <select name="divisionId" required defaultValue={editing?.division_id ?? ""} className={inputClass}>
              <option value="" disabled>
                Selecciona división
              </option>
              {divisions.map((division) => (
                <option key={division.id} value={division.id}>
                  {division.name} · {division.seasons?.name ?? ""}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Nombre">
            <input name="name" required defaultValue={editing?.name ?? ""} placeholder="Tiburones" className={inputClass} />
          </Field>
          <Field label="Slug (URL pública)" hint="minúsculas, números y guiones">
            <input name="slug" required defaultValue={editing?.slug ?? ""} placeholder="tiburones" className={inputClass} />
          </Field>
          <Field label="Color oficial">
            <input
              type="color"
              name="color"
              defaultValue={editing?.color ?? "#E32B1E"}
              className="h-12 w-full cursor-pointer rounded-lg border bg-transparent px-1"
            />
          </Field>
          <Field label="Escudo (imagen, opcional)" hint="Se sube a Supabase Storage (máx. 4 MB)">
            <input type="file" name="logo" accept="image/*" className={`${inputClass} py-2.5`} />
          </Field>
          <div className="flex items-end">
            <SubmitButton>{editing ? "Guardar cambios" : "Crear equipo"}</SubmitButton>
          </div>
        </form>
      </section>

      {teams.length === 0 ? (
        <EmptyRow>Sin equipos: crea el primero arriba.</EmptyRow>
      ) : (
        <ul className="flex flex-col gap-2">
          {teams.map((team) => (
            <li
              key={team.id}
              className="flex items-center gap-3 rounded-xl border px-4 py-3"
            >
              {team.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={team.logo_url}
                  alt=""
                  className="size-10 rounded-full border object-cover"
                />
              ) : (
                <span
                  aria-hidden
                  className="flex size-10 items-center justify-center rounded-full border font-display"
                  style={{
                    backgroundColor: `${team.color ?? "#666"}26`,
                    borderColor: `${team.color ?? "#666"}66`,
                  }}
                >
                  {team.name.slice(0, 1)}
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{team.name}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {team.divisions?.name} · {team.divisions?.seasons?.name}
                </span>
              </span>
              <span
                className="size-4 shrink-0 rounded-full border"
                style={{ backgroundColor: team.color ?? "#666" }}
                aria-label={`Color ${team.color ?? "sin color"}`}
              />
              <a
                href={`/admin/equipos?edit=${team.id}`}
                className="flex min-h-11 items-center rounded-lg border px-3 text-sm text-muted-foreground hover:bg-muted"
              >
                Editar
              </a>
              <form action={deleteTeam.bind(null, team.id)}>
                <ConfirmButton message={`¿Eliminar al equipo "${team.name}"?`}>
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
