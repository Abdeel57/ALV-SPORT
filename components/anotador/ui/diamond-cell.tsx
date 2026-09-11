import type { BaseIndex, PathSegment, PlateAppearance } from "@/lib/engine/scorebook";
import { cn } from "@/lib/utils";

/**
 * Minidiamante de la libreta: un SVG por aparición. Dibuja el recorrido del
 * corredor tramo por tramo (los avances posteriores completan la celda),
 * rellena el diamante cuando anota, marca con ✕ la base del out y numera
 * el out. El código del resultado va en una etiqueta de color y la cuenta
 * de lanzamientos en la esquina, como en la libreta de referencia.
 */

// Vértices del diamante en un viewBox 0 0 40 40: home abajo, 2ª arriba.
const POINTS: Record<BaseIndex, [number, number]> = {
  0: [20, 36],
  1: [34, 20],
  2: [20, 6],
  3: [6, 20],
  4: [20, 36],
};

function edge(from: BaseIndex, to: BaseIndex): string {
  const [x1, y1] = POINTS[from];
  const [x2, y2] = POINTS[to];
  return `M${x1} ${y1} L${x2} ${y2}`;
}

/** Tramos de una base a otra, pasando por las intermedias. */
function edgesBetween(from: BaseIndex, to: BaseIndex): string[] {
  const result: string[] = [];
  for (let b = from; b < to; b += 1) {
    result.push(edge(b as BaseIndex, (b + 1) as BaseIndex));
  }
  return result;
}

function segmentTone(segment: PathSegment): string {
  switch (segment.reason) {
    case "hit":
    case "home_run":
    case "batted_ball":
      return "var(--sheet-hit)";
    case "walk":
    case "forced":
      return "var(--sheet-walk)";
    case "error":
    case "passed_ball":
    case "wild_pitch":
      return "var(--sheet-error)";
    default:
      return "var(--sheet-ink)";
  }
}

export function codeTone(pa: PlateAppearance): string {
  if (!pa.result) return "var(--sheet-muted)";
  if (pa.result === "single" || pa.result === "double" || pa.result === "triple" || pa.result === "home_run") {
    return "var(--sheet-hit)";
  }
  if (pa.result === "walk" || pa.result === "intentional_walk" || pa.result === "hbp" || pa.result === "interference") {
    return "var(--sheet-walk)";
  }
  if (pa.result === "reach_on_error" || pa.result === "fielders_choice") return "var(--sheet-error)";
  return "var(--sheet-out)";
}

export function describeCell(pa: PlateAppearance, batterName: string): string {
  const parts = [`${batterName}, entrada ${pa.inning}`];
  if (!pa.result) parts.push("aparición en curso");
  else parts.push(pa.code);
  if (pa.scored) parts.push("anota carrera");
  else if (pa.finalBase > 0) parts.push(`queda en ${pa.finalBase}ª`);
  if (pa.outNumber) parts.push(`out ${pa.outNumber}`);
  if (pa.rbi > 0) parts.push(`${pa.rbi} impulsada${pa.rbi === 1 ? "" : "s"}`);
  const balls = pa.pitches.filter((p) => p.kind === "ball").length;
  const strikes = pa.pitches.filter((p) => p.kind !== "ball").length;
  if (pa.pitches.length > 0) parts.push(`${balls} bola${balls === 1 ? "" : "s"} y ${strikes} strike${strikes === 1 ? "" : "s"}`);
  return parts.join(", ");
}

export interface DiamondCellProps {
  pa: PlateAppearance | null;
  batterName: string;
  /** Celda del bateador que toca ahora. */
  active?: boolean;
  /** Celda seleccionada para consultar (no cambia al bateador). */
  selected?: boolean;
  /** Foco de navegación por teclado dentro de la libreta. */
  focused?: boolean;
  /** Muestra la marca diagonal de fin de media entrada. */
  endsHalf?: boolean;
  dense?: boolean;
}

export function DiamondCell({ pa, batterName, active, selected, focused, endsHalf, dense }: DiamondCellProps) {
  const size = dense ? 36 : 58;
  const label = pa ? describeCell(pa, batterName) : active ? `${batterName}, al bate` : "sin aparición";
  const outBase = pa?.path.find((segment) => segment.out);
  const balls = pa?.pitches.filter((p) => p.kind === "ball").length ?? 0;
  const strikes = pa?.pitches.filter((p) => p.kind !== "ball").length ?? 0;

  return (
    <figure
      role="img"
      aria-label={label}
      title={label}
      className={cn(
        "relative m-0 flex h-full w-full items-center justify-center",
        active && "bg-[var(--sheet-active)]",
        selected && "outline outline-2 -outline-offset-2 outline-[var(--sheet-select)]",
        focused && !selected && "outline outline-2 -outline-offset-2 outline-[var(--sheet-ink)]",
      )}
    >
      {pa && pa.code && (
        <span
          className={cn("absolute top-0.5 left-0.5 max-w-[calc(100%-6px)] truncate rounded-sm px-1 leading-4 font-bold text-white tabular-nums", dense ? "text-[10px]" : "text-[11px]")}
          style={{ backgroundColor: codeTone(pa) }}
        >
          {pa.code}
        </span>
      )}
      {pa?.outNumber && (
        <span
          className="absolute top-0.5 right-0.5 grid size-4 place-items-center rounded-full text-[10px] leading-none font-bold text-white"
          style={{ backgroundColor: "var(--sheet-out)" }}
          aria-hidden
        >
          {pa.outNumber}
        </span>
      )}
      <svg viewBox="0 0 40 40" width={size} height={size} aria-hidden className="shrink-0">
        {/* Diamante base */}
        <path
          d={`${edge(0, 1)} ${edge(1, 2)} ${edge(2, 3)} ${edge(3, 0)}`}
          fill={pa?.scored ? "var(--sheet-run)" : "none"}
          fillOpacity={pa?.scored ? 0.35 : 0}
          stroke="var(--sheet-line-strong)"
          strokeWidth={1}
        />
        {/* Recorrido del corredor */}
        {pa?.path.map((segment, index) =>
          edgesBetween(segment.from, segment.to).map((d, j) => (
            <path
              key={`${index}-${j}`}
              d={d}
              stroke={segment.out ? "var(--sheet-out)" : segmentTone(segment)}
              strokeWidth={segment.out ? 2 : 3}
              strokeDasharray={segment.out ? "3 2" : undefined}
              strokeLinecap="round"
              fill="none"
            />
          )),
        )}
        {/* Out en una base */}
        {outBase && (
          <g transform={`translate(${POINTS[outBase.to][0]} ${POINTS[outBase.to][1]})`}>
            <path d="M-4 -4 L4 4 M4 -4 L-4 4" stroke="var(--sheet-out)" strokeWidth={2.2} strokeLinecap="round" />
          </g>
        )}
        {/* Corredor todavía en base */}
        {pa && pa.result && !pa.scored && pa.finalBase >= 1 && pa.finalBase <= 3 && !outBase && (
          <circle cx={POINTS[pa.finalBase][0]} cy={POINTS[pa.finalBase][1]} r={3.2} fill="var(--sheet-ink)" />
        )}
        {/* Carrera anotada */}
        {pa?.scored && <circle cx={20} cy={20} r={4} fill="var(--sheet-run)" stroke="var(--sheet-ink)" strokeWidth={1} />}
      </svg>
      {/* Cuenta de lanzamientos: ● bolas, | strikes */}
      {pa && (balls > 0 || strikes > 0) && (
        <span
          className="absolute right-0.5 bottom-0.5 flex items-center gap-0.5 text-[9px] leading-none tabular-nums"
          style={{ color: "var(--sheet-muted)" }}
          aria-hidden
        >
          {"●".repeat(Math.min(balls, 4))}
          {strikes > 0 && <span className="ml-0.5">{"|".repeat(Math.min(strikes, 3))}</span>}
        </span>
      )}
      {pa && pa.rbi > 0 && (
        <span className="absolute bottom-0.5 left-0.5 text-[9px] leading-none font-bold" style={{ color: "var(--sheet-run)" }} aria-hidden>
          {"◆".repeat(Math.min(pa.rbi, 4))}
        </span>
      )}
      {endsHalf && (
        <span
          aria-hidden
          className="pointer-events-none absolute right-0 bottom-0 h-3 w-3"
          style={{
            background: "linear-gradient(135deg, transparent 45%, var(--sheet-out) 45%, var(--sheet-out) 60%, transparent 60%)",
          }}
        />
      )}
      {active && !pa && (
        <span className="absolute right-1 bottom-1 text-[11px]" aria-hidden>
          ✎
        </span>
      )}
    </figure>
  );
}
