import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * Logo oficial de ALV SPORT (wordmark "ALV SPORT / All Leagues" con el swoosh
 * rojo→ámbar→plata, fondo transparente). Fuente única: `/brand/alv-sport-logo.png`,
 * generado desde el logo oficial por `scripts/generate-brand-assets.ts`.
 *
 * Controla el tamaño con la altura vía `className` (ej. `h-8`); el ancho se
 * ajusta solo manteniendo la proporción real del lockup (1000×323).
 */

// Dimensiones intrínsecas del PNG recortado (evita layout shift).
const INTRINSIC_WIDTH = 1000;
const INTRINSIC_HEIGHT = 323;

export function BrandLogo({
  className,
  priority = false,
}: {
  className?: string;
  priority?: boolean;
}) {
  return (
    <Image
      src="/brand/alv-sport-logo.png"
      alt="ALV SPORT"
      width={INTRINSIC_WIDTH}
      height={INTRINSIC_HEIGHT}
      priority={priority}
      className={cn("h-8 w-auto select-none", className)}
    />
  );
}
