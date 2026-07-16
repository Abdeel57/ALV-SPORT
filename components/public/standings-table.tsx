import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { StandingsRowView } from "@/lib/data/types";

/**
 * Tabla de posiciones. En móvil las columnas esenciales (#, equipo, JJ, G,
 * P, Pts) son visibles; CF/CC/DIF entran con scroll horizontal.
 */
export function StandingsTable({
  rows,
  compact = false,
}: {
  rows: StandingsRowView[];
  compact?: boolean;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8">#</TableHead>
            <TableHead>Equipo</TableHead>
            <TableHead className="text-right">JJ</TableHead>
            <TableHead className="text-right">G</TableHead>
            <TableHead className="text-right">P</TableHead>
            <TableHead className="text-right">Pts</TableHead>
            {!compact && (
              <>
                <TableHead className="text-right">CF</TableHead>
                <TableHead className="text-right">CC</TableHead>
                <TableHead className="text-right">DIF</TableHead>
              </>
            )}
          </TableRow>
        </TableHeader>
        <TableBody className="tabular-nums">
          {rows.map((row) => (
            <TableRow key={row.teamId}>
              <TableCell className="font-medium text-muted-foreground">
                {row.rank}
              </TableCell>
              <TableCell>
                <Link
                  href={`/equipo/${row.team.slug}`}
                  className="flex items-center gap-2 hover:underline"
                >
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: row.team.color ?? "#666" }}
                    aria-hidden
                  />
                  <span className="truncate">{row.team.name}</span>
                </Link>
              </TableCell>
              <TableCell className="text-right">{row.played}</TableCell>
              <TableCell className="text-right">{row.wins}</TableCell>
              <TableCell className="text-right">{row.losses}</TableCell>
              <TableCell className="text-right font-semibold">{row.points}</TableCell>
              {!compact && (
                <>
                  <TableCell className="text-right">{row.scoreFor}</TableCell>
                  <TableCell className="text-right">{row.scoreAgainst}</TableCell>
                  <TableCell className="text-right">
                    {row.scoreDiff > 0 ? `+${row.scoreDiff}` : row.scoreDiff}
                  </TableCell>
                </>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
