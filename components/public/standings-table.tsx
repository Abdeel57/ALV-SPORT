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
 * Tabla de posiciones estilo broadcast: el líder lleva la barra ámbar y su
 * rank en ámbar; cada equipo lleva su barra de color oficial. En móvil las
 * columnas esenciales (#, equipo, JJ, G, P, Pts) son visibles; CF/CC/DIF
 * entran con scroll horizontal.
 */
export function StandingsTable({
  rows,
  compact = false,
}: {
  rows: StandingsRowView[];
  compact?: boolean;
}) {
  return (
    <div className="card-elevated overflow-x-auto rounded-xl">
      <Table>
        <TableHeader>
          <TableRow className="border-white/5 hover:bg-transparent">
            <TableHead className="w-9 text-[11px] tracking-[0.12em] uppercase">#</TableHead>
            <TableHead className="text-[11px] tracking-[0.12em] uppercase">Equipo</TableHead>
            <TableHead className="text-right text-[11px] tracking-[0.12em] uppercase">JJ</TableHead>
            <TableHead className="text-right text-[11px] tracking-[0.12em] uppercase">G</TableHead>
            <TableHead className="text-right text-[11px] tracking-[0.12em] uppercase">P</TableHead>
            <TableHead className="text-right text-[11px] tracking-[0.12em] uppercase">Pts</TableHead>
            {!compact && (
              <>
                <TableHead className="text-right text-[11px] tracking-[0.12em] uppercase">CF</TableHead>
                <TableHead className="text-right text-[11px] tracking-[0.12em] uppercase">CC</TableHead>
                <TableHead className="text-right text-[11px] tracking-[0.12em] uppercase">DIF</TableHead>
              </>
            )}
          </TableRow>
        </TableHeader>
        <TableBody className="tabular-nums">
          {rows.map((row, index) => {
            const leader = row.rank === 1;
            return (
              <TableRow
                key={row.teamId}
                className={`relative border-white/5 ${
                  index % 2 === 1 ? "bg-white/[0.015]" : ""
                } ${leader ? "bg-brand-amber/[0.04]" : ""}`}
              >
                <TableCell
                  className={`relative font-display text-base ${
                    leader ? "text-brand-amber" : "text-muted-foreground"
                  }`}
                >
                  {leader && (
                    <span
                      className="absolute inset-y-1 left-0 w-0.5 rounded-full bg-brand-amber"
                      aria-hidden
                    />
                  )}
                  {row.rank}
                </TableCell>
                <TableCell>
                  <Link
                    href={`/equipo/${row.team.slug}`}
                    className="group flex items-center gap-2.5"
                  >
                    <span
                      className="h-4 w-1 shrink-0 rounded-full"
                      style={{ backgroundColor: row.team.color ?? "#666" }}
                      aria-hidden
                    />
                    <span className="truncate transition-colors duration-150 group-hover:text-brand-amber">
                      {row.team.name}
                    </span>
                  </Link>
                </TableCell>
                <TableCell className="text-right text-muted-foreground">{row.played}</TableCell>
                <TableCell className="text-right">{row.wins}</TableCell>
                <TableCell className="text-right text-muted-foreground">{row.losses}</TableCell>
                <TableCell
                  className={`text-right font-display text-base ${leader ? "text-brand-amber" : ""}`}
                >
                  {row.points}
                </TableCell>
                {!compact && (
                  <>
                    <TableCell className="text-right text-muted-foreground">{row.scoreFor}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{row.scoreAgainst}</TableCell>
                    <TableCell
                      className={`text-right ${row.scoreDiff > 0 ? "text-brand-silver" : "text-muted-foreground"}`}
                    >
                      {row.scoreDiff > 0 ? `+${row.scoreDiff}` : row.scoreDiff}
                    </TableCell>
                  </>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
