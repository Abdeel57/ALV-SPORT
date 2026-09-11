import Link from "next/link";
import { KIND_LABELS, formatStatValue, type TeamStatImportView } from "@/lib/stats-import";

/**
 * Tabla de estadísticas importadas desde otro programa. Se muestra tal
 * cual la cargó la liga, con el nombre fijo al desplazar en móvil y una
 * nota de origen: no sale de la anotación de ALV SPORT.
 */

const dateFormat = new Intl.DateTimeFormat("es-MX", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "America/Mexico_City",
});

export function ImportedStatsTable({
  data,
  accentColor,
  linkPlayers = true,
}: {
  data: TeamStatImportView;
  accentColor?: string | null;
  /** Enlaza los nombres vinculados a su perfil. */
  linkPlayers?: boolean;
}) {
  const columns = data.columns.map((column) => ({ key: column, label: column.replace(/·\d+$/, "") }));
  const headingId = `import-${data.id}`;
  return (
    <article
      className="flex flex-col gap-3 rounded-2xl border border-l-4 p-3 sm:p-4"
      style={{ borderLeftColor: accentColor ?? "var(--brand-amber)" }}
      aria-labelledby={headingId}
    >
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 id={headingId} className="font-display text-xl">
          {data.title}
        </h3>
        <p className="text-xs text-muted-foreground">
          {KIND_LABELS[data.kind]} · {data.rows.length} jugadores
          {data.playerCount !== null && data.playerCount !== data.rows.length ? ` (el documento dice ${data.playerCount})` : ""}
          {" · "}actualizado {dateFormat.format(new Date(data.updatedAt))}
        </p>
      </header>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full border-collapse text-sm tabular-nums">
          <thead>
            <tr className="text-[11px] tracking-wider text-muted-foreground uppercase">
              <th scope="col" className="sticky left-0 z-10 bg-background px-3 py-2 text-left font-semibold">
                Jugador
              </th>
              {columns.map((column) => (
                <th key={column.key} scope="col" className="px-2 py-2 text-right font-semibold whitespace-nowrap">
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row, index) => (
              <tr key={`${row.name}-${index}`} className="border-t">
                <th scope="row" className="sticky left-0 z-10 bg-background px-3 py-1.5 text-left font-medium whitespace-nowrap">
                  {row.playerId && linkPlayers ? (
                    <Link href={`/jugador/${row.playerId}`} className="underline-offset-2 transition-colors hover:text-brand-amber hover:underline">
                      {row.name}
                    </Link>
                  ) : (
                    row.name
                  )}
                </th>
                {columns.map((column) => (
                  <td key={column.key} className="px-2 py-1.5 text-right">
                    {formatStatValue(column.key, row.values[column.key] ?? null)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {data.totals && (
            <tfoot>
              <tr className="border-t-2 font-bold">
                <th scope="row" className="sticky left-0 z-10 bg-background px-3 py-2 text-left">
                  Totales
                </th>
                {columns.map((column) => (
                  <td key={column.key} className="px-2 py-2 text-right">
                    {formatStatValue(column.key, data.totals?.[column.key] ?? null)}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        Tabla importada por la liga desde otro programa; no se calcula a partir de la anotación en ALV SPORT.
      </p>
    </article>
  );
}
