import type { Bases, OccupiedBase } from "@/lib/engine/scorebook";
import { cn } from "@/lib/utils";

/**
 * Diamante grande de situación: bases ocupadas con el nombre del corredor
 * y outs. Se usa en el panel contextual y en la resolución de corredores
 * (donde además se puede resaltar al corredor que se está decidiendo).
 */

const CORNERS: Record<OccupiedBase | 0, { x: number; y: number }> = {
  0: { x: 60, y: 108 },
  1: { x: 108, y: 60 },
  2: { x: 60, y: 12 },
  3: { x: 12, y: 60 },
};

export interface BasesDiamondProps {
  bases: Bases;
  outs: number;
  playerNames: Record<string, string>;
  /** Corredor resaltado (p. ej. el que se está resolviendo). */
  highlightPlayerId?: string | null;
  /** Nombre del bateador en turno, si se quiere mostrar en home. */
  batterName?: string | null;
  size?: number;
  className?: string;
  onBaseClick?: (base: OccupiedBase) => void;
}

export function BasesDiamond({
  bases,
  outs,
  playerNames,
  highlightPlayerId,
  batterName,
  size = 168,
  className,
  onBaseClick,
}: BasesDiamondProps) {
  const runnerLabel = (base: OccupiedBase): string | null => {
    const runner = bases[base];
    return runner ? (playerNames[runner.playerId] ?? "corredor") : null;
  };
  const description = [
    `${outs} out${outs === 1 ? "" : "s"}`,
    ...([1, 2, 3] as const).map((b) => {
      const label = runnerLabel(b);
      return label ? `${label} en ${b}ª` : null;
    }).filter(Boolean),
  ].join(", ");

  return (
    <figure role="img" aria-label={`Bases: ${description}`} className={cn("m-0 flex flex-col items-center gap-2", className)}>
      <svg viewBox="0 0 120 134" width={size} height={Math.round((size * 134) / 120)} className="overflow-visible">
        <path
          d="M60 108 L108 60 L60 12 L12 60 Z"
          fill="var(--sheet-bg-alt)"
          stroke="var(--sheet-line-strong)"
          strokeWidth={1.5}
        />
        {([1, 2, 3] as const).map((base) => {
          const runner = bases[base];
          const { x, y } = CORNERS[base];
          const highlighted = runner && highlightPlayerId === runner.playerId;
          return (
            <g
              key={base}
              transform={`translate(${x} ${y})`}
              role={onBaseClick && runner ? "button" : undefined}
              tabIndex={onBaseClick && runner ? 0 : undefined}
              onClick={onBaseClick && runner ? () => onBaseClick(base) : undefined}
              onKeyDown={
                onBaseClick && runner
                  ? (event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onBaseClick(base);
                      }
                    }
                  : undefined
              }
              className={onBaseClick && runner ? "cursor-pointer" : undefined}
            >
              <rect
                x={-11}
                y={-11}
                width={22}
                height={22}
                transform="rotate(45)"
                fill={runner ? (highlighted ? "var(--sheet-run)" : "var(--sheet-ink)") : "var(--sheet-bg)"}
                stroke={highlighted ? "var(--sheet-out)" : "var(--sheet-line-strong)"}
                strokeWidth={highlighted ? 2.5 : 1.5}
              />
              {runner && (
                <text
                  x={0}
                  y={-16}
                  textAnchor="middle"
                  fontSize={10}
                  fontWeight={700}
                  fill="var(--sheet-ink)"
                  style={{ paintOrder: "stroke", stroke: "var(--sheet-bg)", strokeWidth: 3 }}
                >
                  {(runnerLabel(base) ?? "").split(" ")[0]}
                </text>
              )}
            </g>
          );
        })}
        {/* Home */}
        <g transform={`translate(${CORNERS[0].x} ${CORNERS[0].y})`}>
          <path d="M-9 -4 L9 -4 L9 3 L0 10 L-9 3 Z" fill="var(--sheet-bg)" stroke="var(--sheet-line-strong)" strokeWidth={1.5} />
          {batterName && (
            <text x={0} y={22} textAnchor="middle" fontSize={10} fontWeight={700} fill="var(--sheet-ink)">
              {batterName.split(" ")[0]}
            </text>
          )}
        </g>
      </svg>
      <figcaption className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--sheet-muted)" }}>
        Outs
        <span className="flex gap-1" aria-hidden>
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="inline-block size-3 rounded-full border"
              style={{
                borderColor: "var(--sheet-out)",
                backgroundColor: i < outs ? "var(--sheet-out)" : "transparent",
              }}
            />
          ))}
        </span>
        <span className="sr-only">{outs}</span>
      </figcaption>
    </figure>
  );
}
