"use client";

import { useState } from "react";
import { SubmitButton } from "@/components/admin/ui";

export interface SuggestedFixture {
  round: number;
  matchup: string;
  dateLabel: string;
  courtName: string;
}

/**
 * Vista previa de las sugerencias del algoritmo con selección por partido:
 * todas inician marcadas (aceptar todo es un solo toque) y el admin puede
 * desmarcar las que no quiera. Solo los índices marcados llegan a
 * publishSchedule como `include`; el resto de los campos viajan ocultos.
 */
export function SuggestionPicker({
  action,
  fixtures,
  hidden,
}: {
  action: (formData: FormData) => Promise<void>;
  fixtures: SuggestedFixture[];
  hidden: Record<string, string | string[]>;
}) {
  const [excluded, setExcluded] = useState<ReadonlySet<number>>(new Set());
  const selectedCount = fixtures.length - excluded.size;

  const toggle = (index: number) => {
    setExcluded((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  return (
    <form action={action} className="flex flex-col gap-3">
      {Object.entries(hidden).flatMap(([name, value]) =>
        (Array.isArray(value) ? value : [value]).map((item) => (
          <input key={`${name}:${item}`} type="hidden" name={name} value={item} />
        )),
      )}

      <div className="max-h-96 overflow-y-auto rounded-2xl border">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-background">
            <tr className="border-b text-left text-muted-foreground">
              <th className="px-3 py-2 font-medium">
                <span className="sr-only">Publicar</span>
              </th>
              <th className="px-3 py-2 font-medium">J</th>
              <th className="px-3 py-2 font-medium">Partido</th>
              <th className="px-3 py-2 font-medium">Fecha</th>
              <th className="px-3 py-2 font-medium">Campo</th>
            </tr>
          </thead>
          <tbody>
            {fixtures.map((fixture, index) => {
              const included = !excluded.has(index);
              return (
                <tr
                  key={index}
                  className={`border-b last:border-0 ${included ? "" : "opacity-40"}`}
                >
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      name="include"
                      value={index}
                      checked={included}
                      onChange={() => toggle(index)}
                      aria-label={`Publicar ${fixture.matchup}`}
                      className="size-4 accent-[var(--brand-amber)]"
                    />
                  </td>
                  <td className="px-3 py-2 text-muted-foreground tabular-nums">
                    {fixture.round}
                  </td>
                  <td className="px-3 py-2">{fixture.matchup}</td>
                  <td className="px-3 py-2 text-muted-foreground">{fixture.dateLabel}</td>
                  <td className="px-3 py-2 text-muted-foreground">{fixture.courtName}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {selectedCount === 0 ? (
        <p className="text-sm text-muted-foreground">
          Marca al menos un partido para publicar.
        </p>
      ) : (
        <SubmitButton>
          Publicar {selectedCount === fixtures.length
            ? `${fixtures.length} partidos`
            : `${selectedCount} de ${fixtures.length} partidos`}{" "}
          al sitio público
        </SubmitButton>
      )}
      <p className="text-xs text-muted-foreground">
        Las sugerencias no son obligatorias: desmarca las que no quieras y,
        después de publicar, ajusta rivales, fecha, hora o campo de cualquier
        partido desde el calendario.
      </p>
    </form>
  );
}
