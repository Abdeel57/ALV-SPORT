import { positionLabel } from "@/lib/engine/scorebook";
import { cn } from "@/lib/utils";

/**
 * Insignia de posición con el código de color de la referencia: cuadro en
 * azul, jardines en verde, short fielder en amarillo y roles (EP, DH, PH,
 * PR, FLEX) en rojo. El color solo refuerza: el código siempre va en texto.
 */

const INFIELD = new Set(["P", "C", "1B", "2B", "3B", "SS"]);
const OUTFIELD = new Set(["LF", "CF", "RF"]);
const ROLES: Record<string, string> = {
  EP: "Jugador extra",
  DH: "Bateador designado",
  PH: "Bateador emergente",
  PR: "Corredor emergente",
  FLEX: "Solo defiende",
  sub: "Sustituto",
};

export function positionTone(code: string | null | undefined): string {
  if (!code) return "var(--sheet-muted)";
  if (INFIELD.has(code)) return "var(--pos-infield)";
  if (OUTFIELD.has(code)) return "var(--pos-outfield)";
  if (code === "SF") return "var(--pos-sf)";
  return "var(--pos-role)";
}

export function PositionBadge({
  code,
  size = "sm",
  className,
}: {
  code: string | null | undefined;
  size?: "xs" | "sm" | "md";
  className?: string;
}) {
  const label = code ? (ROLES[code] ?? positionLabel(code)) : "Sin posición";
  const tone = positionTone(code);
  return (
    <span
      title={label}
      aria-label={label}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-md font-semibold tabular-nums tracking-wide text-white",
        size === "xs" && "h-4 min-w-6 px-1 text-[10px]",
        size === "sm" && "h-5 min-w-7 px-1.5 text-[11px]",
        size === "md" && "h-7 min-w-9 px-2 text-xs",
        className,
      )}
      style={{ backgroundColor: tone }}
    >
      {code ?? "—"}
    </span>
  );
}
