import { cn } from "@/lib/utils";

/**
 * Placeholder con las iniciales sobre el color oficial del equipo/persona,
 * para usar cuando falta el logo o la foto (cero petición de red, cero CLS
 * porque ocupa exactamente el mismo cuadro que la imagen que sustituye).
 */
export function InitialsAvatar({
  name,
  color,
  className,
}: {
  name: string;
  color?: string | null;
  className?: string;
}) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
  const bg = color ?? "#3a3a3f";
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-display text-xs leading-none text-white",
        className,
      )}
      style={{
        // Color oficial con un leve degradado para dar volumen de "escudo".
        backgroundImage: `linear-gradient(135deg, ${bg} 0%, ${bg}b0 100%)`,
      }}
    >
      {initials || "?"}
    </span>
  );
}
