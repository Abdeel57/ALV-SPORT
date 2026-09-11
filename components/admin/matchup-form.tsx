"use client";

import { useState } from "react";
import Link from "next/link";
import { Field, SubmitButton, inputClass } from "@/components/admin/ui";

export interface TeamOption {
  id: string;
  name: string;
}

export interface DivisionOption {
  id: string;
  label: string;
  /** Categoría (liga) a la que pertenece la división: filtra el listado. */
  categoryId: string;
  categoryName: string;
}

/**
 * Formulario de enfrentamiento, reusado para crear un partido manual y para
 * editar uno existente (rivales, fecha y hora). Categoría → división →
 * equipos: cada selector acota al siguiente, y el equipo elegido en un lado
 * se deshabilita en el otro para que nadie juegue contra sí mismo.
 *
 * En la base el "Equipo 1" sigue siendo home_team_id y el "Equipo 2"
 * away_team_id: la liga no distingue local/visitante en el rol, pero la mesa
 * de anotación sí necesita saber quién batea primero (el Equipo 2).
 */
export function MatchupForm({
  action,
  divisions,
  teamsByDivision,
  cancelHref,
  initial,
}: {
  action: (formData: FormData) => Promise<void>;
  /** Divisiones elegibles; en edición no se muestra (la división es fija). */
  divisions?: DivisionOption[];
  teamsByDivision: Record<string, TeamOption[]>;
  cancelHref?: string;
  initial?: {
    gameId: string;
    divisionId: string;
    homeTeamId: string;
    awayTeamId: string;
    /** Valor datetime-local (hora del centro de México). */
    scheduledAt: string;
    /** Con anotación iniciada los rivales ya no se tocan. */
    teamsLocked?: boolean;
  };
}) {
  const categories = (divisions ?? []).reduce<{ id: string; name: string }[]>((list, division) => {
    if (!list.some((category) => category.id === division.categoryId)) {
      list.push({ id: division.categoryId, name: division.categoryName });
    }
    return list;
  }, []);
  const initialDivision = divisions?.find((division) => division.id === initial?.divisionId) ?? divisions?.[0];
  const [categoryId, setCategoryId] = useState(initialDivision?.categoryId ?? categories[0]?.id ?? "");
  const [divisionId, setDivisionId] = useState(initial?.divisionId ?? initialDivision?.id ?? "");
  const [homeTeamId, setHomeTeamId] = useState(initial?.homeTeamId ?? "");
  const [awayTeamId, setAwayTeamId] = useState(initial?.awayTeamId ?? "");
  const visibleDivisions = (divisions ?? []).filter((division) => division.categoryId === categoryId);
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
        <>
          <Field label="Categoría">
            <select
              value={categoryId}
              onChange={(event) => {
                const nextCategory = event.target.value;
                setCategoryId(nextCategory);
                const first = divisions.find((division) => division.categoryId === nextCategory);
                setDivisionId(first?.id ?? "");
                setHomeTeamId("");
                setAwayTeamId("");
              }}
              className={inputClass}
              aria-label="Categoría"
            >
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </Field>
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
              {visibleDivisions.map((division) => (
                <option key={division.id} value={division.id}>
                  {division.label}
                </option>
              ))}
            </select>
          </Field>
        </>
      )}

      {showTeams && (
        <>
          <Field label="Equipo 1">
            {teamSelect("homeTeamId", homeTeamId, setHomeTeamId, awayTeamId)}
          </Field>
          <Field label="Equipo 2">
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
