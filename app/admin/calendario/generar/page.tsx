import type { Metadata } from "next";
import { SuggestionPicker } from "@/components/admin/suggestion-picker";
import {
  AdminTitle,
  EmptyRow,
  Feedback,
  Field,
  SubmitButton,
  inputClass,
} from "@/components/admin/ui";
import { publishSchedule } from "@/lib/admin/actions";
import { requireAdmin } from "@/lib/admin/auth";
import { assignSlots, generateRoundRobin } from "@/lib/engine";
import { seasonLabel } from "@/lib/utils";

export const metadata: Metadata = { title: "Generar sugerencias" };
export const dynamic = "force-dynamic";

const WEEKDAYS = [
  { value: 0, label: "Dom" },
  { value: 1, label: "Lun" },
  { value: 2, label: "Mar" },
  { value: 3, label: "Mié" },
  { value: 4, label: "Jue" },
  { value: 5, label: "Vie" },
  { value: 6, label: "Sáb" },
] as const;

type Params = Record<string, string | string[] | undefined>;

function asArray(value: string | string[] | undefined): string[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

const dateTimeFormat = new Intl.DateTimeFormat("es-MX", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Mexico_City",
});

export default async function GenerarPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const params = await searchParams;
  const context = await requireAdmin();
  if (!context) return null;

  const [{ data: divisionRows }, { data: courtRows }] = await Promise.all([
    context.supabase
      .from("divisions")
      .select("id, name, seasons(name, leagues(name))")
      .order("created_at", { ascending: false }),
    context.supabase
      .from("courts")
      .select("id, name, venues(name)")
      .order("name"),
  ]);
  const divisions = (divisionRows ?? []) as unknown as Array<{
    id: string;
    name: string;
    seasons: { name: string; leagues: { name: string } | null } | null;
  }>;
  const courts = (courtRows ?? []) as unknown as Array<{
    id: string;
    name: string;
    venues: { name: string } | null;
  }>;

  // --- Vista previa (misma lógica pura que usa publishSchedule) ---
  const divisionId = typeof params.divisionId === "string" ? params.divisionId : "";
  const startDate = typeof params.startDate === "string" ? params.startDate : "";
  const weekdays = asArray(params.weekdays).map(Number).filter((n) => !Number.isNaN(n));
  const times = asArray(params.times)
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter((value) => /^\d{2}:\d{2}$/.test(value));
  const courtIds = asArray(params.courtIds);
  const minRestDays = Number(params.minRestDays ?? 4);
  const doubleRound = params.doubleRound === "on" || params.doubleRound === "true";
  const ready =
    divisionId !== "" && startDate !== "" && weekdays.length > 0 &&
    times.length > 0 && courtIds.length > 0;

  let preview: Awaited<ReturnType<typeof buildPreview>> = null;
  let previewError: string | null = null;
  async function buildPreview() {
    if (!context || !ready) return null;
    const { data: teamRows } = await context.supabase
      .from("teams")
      .select("id, name")
      .eq("division_id", divisionId);
    const teams = (teamRows ?? []) as { id: string; name: string }[];
    if (teams.length < 2) {
      throw new Error("La división necesita al menos 2 equipos para generar el rol");
    }
    const fixtures = assignSlots(
      generateRoundRobin(teams.map((team) => team.id), { doubleRound }),
      { startDate, weekdays, times, courtIds, minRestDays },
    );
    const nameById = new Map(teams.map((team) => [team.id, team.name]));
    const courtById = new Map(courts.map((court) => [court.id, court.name]));
    return { fixtures, nameById, courtById, teamCount: teams.length };
  }
  try {
    preview = await buildPreview();
  } catch (caught) {
    previewError = caught instanceof Error ? caught.message : "No se pudo generar";
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6">
      <AdminTitle subtitle="El algoritmo propone el rol completo; tú eliges qué se publica.">
        Generar sugerencias
      </AdminTitle>
      <Feedback
        error={typeof params.error === "string" ? params.error : previewError ?? undefined}
      />

      {/* Form GET: la vista previa se calcula en el servidor sin publicar */}
      <form className="grid gap-3 rounded-2xl border p-4 sm:grid-cols-2">
        <Field label="División">
          <select name="divisionId" required defaultValue={divisionId} className={inputClass}>
            <option value="" disabled>
              Selecciona división
            </option>
            {divisions.map((division) => (
              <option key={division.id} value={division.id}>
                {[division.name, seasonLabel(division.seasons)]
                  .filter(Boolean)
                  .join(" · ")}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Primera fecha">
          <input type="date" name="startDate" required defaultValue={startDate} className={inputClass} />
        </Field>
        <Field label="Días de juego">
          <div className="flex flex-wrap gap-2">
            {WEEKDAYS.map((day) => (
              <label
                key={day.value}
                className="flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg border px-3 text-sm has-checked:border-brand-amber/60 has-checked:bg-secondary"
              >
                <input
                  type="checkbox"
                  name="weekdays"
                  value={day.value}
                  defaultChecked={weekdays.includes(day.value)}
                  className="accent-[var(--brand-amber)]"
                />
                {day.label}
              </label>
            ))}
          </div>
        </Field>
        <Field label="Horarios (separados por coma)">
          <input
            name="times"
            required
            defaultValue={times.join(", ") || "18:00, 20:00"}
            placeholder="18:00, 20:00"
            className={inputClass}
          />
        </Field>
        <Field label="Campos disponibles">
          <div className="flex flex-wrap gap-2">
            {courts.map((court) => (
              <label
                key={court.id}
                className="flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg border px-3 text-sm has-checked:border-brand-amber/60 has-checked:bg-secondary"
              >
                <input
                  type="checkbox"
                  name="courtIds"
                  value={court.id}
                  defaultChecked={courtIds.includes(court.id)}
                  className="accent-[var(--brand-amber)]"
                />
                {court.name} · {court.venues?.name ?? ""}
              </label>
            ))}
          </div>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Descanso mínimo (días)">
            <input
              type="number"
              name="minRestDays"
              min={0}
              max={30}
              defaultValue={minRestDays}
              className={inputClass}
            />
          </Field>
          <Field label="Doble vuelta">
            <label className="flex min-h-12 items-center gap-2 rounded-lg border px-3 text-sm">
              <input type="checkbox" name="doubleRound" defaultChecked={doubleRound} className="accent-[var(--brand-amber)]" />
              Ida y vuelta
            </label>
          </Field>
        </div>
        <div className="sm:col-span-2">
          <SubmitButton>Ver sugerencias</SubmitButton>
        </div>
      </form>

      {preview && (
        <section className="flex flex-col gap-3">
          <h2 className="font-display text-xl">
            Sugerencias · {preview.fixtures.length} partidos · {preview.teamCount} equipos
          </h2>
          {/* Publicar: mismos parámetros como mutación + selección por partido */}
          <SuggestionPicker
            action={publishSchedule}
            fixtures={preview.fixtures.map((fixture) => ({
              round: fixture.round,
              matchup: `${preview.nameById.get(fixture.awayTeamId)} @ ${preview.nameById.get(fixture.homeTeamId)}`,
              dateLabel: dateTimeFormat.format(new Date(fixture.scheduledAt)),
              courtName: preview.courtById.get(fixture.courtId) ?? "",
            }))}
            hidden={{
              divisionId,
              startDate,
              weekdays: weekdays.map(String),
              times,
              courtIds,
              minRestDays: String(minRestDays),
              ...(doubleRound ? { doubleRound: "true" } : {}),
            }}
          />
        </section>
      )}

      {!preview && !previewError && (
        <EmptyRow>
          Configura las restricciones y toca “Ver sugerencias”: nada se
          publica hasta que tú lo confirmes.
        </EmptyRow>
      )}
    </main>
  );
}
