"use client";

import { useState } from "react";
import Link from "next/link";
import { Field, SubmitButton, inputClass } from "@/components/admin/ui";

export interface TeamOption {
  id: string;
  name: string;
}

/**
 * Formulario de enfrentamiento, reusado para crear un partido manual y para
 * editar uno existente (rivales, fecha, hora y campo). La única interactividad
 * real es el candado local/visitante: el equipo elegido en un lado se
 * deshabilita en el otro, así el mismo equipo nunca juega contra sí mismo.
 */
export function MatchupForm({
  action,
  divisions,
  teamsByDivision,
  courts,
  cancelHref,
  initial,
}: {
  action: (formData: FormData) => Promise<void>;
  /** Divisiones elegibles; en edición no se muestra (la división es fija). */
  divisions?: { id: string; label: string }[];
  teamsByDivision: Record<string, TeamOption[]>;
  courts: { id: string; name: string }[];
  cancelHref?: string;
  initial?: {
    gameId: string;
    divisionId: string;
    homeTeamId: string;
    awayTeamId: string;
    /** Valor datetime-local (hora del centro de México). */
    scheduledAt: string;
    courtId: string | null;
    /** Con anotación iniciada los rivales ya no se tocan. */
    teamsLocked?: boolean;
  };
}) {
  const [divisionId, setDivisionId] = useState(
    initial?.divisionId ?? divisions?.[0]?.id ?? "",
  );
  const [homeTeamId, setHomeTeamId] = useState(initial?.homeTeamId ?? "");
  const [awayTeamId, setAwayTeamId] = useState(initial?.awayTeamId ?? "");
  const teams = teamsByDivision[divisionId] ?? [];
  const editing = initial !== undefined;
  const showTeams = !initial?.teamsLocked;

  const teamSelect = (
    side: "homeTeamId" | "awayTeamId",
    value: string,
    onChange: (id: string) => void,
    rivalId: string,
  ) => (
    <select
      name={side}
      required
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={inputClass}
    >
      <option value="" disabled>
        Selecciona equipo
      </option>
      {teams.map((team) => (
        <option key={team.id} value={team.id} disabled={team.id === rivalId}>
          {team.name}
        </option>
      ))}
    </select>
  );

  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      {editing && <input type="hidden" name="gameId" value={initial.gameId} />}
      {!editing && divisions && (
        <div className="sm:col-span-2">
          <Field label="División">
            <select
              name="divisionId"
              required
              value={divisionId}
              onChange={(event) => {
                setDivisionId(event.target.value);
                setHomeTeamId("");
                setAwayTeamId("");
              }}
              className={inputClass}
            >
              {divisions.map((division) => (
                <option key={division.id} value={division.id}>
                  {division.label}
                </option>
              ))}
            </select>
          </Field>
        </div>
      )}

      {showTeams && (
        <>
          <Field label="Equipo local">
            {teamSelect("homeTeamId", homeTeamId, setHomeTeamId, awayTeamId)}
          </Field>
          <Field label="Equipo visitante">
            {teamSelect("awayTeamId", awayTeamId, setAwayTeamId, homeTeamId)}
          </Field>
          {teams.length < 2 && (
            <p className="text-xs text-muted-foreground sm:col-span-2">
              Esta división aún no tiene equipos suficientes.
            </p>
          )}
        </>
      )}

      <Field label="Fecha y hora (centro de México)">
        <input
          type="datetime-local"
          name="scheduledAt"
          required
          defaultValue={initial?.scheduledAt}
          className={inputClass}
        />
      </Field>
      <Field label="Campo">
        <select name="courtId" defaultValue={initial?.courtId ?? ""} className={inputClass}>
          <option value="">Sin campo</option>
          {courts.map((court) => (
            <option key={court.id} value={court.id}>
              {court.name}
            </option>
          ))}
        </select>
      </Field>

      <div className="flex items-end gap-2 sm:col-span-2">
        <SubmitButton>Guardar</SubmitButton>
        {cancelHref && (
          <Link
            href={cancelHref}
            className="flex min-h-12 items-center rounded-lg border px-4 text-sm text-muted-foreground transition-colors hover:bg-muted"
          >
            Cancelar
          </Link>
        )}
      </div>
    </form>
  );
}
