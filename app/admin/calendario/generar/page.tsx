import type { Metadata } from "next";
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

export const metadata: Metadata = { title: "Generar calendario" };
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
      .select("id, name, seasons(name)")
      .order("created_at", { ascending: false }),
    context.supabase
      .from("courts")
      .select("id, name, venues(name)")
      .order("name"),
  ]);
  const divisions = (divisionRows ?? []) as unknown as Array<{
    id: string;
    name: string;
    seasons: { name: string } | null;
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
      <AdminTitle>Generar calendario</AdminTitle>
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
                {division.name} · {division.seasons?.name ?? ""}
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
        <Field label="Canchas disponibles">
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
          <SubmitButton>Ver vista previa</SubmitButton>
        </div>
      </form>

      {preview && (
        <section className="flex flex-col gap-3">
          <h2 className="font-display text-xl">
            Vista previa · {preview.fixtures.length} partidos · {preview.teamCount} equipos
          </h2>
          <div className="max-h-96 overflow-y-auto rounded-2xl border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-background">
                <tr className="border-b text-left text-muted-foreground">
                  <th className="px-3 py-2 font-medium">J</th>
                  <th className="px-3 py-2 font-medium">Partido</th>
                  <th className="px-3 py-2 font-medium">Fecha</th>
                  <th className="px-3 py-2 font-medium">Cancha</th>
                </tr>
              </thead>
              <tbody>
                {preview.fixtures.map((fixture, index) => (
                  <tr key={index} className="border-b last:border-0">
                    <td className="px-3 py-2 text-muted-foreground tabular-nums">
                      {fixture.round}
                    </td>
                    <td className="px-3 py-2">
                      {preview.nameById.get(fixture.awayTeamId)} @{" "}
                      {preview.nameById.get(fixture.homeTeamId)}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {dateTimeFormat.format(new Date(fixture.scheduledAt))}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {preview.courtById.get(fixture.courtId)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Publicar: mismos parámetros, ahora como mutación */}
          <form action={publishSchedule} className="flex flex-col gap-2">
            <input type="hidden" name="divisionId" value={divisionId} />
            <input type="hidden" name="startDate" value={startDate} />
            {weekdays.map((day) => (
              <input key={day} type="hidden" name="weekdays" value={day} />
            ))}
            {times.map((time) => (
              <input key={time} type="hidden" name="times" value={time} />
            ))}
            {courtIds.map((id) => (
              <input key={id} type="hidden" name="courtIds" value={id} />
            ))}
            <input type="hidden" name="minRestDays" value={minRestDays} />
            {doubleRound && <input type="hidden" name="doubleRound" value="true" />}
            <SubmitButton>
              Publicar {preview.fixtures.length} partidos al sitio público
            </SubmitButton>
            <p className="text-xs text-muted-foreground">
              Después de publicar puedes ajustar fecha, hora o cancha de
              cualquier partido desde el calendario.
            </p>
          </form>
        </section>
      )}

      {!preview && !previewError && (
        <EmptyRow>
          Configura las restricciones y toca “Ver vista previa”: nada se
          publica hasta que lo confirmes.
        </EmptyRow>
      )}
    </main>
  );
}
