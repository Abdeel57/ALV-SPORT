"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import type { PlateAppearance, ScorebookStateInternal } from "@/lib/engine/scorebook";
import { cn } from "@/lib/utils";
import { DiamondCell } from "../ui/diamond-cell";
import { PositionBadge } from "../ui/position-badge";
import type { ConsoleTeam } from "../types";

/**
 * La libreta: filas por orden al bate, columnas por entrada (con
 * subcolumnas cuando un bateador tiene dos apariciones en la misma
 * entrada), celdas con minidiamante. Jugadores y encabezados fijos al
 * desplazar; navegación con flechas cuando la cuadrícula tiene el foco.
 */

export interface CellRef {
  slot: number;
  inning: number;
  index: number;
}

export interface ScorebookGridProps {
  state: ScorebookStateInternal;
  team: ConsoleTeam;
  playerNames: Record<string, string>;
  jerseyOf: (playerId: string) => string | null;
  /** Celda del bateador en turno (solo si este equipo está al bate). */
  activeCell: CellRef | null;
  selectedPaId: string | null;
  onSelectPa: (pa: PlateAppearance | null) => void;
  focusedCell: CellRef | null;
  onFocusCell: (cell: CellRef) => void;
  dense: boolean;
  /** Si la cuadrícula debe pedir el foco del teclado al montar/cambiar. */
  gridFocus: boolean;
  className?: string;
}

export function ScorebookGrid({
  state,
  team,
  playerNames,
  jerseyOf,
  activeCell,
  selectedPaId,
  onSelectPa,
  focusedCell,
  onFocusCell,
  dense,
  gridFocus,
  className,
}: ScorebookGridProps) {
  const book = state.teams[team.id]!;
  const rows = useMemo(() => [...book.slots].sort((a, b) => a.slot - b.slot), [book.slots]);
  const inningsToShow = Math.max(state.rules.innings, state.inning);

  // Subcolumnas por entrada: máximo de apariciones de un bateador en esa entrada.
  const columns = useMemo(() => {
    const widths = new Map<number, number>();
    for (let inning = 1; inning <= inningsToShow; inning += 1) widths.set(inning, 1);
    for (const pa of book.plateAppearances) {
      if (pa.interrupted) continue;
      widths.set(pa.inning, Math.max(widths.get(pa.inning) ?? 1, pa.indexInInning));
    }
    if (activeCell) widths.set(activeCell.inning, Math.max(widths.get(activeCell.inning) ?? 1, activeCell.index));
    return [...widths.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([inning, width]) => ({ inning, width }));
  }, [book.plateAppearances, inningsToShow, activeCell]);

  const paIndex = useMemo(() => {
    const map = new Map<string, PlateAppearance>();
    for (const pa of book.plateAppearances) {
      if (pa.interrupted) continue;
      map.set(`${pa.slot}:${pa.inning}:${pa.indexInInning}`, pa);
    }
    // Aparición en curso (todavía sin resultado) también ocupa su celda.
    const current = state.currentPA;
    if (current && current.teamId === team.id && current.result === null) {
      map.set(`${current.slot}:${current.inning}:${current.indexInInning}`, current);
    }
    return map;
  }, [book.plateAppearances, state.currentPA, team.id]);

  // Fin de media entrada: la aparición que hizo el tercer out (o el último
  // out de corredor asociado) lleva la marca diagonal.
  const halfEnders = useMemo(() => {
    const set = new Set<string>();
    for (const pa of book.plateAppearances) {
      if (pa.outNumber === 3) set.add(pa.id);
    }
    return set;
  }, [book.plateAppearances]);

  // Historial de sustituciones por puesto (para mostrarlo junto a la fila).
  const subsBySlot = useMemo(() => {
    const map = new Map<number, string[]>();
    for (const sub of book.substitutions) {
      const list = map.get(sub.slot) ?? [];
      if (sub.outPlayerId) list.push(`${playerNames[sub.outPlayerId] ?? "—"} → ${playerNames[sub.inPlayerId] ?? "—"} (E${sub.inning})`);
      map.set(sub.slot, list);
    }
    return map;
  }, [book.substitutions, playerNames]);

  const flatCells = useMemo(() => {
    const list: CellRef[] = [];
    for (const row of rows) {
      for (const column of columns) {
        for (let index = 1; index <= column.width; index += 1) {
          list.push({ slot: row.slot, inning: column.inning, index });
        }
      }
    }
    return list;
  }, [rows, columns]);

  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (gridFocus) containerRef.current?.focus();
  }, [gridFocus]);

  const cellKey = (cell: CellRef): string => `${cell.slot}:${cell.inning}:${cell.index}`;
  const sameCell = (a: CellRef | null, b: CellRef): boolean =>
    a !== null && a.slot === b.slot && a.inning === b.inning && a.index === b.index;

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const current = focusedCell ?? activeCell ?? flatCells[0] ?? null;
      if (!current) return;
      const rowIndex = rows.findIndex((r) => r.slot === current.slot);
      const colIndex = flatCells.findIndex((c) => c.slot === current.slot && c.inning === current.inning && c.index === current.index);
      const perRow = flatCells.length / Math.max(rows.length, 1);
      const colInRow = colIndex % perRow;
      let next: CellRef | null = null;
      switch (event.key) {
        case "ArrowRight":
          next = flatCells[rowIndex * perRow + Math.min(colInRow + 1, perRow - 1)] ?? null;
          break;
        case "ArrowLeft":
          next = flatCells[rowIndex * perRow + Math.max(colInRow - 1, 0)] ?? null;
          break;
        case "ArrowDown":
          next = flatCells[Math.min(rowIndex + 1, rows.length - 1) * perRow + colInRow] ?? null;
          break;
        case "ArrowUp":
          next = flatCells[Math.max(rowIndex - 1, 0) * perRow + colInRow] ?? null;
          break;
        case "Enter": {
          const pa = paIndex.get(cellKey(current)) ?? null;
          onSelectPa(pa);
          event.preventDefault();
          return;
        }
        case "Escape":
          onSelectPa(null);
          return;
        default:
          return;
      }
      if (next) {
        event.preventDefault();
        onFocusCell(next);
      }
    },
    [focusedCell, activeCell, flatCells, rows, paIndex, onSelectPa, onFocusCell],
  );

  const totalSubColumns = columns.reduce((sum, column) => sum + column.width, 0);
  const cellSize = dense ? "h-11" : "h-18";
  const nameWidth = dense ? "w-[10.5rem]" : "w-[12rem]";

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      role="grid"
      aria-label={`Libreta de ${team.name}`}
      aria-rowcount={rows.length + 1}
      onKeyDown={handleKeyDown}
      className={cn("sheet relative overflow-auto outline-none focus-visible:ring-2 focus-visible:ring-[var(--sheet-select)] focus-visible:ring-inset", className)}
    >
      <table
        className="w-full table-fixed border-separate border-spacing-0 text-xs"
        style={{ minWidth: `${(dense ? 168 : 192) + 44 + totalSubColumns * (dense ? 64 : 88)}px` }}
      >
        <thead className="sticky top-0 z-20">
          <tr role="row">
            <th
              scope="col"
              className={cn("sticky left-0 z-30 border-r border-b px-2 py-1 text-left text-[11px] font-semibold uppercase tracking-wider sheet-line", nameWidth)}
              style={{ backgroundColor: "var(--sheet-bg-alt)", color: "var(--sheet-muted)" }}
            >
              Orden · Jugador
            </th>
            <th
              scope="col"
              className="sticky z-30 w-11 border-r border-b px-1 py-1 text-center text-[11px] font-semibold uppercase tracking-wider sheet-line"
              style={{ backgroundColor: "var(--sheet-bg-alt)", color: "var(--sheet-muted)", left: dense ? "10.5rem" : "12rem" }}
            >
              Pos
            </th>
            {columns.map((column) => (
              <th
                key={column.inning}
                scope="col"
                colSpan={column.width}
                className={cn(
                  "border-r border-b px-1 py-1 text-center font-display text-sm sheet-line",
                  column.inning === state.inning && "text-[var(--sheet-run)]",
                )}
                style={{ backgroundColor: "var(--sheet-bg-alt)" }}
                aria-label={`Entrada ${column.inning}`}
              >
                {column.inning}
                {column.inning > state.rules.innings && <span className="text-[9px]"> x</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={2 + columns.reduce((s, c) => s + c.width, 0)} className="px-3 py-6 text-center" style={{ color: "var(--sheet-muted)" }}>
                Sin alineación confirmada.
              </td>
            </tr>
          )}
          {rows.map((row) => {
            const subs = subsBySlot.get(row.slot) ?? [];
            return (
              <tr key={row.slot} role="row" className="group">
                <th
                  scope="row"
                  className={cn("sticky left-0 z-10 border-r border-b px-2 py-0.5 text-left font-normal sheet-line", nameWidth)}
                  style={{ backgroundColor: "var(--sheet-bg)" }}
                >
                  <span className="flex items-center gap-1.5">
                    <span className="w-4 shrink-0 text-center font-display text-sm tabular-nums" aria-label={`Turno ${row.slot}`}>
                      {row.slot}
                    </span>
                    <span className="w-6 shrink-0 text-center text-[10px] tabular-nums" style={{ color: "var(--sheet-muted)" }}>
                      {jerseyOf(row.playerId) ?? "—"}
                    </span>
                    <span className="min-w-0 truncate font-semibold" title={playerNames[row.playerId] ?? ""}>
                      {playerNames[row.playerId] ?? "—"}
                    </span>
                  </span>
                  {subs.length > 0 && (
                    <span className="block truncate pl-11 text-[10px]" style={{ color: "var(--sheet-muted)" }} title={subs.join(" · ")}>
                      ↳ {subs[subs.length - 1]}
                    </span>
                  )}
                </th>
                <td
                  className="sticky z-10 border-r border-b px-1 py-0.5 text-center sheet-line"
                  style={{ backgroundColor: "var(--sheet-bg)", left: dense ? "10.5rem" : "12rem" }}
                >
                  <PositionBadge code={row.position ?? (row.role !== "starter" && row.role !== "sub" ? row.role : null)} size="xs" />
                </td>
                {columns.flatMap((column) =>
                  Array.from({ length: column.width }, (_, i) => {
                    const cell: CellRef = { slot: row.slot, inning: column.inning, index: i + 1 };
                    const key = cellKey(cell);
                    const pa = paIndex.get(key) ?? null;
                    const isActive = sameCell(activeCell, cell);
                    const isFocused = sameCell(focusedCell, cell);
                    const isSelected = pa !== null && pa.id === selectedPaId;
                    return (
                      <td
                        key={key}
                        role="gridcell"
                        aria-selected={isSelected || undefined}
                        onClick={() => {
                          onFocusCell(cell);
                          onSelectPa(pa);
                        }}
                        className={cn(
                          "border-r border-b p-0 align-top sheet-line",
                          cellSize,
                          i === column.width - 1 && "border-r-2",
                          column.inning > state.rules.innings && "bg-[var(--sheet-bg-alt)]",
                          "cursor-pointer",
                        )}
                        style={{ borderRightColor: i === column.width - 1 ? "var(--sheet-line-strong)" : undefined }}
                      >
                        <DiamondCell
                          pa={pa}
                          batterName={playerNames[row.playerId] ?? ""}
                          active={isActive}
                          selected={isSelected}
                          focused={isFocused}
                          endsHalf={pa !== null && halfEnders.has(pa.id)}
                          dense={dense}
                        />
                      </td>
                    );
                  }),
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
