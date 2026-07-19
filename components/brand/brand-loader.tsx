import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * Pantalla de carga de marca: el logo con su glow emergiendo del negro
 * (`/brand/pantalla-carga.webp`, derivado del render oficial por
 * `scripts/generate-brand-assets.ts`) sobre la barra del gradiente de marca
 * en movimiento (`live-bar`).
 *
 * Se usa en los `loading.tsx` de rutas SIN skeleton propio (entrada a la
 * app, /admin); las vistas públicas de contenido conservan sus skeletons,
 * que comunican mejor la estructura de lo que viene.
 */

// Dimensiones intrínsecas del webp (evita layout shift).
const INTRINSIC_WIDTH = 800;
const INTRINSIC_HEIGHT = 452;

export function BrandLoader({
  variant = "pantalla",
  label = "Cargando…",
  className,
}: {
  /**
   * `pantalla`: ocupa el viewport completo (entrada a la app, rutas sin
   * shell). `seccion`: dentro de un shell persistente (contenido del admin).
   */
  variant?: "pantalla" | "seccion";
  label?: string;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex flex-col items-center justify-center",
        variant === "pantalla" ? "min-h-dvh" : "min-h-[60dvh]",
        className,
      )}
    >
      <Image
        src="/brand/pantalla-carga.webp"
        alt=""
        width={INTRINSIC_WIDTH}
        height={INTRINSIC_HEIGHT}
        priority
        // El webp ya está optimizado (≈120 KB, alpha) y se precarga desde el
        // layout raíz; servirlo estático evita el salto por /_next/image.
        unoptimized
        className={cn(
          "loader-breathe w-64 select-none sm:w-80",
          variant === "seccion" && "w-52 sm:w-64",
        )}
      />
      <div className="live-bar mt-2 h-1 w-36 rounded-full" aria-hidden />
      <p className="mt-4 text-[11px] font-medium tracking-[0.3em] text-muted-foreground uppercase">
        {label}
      </p>
    </div>
  );
}
